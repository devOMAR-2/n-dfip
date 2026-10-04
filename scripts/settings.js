// Settings › Clinics: demo clinic builder (details, team, ordered steps, step access,
// sections and questions). UI only: saved to localStorage, doesn't change live pages.
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

  function questionsFromSchema() {
    const typeOf = { radio: "single", checkbox: "multiple", number: "number", range: "scale", text: "text", select: "select", file: "photo" };
    const sections = [];
    const seen = new Set();
    for (const f of ScreeningSchema.fields) {
      const parts = f.name.split(".");
      const perFoot = parts[1] === "left" || parts[1] === "right";
      const perUlcer = /^\d$/.test(parts[1]);
      const key = perFoot || perUlcer ? `${parts[0]}.*.${parts.slice(2).join(".")}` : f.name;
      if (seen.has(key)) continue;
      seen.add(key);
      let section = sections.find((s) => s.letter === f.section);
      if (!section) {
        section = { id: uid("sec"), letter: f.section, title: `${f.section} · ${ScreeningSchema.sections[f.section]}`, questions: [] };
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
      });
    }
    // The nurse form places sensation sites on a foot map
    const c = sections.find((s) => s.letter === "C");
    if (c) c.questions.splice(1, 0, { id: uid("q"), label: "Sensation sites", help: "Tap a site to cycle Detected / Absent / Not assessed", type: "footmap", options: [], required: true, perFoot: true, unit: "" });
    sections.forEach((s) => delete s.letter);
    return sections;
  }

  const q = (label, type, extra = {}) => ({ id: uid("q"), label, help: "", type, options: [], required: true, perFoot: false, unit: "", ...extra });

  function seedClinics() {
    return [
      {
        id: "diabetic-foot",
        name: "Diabetic Foot",
        excerpt: "Structured foot screening by trained staff, prepared for practitioner review. One connected record supporting prevention, continuity and limb preservation.",
        nurses: ["100002", "200011"],
        practitioners: ["100003", "200021"],
        steps: [
          { id: uid("step"), name: "Screening room", description: "Nurse records objective measurements before the practitioner sees the patient.", access: clone(ACCESS.screening), sections: questionsFromSchema() },
          {
            id: uid("step"),
            name: "Practitioner review",
            description: "Practitioner confirms or corrects findings, decides classifications, orders, referral and plan, then signs off.",
            access: clone(ACCESS.review),
            sections: [
              { id: uid("sec"), title: "Wound evaluation", questions: [
                q("Onset / duration", "single", { options: ["< 1 week", "1–4 weeks", "1–3 months", "> 3 months"] }),
                q("Type / cause", "single", { options: ["Neuropathic", "Ischaemic", "Neuro-ischaemic", "Pressure", "Trauma", "Surgical", "Other"] }),
                q("Length", "number", { unit: "cm" }), q("Width", "number", { unit: "cm" }), q("Depth", "number", { unit: "cm" }),
                q("Local infection signs", "multiple", { options: ["Swelling / induration", "Erythema", "Tenderness", "Warmth", "Purulent discharge", "None"] }),
                q("Probe-to-bone", "single", { options: ["Positive", "Negative"] }),
              ] },
              { id: uid("sec"), title: "Referral decision", questions: [
                q("Referral needed?", "yesno"),
                q("Destination", "single", { options: ["Secondary Care", "Private Center", "Vascular", "Wound Care", "Tertiary"] }),
                q("Urgency", "single", { options: ["Routine", "Soon", "Urgent", "Emergency"] }),
              ] },
              { id: uid("sec"), title: "Plan", questions: [
                q("Follow-up interval", "select", { options: ["48 hours", "1 week", "2 weeks", "1 month", "1–3 months", "3–6 months", "6–12 months", "12 months"] }),
                q("Patient / carer understands the plan", "yesno"),
              ] },
              { id: uid("sec"), title: "Sign-off", questions: [q("Clinical impression", "longtext"), q("Signature", "text", { help: "Must match the signed-in name" })] },
            ],
          },
        ],
      },
    ];
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return seedClinics();
  }

  function store(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
  }

  let clinics = load();
  let draft = null; // clinic being edited (a copy until saved)
  let dirty = false;
  const open = new Set(); // ids of expanded steps / questions

  // ---------- Access ----------

  const me = Auth.findUser(Auth.getSessionId());
  const isAdmin = me?.role === "admin";
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
    if (question.perFoot) meta.append(el("span", "badge badge-muted", "Each foot"));
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

    if (question.type === "number") {
      grid.append(textField("Unit", question.unit, (v) => ((question.unit = v), refresh()), { optional: true, placeholder: "e.g. mmHg" }));
    }

    // Toggles
    const toggles = el("div", "toggle-row");
    for (const [key, label] of [["required", "Required"], ["perFoot", "Ask for each foot"]]) {
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
    grid.append(toggles);

    body.append(grid);
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
        return el("p", "preview-footmap", "Interactive foot diagram (left and right sole) with tappable sites.");
      default:
        return el("input", "input");
    }
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
    if (index >= 0) clinics[index] = clone(draft);
    else clinics.push(clone(draft));
    store(clinics);
    dirty = false;
    $("#editor-status").textContent = "All changes saved";
    toast(`${draft.name} saved`);
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

  function route() {
    const view = location.hash === "#roles" ? "roles" : "clinics";
    $("#clinics").hidden = view !== "clinics";
    $("#roles").hidden = view !== "roles";
    $$(".settings-nav a").forEach((a) => {
      if (a.getAttribute("href") === `#${view}`) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
  window.addEventListener("hashchange", route);
  route();
})();
