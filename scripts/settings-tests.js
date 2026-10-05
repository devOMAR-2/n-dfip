// Settings › Tests & approvals (#tests): the test catalogue of the Diabetic Foot clinic
// definition, with approval rules, insurance and escalation (UAT-17, EC-13).
// Editable with "clinic.setup"; view only with "tests.approve" alone.
// Tests are retired, never deleted (EC-09). A save based on an outdated copy is refused (EC-11).
// Needs tests.js.

(() => {
  const host = document.getElementById("tests");
  if (!host || typeof TestCatalog === "undefined") return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ERROR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>';
  const PLUS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>';
  const SAVE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></svg>';
  let uidN = 0;
  const uid = (p) => `${p}-${++uidN}`;

  const canEdit = () => Access.can("clinic.setup");
  const GROUP_LABEL = Object.fromEntries(TestCatalog.GROUPS);
  const MODE_LABEL = Object.fromEntries(TestCatalog.MODES);
  const clinical = () => Staff.active().filter((s) => ["practitioner", "senior", "supervisor"].includes(s.role));

  let loaded = TestCatalog.state();
  let draft = clone(loaded.tests);
  let open = new Set();

  const dirty = () => JSON.stringify(draft) !== JSON.stringify(loaded.tests);

  // ---------- Skeleton ----------

  host.innerHTML = "";
  const form = el("form", "settings-form");
  form.noValidate = true;
  const header = el("div", "page-header page-header--split");
  const titles = el("div");
  titles.append(
    el("h2", "section-title", "Tests & approvals"),
    el("p", "field-hint", "The tests the Diabetic Foot clinic can order. For each one: whether it needs clinical approval and from whom, whether insurance must approve it, and when a waiting approval escalates. Retired tests can't be ordered; old orders keep their name."),
  );
  const addBtn = el("button", "btn btn-primary");
  addBtn.type = "button";
  addBtn.innerHTML = PLUS + "Add test";
  header.append(titles, addBtn);
  const readonly = el("div", "callout callout-warning");
  readonly.innerHTML = `${ERROR_ICON}<div><strong>View only</strong><p>Only users with the clinic setup permission can change tests and approval rules.</p></div>`;
  const banner = el("div", "callout callout-danger");
  banner.hidden = true;
  banner.setAttribute("role", "alert");
  const list = el("div", "test-catalogue");
  const actions = el("div", "form-actions");
  const status = el("p", "form-actions__progress");
  status.setAttribute("aria-live", "polite");
  const buttons = el("div", "form-actions__buttons");
  const discard = el("button", "btn btn-outline", "Discard changes");
  discard.type = "button";
  const save = el("button", "btn btn-primary");
  save.type = "submit";
  save.innerHTML = SAVE + "Save tests";
  buttons.append(discard, save);
  actions.append(status, buttons);
  form.append(header, readonly, banner, list, actions);
  host.append(form);

  function updateStatus(message) {
    status.textContent = message ?? (!canEdit() ? "View only" : dirty() ? "Unsaved changes" : "All changes saved");
  }

  // ---------- Field helpers ----------

  function wrap(label, control, { check, hint, wide } = {}) {
    const q = el("div", `q${wide ? " q--wide" : ""}`);
    if (check) q.dataset.check = check;
    const l = el("label", "label", label);
    l.htmlFor = control.id;
    q.append(l, control);
    if (hint) q.append(el("p", "field-hint", hint));
    const err = el("p", "field-error");
    err.hidden = true;
    err.innerHTML = ERROR_ICON + "<span></span>";
    q.append(err);
    return q;
  }

  function select(options, value, onChange) {
    const s = el("select", "input select");
    s.id = uid("t");
    options.forEach(([v, l]) => s.append(new Option(l, v, false, v === value)));
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }

  const changed = () => {
    updateStatus();
  };

  // ---------- One test ----------

  function summaryBadges(test) {
    const out = [el("span", "badge badge-muted", GROUP_LABEL[test.group] ?? test.group)];
    const a = test.approval;
    if (a.mode === "role") out.push(el("span", "badge badge-status-attention", a.role === "senior" ? "Senior doctor approves" : "Practitioner approves"));
    if (a.mode === "person") out.push(el("span", "badge badge-status-attention", `${TestOrders.staffName(a.people[0]) || "Person not chosen"} approves`));
    if (a.mode === "people") out.push(el("span", "badge badge-status-attention", `${a.people.length} people approve`));
    if (test.insurance) out.push(el("span", "badge badge-status-progress", "Insurance"));
    if (test.status === "retired") out.push(el("span", "badge badge-danger", "Retired"));
    return out;
  }

  function testCard(test) {
    const card = el("details", `test-card${test.status === "retired" ? " test-card--retired" : ""}`);
    card.dataset.test = test.id;
    card.open = open.has(test.id);
    card.addEventListener("toggle", () => (card.open ? open.add(test.id) : open.delete(test.id)));
    const summary = el("summary");
    const name = el("span", "test-card__name", test.label || "New test");
    summary.append(name, ...summaryBadges(test));
    card.append(summary);
    const body = el("div", "test-card__body");
    const refreshSummary = () => {
      name.textContent = test.label || "New test";
      summary.replaceChildren(name, ...summaryBadges(test));
    };

    const nameInput = el("input", "input");
    nameInput.id = uid("t");
    nameInput.value = test.label;
    nameInput.addEventListener("input", () => {
      test.label = nameInput.value;
      refreshSummary();
      changed();
    });
    body.append(wrap("Test name", nameInput, { check: `label-${test.id}` }));

    body.append(wrap("Group", select(TestCatalog.GROUPS, test.group, (v) => ((test.group = v), refreshSummary(), changed()))));

    body.append(wrap("Clinical approval", select(TestCatalog.MODES, test.approval.mode, (v) => {
      test.approval.mode = v;
      if (v === "person") test.approval.people = test.approval.people.slice(0, 1);
      open.add(test.id);
      render();
      changed();
    })));

    const a = test.approval;
    if (a.mode === "role") {
      body.append(wrap("Who can approve", select(TestCatalog.ROLE_LEVELS, a.role, (v) => ((a.role = v), refreshSummary(), changed())), {
        hint: "Any one person at this level or higher in the clinic, other than the one who ordered it.",
      }));
    }
    if (a.mode === "person") {
      const opts = [["", "Choose a person…"], ...clinical().map((s) => [s.id, `${s.name} (${s.title})`])];
      body.append(wrap("Approver", select(opts, a.people[0] ?? "", (v) => ((a.people = v ? [v] : []), refreshSummary(), changed())), { check: `people-${test.id}` }));
    }
    if (a.mode === "people") {
      const fs = el("fieldset", "q q--wide");
      fs.dataset.check = `people-${test.id}`;
      fs.append(el("legend", "label", "Approvers (all must approve)"));
      const chips = el("div", "chips");
      for (const s of clinical()) {
        const chip = el("label", "chip");
        const box = el("input");
        box.type = "checkbox";
        box.checked = a.people.includes(s.id);
        box.addEventListener("change", () => {
          a.people = clinical().map((x) => x.id).filter((id) => (id === s.id ? box.checked : a.people.includes(id)));
          refreshSummary();
          changed();
        });
        chip.append(box, el("span", "", s.name));
        chips.append(chip);
      }
      const err = el("p", "field-error");
      err.hidden = true;
      err.innerHTML = ERROR_ICON + "<span></span>";
      fs.append(chips, el("p", "field-hint", "Regardless of their role."), err);
      body.append(fs);
    }

    if (a.mode !== "none") {
      const hours = el("input", "input");
      hours.id = uid("t");
      hours.type = "number";
      hours.min = "1";
      hours.step = "1";
      hours.inputMode = "numeric";
      hours.value = test.escalateAfterHours ?? "";
      hours.addEventListener("input", () => {
        test.escalateAfterHours = hours.value === "" ? null : Number(hours.value);
        changed();
      });
      body.append(wrap("Escalate after (hours)", hours, { check: `hours-${test.id}`, hint: "A waiting approval then goes to the backup, or to the facility supervisor if there is no backup." }));
      const opts = [["", "Facility supervisor"], ...clinical().map((s) => [s.id, `${s.name} (${s.title})`])];
      body.append(wrap("Backup approver", select(opts, test.backup ?? "", (v) => ((test.backup = v), changed())), { check: `backup-${test.id}` }));
    }

    const insurance = el("label", "toggle q--wide");
    const box = el("input", "checkbox");
    box.type = "checkbox";
    box.checked = !!test.insurance;
    box.addEventListener("change", () => {
      test.insurance = box.checked;
      refreshSummary();
      changed();
    });
    insurance.append(box, el("span", "", "Insurance approval required (tracked separately from the clinical approval)"));
    body.append(insurance);

    const footer = el("div", "test-card__footer");
    const retire = el("button", "btn btn-outline btn-sm", test.status === "retired" ? "Restore" : "Retire");
    retire.type = "button";
    retire.addEventListener("click", () => {
      test.status = test.status === "retired" ? "active" : "retired";
      open.add(test.id);
      render();
      changed();
    });
    footer.append(retire);
    if (test.status !== "retired") footer.prepend(el("p", "field-hint", "Retiring removes the test from ordering. Past orders keep it."));
    body.append(footer);

    card.append(body);
    return card;
  }

  function render() {
    const nodes = [];
    for (const [g, gl] of TestCatalog.GROUPS) {
      const tests = draft.filter((x) => x.group === g);
      if (!tests.length) continue;
      nodes.push(el("h3", "test-catalogue__group-title", gl), ...tests.map(testCard));
    }
    list.replaceChildren(...nodes);
    const edit = canEdit();
    readonly.hidden = edit;
    addBtn.hidden = !edit;
    buttons.hidden = !edit;
    if (!edit) $$("input, select, textarea, .test-card__footer button", list).forEach((f) => (f.disabled = true));
  }

  // ---------- Validation (EC-08) ----------

  function setError(check, message) {
    const q = $(`[data-check="${check}"]`, list);
    if (!q) return;
    q.classList.toggle("q--invalid", !!message);
    const err = $(":scope > .field-error", q);
    if (err) {
      err.hidden = !message;
      $("span", err).textContent = message ?? "";
    }
    $$("input, select", q).forEach((i) => (message ? i.setAttribute("aria-invalid", "true") : i.removeAttribute("aria-invalid")));
  }

  function validate() {
    const problems = [];
    const names = new Map();
    for (const t of draft) {
      const label = t.label.trim();
      if (!label) problems.push([t.id, `label-${t.id}`, "Enter the test name."]);
      else if (names.has(label.toLowerCase())) problems.push([t.id, `label-${t.id}`, "Another test has this name."]);
      names.set(label.toLowerCase(), t.id);
      const a = t.approval;
      if (a.mode === "person" && !a.people[0]) problems.push([t.id, `people-${t.id}`, "Choose who approves this test."]);
      if (a.mode === "people" && a.people.length < 2) problems.push([t.id, `people-${t.id}`, "Choose at least two people, or use \"One named person\"."]);
      if (a.mode !== "none") {
        const h = t.escalateAfterHours;
        if (h === null || h === undefined || !Number.isFinite(h) || h <= 0 || !Number.isInteger(h)) problems.push([t.id, `hours-${t.id}`, "Enter a whole number of hours, 1 or more."]);
        else if (h > 720) problems.push([t.id, `hours-${t.id}`, "Use 720 hours (30 days) or less."]);
        if (t.backup && (a.people.includes(t.backup) && a.mode !== "role")) problems.push([t.id, `backup-${t.id}`, "The backup must be someone other than the approvers."]);
      }
    }
    return problems;
  }

  // ---------- Actions ----------

  addBtn.addEventListener("click", () => {
    const id = `test-${Date.now().toString(36)}`;
    draft.push({ id, label: "", group: "lab", approval: { mode: "none", role: "practitioner", people: [] }, insurance: false, escalateAfterHours: 24, backup: "", status: "active", added: true });
    open.add(id);
    render();
    updateStatus();
    $(`[data-test="${id}"] input`, list)?.focus();
  });

  discard.addEventListener("click", () => {
    loaded = TestCatalog.state();
    draft = clone(loaded.tests);
    banner.hidden = true;
    render();
    updateStatus("Changes discarded");
  });

  let saving = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!canEdit() || saving) return;
    $$(".q--invalid", list).forEach((q) => q.classList.remove("q--invalid"));
    $$(".field-error", list).forEach((e) => (e.hidden = true));
    banner.hidden = true;
    const problems = validate();
    if (problems.length) {
      problems.forEach(([id]) => open.add(id));
      render();
      problems.forEach(([, check, message]) => setError(check, message));
      const first = $(`[data-check="${problems[0][1]}"] input, [data-check="${problems[0][1]}"] select`, list);
      first?.focus();
      updateStatus(`Fix ${problems.length === 1 ? "the highlighted field" : `${problems.length} highlighted fields`} before saving`);
      return;
    }
    saving = true;
    save.disabled = true;
    try {
      const before = new Map(loaded.tests.map((x) => [x.id, x]));
      const added = draft.filter((x) => !before.has(x.id)).map((x) => x.label);
      const retired = draft.filter((x) => x.status === "retired" && before.get(x.id)?.status !== "retired").map((x) => x.label);
      const restored = draft.filter((x) => x.status !== "retired" && before.get(x.id)?.status === "retired").map((x) => x.label);
      const edited = draft.filter((x) => before.has(x.id) && JSON.stringify(x) !== JSON.stringify(before.get(x.id)) && !retired.includes(x.label) && !restored.includes(x.label)).map((x) => x.label);
      const clean = draft.map(({ added: _a, ...x }) => ({ ...x, label: x.label.trim() }));
      loaded = TestCatalog.save(clean, loaded.rev);
      draft = clone(loaded.tests);
      const parts = [
        added.length && `added ${added.join(", ")}`,
        edited.length && `changed ${edited.join(", ")}`,
        retired.length && `retired ${retired.join(", ")}`,
        restored.length && `restored ${restored.join(", ")}`,
      ].filter(Boolean);
      Audit.log("setup.change", { action: `Test catalogue saved: ${parts.join("; ") || "no changes"}`, new: `rev ${loaded.rev}` });
      render();
      updateStatus("Tests saved");
    } catch (e) {
      banner.innerHTML = `${ERROR_ICON}<div><strong>Not saved</strong><p></p></div>`;
      $("p", banner).textContent = e.message || "Something went wrong. Nothing was saved. Try again.";
      banner.hidden = false;
      updateStatus("Not saved");
      if (!(e instanceof TestCatalog.StaleError) && !(e instanceof Db.SaveError)) Db.logError("settings tests", e);
    } finally {
      saving = false;
      save.disabled = false;
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (canEdit() && dirty()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  render();
  updateStatus();
})();
