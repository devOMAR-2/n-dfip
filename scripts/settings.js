// Settings › Clinics: demo clinic builder (details, team, ordered steps, step access,
// sections and questions). The Diabetic Foot clinic drives the live pages: saving it
// publishes a new page-layout version (layout.js) with the questions added, moved or switched
// off here (F-13, UAT-15). Other clinics have no live pages yet.
// Needs auth.js, staff.js and screening-schema.js.

(() => {
  const KEY = "ndfip.clinics";
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ICON = {
    up: '<path d="m18 15-6-6-6 6" />',
    down: '<path d="m6 9 6 6 6-6" />',
    trash: '<path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
    plus: '<path d="M5 12h14" /><path d="M12 5v14" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    chevron: '<path d="m6 9 6 6 6-6" />',
  };
  const svg = (name) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

  function iconButton(icon, label, onClick, cls = "btn btn-ghost btn-xs", ariaLabel = null) {
    const b = el("button", cls);
    b.type = "button";
    b.innerHTML = svg(icon) + `<span>${label}</span>`;
    if (ariaLabel) b.setAttribute("aria-label", ariaLabel);
    b.addEventListener("click", onClick);
    return b;
  }

  // ---------- Reference data ----------

  const ROLES = [
    ["nurse", "Screening Nurse"],
    ["practitioner", "Practitioner"],
    ["admin", "Administrator"],
  ];
  const PERMS = [
    ["view", "View"],
    ["fill", "Fill in"],
    ["edit", "Edit after submit"],
    ["signoff", "Sign off"],
  ];
  const TYPES = [
    ["single", "Single choice"],
    ["multiple", "Multiple choice"],
    ["yesno", "Yes / No"],
    ["select", "Dropdown"],
    ["number", "Number"],
    ["scale", "Scale 0–10"],
    ["text", "Short text"],
    ["longtext", "Long text"],
    ["date", "Date"],
    ["photo", "Photo"],
    ["footmap", "Foot map"],
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES);
  const HAS_OPTIONS = new Set(["single", "multiple", "select"]);

  // Foot map: same drawing as the live form (generated into screening-schema.js)
  const DIAGRAM = ScreeningSchema.footDiagram;
  const SENSATION_SITES = ["hallux", "mth1", "mth5"];
  const MAP_VIEWS = [["plantar", "Sole view"], ["dorsal", "Top view"], ["both", "Sole and top views"]];
  const DORSAL_ZONES = new Set(Object.keys(DIAGRAM.labels).filter((z) => z !== "heel"));
  // Older saved clinics have foot maps without a view or sites
  const footmapDefaults = (question) => {
    if (question.type !== "footmap") return;
    question.view ??= "plantar";
    question.sites ??= [...SENSATION_SITES];
  };
  const shownSites = (question) => (question.view === "dorsal" ? question.sites.filter((z) => DORSAL_ZONES.has(z)) : question.sites);

  // Demo staff directory lives in staff.js (shared with Roles & permissions)
  const STAFF = StaffDirectory;

  // Default step access: nurses screen (and don't see reviews); practitioners review
  // (and don't do the screening); administrators can look but not change clinical data.
  const NONE = { view: false, fill: false, edit: false, signoff: false };
  const ACCESS = {
    screening: { nurse: { view: true, fill: true, edit: false, signoff: false }, practitioner: { ...NONE }, admin: { ...NONE, view: true } },
    review: { nurse: { ...NONE }, practitioner: { view: true, fill: true, edit: true, signoff: true }, admin: { ...NONE, view: true } },
    blank: { nurse: { ...NONE }, practitioner: { ...NONE }, admin: { ...NONE, view: true } },
  };

  // ---------- Seed: Diabetic Foot from the real nurse form schema ----------

  function questionsFromSchema(schema = ScreeningSchema, page = "screening") {
    const typeOf = { radio: "single", checkbox: "multiple", number: "number", range: "scale", text: "text", select: "select", file: "photo", textarea: "longtext" };
    const sections = [];
    const seen = new Set();
    const titles = Object.fromEntries(Layout.SECTIONS[page]);
    for (const f of schema.fields) {
      const parts = f.name.split(".");
      const perFoot = parts[1] === "left" || parts[1] === "right";
      const perUlcer = /^\d$/.test(parts[1]) || /^r\.w\.\d/.test(f.name);
      const key = Layout.keyOf(f.name);
      if (seen.has(key)) continue;
      seen.add(key);
      let section = sections.find((s) => s.letter === f.section);
      if (!section) {
        const n = Layout.SECTIONS[page].findIndex(([k]) => k === f.section) + 1;
        section = { id: uid("sec"), letter: f.section, key: f.section, title: page === "screening" ? `${f.section} · ${titles[f.section]}` : `${n} · ${titles[f.section]}`, questions: [] };
        sections.push(section);
      }
      const yesno = f.options?.length === 2 && f.options[0][0] === "yes" && f.options[1][0] === "no";
      section.questions.push({
        id: uid("q"),
        label: perUlcer ? `${f.label} (each ulcer)` : f.label,
        help: f.sub ?? "",
        type: yesno ? "yesno" : typeOf[f.type] ?? "text",
        options: yesno ? [] : (f.options ?? []).map(([, label]) => label),
        required: !!f.required,
        perFoot,
        unit: f.unit ?? "",
        key,
        // Per-ulcer questions stay where they are; risk-calculation questions are locked on (handbook §9)
        fixed: perUlcer || Layout.locked(key),
      });
    }
    // The nurse form places sensation sites on a foot map
    const c = sections.find((s) => s.letter === "C");
    if (c) c.questions.splice(1, 0, { id: uid("q"), label: "Sensation sites", help: "Tap a site to cycle Detected / Absent / Not assessed", type: "footmap", options: [], required: true, perFoot: true, unit: "", view: "plantar", sites: [...SENSATION_SITES], fixedMap: true });
    const j = sections.find((s) => s.letter === "J");
    if (j) j.questions.splice(1, 0, { id: uid("q"), label: "Ulcer location", help: "Tap a site to place the selected ulcer", type: "footmap", options: [], required: true, perFoot: true, unit: "", view: "both", sites: Object.keys(DIAGRAM.labels), fixedMap: true });
    sections.forEach((s) => delete s.letter);
    return sections;
  }

  const q = (label, type, extra = {}) => ({ id: uid("q"), label, help: "", type, options: [], required: true, perFoot: false, unit: "", ...extra });

  function seedClinics() {
    return [
      {
        id: "diabetic-foot",
        name: "Diabetic Foot",
        live: 3, // linked to the live pages (page-layout versions); bump to re-seed saved builders
        excerpt: "Structured foot screening by trained staff, prepared for practitioner review. One connected record supporting prevention, continuity and limb preservation.",
        nurses: ["100002", "200011"],
        practitioners: ["100003", "200021"],
        steps: [
          { id: uid("step"), name: "Screening room", description: "Nurse records objective measurements before the practitioner sees the patient.", access: clone(ACCESS.screening), page: "screening", sections: questionsFromSchema() },
          {
            id: uid("step"),
            name: "Practitioner review",
            description: "Practitioner confirms or corrects findings, decides classifications, orders, referral and plan, then signs off.",
            access: clone(ACCESS.review),
            page: "review",
            sections: questionsFromSchema(ReviewSchema, "review"),
          },
        ],
      },
    ];
  }

  function load() {
    const saved = Db.read(KEY, null);
    if (!Array.isArray(saved) || !saved.length) return applyLayout(seedClinics());
    const fresh = seedClinics()[0];
    return saved.map((c) => (c.id === "diabetic-foot" && c.live !== fresh.live ? applyLayout([{ ...c, live: fresh.live, steps: fresh.steps }])[0] : c));
  }

  // Show the published layout in the builder: moved and switched-off questions, added ones
  function applyLayout(list) {
    const df = list.find((c) => c.id === "diabetic-foot");
    if (!df) return list;
    const cfg = Layout.current();
    const all = df.steps.flatMap((st) => st.sections.map((sec) => ({ st, sec })));
    for (const { sec } of all) {
      for (const q of [...sec.questions]) {
        if (!q.key) continue;
        const pl = Layout.placement(cfg, q.key);
        q.enabled = pl.enabled;
        const target = all.find(({ st, sec: s2 }) => st.page === pl.page && s2.key === pl.section);
        if (target && target.sec !== sec) {
          sec.questions.splice(sec.questions.indexOf(q), 1);
          target.sec.questions.push(q);
        }
      }
    }
    for (const c of cfg.custom) {
      if (all.some(({ sec }) => sec.questions.some((q) => q.id === c.id))) continue;
      const target = all.find(({ st, sec }) => st.page === c.page && sec.key === c.section) ?? all.find(({ st }) => st.page === c.page);
      if (target) target.sec.questions.push({ id: c.id, label: c.label, help: c.help ?? "", type: c.type, options: c.options ?? [], required: !!c.required, perFoot: !!c.perFoot, unit: c.unit ?? "", view: c.view, sites: c.sites, enabled: c.enabled !== false });
    }
    return list;
  }

  // Throws Db.SaveError (shown by the caller)
  function store(all) {
    Db.write(KEY, all, { where: "clinic builder" });
  }

  // F-13: builder -> live pages. Built-in questions: page, section, on / off.
  // Questions added here become clinic questions on the page and section they sit in.
  function layoutFromBuilder(clinic) {
    const cfg = Layout.current();
    cfg.questions = {};
    cfg.custom = [];
    const seen = new Set();
    for (const step of clinic.steps) {
      if (!step.page) continue;
      for (const sec of step.sections) {
        for (const q of sec.questions) {
          if (q.fixedMap) continue;
          if (q.key) {
            seen.add(q.key);
            const home = Layout.fieldOf(q.key);
            const o = {};
            if (step.page !== Layout.pageOfKey(q.key)) o.page = step.page;
            if (sec.key && sec.key !== home?.section) o.section = sec.key;
            if (q.enabled === false) o.enabled = false;
            if (Object.keys(o).length) cfg.questions[q.key] = { ...o, page: o.page ?? Layout.pageOfKey(q.key) };
          } else {
            cfg.custom.push({
              id: q.id, key: `x.${q.id}`, label: q.label, help: q.help, type: q.type, options: q.options, required: !!q.required,
              unit: q.unit, perFoot: !!q.perFoot, view: q.view, sites: q.sites, page: step.page, section: sec.key ?? null, enabled: q.enabled !== false,
            });
          }
        }
      }
    }
    // Built-in questions deleted in the builder are switched off on the page
    for (const page of ["screening", "review"]) {
      for (const q of Layout.catalogue(page)) if (!seen.has(q.key) && q.movable) cfg.questions[q.key] = { page, enabled: false };
    }
    return cfg;
  }

  let clinics = load();
  let draft = null; // clinic being edited (a copy until saved)
  let dirty = false;
  let openedSnapshot = null;
  const open = new Set(); // ids of expanded steps / questions

  // ---------- Access ----------

  const me = Access.currentUser();
  const isAdmin = Access.canAny(["admin.clinics", "clinic.setup"]);
  $("#settings-readonly").hidden = isAdmin;
  $$("[data-admin-only]").forEach((b) => (b.hidden = !isAdmin));

  // ---------- Toast ----------

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ---------- List view ----------

  function renderList() {
    const host = $("#clinic-list");
    host.replaceChildren(
      ...clinics.map((c) => {
        const card = el("article", "clinic-card");
        const head = el("div", "clinic-card__head");
        head.append(el("h3", "clinic-card__name", c.name || "Untitled clinic"));
        if (c.id === "diabetic-foot") head.append(el("span", "badge badge-status-complete", "Live"));
        card.append(head);
        card.append(el("p", "clinic-card__excerpt", c.excerpt || "No excerpt."));
        const flow = el("ol", "step-flow");
        c.steps.forEach((s) => flow.append(el("li", "", s.name || "Untitled step")));
        card.append(flow);
        const questions = c.steps.reduce((n, s) => n + s.sections.reduce((m, sec) => m + sec.questions.length, 0), 0);
        card.append(el("p", "clinic-card__meta", `${plural(c.nurses.length, "nurse")} · ${plural(c.practitioners.length, "practitioner")} · ${plural(c.steps.length, "step")} · ${plural(questions, "question")}`));
        const actions = el("div", "clinic-card__actions");
        const edit = el("button", "btn btn-outline btn-sm", isAdmin ? "Edit" : "View");
        edit.type = "button";
        edit.addEventListener("click", () => openEditor(c.id));
        actions.append(edit);
        if (isAdmin && c.id !== "diabetic-foot") {
          actions.append(
            iconButton("trash", "Delete", () => {
              clinics = clinics.filter((x) => x.id !== c.id);
              store(clinics);
              renderList();
              toast(`${c.name || "Clinic"} deleted`);
            }),
          );
        }
        card.append(actions);
        return card;
      }),
    );
  }

  // ---------- Editor ----------

  function openEditor(id) {
    const existing = clinics.find((c) => c.id === id);
    draft = existing
      ? clone(existing)
      : { id: uid("clinic"), name: "", excerpt: "", nurses: [], practitioners: [], steps: [{ id: uid("step"), name: "Screening room", description: "", access: clone(ACCESS.screening), sections: [{ id: uid("sec"), title: "Section 1", questions: [] }] }] };
    dirty = !existing;
    // What was stored when the editor opened: a save over someone else's newer save is refused (EC-11)
    openedSnapshot = JSON.stringify(Db.read(KEY, null));
    open.clear();
    if (!existing) open.add(draft.steps[0].id);
    $("#clinic-list-view").hidden = true;
    $("#clinic-editor").hidden = false;
    $("#editor-fieldset").disabled = !isAdmin;
    $("#clinic-name").value = draft.name;
    $("#clinic-excerpt").value = draft.excerpt;
    clearErrors();
    renderEditor();
    window.scrollTo({ top: 0 });
    (existing ? $("#back-to-list") : $("#clinic-name")).focus();
  }

  function closeEditor() {
    draft = null;
    dirty = false;
    $("#clinic-editor").hidden = true;
    $("#clinic-list-view").hidden = false;
    renderList();
  }

  function markDirty() {
    dirty = true;
    $("#editor-status").textContent = isAdmin ? "Unsaved changes" : "View only";
  }

  function renderEditor() {
    $("#editor-title").textContent = draft.name ? `Edit clinic: ${draft.name}` : "New clinic";
    $("#editor-status").textContent = !isAdmin ? "View only" : dirty ? "Unsaved changes" : "All changes saved";
    renderTeam();
    renderSteps();
  }

  // Team pickers
  function renderTeam() {
    for (const [role, hostId, key] of [["nurse", "#team-nurses", "nurses"], ["practitioner", "#team-practitioners", "practitioners"]]) {
      const host = $(hostId);
      host.replaceChildren(
        ...STAFF.filter((s) => s.role === role).map((s) => {
          const label = el("label", "staff-option");
          const input = el("input");
          input.type = "checkbox";
          input.checked = draft[key].includes(s.id);
          input.addEventListener("change", () => {
            draft[key] = input.checked ? [...draft[key], s.id] : draft[key].filter((x) => x !== s.id);
            markDirty();
          });
          const initials = s.name.split(" ").filter((_, i, a) => i === 0 || i === a.length - 1).map((p) => p[0]).join("");
          const text = el("span", "staff-option__text");
          text.append(el("span", "staff-option__name", s.name), el("span", "staff-option__title", `${s.title} · ID ${s.id}`));
          label.append(input, el("span", "staff-option__avatar", initials), text);
          return label;
        }),
      );
    }
  }

  // Steps
  function move(list, index, delta) {
    const to = index + delta;
    if (to < 0 || to >= list.length) return false;
    [list[index], list[to]] = [list[to], list[index]];
    return true;
  }

  function renderFlow() {
    const flow = $("#step-flow");
    flow.replaceChildren(...draft.steps.map((s) => el("li", "", s.name || "Untitled step")));
  }

  function accessSummary(step) {
    return ROLES.filter(([r]) => Object.values(step.access[r]).some(Boolean))
      .map(([r, label]) => {
        const p = step.access[r];
        const what = p.signoff ? "sign off" : p.edit ? "edit" : p.fill ? "fill" : "view";
        return `${label.replace("Screening ", "")}: ${what}`;
      });
  }

  function renderSteps() {
    renderFlow();
    const host = $("#step-list");
    host.replaceChildren(...draft.steps.map((step, i) => stepCard(step, i)));
  }

  function stepCard(step, i) {
    const details = el("details", "form-section step-card");
    details.dataset.step = step.id;
    details.open = open.has(step.id);
    details.addEventListener("toggle", () => (details.open ? open.add(step.id) : open.delete(step.id)));

    const summary = el("summary", "form-section__summary");
    summary.append(el("span", "form-section__letter", String(i + 1)));
    const title = el("span", "form-section__title");
    title.append(el("span", "step-card__name", step.name || "Untitled step"));
    const badges = el("span", "step-card__roles");
    accessSummary(step).forEach((t) => badges.append(el("span", "badge badge-secondary", t)));
    title.append(badges);
    summary.append(title);
    const qCount = step.sections.reduce((n, s) => n + s.questions.length, 0);
    summary.append(el("span", "badge badge-muted", plural(qCount, "question")));
    summary.insertAdjacentHTML("beforeend", `<svg class="form-section__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON.chevron}</svg>`);
    details.append(summary);

    const body = el("div", "form-section__body");

    // Toolbar: reorder / delete
    const toolbar = el("div", "builder-toolbar");
    const up = iconButton("up", "Move up", () => move(draft.steps, i, -1) && (markDirty(), renderSteps(), focusStep(step.id, "Move step up")), undefined, "Move step up");
    const down = iconButton("down", "Move down", () => move(draft.steps, i, 1) && (markDirty(), renderSteps(), focusStep(step.id, "Move step down")), undefined, "Move step down");
    up.disabled = i === 0;
    down.disabled = i === draft.steps.length - 1;
    const del = iconButton("trash", "Delete step", () => {
      draft.steps.splice(i, 1);
      markDirty();
      renderSteps();
    });
    del.disabled = draft.steps.length === 1;
    toolbar.append(up, down, del);
    body.append(toolbar);

    // Details
    const info = el("section", "subsection");
    info.append(el("h4", "subsection__title", "Step details"));
    info.append(textField("Step name", step.name, (v) => {
      step.name = v;
      $(".step-card__name", details).textContent = v || "Untitled step";
      renderFlow();
    }, { check: `step-name-${step.id}` }));
    info.append(textField("Description", step.description, (v) => (step.description = v), { long: true, optional: true }));
    body.append(info);

    // Access matrix
    const access = el("section", "subsection");
    access.append(el("h4", "subsection__title", "Who can access this step"));
    const table = el("table", "data-table access-table");
    const thead = el("thead");
    const hr = el("tr");
    hr.append(el("th", "", "Role"));
    PERMS.forEach(([, label]) => hr.append(el("th", "", label)));
    thead.append(hr);
    const tbody = el("tbody");
    for (const [role, roleLabel] of ROLES) {
      const tr = el("tr");
      tr.append(el("th", "", roleLabel));
      for (const [perm, permLabel] of PERMS) {
        const td = el("td");
        const box = el("input", "checkbox");
        box.type = "checkbox";
        box.checked = step.access[role][perm];
        box.setAttribute("aria-label", `${roleLabel}: ${permLabel}`);
        box.addEventListener("change", () => {
          step.access[role][perm] = box.checked;
          // Any action implies being able to see the step; no view means no actions
          if (box.checked && perm !== "view") step.access[role].view = true;
          if (!box.checked && perm === "view") PERMS.forEach(([p]) => (step.access[role][p] = false));
          markDirty();
          renderSteps();
          $(`[data-step="${step.id}"] input[aria-label="${roleLabel}: ${permLabel}"]`)?.focus();
        });
        td.append(box);
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    access.append(wrap);
    body.append(access);

    // Sections and questions
    const builder = el("section", "subsection");
    builder.append(el("h4", "subsection__title", "Sections and questions"));
    step.sections.forEach((section, si) => builder.append(sectionBlock(step, section, si)));
    const addSection = iconButton("plus", "Add section", () => {
      step.sections.push({ id: uid("sec"), title: `Section ${step.sections.length + 1}`, questions: [] });
      markDirty();
      renderSteps();
      const last = $$(`[data-step="${step.id}"] .builder-section`).pop();
      $("input", last)?.focus();
    }, "btn btn-outline btn-sm");
    builder.append(addSection);
    body.append(builder);

    details.append(body);
    return details;
  }

  function focusStep(stepId, buttonLabel) {
    const card = $(`[data-step="${stepId}"]`);
    const button = $$("button", card).find((b) => b.getAttribute("aria-label") === buttonLabel && !b.disabled) ?? $("summary", card);
    button.focus();
  }

  function textField(label, value, onInput, { long = false, optional = false, check = null, placeholder = "" } = {}) {
    const wrap = el("div", "q");
    if (check) wrap.dataset.check = check;
    const id = uid("f");
    const lab = el("label", "label", label);
    lab.htmlFor = id;
    if (optional) lab.append(el("span", "label__optional", " (optional)"));
    const input = el(long ? "textarea" : "input", long ? "input textarea" : "input");
    input.id = id;
    if (long) input.rows = 2;
    input.value = value ?? "";
    input.placeholder = placeholder;
    input.addEventListener("input", () => {
      onInput(input.value);
      markDirty();
      if (wrap.classList.contains("q--invalid") && input.value.trim()) setError(wrap, null);
    });
    wrap.append(lab, input);
    const err = el("p", "field-error");
    err.hidden = true;
    err.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';
    wrap.append(err);
    return wrap;
  }

  function sectionBlock(step, section, si) {
    const block = el("div", "builder-section");
    const head = el("div", "builder-section__head");
    head.append(textField(`Section ${si + 1} title`, section.title, (v) => (section.title = v)));
    const tools = el("div", "builder-toolbar");
    const up = iconButton("up", "Move up", () => move(step.sections, si, -1) && (markDirty(), renderSteps()), undefined, `Move section ${si + 1} up`);
    const down = iconButton("down", "Move down", () => move(step.sections, si, 1) && (markDirty(), renderSteps()), undefined, `Move section ${si + 1} down`);
    up.disabled = si === 0;
    down.disabled = si === step.sections.length - 1;
    tools.append(up, down, iconButton("trash", "Delete section", () => {
      step.sections.splice(si, 1);
      markDirty();
      renderSteps();
    }, undefined, `Delete section ${si + 1}`));
    head.append(tools);
    block.append(head);

    const list = el("div", "question-list");
    if (!section.questions.length) list.append(el("p", "field-hint", "No questions yet."));
    section.questions.forEach((question, qi) => list.append(questionItem(step, section, question, qi)));
    block.append(list);

    block.append(iconButton("plus", "Add question", () => {
      const nq = q("", "single", { options: ["Option 1", "Option 2"] });
      section.questions.push(nq);
      open.add(step.id);
      open.add(nq.id);
      markDirty();
      renderSteps();
      $(`[data-question="${nq.id}"] input`)?.focus();
    }, "btn btn-outline btn-sm"));
    return block;
  }

  function questionSummary(question) {
    const frag = document.createDocumentFragment();
    frag.append(el("span", "question-item__label", question.label || "Untitled question"));
    const meta = el("span", "question-item__meta");
    meta.append(el("span", "badge badge-secondary", TYPE_LABEL[question.type]));
    if (question.required) meta.append(el("span", "badge badge-risk-3", "Required"));
    if (question.enabled === false) meta.append(el("span", "badge badge-muted", "Switched off"));
    else if (draft?.live && !question.key && !question.fixedMap) meta.append(el("span", "badge badge-status-progress", "Clinic question"));
    if (question.perFoot && question.type !== "footmap") meta.append(el("span", "badge badge-muted", "Each foot"));
    frag.append(meta);
    return frag;
  }

  function questionItem(step, section, question, qi) {
    const item = el("details", "question-item");
    item.dataset.question = question.id;
    item.open = open.has(question.id);
    item.addEventListener("toggle", () => (item.open ? open.add(question.id) : open.delete(question.id)));
    const summary = el("summary", "question-item__summary");
    summary.append(questionSummary(question));
    item.append(summary);
    const refreshSummary = () => summary.replaceChildren(questionSummary(question));

    const body = el("div", "question-item__body");
    const tools = el("div", "builder-toolbar");
    const qName = question.label || "untitled question";
    const up = iconButton("up", "Move up", () => move(section.questions, qi, -1) && (markDirty(), renderSteps()), undefined, `Move ${qName} up`);
    const down = iconButton("down", "Move down", () => move(section.questions, qi, 1) && (markDirty(), renderSteps()), undefined, `Move ${qName} down`);
    up.disabled = qi === 0;
    down.disabled = qi === section.questions.length - 1;
    tools.append(
      up,
      down,
      iconButton("copy", "Duplicate", () => {
        const copy = { ...clone(question), id: uid("q"), label: `${question.label} (copy)` };
        delete copy.key; // a copy is a new clinic question
        delete copy.fixed;
        delete copy.fixedMap;
        section.questions.splice(qi + 1, 0, copy);
        open.add(copy.id);
        markDirty();
        renderSteps();
      }, undefined, `Duplicate ${qName}`),
      iconButton("trash", "Delete", () => {
        section.questions.splice(qi, 1);
        markDirty();
        renderSteps();
      }, undefined, `Delete ${qName}`),
    );
    body.append(tools);

    const grid = el("div", "question-editor");
    const preview = el("div", "question-preview");
    const refresh = () => {
      refreshSummary();
      renderPreview(preview, question);
    };

    grid.append(textField("Question", question.label, (v) => ((question.label = v), refresh()), { check: `q-label-${question.id}`, placeholder: "e.g. Dorsalis pedis pulse" }));
    grid.append(textField("Help text", question.help, (v) => ((question.help = v), refresh()), { optional: true }));

    // Answer type
    const typeWrap = el("div", "q");
    const typeId = uid("f");
    const typeLabel = el("label", "label", "Answer type");
    typeLabel.htmlFor = typeId;
    const typeSelect = el("select", "input select");
    typeSelect.id = typeId;
    TYPES.forEach(([v, l]) => typeSelect.append(new Option(l, v, false, v === question.type)));
    typeSelect.addEventListener("change", () => {
      question.type = typeSelect.value;
      if (HAS_OPTIONS.has(question.type) && question.options.length < 2) question.options = ["Option 1", "Option 2"];
      footmapDefaults(question);
      markDirty();
      renderSteps();
      $(`[data-question="${question.id}"] select`)?.focus();
    });
    typeWrap.append(typeLabel, typeSelect);
    grid.append(typeWrap);

    // Options editor
    if (HAS_OPTIONS.has(question.type)) {
      const optWrap = el("fieldset", "q options-editor");
      optWrap.dataset.check = `q-options-${question.id}`;
      optWrap.append(el("legend", "label", "Answer options"));
      question.options.forEach((opt, oi) => {
        const row = el("div", "option-row");
        const input = el("input", "input");
        input.value = opt;
        input.setAttribute("aria-label", `Option ${oi + 1}`);
        input.addEventListener("input", () => {
          question.options[oi] = input.value;
          markDirty();
          refresh();
        });
        const remove = iconButton("x", "Remove", () => {
          question.options.splice(oi, 1);
          markDirty();
          renderSteps();
        });
        remove.setAttribute("aria-label", `Remove option ${oi + 1}`);
        row.append(input, remove);
        optWrap.append(row);
      });
      optWrap.append(iconButton("plus", "Add option", () => {
        question.options.push(`Option ${question.options.length + 1}`);
        markDirty();
        renderSteps();
        const inputs = $$(`[data-question="${question.id}"] .option-row input`);
        inputs[inputs.length - 1]?.select();
      }, "btn btn-outline btn-sm"));
      const err = el("p", "field-error");
      err.hidden = true;
      err.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';
      optWrap.append(err);
      grid.append(optWrap);
    }

    if (question.type === "footmap") {
      footmapDefaults(question);
      const viewWrap = el("div", "q");
      const viewId = uid("f");
      const viewLabel = el("label", "label", "View");
      viewLabel.htmlFor = viewId;
      const viewSelect = el("select", "input select");
      viewSelect.id = viewId;
      MAP_VIEWS.forEach(([v, l]) => viewSelect.append(new Option(l, v, false, v === question.view)));
      viewSelect.addEventListener("change", () => {
        question.view = viewSelect.value;
        markDirty();
        renderSteps();
      });
      viewWrap.append(viewLabel, viewSelect);
      grid.append(viewWrap);

      const sitesWrap = el("fieldset", "q");
      sitesWrap.dataset.check = `q-sites-${question.id}`;
      sitesWrap.append(el("legend", "label", "Tappable sites"));
      const chips = el("div", "chips");
      for (const [zone, label] of Object.entries(DIAGRAM.labels)) {
        const chip = el("label", "chip");
        const box = el("input");
        box.type = "checkbox";
        box.checked = question.sites.includes(zone);
        box.addEventListener("change", () => {
          question.sites = Object.keys(DIAGRAM.labels).filter((z) => (z === zone ? box.checked : question.sites.includes(z)));
          markDirty();
          refresh();
        });
        chip.append(box, el("span", "", label));
        chips.append(chip);
      }
      sitesWrap.append(chips);
      if (question.view === "dorsal") sitesWrap.append(el("p", "field-hint", "The heel is not shown in the top view."));
      const err = el("p", "field-error");
      err.hidden = true;
      err.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';
      sitesWrap.append(err);
      grid.append(sitesWrap);
    }

    if (question.type === "number") {
      grid.append(textField("Unit", question.unit, (v) => ((question.unit = v), refresh()), { optional: true, placeholder: "e.g. mmHg" }));
    }

    // Toggles
    const toggles = el("div", "toggle-row");
    // A foot map always shows both feet, so "Ask for each foot" doesn't apply
    const toggleKeys = question.type === "footmap" ? [["required", "Required"]] : [["required", "Required"], ["perFoot", "Ask for each foot"]];
    for (const [key, label] of toggleKeys) {
      const t = el("label", "toggle");
      const box = el("input", "checkbox");
      box.type = "checkbox";
      box.checked = !!question[key];
      box.addEventListener("change", () => {
        question[key] = box.checked;
        markDirty();
        refresh();
      });
      t.append(box, el("span", "", label));
      toggles.append(t);
    }
    // Switched off: hidden on the live form, kept here (EC-09: nothing is deleted)
    const on = el("label", "toggle");
    on.dataset.keep = "";
    const onBox = el("input", "checkbox");
    onBox.type = "checkbox";
    onBox.checked = question.enabled !== false;
    onBox.addEventListener("change", () => {
      question.enabled = onBox.checked;
      markDirty();
      renderSteps();
    });
    on.append(onBox, el("span", "", "Shown on the form"));
    toggles.append(on);
    grid.append(toggles);

    // Move to another section or step (live steps only)
    if (draft.live && !question.fixed && !question.fixedMap) {
      const wrap = el("div", "q");
      wrap.dataset.keep = "";
      const sid = uid("f");
      const lab = el("label", "label", "Section");
      lab.htmlFor = sid;
      const sel = el("select", "input select");
      sel.id = sid;
      for (const st of draft.steps) {
        const og = document.createElement("optgroup");
        og.label = st.name;
        st.sections.forEach((sec2) => og.append(new Option(sec2.title || "Untitled section", sec2.id, false, sec2 === section)));
        sel.append(og);
      }
      sel.addEventListener("change", () => {
        const target = draft.steps.flatMap((st) => st.sections).find((x) => x.id === sel.value);
        if (!target || target === section) return;
        section.questions.splice(section.questions.indexOf(question), 1);
        target.questions.push(question);
        open.add(question.id);
        markDirty();
        renderSteps();
      });
      wrap.append(lab, sel, el("p", "field-hint", "Moving a question to the other step moves it to that page for new encounters."));
      grid.append(wrap);
    }

    body.append(grid);
    // Built-in questions: wording and answers are fixed in this version; they can be moved
    // or switched off. Questions added here are fully editable.
    if (question.key || question.fixedMap) {
      $$("input, select, textarea, button", grid).forEach((f) => {
        if (!f.closest("[data-keep]")) f.disabled = true;
      });
      grid.prepend(el("p", "field-hint builtin-note", question.fixedMap ? "Built-in foot map. Shown here for reference." : question.fixed ? "Built-in question that feeds the risk calculation: always on and can't be moved." : "Built-in question: the wording and answers are fixed. You can move it or switch it off."));
      if (question.fixed) $$("[data-keep] input, [data-keep] select", grid).forEach((f) => (f.disabled = true));
    }
    const previewWrap = el("div", "question-preview-wrap");
    previewWrap.append(el("p", "eyebrow", "Preview"), preview);
    body.append(previewWrap);
    renderPreview(preview, question);
    item.append(body);
    return item;
  }

  // ---------- Live preview of one question ----------

  function renderPreview(host, question) {
    host.replaceChildren();
    const label = el("p", "label", question.label || "Untitled question");
    if (question.required) label.append(el("span", "preview-required", " *"));
    host.append(label);
    if (question.help) host.append(el("p", "field-hint", question.help));
    const control = previewControl(question);
    if (question.perFoot && question.type !== "footmap") {
      const feet = el("div", "preview-feet");
      for (const side of ["Left foot", "Right foot"]) {
        const col = el("div", "preview-foot");
        col.append(el("span", "preview-foot__label", side), previewControl(question));
        feet.append(col);
      }
      host.append(feet);
    } else host.append(control);
  }

  function previewControl(question) {
    const name = uid("preview");
    const chips = (options, kind) => {
      const wrap = el("div", "chips");
      options.filter(Boolean).forEach((o) => {
        const c = el("label", "chip");
        const i = el("input");
        i.type = kind;
        i.name = name;
        c.append(i, el("span", "", o));
        wrap.append(c);
      });
      return wrap;
    };
    switch (question.type) {
      case "single":
        return chips(question.options, "radio");
      case "multiple":
        return chips(question.options, "checkbox");
      case "yesno":
        return chips(["Yes", "No"], "radio");
      case "select": {
        const s = el("select", "input select");
        s.append(new Option("Choose…", ""));
        question.options.filter(Boolean).forEach((o) => s.append(new Option(o, o)));
        return s;
      }
      case "number": {
        const w = el("div", "input-unit");
        const i = el("input", "input");
        i.type = "number";
        w.append(i);
        if (question.unit) w.append(el("span", "input-unit__suffix", question.unit));
        return w;
      }
      case "scale": {
        const r = el("input", "range");
        r.type = "range";
        r.min = 0;
        r.max = 10;
        return r;
      }
      case "longtext": {
        const t = el("textarea", "input textarea");
        t.rows = 2;
        return t;
      }
      case "date": {
        const d = el("input", "input");
        d.type = "date";
        return d;
      }
      case "photo": {
        const f = el("input", "file-input");
        f.type = "file";
        f.accept = "image/*";
        return f;
      }
      case "footmap":
        return footmapPreview(question);
      default:
        return el("input", "input");
    }
  }

  // Real diagram, same orientation as the live form: sole view reads right foot then
  // left foot, top view left then right, big toes towards the centre (UAT F-11).
  // Tapping a site in the preview shows how it will respond.
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  function footSvg(side, view, sites) {
    const svg = svgEl("svg", { class: "foot-map__svg", viewBox: "0 0 100 220", role: "group", "aria-label": `${side === "left" ? "Left" : "Right"} foot, ${view === "plantar" ? "sole" : "top"} view` });
    const flip = view === "plantar" ? side === "right" : side === "left";
    const g = svgEl("g", flip ? { transform: "translate(100 0) scale(-1 1)" } : {});
    g.append(svgEl("path", { class: "foot-outline", d: DIAGRAM.outline }));
    const shape = (zone, tag, attrs) => {
      const tappable = sites.includes(zone);
      const node = svgEl(tag, { ...attrs, class: tappable ? "foot-zone" : "foot-landmark", "data-zone": zone });
      const title = svgEl("title");
      title.textContent = DIAGRAM.labels[zone];
      node.append(title);
      if (tappable) {
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", DIAGRAM.labels[zone]);
        const toggle = () => node.classList.toggle("is-selected");
        node.addEventListener("click", toggle);
        node.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
      }
      g.append(node);
    };
    for (const [z, cx, cy, rx, ry] of DIAGRAM.toes) {
      shape(z, "ellipse", { cx, cy, rx, ry });
      if (view === "dorsal") g.append(svgEl("ellipse", { class: "foot-nail", cx, cy: (cy - ry * 0.35).toFixed(1), rx: (rx * 0.55).toFixed(1), ry: (ry * 0.4).toFixed(1) }));
    }
    for (const [z, cx, cy, r] of DIAGRAM.mths) shape(z, "circle", { cx, cy, r });
    const [mx, my, mrx, mry] = DIAGRAM.midfoot;
    shape("midfoot", "ellipse", { cx: mx, cy: my, rx: mrx, ry: mry });
    if (view === "plantar") {
      const [hx, hy, hrx, hry] = DIAGRAM.heel;
      shape("heel", "ellipse", { cx: hx, cy: hy, rx: hrx, ry: hry });
    }
    svg.append(g);
    return svg;
  }

  function footmapPreview(question) {
    footmapDefaults(question);
    const wrap = el("div", "preview-footmap");
    const views = question.view === "both" ? ["plantar", "dorsal"] : [question.view];
    const viewsWrap = el("div", "ulcer-map__views");
    for (const view of views) {
      const block = el("div", "ulcer-map__view");
      block.append(el("p", "ulcer-map__view-title", view === "plantar" ? "Sole view" : "Top view"));
      const feet = el("div", "ulcer-map__feet");
      const order = view === "plantar" ? [["right", "Right foot"], ["left", "Left foot"]] : [["left", "Left foot"], ["right", "Right foot"]];
      for (const [side, label] of order) {
        const fig = el("figure", "ulcer-map__foot");
        fig.append(footSvg(side, view, question.sites), el("figcaption", "", label));
        feet.append(fig);
      }
      block.append(feet);
      viewsWrap.append(block);
    }
    const shown = shownSites(question);
    wrap.append(viewsWrap, el("p", "field-hint", shown.length ? `Tappable: ${shown.map((z) => DIAGRAM.labels[z]).join(", ")}.` : "No sites chosen yet."));
    return wrap;
  }

  // ---------- Validation and save ----------

  function setError(wrap, message) {
    const err = $(":scope > .field-error", wrap);
    wrap.classList.toggle("q--invalid", !!message);
    if (err) {
      err.hidden = !message;
      $("span", err).textContent = message ?? "";
    }
    const input = $("input, textarea", wrap);
    if (input && !wrap.matches("fieldset")) {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  }

  function clearErrors() {
    $$("#clinic-editor .q--invalid").forEach((w) => setError(w, null));
  }

  function validate() {
    const problems = []; // [checkKey, message, openIds]
    if (!draft.name.trim()) problems.push(["name", "Enter the clinic name.", []]);
    draft.steps.forEach((step) => {
      if (!step.name.trim()) problems.push([`step-name-${step.id}`, "Enter the step name.", [step.id]]);
      step.sections.forEach((section) =>
        section.questions.forEach((question) => {
          if (!question.label.trim()) problems.push([`q-label-${question.id}`, "Enter the question text.", [step.id, question.id]]);
          if (question.type === "footmap") {
            footmapDefaults(question);
            if (!shownSites(question).length) problems.push([`q-sites-${question.id}`, "Choose at least one site the user can tap.", [step.id, question.id]]);
          }
          if (HAS_OPTIONS.has(question.type) && question.options.filter((o) => o.trim()).length < 2) {
            problems.push([`q-options-${question.id}`, "Add at least two answer options.", [step.id, question.id]]);
          }
        }),
      );
    });
    return problems;
  }

  $("#clinic-name").addEventListener("input", (e) => {
    draft.name = e.target.value;
    $("#editor-title").textContent = draft.name ? `Edit clinic: ${draft.name}` : "New clinic";
    markDirty();
    if (draft.name.trim()) setError($('[data-check="name"]'), null);
  });
  $("#clinic-excerpt").addEventListener("input", (e) => {
    draft.excerpt = e.target.value;
    markDirty();
  });

  $("#add-step").addEventListener("click", () => {
    const step = { id: uid("step"), name: "", description: "", access: clone(ACCESS.blank), sections: [{ id: uid("sec"), title: "Section 1", questions: [] }] };
    draft.steps.push(step);
    open.add(step.id);
    markDirty();
    renderSteps();
    $(`[data-step="${step.id}"] .subsection input`)?.focus();
  });

  $("#clinic-editor").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin) return;
    const problems = validate();
    if (problems.length) {
      problems.forEach(([, , ids]) => ids.forEach((id) => open.add(id)));
      renderSteps();
      clearErrors();
      for (const [check, message] of problems) {
        const wrap = $(`[data-check="${check}"]`);
        if (wrap) setError(wrap, message);
      }
      const first = $(`[data-check="${problems[0][0]}"]`);
      first?.scrollIntoView({ block: "center" });
      $("input, textarea", first)?.focus();
      $("#editor-status").textContent = `${plural(problems.length, "problem")} to fix before saving`;
      return;
    }
    const index = clinics.findIndex((c) => c.id === draft.id);
    const next = [...clinics];
    if (index >= 0) next[index] = clone(draft);
    else next.push(clone(draft));
    let published = null;
    if (JSON.stringify(Db.read(KEY, null)) !== openedSnapshot) {
      $("#editor-status").textContent = "Another administrator saved clinic settings after you opened this editor. Nothing was saved. Cancel and reopen to see their changes.";
      toast("Not saved: changed by someone else");
      return;
    }
    try {
      if (draft.live) {
        const before = Layout.current();
        const cfg = layoutFromBuilder(draft);
        if (JSON.stringify([before.questions, before.custom]) !== JSON.stringify([cfg.questions, cfg.custom])) {
          published = Layout.publish(cfg, "Questions changed in the clinic builder", Layout.state().rev);
        }
      }
      store(next);
    } catch (e) {
      $("#editor-status").textContent = e.message;
      toast(e.message);
      return;
    }
    clinics = next;
    openedSnapshot = JSON.stringify(next);
    Audit.log("setup.change", { action: `Clinic ${draft.name} saved${published ? `; page layout version ${published} published` : ""}` });
    dirty = false;
    $("#editor-status").textContent = "All changes saved";
    toast(published ? `${draft.name} saved. Layout version ${published} is live for new encounters.` : `${draft.name} saved`);
  });

  $("#new-clinic").addEventListener("click", () => openEditor(null));
  $("#back-to-list").addEventListener("click", () => {
    if (dirty && isAdmin) toast("Unsaved changes discarded");
    closeEditor();
  });
  $("#cancel-edit").addEventListener("click", () => {
    if (dirty && isAdmin) toast("Changes discarded");
    closeEditor();
  });

  renderList();

  // ---------- Settings sections (hash routing: #clinics, #roles) ----------

})();
