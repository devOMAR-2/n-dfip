// Diabetic Foot screening, Part 1 (nurse): prefill, conditional fields,
// section status, inline validation, and sending to the practitioner.
// Needs auth.js and patients.js loaded first. Markup lives in screening.html.

(() => {
  const PATIENT_KEY = "ndfip.df.patient";

  const form = document.getElementById("screening-form");
  const sections = [...form.querySelectorAll(".form-section")];
  const progress = document.getElementById("screening-progress");
  const toggleAll = document.getElementById("toggle-sections");
  const confirmDialog = document.getElementById("confirm-send");
  const sentPanel = document.getElementById("screening-sent");

  let fileNumber = null;
  try {
    fileNumber = sessionStorage.getItem(PATIENT_KEY);
  } catch {}
  const patient = fileNumber && Patients.byFileNumber(fileNumber);
  if (!patient) return; // head script already redirects to the clinic page

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
    name: patient.name,
    fileNumber: patient.fileNumber,
    dob: `${formatDate(patient.dob)} (${plural(Patients.ageOn(patient.dob), "year")})`,
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
      if (!field.name || field.name.startsWith("_") || isHidden(field)) continue;
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

  let dirty = false;
  let sent = false;
  form.addEventListener("input", () => (dirty = true));
  form.addEventListener("change", () => (dirty = true));
  window.addEventListener("beforeunload", (event) => {
    if (dirty && !sent) event.preventDefault();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const invalid = requiredQs(form).filter((q) => !isAnswered(q));
    form.querySelectorAll("[data-required]").forEach((q) => setInvalid(q, invalid.includes(q)));
    updateStatus();

    if (invalid.length) {
      invalid.forEach((q) => (q.closest(".form-section").open = true));
      syncToggleLabel();
      const first = invalid[0];
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

    const flags = buildFlags();
    const record = {
      id: `scr-${Date.now()}`,
      fileNumber: patient.fileNumber,
      patientName: patient.name,
      submittedBy: Auth.findUser(Auth.getSessionId())?.name ?? Auth.getSessionId(),
      submittedAt: new Date().toISOString(),
      status: "awaiting-review",
      urgent: flags.some((f) => f.level === "urgent"),
      flags,
      answers: collectAnswers(),
    };

    ScreeningStore.add(record);
    document.getElementById("screening-review-link").href = `./review.html?id=${encodeURIComponent(record.id)}`;

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
