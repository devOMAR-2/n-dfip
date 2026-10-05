// Settings › Data visibility (#privacy, UAT-02, PDPL).
// Per role, each group of patient data is hidden, masked or visible. The setting applies
// everywhere the data appears: lists, search, timeline, dashboards, exports and print.
// Saves are refused when another admin saved since this page loaded (EC-11).
// Needs db.js, access.js, audit.js, privacy.js, privacy-ui.js.

(() => {
  const host = document.getElementById("privacy");
  if (!host || Access.denied) return;
  PrivacyUI.ensureStyles();

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const canEdit = () => Access.can("admin.privacy");
  const LEVEL_LABEL = Object.fromEntries(Privacy.LEVELS);

  // What each level looks like for a sample (fictional) patient
  const SAMPLE = {
    identifiers: { visible: "1082345671 · 1975-03-14", masked: "••••••5671 · 1975 (year only)", hidden: "Hidden" },
    general: { visible: "Abdulrahman Saleh Al-Qahtani", masked: "A. S. Al-Q.", hidden: "Patient (name hidden)" },
    medical: { visible: "Findings, tests and notes shown", masked: "Treated as hidden (no partial view)", hidden: "Not shown" },
  };

  let draft, baseRev, dirty, notice;

  function load() {
    const roles = Access.roles();
    const current = Privacy.settings();
    draft = Object.fromEntries(roles.map((r) => [r.id, { ...{ identifiers: "hidden", general: "hidden", medical: "hidden" }, ...(current[r.id] ?? {}) }]));
    baseRev = Privacy.meta().rev;
    dirty = false;
  }

  function render() {
    host.replaceChildren();
    const header = el("div", "page-header");
    const titles = el("div");
    titles.append(
      el("h2", "section-title", "Data visibility"),
      el("p", "field-hint", "What each role sees of a patient's data. Applies everywhere the data appears: lists, search, timeline, dashboards, exports and print."),
    );
    header.append(titles);
    host.append(header);

    const legend = el("section", "settings-card");
    legend.append(el("h3", "settings-card__title", "Levels"));
    const dl = el("dl", "privacy-legend");
    [
      ["Visible", "The full value."],
      ["Masked", "Part of the value: the last 4 digits of the national ID and the year of birth; initials instead of the name; the last 2 digits of the phone. The medical record has no partial view, so masked works as hidden."],
      ["Hidden", "Not shown at all. In an emergency, a user with emergency access can open a hidden record by giving a reason. The reason is logged and flagged for review."],
    ].forEach(([t, d]) => {
      const row = el("div");
      row.append(el("dt", "", t), el("dd", "", d));
      dl.append(row);
    });
    legend.append(dl);
    host.append(legend);

    const card = el("section", "settings-card");
    card.append(el("h3", "settings-card__title", "By role"));
    const table = el("table", "data-table privacy-matrix");
    const head = el("thead");
    const htr = el("tr");
    htr.append(el("th", "", "Role"));
    for (const g of Privacy.GROUPS) {
      const th = el("th");
      th.scope = "col";
      th.append(el("span", "privacy-matrix__group", g.label), el("span", "privacy-matrix__fields", g.fields));
      htr.append(th);
    }
    head.append(htr);
    table.append(head);
    const body = el("tbody");
    for (const role of Access.roles()) {
      const tr = el("tr");
      const th = el("th", "", role.name);
      th.scope = "row";
      tr.append(th);
      for (const g of Privacy.GROUPS) {
        const td = el("td");
        const select = el("select", "input select");
        select.setAttribute("aria-label", `${g.label} for ${role.name}`);
        select.disabled = !canEdit();
        Privacy.LEVELS.forEach(([v, l]) => select.append(new Option(l, v, false, v === draft[role.id][g.id])));
        const sample = el("span", "privacy-matrix__sample", SAMPLE[g.id][draft[role.id][g.id]]);
        select.addEventListener("change", () => {
          draft[role.id][g.id] = select.value;
          sample.textContent = SAMPLE[g.id][select.value];
          dirty = true;
          notice = null;
          renderActions();
        });
        td.append(select, sample);
        tr.append(td);
      }
      body.append(tr);
    }
    table.append(body);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    card.append(wrap, el("p", "field-hint", "Sample values are fictional. Changes apply on each user's next action."));
    host.append(card);

    actions = el("div", "form-actions");
    host.append(actions);
    renderActions();
  }

  let actions;

  function renderActions() {
    actions.replaceChildren();
    if (notice) {
      const c = el("div", `callout ${notice.ok ? "callout-success" : "callout-danger"} org-notice`);
      c.setAttribute("role", notice.ok ? "status" : "alert");
      c.append(el("p", "", notice.text));
      if (notice.reload) {
        const r = el("button", "btn btn-sm btn-outline", "Reload");
        r.type = "button";
        r.addEventListener("click", () => {
          load();
          notice = null;
          render();
        });
        c.append(r);
      }
      actions.append(c);
    }
    actions.append(el("p", "form-actions__progress", !canEdit() ? "View only" : dirty ? "Unsaved changes" : "All changes saved"));
    if (!canEdit()) return;
    const buttons = el("div", "form-actions__buttons");
    const discard = el("button", "btn btn-outline", "Discard changes");
    discard.type = "button";
    discard.disabled = !dirty;
    discard.addEventListener("click", () => {
      load();
      notice = null;
      render();
    });
    const save = el("button", "btn btn-primary", "Save changes");
    save.type = "button";
    save.disabled = !dirty;
    save.addEventListener("click", saveAll);
    buttons.append(discard, save);
    actions.append(buttons);
  }

  function saveAll() {
    if (!Access.can("admin.privacy")) {
      notice = { ok: false, text: "Your permission to change data visibility was removed. Nothing was saved." };
      return renderActions();
    }
    const before = Privacy.settings();
    try {
      Privacy.save(clone(draft), { rev: baseRev });
    } catch (e) {
      notice = { ok: false, text: e.message, reload: e instanceof Privacy.ConflictError };
      return renderActions();
    }
    const names = Object.fromEntries(Access.roles().map((r) => [r.id, r.name]));
    for (const [roleId, groups] of Object.entries(draft)) {
      for (const g of Privacy.GROUPS) {
        const was = before[roleId]?.[g.id] ?? "hidden";
        if (was !== groups[g.id]) {
          Audit.log("permission.change", { action: `Data visibility: ${g.label} for ${names[roleId] ?? roleId}`, field: g.id, old: LEVEL_LABEL[was], new: LEVEL_LABEL[groups[g.id]] });
        }
      }
    }
    load();
    notice = { ok: true, text: "Saved. Each user sees the change on their next action." };
    render();
  }

  load();
  render();
  window.addEventListener("storage", (e) => {
    if (e.key === Privacy.KEY && !dirty) {
      load();
      render();
    }
  });
})();
