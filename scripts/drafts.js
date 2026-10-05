// Unsaved changes and drafts (UAT-10, EC-03, EC-04). Used by the screening and review pages.
//
//   const d = Drafts.attach({ key, form, collect, saved, apply, enabled, save, onDiscard })
//     key        draft id, e.g. "screening.<encounterId>" (stored per user)
//     collect()  current values {name: value} of the editable fields
//     saved()    values as last saved in the record
//     apply(v)   put values into the form
//     enabled()  false while the page is read-only
//     save()     page's save; resolves true when saved
//
// Edits are kept as a draft automatically (in this browser, per user), so nothing is lost if
// the browser closes or the session expires. The record itself changes only when the user
// saves or sends. Leaving with a draft asks first; "Discard changes" lists the edited
// sections and restores the saved values after confirmation.

const Drafts = (() => {
  const PREFIX = "ndfip.draft.";
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const empty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);

  function attach({ key, form, collect, saved, apply, enabled = () => true, save, onDiscard = () => {} }) {
    const userId = Access.currentUser()?.id ?? "anon";
    const storeKey = `${PREFIX}${key}.${userId}`;
    let leaving = false;

    const read = () => {
      try {
        return JSON.parse(localStorage.getItem(storeKey) || "null");
      } catch {
        return null;
      }
    };
    const clear = () => {
      try {
        localStorage.removeItem(storeKey);
      } catch {}
      notify();
    };

    // Fields whose current value differs from the saved one
    function changedNames() {
      const now = collect();
      const before = saved() ?? {};
      const names = new Set([...Object.keys(now), ...Object.keys(before)]);
      return [...names].filter((n) => !(empty(now[n]) && empty(before[n])) && !same(now[n], before[n]));
    }

    function sectionTitle(name) {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
      const s = input?.closest(".form-section");
      if (!s) return "Other";
      const letter = s.querySelector(".form-section__letter")?.textContent.trim();
      const title = [...(s.querySelector(".form-section__title")?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      return letter ? `${letter} · ${title}` : title;
    }

    const changedSections = () => [...new Set(changedNames().map(sectionTitle))];
    const dirty = () => enabled() && changedNames().length > 0;

    let timer = null;
    function keep() {
      if (!enabled()) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          if (dirty()) localStorage.setItem(storeKey, JSON.stringify({ at: new Date().toISOString(), values: collect() }));
          else localStorage.removeItem(storeKey);
        } catch {}
        notify();
      }, 300);
    }
    form.addEventListener("input", keep);
    form.addEventListener("change", keep);

    // ---- Status line + Discard button (placed by the page) ----
    const listeners = new Set();
    function notify() {
      listeners.forEach((fn) => fn({ dirty: dirty(), sections: changedSections() }));
    }

    // ---- Dialog ----
    const dialog = document.createElement("dialog");
    dialog.className = "modal";
    dialog.setAttribute("aria-labelledby", `${storeKey}-title`);
    dialog.innerHTML = `<form class="modal__inner" method="dialog">
      <div><h2 class="modal__title" id="${storeKey}-title"></h2><p class="modal__description" data-text></p></div>
      <ul class="draft-list" data-list></ul>
      <p class="field-error" data-error hidden></p>
      <div class="modal__actions" data-actions></div>
    </form>`;
    document.body.append(dialog);

    function ask({ title, text, actions }) {
      dialog.querySelector(".modal__title").textContent = title;
      dialog.querySelector("[data-text]").textContent = text;
      const list = dialog.querySelector("[data-list]");
      list.replaceChildren(...changedSections().map((t) => Object.assign(document.createElement("li"), { textContent: t })));
      const err = dialog.querySelector("[data-error]");
      err.hidden = true;
      const bar = dialog.querySelector("[data-actions]");
      bar.replaceChildren(
        ...actions.map(([value, label, cls]) => {
          const b = document.createElement("button");
          b.type = "submit";
          b.value = value;
          b.className = `btn ${cls}`;
          b.textContent = label;
          return b;
        }),
      );
      dialog.returnValue = "";
      dialog.showModal();
      return new Promise((resolve) => dialog.addEventListener("close", () => resolve(dialog.returnValue), { once: true }));
    }

    async function discard() {
      if (!dirty()) return true;
      const answer = await ask({
        title: "Discard your changes?",
        text: "These sections have changes that aren't saved. Discarding restores the saved values.",
        actions: [["cancel", "Keep my changes", "btn-outline"], ["discard", "Discard changes", "btn-destructive"]],
      });
      if (answer !== "discard") return false;
      const sections = changedSections();
      apply(saved() ?? {});
      clear();
      if (typeof Audit !== "undefined") Audit.log("discard", { action: `Discarded unsaved changes: ${sections.join(", ")}`, ...(onDiscard() ?? {}) });
      return true;
    }

    // Leaving through a link on the page
    document.addEventListener("click", async (e) => {
      const a = e.target.closest("a[href]");
      if (!a || leaving || !dirty() || a.target === "_blank" || a.getAttribute("href").startsWith("#")) return;
      e.preventDefault();
      const answer = await ask({
        title: "Leave without saving?",
        text: "Your changes are kept as a draft on this device, but they aren't saved to the record yet.",
        actions: [["stay", "Stay", "btn-outline"], ["discard", "Discard and leave", "btn-outline"], ["save", "Save and leave", "btn-primary"]],
      });
      if (answer === "stay" || !answer) return;
      if (answer === "save") {
        if (!(await save())) return;
      } else {
        const sections = changedSections();
        clear();
        if (typeof Audit !== "undefined") Audit.log("discard", { action: `Discarded unsaved changes on leaving: ${sections.join(", ")}`, ...(onDiscard() ?? {}) });
      }
      leaving = true;
      location.href = a.href;
    });

    // Closing the tab or browser: the browser's own warning (the draft is kept anyway)
    window.addEventListener("beforeunload", (e) => {
      if (!leaving && dirty()) e.preventDefault();
    });

    // Restore a draft left from an earlier visit
    function restore() {
      const d = read();
      if (!d || !enabled()) return null;
      apply(d.values);
      if (!dirty()) {
        clear();
        return null;
      }
      notify();
      return d.at;
    }

    return {
      dirty, changedSections, discard, restore, clear,
      afterSave: () => clear(),
      onChange: (fn) => (listeners.add(fn), fn({ dirty: dirty(), sections: changedSections() })),
      leave: () => (leaving = true),
    };
  }

  return { attach };
})();
