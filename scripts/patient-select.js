// Diabetic Foot clinic: select a patient (search dialog) and show their summary.
// Needs auth.js, org.js, privacy.js, privacy-ui.js and patients.js loaded first.
// Patient data follows the role's visibility settings (UAT-02); hidden data can be
// opened with emergency access (reason required, logged and flagged).
// "Working in" picks the clinic for walk-in screenings when the user has several (UAT-01).

(() => {
  if (typeof Access !== "undefined" && Access.denied) return;
  // Only roles that can screen see "Start Screening" (F-01)
  if (typeof Access !== "undefined" && !Access.canAny(["screening.perform", "screening.pull"])) {
    document.querySelectorAll('a[href="./screening.html"]').forEach((a) => (a.hidden = true));
  }
  const STORAGE_KEY = "ndfip.df.patient";

  // ---------- Working clinic (UAT-01) ----------

  const picker = document.getElementById("clinic-picker");
  const clinicSelect = document.getElementById("working-clinic");
  function renderPicker() {
    if (!picker || typeof Org === "undefined") return;
    const open = Org.clinicsInScope().filter(Org.active);
    if (open.length < 2) {
      picker.hidden = true;
      return;
    }
    const current = Org.workingClinic();
    clinicSelect.replaceChildren(...open.map((c) => new Option(Org.clinicLabel(c.id), c.id, false, c.id === current)));
    picker.hidden = false;
  }
  clinicSelect?.addEventListener("change", () => {
    Org.setWorkingClinic(clinicSelect.value);
    document.dispatchEvent(new CustomEvent("clinic:change", { detail: clinicSelect.value }));
  });
  renderPicker();

  const dialog = document.getElementById("patient-search");
  const form = document.getElementById("patient-search-form");
  const input = document.getElementById("patient-query");
  const label = document.getElementById("patient-query-label");
  const hint = document.getElementById("patient-query-hint");
  const error = document.getElementById("patient-query-error");
  const count = document.getElementById("patient-result-count");
  const list = document.getElementById("patient-results");
  const emptyState = document.getElementById("no-patient");
  const summary = document.getElementById("patient-summary");

  const SEARCH_BY = {
    fileNumber: {
      label: "File number",
      placeholder: "N-DFIP-004271",
      hint: "Full or last digits, e.g. N-DFIP-004271 or 4271.",
      inputMode: "text",
    },
    nationalId: {
      label: "National ID",
      placeholder: "1XXXXXXXXX",
      hint: "10 digits, starting with 1 (citizen) or 2 (resident).",
      inputMode: "numeric",
    },
    phone: {
      label: "Phone number",
      placeholder: "05XXXXXXXX",
      hint: "05XXXXXXXX or +966 5XXXXXXXX.",
      inputMode: "tel",
    },
  };

  // ---------- Helpers ----------

  // plural(1, "year") → "1 year", plural(3, "year") → "3 years"
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

  // 0541234562 → 054 123 4562
  const formatPhone = (phone) => phone.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");

  const formatDate = (iso) =>
    iso
      ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const initials = (name) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .filter((_, i, parts) => i === 0 || i === parts.length - 1)
      .map((part) => part[0].toUpperCase())
      .join("");

  function riskBadge(el, risk) {
    el.className = "badge " + (risk === null ? "badge-muted" : `badge-risk-${risk}`);
    el.textContent = risk === null ? "Risk not assessed" : Patients.RISK[risk].label;
  }

  const searchBy = () => form.elements.searchBy.value;

  function showError(message) {
    error.querySelector("span").textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", `${error.id} ${hint.id}`);
  }

  function clearError() {
    error.hidden = true;
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", hint.id);
  }

  function clearResults() {
    list.replaceChildren();
    count.textContent = "";
  }

  // ---------- Search dialog ----------

  function applySearchBy() {
    const config = SEARCH_BY[searchBy()];
    label.textContent = config.label;
    input.placeholder = config.placeholder;
    input.inputMode = config.inputMode;
    hint.textContent = config.hint;
  }

  function openSearch() {
    form.reset();
    applySearchBy();
    clearError();
    clearResults();
    dialog.showModal();
    input.focus();
  }

  function renderResults(results) {
    count.textContent =
      results.length === 0
        ? "No patient found. Check the number or try another search type."
        : `${plural(results.length, "patient")} found`;

    list.replaceChildren(
      ...results.map((patient) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "result-item";
        button.dataset.fileNumber = patient.fileNumber;

        const text = document.createElement("span");
        text.className = "result-item__text";
        const name = document.createElement("span");
        name.className = "result-item__name";
        name.textContent = Privacy.name(patient.name, patient);
        const meta = document.createElement("span");
        meta.className = "result-item__meta";
        meta.textContent = [
          patient.fileNumber,
          `ID ${Privacy.nationalId(patient.nationalId, patient)}`,
          Privacy.ageVisible(patient) ? `${plural(Patients.ageOn(patient.dob), "year")} · ${patient.sex}` : patient.sex,
        ].join(" · ");
        text.append(name, meta);
        button.append(text);

        // Risk and active problems are medical data
        if (Privacy.medicalVisible(patient)) {
          const badge = document.createElement("span");
          riskBadge(badge, patient.iwgdfRisk);
          if (patient.activeProblem) {
            badge.className = "badge badge-danger";
            badge.textContent = Patients.ACTIVE_PROBLEM[patient.activeProblem.type];
          }
          button.append(badge);
        }
        item.append(button);
        return item;
      }),
    );
  }

  form.addEventListener("change", (event) => {
    if (event.target.name !== "searchBy") return;
    applySearchBy();
    clearError();
    clearResults();
    input.value = "";
    input.focus();
  });

  input.addEventListener("input", clearError);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearResults();
    const { error: message, results } = Patients.search(searchBy(), input.value);
    if (message) {
      showError(message);
      input.focus();
      return;
    }
    clearError();
    renderResults(results);
  });

  list.addEventListener("click", (event) => {
    const button = event.target.closest(".result-item");
    if (!button) return;
    // Close first: closing restores focus to the opener, then we move it on
    dialog.close();
    selectPatient(button.dataset.fileNumber);
  });

  // Click on the backdrop (outside the inner panel) closes the dialog
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.querySelectorAll("[data-open-patient-search]").forEach((button) => {
    button.addEventListener("click", openSearch);
  });

  // ---------- Selected patient ----------

  function setField(name, value) {
    summary.querySelector(`[data-field="${name}"]`).textContent = value;
  }

  function describeHistory(history) {
    const items = [
      history.ckd && "CKD",
      history.dialysis && "Dialysis",
      history.cardiovascular && "Cardiovascular disease",
      history.retinopathy && "Retinopathy",
      history.immunosuppression && "Immunosuppression",
      history.pad && "PAD",
      history.revascularisation && "Revascularisation",
      history.smoking && `Smoking (${history.smoking})`,
      history.neuropathy && "Neuropathy",
      history.poorVisionOrSelfCare && "Poor vision / self-care limitation",
    ].filter(Boolean);
    return items.length ? items.join(", ") : "None recorded";
  }

  function describeUlcerHistory({ left, right }) {
    const sides = [left && "Left foot", right && "Right foot"].filter(Boolean);
    return sides.length ? sides.join(", ") : "None";
  }

  // One banner per patient when the role can't see everything (UAT-02)
  function renderPrivacyBanner(patient) {
    let banner = summary.querySelector("[data-privacy-banner]");
    if (!Privacy.anythingHidden(patient)) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "callout callout-warning privacy-banner";
      banner.dataset.privacyBanner = "";
      summary.querySelector(".patient-summary__header").after(banner);
    }
    const text = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Some of this patient's data is hidden for your role";
    const p = document.createElement("p");
    const button = PrivacyUI.emergencyButton(patient, () => renderSummary(patient));
    p.textContent = button
      ? "In an emergency you can open the full record. You'll be asked for a reason, which is logged and reviewed."
      : "Ask a colleague with emergency access if you need the full record.";
    text.append(title, p);
    if (button) text.append(button);
    banner.replaceChildren(text);
  }

  function renderSummary(patient) {
    const general = Privacy.level("general", patient.fileNumber);
    setField("initials", general === "hidden" ? "?" : initials(patient.name));
    setField("name", Privacy.name(patient.name, patient));
    setField("fileNumber", patient.fileNumber);
    setField("nationalId", Privacy.nationalId(patient.nationalId, patient));
    setField("age", Privacy.ageVisible(patient) ? plural(Patients.ageOn(patient.dob), "year") : "Hidden");
    setField("sex", patient.sex);
    setField("phone", general === "visible" ? formatPhone(patient.phone) : Privacy.phone(patient.phone, patient));
    setField("careLevel", Patients.CARE_LEVEL[patient.careLevel]);
    renderPrivacyBanner(patient);

    // Medical record: risk, active problem, history, labs, notes
    const medical = Privacy.medicalVisible(patient);
    const riskEl = summary.querySelector('[data-field="riskBadge"]');
    riskEl.hidden = !medical;
    summary.querySelector(".detail-grid").hidden = !medical;
    riskBadge(riskEl, patient.iwgdfRisk);

    const problemBadge = summary.querySelector('[data-field="problemBadge"]');
    const callout = summary.querySelector('[data-field="problemCallout"]');
    const problem = medical ? patient.activeProblem : null;
    problemBadge.hidden = !problem;
    callout.hidden = !problem;
    if (problem) {
      problemBadge.textContent = Patients.ACTIVE_PROBLEM[problem.type];
      const lines = [
        ...(problem.ulcers || []).map(
          (u) => `${u.site}: Wagner ${u.wagner}, ${u.infection}, ${u.sizeCm} cm`,
        ),
        problem.detail,
      ].filter(Boolean);
      const detail = summary.querySelector('[data-field="problemDetail"]');
      const title = document.createElement("strong");
      title.textContent = Patients.ACTIVE_PROBLEM[problem.type];
      detail.replaceChildren(
        title,
        ...lines.map((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          return p;
        }),
      );
    }

    setField("diabetes", `${patient.diabetesType} · ${plural(patient.diabetesDurationYears, "year")}`);
    setField(
      "hba1c",
      patient.lastHbA1c ? `${patient.lastHbA1c.value}% · ${formatDate(patient.lastHbA1c.date)}` : "Not recorded",
    );
    setField("allergies", patient.allergies.length ? patient.allergies.join(", ") : "No known allergies");
    setField("interval", patient.iwgdfRisk === null ? "Pending first screening" : Patients.RISK[patient.iwgdfRisk].interval);
    setField("previousUlcer", describeUlcerHistory(patient.previousUlcer));
    setField(
      "previousAmputation",
      patient.previousAmputation
        ? `${patient.previousAmputation.level}, ${patient.previousAmputation.side} (${formatDate(patient.previousAmputation.date)})`
        : "None",
    );
    setField("lastVisit", patient.lastVisit ? formatDate(patient.lastVisit) : "No visits yet");
    setField("nextReview", patient.nextReview ? formatDate(patient.nextReview) : "—");
    setField("riskHistory", describeHistory(patient.riskHistory));
    setField("note", patient.note);

    emptyState.hidden = true;
    summary.hidden = false;
  }

  function selectPatient(fileNumber) {
    const patient = Patients.byFileNumber(fileNumber);
    if (!patient) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, fileNumber);
    } catch {}
    if (typeof Audit !== "undefined") {
      Audit.log("patient.view", { patient: fileNumber, clinicId: Org.workingClinic(), action: "Patient summary viewed (Diabetic Foot clinic page)" });
    }
    renderSummary(patient);
    document.getElementById("patient-name").focus();
  }

  // Restore the selection after a refresh
  let saved = null;
  try {
    saved = sessionStorage.getItem(STORAGE_KEY);
  } catch {}
  const savedPatient = saved && Patients.byFileNumber(saved);
  if (savedPatient) renderSummary(savedPatient);
})();
