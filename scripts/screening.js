// Diabetic Foot screening, Part 1 (nurse): prefill, conditional fields,
// section status, inline validation, and sending to the practitioner.
// Needs auth.js and patients.js loaded first. Markup lives in screening.html.

(() => {
  if (Access.denied) return;
  const PATIENT_KEY = "ndfip.df.patient";
  const user = Access.currentUser();

  const form = document.getElementById("screening-form");
  const sections = [...form.querySelectorAll(".form-section")];
  const progress = document.getElementById("screening-progress");
  const toggleAll = document.getElementById("toggle-sections");
  const confirmDialog = document.getElementById("confirm-send");
  const sentPanel = document.getElementById("screening-sent");

  // ---------- Encounter ----------
  // Opened from a queue (?id=) or as a walk-in for the patient picked on the clinic page.
  const params = new URLSearchParams(location.search);
  let record = params.get("id") ? ScreeningStore.getById(params.get("id")) : null;
  if (params.get("id") && !record) {
    window.location.replace("./diabetic-foot.html");
    return;
  }
  if (!record) {
    let picked = null;
    try {
      picked = sessionStorage.getItem(PATIENT_KEY);
    } catch {}
    const p = picked && Patients.byFileNumber(picked);
    if (!p) return; // head script already redirects to the clinic page
    const clinicId = (typeof Org.workingClinic === "function" ? Org.workingClinic() : null) ?? Org.homeClinic();
    record = {
      id: `enc-${Date.now()}`, fileNumber: p.fileNumber, patientName: p.name, arrivedAt: new Date().toISOString(),
      status: "waiting-screening", urgent: false, flags: [], answers: {}, clinicId,
      appointment: { bookedBy: { type: "reception", name: "Walk-in" }, bookedAt: new Date().toISOString(), confirmed: true, source: "regular" },
      // New encounters use the clinic setup in force now (UAT-14, EC-10)
      layoutVersion: Layout.currentN(),
    };
    try {
      ScreeningStore.add(record);
    } catch (e) {
      document.querySelector("main").replaceChildren(errorState(e.message));
      return;
    }
    ScreeningStore.audit("Walk-in encounter created", record);
    history.replaceState(null, "", `?id=${encodeURIComponent(record.id)}`);
  }
  const patient = Patients.byFileNumber(record.fileNumber);
  if (!patient) return;
  const encounterId = record.id;

  // Files of clinics outside the user's assignment can't be opened (UAT-01)
  if (!Org.inScope(record)) {
    document.querySelector("main").replaceChildren(errorState(`This file belongs to ${Org.clinicLabel(record.clinicId)}, which isn't one of your clinics.`, "Not one of your clinics"));
    return;
  }

  function errorState(text, title = "Something went wrong") {
    const box = document.createElement("section");
    box.className = "empty-state";
    box.innerHTML = '<h1 class="empty-state__title"></h1><p class="empty-state__text"></p><a class="btn btn-primary" href="./home.html">Back to home</a>';
    box.querySelector("h1").textContent = title;
    box.querySelector("p").textContent = text;
    return box;
  }

  // Who may edit: stages 1 and 2 only, one person at a time (UAT-07, UAT-09, EC-06)
  let readOnly = null; // message shown when the form can't be edited
  let holding = false;
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (!["waiting-screening", "screening"].includes(record.status)) {
    readOnly = `This screening was sent to the practitioner at ${fmtTime(record.submittedAt)} by ${record.submittedBy}. It can't be edited here.`;
  } else {
    const lock = ScreeningStore.acquire(encounterId, user);
    if (!lock.ok) {
      readOnly = `Being screened by ${lock.holder.name} since ${fmtTime(lock.holder.since)}. You can view it, but only they can edit until they leave or the lock times out.`;
    } else {
      holding = true;
      record = lock.record;
      if (record.status === "waiting-screening") {
        record.status = "screening";
        record.startedAt = new Date().toISOString();
        record.startedBy = user.name;
        record.layoutVersion ??= Layout.currentN();
        try {
          ScreeningStore.save(record);
          ScreeningStore.audit("Screening started", record);
        } catch (e) {
          readOnly = e.message;
          holding = false;
        }
      }
      // A practitioner completing the nurse's part is allowed, and recorded (UAT-07)
      if (!Access.can("screening.perform")) ScreeningStore.audit("Practitioner entered the nurse's part", record, user.name);
    }
  }

  // ---------- Helpers ----------

  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

  const formatDate = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const inputs = (name) => [...form.querySelectorAll(`[name="${name}"]`)];
  const radioValue = (name) => inputs(name).find((i) => i.checked)?.value ?? "";
  const checkedValues = (name) => inputs(name).filter((i) => i.checked).map((i) => i.value);
  const numberValue = (name) => {
    const el = form.elements[name];
    return el && el.value !== "" && el.checkValidity() ? Number(el.value) : null;
  };

  function setRadio(name, value) {
    inputs(name).forEach((i) => (i.checked = i.value === value));
  }

  function setChecks(name, values) {
    inputs(name).forEach((i) => (i.checked = values.includes(i.value)));
  }

  const isHidden = (el) => !!el.closest("[hidden]");

  // ---------- Prefill from the patient record ----------

  const prefill = {
    // Visibility settings apply here too (UAT-02)
    name: Privacy.name(patient.name, patient.fileNumber),
    fileNumber: patient.fileNumber,
    dob: Privacy.level("identifiers", patient.fileNumber) === "visible"
      ? `${formatDate(patient.dob)} (${plural(Patients.ageOn(patient.dob), "year")})`
      : Privacy.dob(patient.dob, patient.fileNumber),
    sex: patient.sex,
    diabetes: `${patient.diabetesType} · ${plural(patient.diabetesDurationYears, "year")}`,
    hba1c: patient.lastHbA1c ? `${patient.lastHbA1c.value}% · ${formatDate(patient.lastHbA1c.date)}` : "Not recorded",
  };
  form.querySelectorAll("[data-p]").forEach((el) => (el.textContent = prefill[el.dataset.p]));

  const h = patient.riskHistory;
  setChecks(
    "b.history",
    [
      (h.ckd || h.dialysis) && "ckd",
      h.cardiovascular && "cardiovascular",
      h.retinopathy && "retinopathy",
      h.immunosuppression && "immunosuppression",
      (h.pad || h.revascularisation) && "pad",
      h.neuropathy && "neuropathy",
      h.poorVisionOrSelfCare && "poor-vision",
    ].filter(Boolean),
  );
  if (h.smoking) setRadio("b.smoking", h.smoking);

  for (const side of ["left", "right"]) {
    setRadio(`i.${side}.ulcer`, patient.previousUlcer[side] ? "yes" : "no");
    const amp = patient.previousAmputation;
    const minor = amp && amp.side === side && amp.level.startsWith("Minor");
    const major = amp && amp.side === side && amp.level.startsWith("Major");
    setRadio(`i.${side}.minor`, minor ? "yes" : "no");
    if (minor) setRadio(`i.${side}.minorLevel`, /digital/i.test(amp.level) ? "digital" : /ray/i.test(amp.level) ? "ray" : "transmetatarsal");
    setRadio(`i.${side}.hindfoot`, "no");
    setRadio(`i.${side}.major`, major ? "yes" : "no");
  }

  // ---------- Restore the saved draft (UAT-10) ----------

  function fill(answers) {
    for (const [name, value] of Object.entries(answers ?? {})) {
      const fields = inputs(name);
      if (!fields.length || fields[0].type === "file") continue;
      if (fields[0].type === "checkbox") fields.forEach((f) => (f.checked = [].concat(value).includes(f.value)));
      else if (fields[0].type === "radio") fields.forEach((f) => (f.checked = f.value === value));
      else fields[0].value = value;
    }
    form.querySelectorAll("[data-range-output]").forEach((out) => (out.textContent = document.getElementById(out.htmlFor.value).value));
  }
  function clearAll() {
    for (const f of form.elements) {
      if (!f.name || f.name.startsWith("_") || f.type === "file") continue;
      if (f.type === "checkbox" || f.type === "radio") f.checked = false;
      else if (f.type !== "range") f.value = "";
    }
  }

  fill(record.answers);

  // Page layout from clinic setup: tabs, sections on/off/required/locked, moved and added
  // questions (UAT-13, UAT-14, UAT-15)
  const layout = LayoutUI.apply({
    page: "screening", form, record, readOnly: false,
    isAnswered: (q) => isAnswered(q),
  });
  const foreignNames = new Set(layout.foreignNames);
  layout.fill(record);

  // ---------- Conditional fields and alerts ----------

  function reveal(key, show) {
    form.querySelectorAll(`[data-reveal="${key}"]`).forEach((el) => (el.hidden = !show));
  }

  function alertBox(key, show) {
    form.querySelector(`[data-alert="${key}"]`).hidden = !show;
  }

  function sirsCount() {
    const temp = numberValue("a.temp");
    const hr = numberValue("a.hr");
    const rr = numberValue("a.rr");
    return [temp !== null && (temp > 38 || temp < 36), hr !== null && hr > 90, rr !== null && rr > 20].filter(Boolean).length;
  }

  const charcotFlags = (side) => checkedValues(`h.${side}.flags`).filter((v) => v !== "none");

  function updateConditionals() {
    reveal("symptoms", checkedValues("c.symptoms").some((v) => v !== "none"));
    reveal("perfusion", radioValue("e.available") === "yes");
    reveal("footwear", radioValue("g.footwear") === "no");
    for (const side of ["left", "right"]) {
      reveal(`${side}-minor`, radioValue(`i.${side}.minor`) === "yes");
      reveal(`${side}-major`, radioValue(`i.${side}.major`) === "yes");
    }

    const count = radioValue("j.count");
    const shown = count === "3+" ? 3 : Number(count || 0);
    form.querySelectorAll("[data-ulcer]").forEach((card) => (card.hidden = Number(card.dataset.ulcer) > shown));
    reveal("ulcers", shown > 0);
    reveal("ulcer-many", count === "3+");
    alertBox("ulcer", shown > 0);

    alertBox("sirs", sirsCount() >= 2);
    alertBox("charcot", charcotFlags("left").length + charcotFlags("right").length > 0);

    const tl = numberValue("h.left.temp");
    const tr = numberValue("h.right.temp");
    const diffEl = form.querySelector("[data-temp-diff]");
    diffEl.hidden = tl === null || tr === null;
    if (!diffEl.hidden) {
      const diff = Math.abs(tl - tr);
      diffEl.textContent = `Temperature difference: ${diff.toFixed(1)} °C${diff > 2 ? " (more than 2 °C)" : ""}`;
      diffEl.classList.toggle("temp-diff--high", diff > 2);
    }
  }

  // "None" chips clear their siblings, and vice versa
  form.addEventListener("change", (event) => {
    const input = event.target;
    if (input.type !== "checkbox" || !input.checked) return;
    const group = inputs(input.name);
    if (input.hasAttribute("data-exclusive")) group.forEach((i) => i !== input && (i.checked = false));
    else group.forEach((i) => i.hasAttribute("data-exclusive") && (i.checked = false));
  });

  // Live value next to the severity slider
  form.querySelectorAll("[data-range-output]").forEach((output) => {
    const range = document.getElementById(output.htmlFor.value);
    range.addEventListener("input", () => (output.textContent = range.value));
  });

  // ---------- Validation ----------

  let errorSeq = 0;

  function isAnswered(q) {
    const kind = q.dataset.required;
    const fields = [...q.querySelectorAll("input, select, textarea")].filter((f) => !isHidden(f));
    if (kind === "radio" || kind === "any") return fields.some((f) => f.checked);
    return fields.every((f) => f.value.trim() !== "" && f.checkValidity());
  }

  function setInvalid(q, invalid) {
    const error = q.querySelector(":scope > .field-error");
    if (!error) return;
    if (!error.id) error.id = `screening-error-${++errorSeq}`;
    error.hidden = !invalid;
    error.querySelector("span").textContent = invalid ? q.dataset.error : "";
    q.classList.toggle("q--invalid", invalid);
    const target = q.matches("fieldset") ? q : q.querySelector("input, select, textarea");
    if (invalid) {
      target.setAttribute("aria-invalid", "true");
      target.setAttribute("aria-describedby", error.id);
    } else {
      target.removeAttribute("aria-invalid");
      target.removeAttribute("aria-describedby");
    }
  }

  const requiredQs = (scope) => [...scope.querySelectorAll("[data-required]")].filter((q) => !isHidden(q));

  // Re-check a question once it has been flagged, so the error clears as soon as it's answered
  form.addEventListener("input", recheck);
  form.addEventListener("change", recheck);
  function recheck(event) {
    const q = event.target.closest("[data-required]");
    if (q && q.classList.contains("q--invalid")) setInvalid(q, !isAnswered(q));
    // Hidden questions can't stay flagged
    form.querySelectorAll(".q--invalid").forEach((el) => isHidden(el) && setInvalid(el, false));
  }

  // ---------- Section status ----------

  const STATUS = {
    complete: ["Complete", "badge-status-complete"],
    progress: ["In progress", "badge-status-progress"],
    empty: ["Not started", "badge-muted"],
    optional: ["Optional", "badge-muted"],
    recorded: ["Recorded", "badge-status-complete"],
    attention: ["Needs attention", "badge-status-attention"],
  };

  function hasAnyValue(section) {
    return [...section.querySelectorAll("input, select, textarea")].some((f) =>
      !f.name.startsWith("_") &&
      (f.type === "checkbox" || f.type === "radio" ? f.checked : f.type !== "range" && f.value.trim() !== ""),
    );
  }

  function sectionState(section) {
    const qs = requiredQs(section);
    if (section.querySelector(".q--invalid")) return "attention";
    if (section.hasAttribute("data-optional")) return hasAnyValue(section) ? "recorded" : "optional";
    const answered = qs.filter(isAnswered).length;
    if (answered === qs.length) return "complete";
    return answered > 0 ? "progress" : "empty";
  }

  function updateStatus() {
    let done = 0;
    let required = 0;
    for (const section of sections) {
      const state = sectionState(section);
      const badge = section.querySelector("[data-status]");
      const [text, cls] = STATUS[state];
      badge.textContent = text;
      badge.className = `badge form-section__status ${cls}`;
      if (!section.hasAttribute("data-optional")) {
        required++;
        if (state === "complete") done++;
      }
    }
    progress.textContent = `${done} of ${plural(required, "required section")} complete`;
  }

  function refresh() {
    updateConditionals();
    updateStatus();
  }

  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  refresh();

  // ---------- Expand / collapse all ----------

  function syncToggleLabel() {
    toggleAll.textContent = sections.every((s) => s.open) ? "Collapse all" : "Expand all";
  }

  toggleAll.addEventListener("click", () => {
    const open = !sections.every((s) => s.open);
    sections.forEach((s) => (s.open = open));
    syncToggleLabel();
  });
  sections.forEach((s) => s.addEventListener("toggle", syncToggleLabel));
  syncToggleLabel();

  // ---------- Flags for the practitioner ----------

  function buildFlags() {
    const flags = [];
    const charcot = ["left", "right"].filter((side) => charcotFlags(side).length);
    if (charcot.length) {
      flags.push({
        level: "urgent",
        text: `Charcot red flag (${charcot.map((s) => s + " foot").join(", ")}): immediate practitioner alert`,
      });
    }
    if (sirsCount() >= 2) flags.push({ level: "urgent", text: "2 or more SIRS signs: possible systemic infection" });
    const count = radioValue("j.count");
    if (count && count !== "0") {
      flags.push({
        level: "attention",
        text: `${count === "3+" ? "3 or more ulcers" : plural(Number(count), "ulcer")}: hands-on practitioner evaluation required`,
      });
    }
    if (radioValue("a.confirmed") === "needs-update") {
      flags.push({ level: "info", text: "Patient record details need updating" });
    }
    return flags;
  }

  function renderFlags(list, flags) {
    list.replaceChildren(
      ...flags.map((flag) => {
        const li = document.createElement("li");
        li.className = `flag flag--${flag.level}`;
        li.textContent = flag.text;
        return li;
      }),
    );
    list.hidden = flags.length === 0;
  }

  // ---------- Send ----------

  function collectAnswers() {
    const answers = {};
    for (const field of form.elements) {
      // Names starting with "_" are UI helpers (e.g. which ulcer the foot map is placing)
      if (!field.name || field.name.startsWith("_") || isHidden(field) || foreignNames.has(field.name)) continue;
      if (field.type === "file") {
        if (field.files.length) answers[field.name] = [...field.files].map((f) => f.name);
      } else if (field.type === "checkbox") {
        if (field.checked) (answers[field.name] ||= []).push(field.value);
      } else if (field.type === "radio") {
        if (field.checked) answers[field.name] = field.value;
      } else if (field.value !== "") {
        answers[field.name] = field.value;
      }
    }
    return answers;
  }

  let sent = false;
  let busy = false;

  // What the record holds now (for comparing and discarding). A fresh file starts from the
  // values prefilled from the patient record.
  const baseline = () => {
    const r = ScreeningStore.getById(encounterId) ?? record;
    return Object.keys(r.answers ?? {}).length || r.custom ? { ...(r.answers ?? {}), ...(r.custom ?? {}) } : prefilled;
  };
  const prefilled = collectAnswers();
  const currentValues = () => ({ ...collectAnswers(), ...layout.collect().custom });

  // Edits are a draft until Save or Send (UAT-10, EC-03, EC-04)
  const draft = Drafts.attach({
    key: `screening.${encounterId}`,
    form,
    collect: currentValues,
    saved: baseline,
    apply: (values) => {
      clearAll();
      fill(values);
      layout.fill({ answers: values, custom: values, review: {} });
      refresh();
    },
    enabled: () => holding && !sent,
    save: () => saveRecord(),
    onDiscard: () => ({ patient: record.fileNumber, record: encounterId, clinicId: record.clinicId }),
  });

  // Every changed value is logged with its old and new value (UAT-05)
  function logEdits(before, after) {
    const fmt = (v) => (v === undefined || v === null || v === "" ? "—" : [].concat(v).join(", "));
    const names = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    for (const n of names) {
      if (JSON.stringify(before?.[n] ?? null) === JSON.stringify(after?.[n] ?? null)) continue;
      Audit.forRecord("value.edit", record, `Value recorded: ${n}`, { field: n, old: fmt(before?.[n]), new: fmt(after?.[n]) });
    }
  }

  // Save to the record without sending. Returns true when saved.
  async function saveRecord() {
    if (!holding || busy) return false;
    busy = true;
    const saveBtn = document.getElementById("save-screening");
    if (saveBtn) saveBtn.disabled = true;
    try {
      await Db.delay(150);
      const before = record.answers;
      const values = collectAnswers();
      const foreign = layout.collect();
      Object.assign(record, { answers: values, custom: { ...(record.custom ?? {}), ...foreign.custom } });
      if (Object.keys(foreign.review).length) record.review = { ...(record.review ?? {}), answers: { ...(record.review?.answers ?? {}), ...foreign.review } };
      ScreeningStore.save(record);
      logEdits(before, values);
      draft.afterSave();
      showNotice(`Saved at ${fmtTime(new Date().toISOString())}.`, "success");
      return true;
    } catch (e) {
      // Conflict (EC-01, EC-05) or failed save (EC-15): nothing was written
      const fresh = ScreeningStore.getById(encounterId);
      if (e instanceof ScreeningStore.ConflictError && fresh) record.rev = record.rev; // keep ours; user reloads
      showNotice(e.message, "error");
      return false;
    } finally {
      busy = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  setInterval(() => holding && ScreeningStore.heartbeat(encounterId, user), 60000);
  window.addEventListener("pagehide", () => holding && ScreeningStore.release(encounterId, user));

  // Stage tracker and notices under the page header
  const header = document.querySelector(".page-header");
  let trackerEl = null;
  function renderTracker() {
    const next = EncounterUI.tracker(ScreeningStore.getById(encounterId) ?? record);
    trackerEl ? trackerEl.replaceWith(next) : header.after(next);
    trackerEl = next;
  }
  renderTracker();

  function showNotice(text, kind = "warning") {
    let box = document.getElementById("screening-notice");
    if (!box) {
      box = document.createElement("div");
      box.id = "screening-notice";
      box.setAttribute("role", kind === "error" ? "alert" : "status");
      trackerEl.after(box);
    }
    box.className = `callout callout-${kind === "error" ? "destructive" : kind}`;
    box.textContent = text;
  }

  // An old copy of the page brought back with the Back button shows the current state (EC-05)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });

  if (readOnly) {
    showNotice(readOnly);
    form.dataset.readonly = "true";
    form.querySelectorAll("input, select, textarea, button").forEach((f) => {
      if (!f.closest(".form-section__summary")) f.disabled = true;
    });
    form.querySelector(".form-actions").hidden = true;
    if (record.status !== "waiting-screening" && record.status !== "screening" && Access.can("review.queue")) {
      const a = document.createElement("a");
      a.className = "btn btn-primary";
      a.href = `./review.html?id=${encodeURIComponent(encounterId)}`;
      a.textContent = "Open the practitioner review";
      document.getElementById("screening-notice").append(" ", a);
    }
  }
  // Draft left from an earlier visit (browser closed, session expired)
  if (holding) {
    const at = draft.restore();
    if (at) showNotice(`Your unsaved changes from ${fmtTime(at)} were restored. Save to keep them, or discard them.`, "info");
  }

  // Save / Discard in the action bar
  const actions = form.querySelector(".form-actions");
  const draftLine = document.createElement("span");
  draftLine.className = "draft-line";
  const discardBtn = document.createElement("button");
  discardBtn.type = "button";
  discardBtn.className = "btn btn-ghost";
  discardBtn.textContent = "Discard changes";
  discardBtn.addEventListener("click", () => draft.discard());
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "save-screening";
  saveBtn.className = "btn btn-outline";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", () => saveRecord());
  const buttons = document.createElement("div");
  buttons.className = "form-actions__buttons";
  const send = actions.querySelector('button[type="submit"]');
  buttons.append(discardBtn, saveBtn, send);
  actions.append(buttons);
  actions.querySelector(".form-actions__progress").after(draftLine);
  draft.onChange(({ dirty, sections }) => {
    discardBtn.hidden = !dirty;
    draftLine.textContent = dirty ? `Unsaved changes: ${sections.join(", ")}` : "All changes saved";
    draftLine.classList.toggle("is-dirty", dirty);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy || sent) return;

    const invalid = requiredQs(form).filter((q) => !isAnswered(q));
    form.querySelectorAll("[data-required]").forEach((q) => setInvalid(q, invalid.includes(q)));
    updateStatus();

    if (invalid.length) {
      invalid.forEach((q) => (q.closest(".form-section").open = true));
      syncToggleLabel();
      const first = invalid[0];
      layout.reveal(first);
      // <details> must be open before focusing inside it
      first.querySelector("input, select, textarea").focus();
      first.scrollIntoView({ block: "center" });
      return;
    }

    const flags = buildFlags();
    document.getElementById("confirm-send-text").textContent =
      `${patient.name} (${patient.fileNumber}). Part 1 is sent for practitioner review.` +
      (flags.length ? " The practitioner will see these flags:" : " No flags raised.");
    renderFlags(document.getElementById("confirm-send-flags"), flags);
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
  });

  confirmDialog.addEventListener("close", () => {
    if (confirmDialog.returnValue !== "send") return;

    // Permission and stage are checked again at the moment of the action (EC-06, EC-07)
    const latest = ScreeningStore.getById(encounterId);
    if (!Access.canAny(["screening.perform", "screening.pull"]) || !["waiting-screening", "screening"].includes(latest?.status) || (ScreeningStore.lockActive(latest) && latest.holder.id !== user.id)) {
      showNotice("This screening can't be sent: it was already sent, or someone else now holds the file. Reload to see the current state.");
      return;
    }

    if (busy) return;
    busy = true;
    const flags = buildFlags();
    const before = record.answers;
    const values = collectAnswers();
    const foreign = layout.collect();
    const next = {
      ...record,
      submittedBy: user.name,
      submittedAt: new Date().toISOString(),
      status: "awaiting-review",
      urgent: flags.some((f) => f.level === "urgent"),
      flags,
      answers: values,
      custom: { ...(record.custom ?? {}), ...foreign.custom },
    };
    if (Object.keys(foreign.review).length) next.review = { ...(record.review ?? {}), answers: { ...(record.review?.answers ?? {}), ...foreign.review } };
    try {
      ScreeningStore.save(next, { releaseLock: true });
    } catch (e) {
      busy = false;
      showNotice(e.message, "error");
      return;
    }
    logEdits(before, values);
    ScreeningStore.audit("Screening sent to practitioner", next, flags.map((f) => f.text).join("; "));
    record = next;
    holding = false;
    draft.clear();
    draft.leave();
    renderTracker();

    const reviewLink = document.getElementById("screening-review-link");
    reviewLink.href = `./review.html?id=${encodeURIComponent(record.id)}`;
    reviewLink.textContent = "Continue to review";
    reviewLink.hidden = !Access.can("review.queue");

    sent = true;
    form.hidden = true;
    toggleAll.hidden = true;
    document.getElementById("screening-sent-text").textContent = record.urgent
      ? `${patient.name}'s screening was sent and marked urgent.`
      : `${patient.name}'s screening is waiting for practitioner review.`;
    renderFlags(document.getElementById("screening-sent-flags"), flags);
    sentPanel.hidden = false;
    sentPanel.focus();
    window.scrollTo({ top: 0 });
  });
})();
