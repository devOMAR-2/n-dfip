// Settings › Page layout (#layout): tabs, sections and question placement for the live
// nurse and practitioner pages (UAT-13, UAT-14, UAT-15). Publishing creates a new version;
// new encounters use it, open and past encounters keep theirs (EC-10). Needs layout.js.
(() => {
  const host = document.getElementById("layout");
  if (!host || Access.denied) return;

  const $ = (sel, root = host) => root.querySelector(sel);
  const $$ = (sel, root = host) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const fmt = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const canEdit = () => Access.can("clinic.setup");

  let rev = Layout.state().rev;
  let config = Layout.current();
  let page = "screening";
  let dirty = false;
  let errors = [];
  let message = null; // result of the last publish, shown until the next change

  const ROLES = () => Access.roles().filter((r) => r.status !== "deactivated");
  const sectionTitle = (pg, key) => Layout.SECTIONS[pg].find(([k]) => k === key)?.[1] ?? key;

  function markDirty() {
    dirty = true;
    message = null;
    errors = [];
    render();
  }

  // ---------- Validation (Settings refuses a layout that leaves a section outside every tab) ----------
  function validate() {
    const out = [];
    for (const pg of ["screening", "review"]) {
      const p = config.pages[pg];
      if (!p.tabs.length) out.push([pg, null, `${Layout.PAGE_LABEL[pg]}: add at least one tab.`]);
      const titles = new Set();
      for (const t of p.tabs) {
        if (!t.title.trim()) out.push([pg, t.id, `${Layout.PAGE_LABEL[pg]}: every tab needs a name.`]);
        else if (titles.has(t.title.trim().toLowerCase())) out.push([pg, t.id, `${Layout.PAGE_LABEL[pg]}: two tabs are called "${t.title}".`]);
        titles.add(t.title.trim().toLowerCase());
        if (!t.sections.some((k) => p.sections[k]?.enabled)) out.push([pg, t.id, `${Layout.PAGE_LABEL[pg]}: tab "${t.title || "Untitled"}" has no sections switched on.`]);
      }
      for (const [k] of Layout.SECTIONS[pg]) {
        if (p.sections[k]?.enabled && !p.tabs.some((t) => t.sections.includes(k))) out.push([pg, k, `${Layout.PAGE_LABEL[pg]}: section "${sectionTitle(pg, k)}" isn't in any tab.`]);
      }
    }
    return out;
  }

  // ---------- Render ----------
  function render() {
    const st = Layout.state();
    const cur = st.versions.find((v) => v.n === st.current);
    host.replaceChildren();

    const head = el("div", "page-header page-header--split");
    const left = el("div");
    left.append(
      el("h2", "section-title", "Page layout · Diabetic Foot"),
      el("p", "field-hint", `Live version ${cur.n}, published by ${cur.by} on ${fmt(cur.at)}. New encounters use the latest version; open and past encounters keep the version they started with.`),
    );
    head.append(left);
    host.append(head);

    if (!canEdit()) host.append(el("p", "callout callout-warning", "View only: changing the page layout needs the Clinic setup permission."));

    // Page switch
    const sw = el("div", "segmented");
    sw.setAttribute("role", "group");
    sw.setAttribute("aria-label", "Page");
    for (const pg of ["screening", "review"]) {
      const b = el("button", `segmented__item${pg === page ? " is-active" : ""}`, Layout.PAGE_LABEL[pg]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(pg === page));
      b.addEventListener("click", () => {
        page = pg;
        render();
      });
      sw.append(b);
    }
    host.append(sw);

    if (errors.length) {
      const box = el("div", "callout callout-destructive");
      box.setAttribute("role", "alert");
      const ul = el("ul", "error-list");
      errors.forEach(([, , m]) => ul.append(el("li", "", m)));
      box.append(el("strong", "", "Fix these before publishing"), ul);
      host.append(box);
    }

    host.append(tabsCard(), sectionsCard(), questionsCard(), publishBar(), historyCard());
    if (!canEdit()) $$("input, select, textarea, button:not(.segmented__item)").forEach((f) => !f.closest(".layout-history") && (f.disabled = true));
  }

  function card(title, hint) {
    const c = el("section", "settings-card layout-card");
    c.append(el("h3", "subsection__title", title));
    if (hint) c.append(el("p", "field-hint", hint));
    return c;
  }

  function tabsCard() {
    const p = config.pages[page];
    const c = card("Tabs", "Tabs run across the top of the page. On a phone they scroll sideways. The patient header, clinical alerts, the stage of the file and the pending counter stay visible on every tab.");
    const list = el("ol", "layout-tabs");
    p.tabs.forEach((t, i) => {
      const li = el("li", "layout-tab-row");
      const input = el("input", "input");
      input.value = t.title;
      input.setAttribute("aria-label", `Tab ${i + 1} name`);
      input.addEventListener("input", () => {
        t.title = input.value;
        dirty = true;
        updateStatus();
      });
      input.addEventListener("change", () => markDirty());
      const up = el("button", "btn btn-ghost btn-xs", "Up");
      up.type = "button";
      up.disabled = i === 0;
      up.setAttribute("aria-label", `Move ${t.title || "tab"} up`);
      up.addEventListener("click", () => {
        [p.tabs[i - 1], p.tabs[i]] = [p.tabs[i], p.tabs[i - 1]];
        markDirty();
      });
      const down = el("button", "btn btn-ghost btn-xs", "Down");
      down.type = "button";
      down.disabled = i === p.tabs.length - 1;
      down.setAttribute("aria-label", `Move ${t.title || "tab"} down`);
      down.addEventListener("click", () => {
        [p.tabs[i + 1], p.tabs[i]] = [p.tabs[i], p.tabs[i + 1]];
        markDirty();
      });
      const del = el("button", "btn btn-ghost btn-xs", "Delete");
      del.type = "button";
      del.setAttribute("aria-label", `Delete ${t.title || "tab"}`);
      del.addEventListener("click", () => {
        p.tabs.splice(i, 1);
        markDirty();
      });
      const count = el("span", "badge badge-muted", `${t.sections.length} section${t.sections.length === 1 ? "" : "s"}`);
      li.append(input, count, up, down, del);
      if (errors.some(([pg, id]) => pg === page && id === t.id)) li.classList.add("is-invalid");
      list.append(li);
    });
    c.append(list);
    const add = el("button", "btn btn-outline btn-sm", "Add tab");
    add.type = "button";
    add.addEventListener("click", () => {
      p.tabs.push({ id: `t-${Date.now().toString(36)}`, title: "New tab", sections: [] });
      markDirty();
      $$(".layout-tab-row input").at(-1)?.select();
    });
    c.append(add);
    return c;
  }

  function sectionsCard() {
    const p = config.pages[page];
    const c = card("Sections", "Switch a section off, make it optional, or lock it for a role (read-only). Where a section also depends on a permission, the stricter of the two applies. A required section blocks sending or signing until it is complete.");
    const wrap = el("div", "table-wrap");
    const table = el("table", "data-table layout-sections");
    const roles = ROLES();
    table.innerHTML = `<thead><tr><th scope="col">Section</th><th scope="col">Tab</th><th scope="col">Shown</th><th scope="col">Required</th><th scope="col">Locked for</th></tr></thead>`;
    const tbody = el("tbody");
    for (const [key, title] of Layout.SECTIONS[page]) {
      const s = p.sections[key];
      const tr = el("tr");
      if (errors.some(([pg, id]) => pg === page && id === key)) tr.classList.add("is-invalid");
      const name = el("th", "", title);
      name.scope = "row";
      const tabSel = el("select", "input select input-sm");
      tabSel.setAttribute("aria-label", `Tab for ${title}`);
      tabSel.append(new Option("Not in a tab", ""));
      p.tabs.forEach((t) => tabSel.append(new Option(t.title || "Untitled", t.id, false, t.sections.includes(key))));
      tabSel.addEventListener("change", () => {
        p.tabs.forEach((t) => (t.sections = t.sections.filter((k) => k !== key)));
        p.tabs.find((t) => t.id === tabSel.value)?.sections.push(key);
        markDirty();
      });
      const check = (prop, label) => {
        const box = el("input", "checkbox");
        box.type = "checkbox";
        box.checked = !!s[prop];
        box.setAttribute("aria-label", `${label}: ${title}`);
        box.addEventListener("change", () => {
          s[prop] = box.checked;
          markDirty();
        });
        return box;
      };
      const locks = el("div", "chips chips--sm");
      for (const r of roles) {
        const chip = el("label", "chip");
        const box = el("input");
        box.type = "checkbox";
        box.checked = s.locked.includes(r.id);
        box.addEventListener("change", () => {
          s.locked = box.checked ? [...s.locked, r.id] : s.locked.filter((x) => x !== r.id);
          markDirty();
        });
        chip.append(box, el("span", "", r.name));
        locks.append(chip);
      }
      const td = (n) => {
        const cell = el("td");
        cell.append(n);
        return cell;
      };
      tr.append(name, td(tabSel), td(check("enabled", "Shown")), td(check("required", "Required")), td(locks));
      tbody.append(tr);
    }
    table.append(tbody);
    wrap.append(table);
    c.append(wrap);
    return c;
  }

  function questionsCard() {
    const c = card("Which questions go on which page", "Move a question between the nurse page and the practitioner page, or into another section. New encounters show it in its new place. Per-ulcer questions stay where they are. To add new questions, use Clinics › Diabetic Foot.");
    const search = el("input", "input");
    search.type = "search";
    search.placeholder = "Find a question";
    search.setAttribute("aria-label", "Find a question");
    c.append(search);
    const list = el("div", "layout-questions");
    const items = [...Layout.catalogue("screening"), ...Layout.catalogue("review")].filter((q) => q.movable);
    const here = items.filter((q) => Layout.placement(config, q.key).page === page);
    const groups = new Map();
    for (const q of here) {
      const sec = Layout.placement(config, q.key).section;
      if (!groups.has(sec)) groups.set(sec, []);
      groups.get(sec).push(q);
    }
    const order = Layout.SECTIONS[page].map(([k]) => k);
    const keys = [...groups.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    for (const sec of keys) {
      const det = el("details", "layout-qgroup");
      const sum = el("summary", "", `${sectionTitle(page, sec) ?? sec} (${groups.get(sec).length})`);
      det.append(sum);
      for (const q of groups.get(sec)) det.append(questionRow(q));
      list.append(det);
    }
    search.addEventListener("input", () => {
      const t = search.value.trim().toLowerCase();
      $$(".layout-qrow", list).forEach((r) => (r.hidden = t && !r.dataset.label.includes(t)));
      $$(".layout-qgroup", list).forEach((d) => {
        d.open = !!t && $$(".layout-qrow:not([hidden])", d).length > 0;
        d.hidden = !!t && !$$(".layout-qrow:not([hidden])", d).length;
      });
    });
    c.append(list);
    const moved = Object.keys(config.questions).length;
    if (moved) c.append(el("p", "field-hint", `${moved} question${moved === 1 ? "" : "s"} moved or switched off in this layout.`));
    return c;
  }

  function questionRow(q) {
    const pl = Layout.placement(config, q.key);
    const row = el("div", "layout-qrow");
    row.dataset.label = `${q.label} ${q.sub}`.toLowerCase();
    const name = el("div", "layout-qrow__name");
    name.append(el("span", "", q.label));
    if (q.key.includes(".*.")) name.append(el("span", "badge badge-muted", "Each foot"));
    if (pl.page !== Layout.pageOfKey(q.key)) name.append(el("span", "badge badge-status-progress", "Moved"));
    const pageSel = el("select", "input select input-sm");
    pageSel.setAttribute("aria-label", `Page for ${q.label}`);
    for (const pg of ["screening", "review"]) pageSel.append(new Option(Layout.PAGE_LABEL[pg], pg, false, pg === pl.page));
    const secSel = el("select", "input select input-sm");
    secSel.setAttribute("aria-label", `Section for ${q.label}`);
    for (const [k, t] of Layout.SECTIONS[pl.page]) if (!Layout.FIXED.has(k) || k === pl.section) secSel.append(new Option(t, k, false, k === pl.section));
    const on = el("label", "toggle");
    const box = el("input", "checkbox");
    box.type = "checkbox";
    box.checked = pl.enabled;
    on.append(box, el("span", "", "Shown"));
    const save = (next) => {
      const homePage = Layout.pageOfKey(q.key);
      const homeSec = q.section;
      const o = { page: next.page, section: next.section, enabled: next.enabled };
      if (o.page === homePage && o.section === homeSec && o.enabled) delete config.questions[q.key];
      else config.questions[q.key] = o;
      markDirty();
    };
    pageSel.addEventListener("change", () => {
      const first = Layout.SECTIONS[pageSel.value].find(([k]) => !Layout.FIXED.has(k))[0];
      save({ page: pageSel.value, section: pageSel.value === Layout.pageOfKey(q.key) ? q.section : first, enabled: box.checked });
    });
    secSel.addEventListener("change", () => save({ page: pl.page, section: secSel.value, enabled: box.checked }));
    box.addEventListener("change", () => save({ page: pl.page, section: pl.section, enabled: box.checked }));
    row.append(name, pageSel, secSel, on);
    return row;
  }

  function publishBar() {
    const bar = el("div", "form-actions layout-publish");
    const status = el("p", "form-actions__progress");
    status.id = "layout-status";
    status.setAttribute("aria-live", "polite");
    const note = el("input", "input");
    note.placeholder = "What changed (optional)";
    note.setAttribute("aria-label", "What changed");
    note.id = "layout-note";
    const buttons = el("div", "form-actions__buttons");
    const discard = el("button", "btn btn-outline", "Discard changes");
    discard.type = "button";
    discard.addEventListener("click", () => {
      config = Layout.current();
      rev = Layout.state().rev;
      dirty = false;
      errors = [];
      render();
    });
    const publish = el("button", "btn btn-primary", "Publish new version");
    publish.type = "button";
    publish.addEventListener("click", () => {
      if (!canEdit()) return;
      errors = validate();
      if (errors.length) {
        render();
        $(".callout-destructive")?.scrollIntoView({ block: "center" });
        return;
      }
      publish.disabled = true;
      try {
        const n = Layout.publish(config, $("#layout-note").value.trim(), rev);
        rev = Layout.state().rev;
        config = Layout.current();
        dirty = false;
        message = `Version ${n} published. New encounters use it; open and past encounters keep their version.`;
        render();
      } catch (e) {
        publish.disabled = false;
        $("#layout-status").textContent = e.message;
        $("#layout-status").classList.add("is-error");
      }
    });
    buttons.append(discard, publish);
    bar.append(status, note, buttons);
    queueMicrotask(updateStatus);
    return bar;
  }

  function updateStatus() {
    const s = document.getElementById("layout-status");
    if (s && !s.classList.contains("is-error")) s.textContent = dirty ? "Unsaved changes" : message ?? "No changes";
  }

  function historyCard() {
    const c = card("Version history", "Encounters record the version they used, so older ones stay readable as they were.");
    c.classList.add("layout-history");
    const ol = el("ol", "layout-versions");
    for (const v of [...Layout.versions()].reverse()) {
      const li = el("li");
      li.append(el("strong", "", `Version ${v.n}`), ` · ${v.by} · ${fmt(v.at)}${v.note ? ` · ${v.note}` : ""}`);
      if (v.n === Layout.currentN()) li.append(" ", el("span", "badge badge-status-complete", "Live"));
      ol.append(li);
    }
    c.append(ol);
    return c;
  }

  document.addEventListener("settings:view", (e) => {
    if (e.detail === "layout" && !dirty) {
      config = Layout.current();
      rev = Layout.state().rev;
      render();
    }
  });
  render();
})();
