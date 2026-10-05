// Shared helpers for the records pages (patients, patient file, appointment, referrals).
// Needs the head stack (db, auth, staff, access, org, audit, privacy).

const Records = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;

  const ICON = {
    alert: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>',
    lock: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>',
    file: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>',
    image: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></svg>',
    search: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>',
    print: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></svg>',
    users: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>',
    send: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>',
    upload: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" /></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>',
  };

  function icon(name) {
    const span = el("span", "records-icon");
    span.innerHTML = ICON[name] ?? "";
    return span.firstChild;
  }

  // ---------- Dates ----------
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—");
  const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : "—");
  function duration(fromIso, toIso) {
    if (!fromIso || !toIso) return "—";
    const mins = Math.max(0, Math.round((new Date(toIso) - new Date(fromIso)) / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    if (h < 48) return `${h} h ${mins % 60} min`;
    return plural(Math.round(h / 24), "day");
  }

  // ---------- Labels for practitioner answers ----------
  const OPTION = {
    "r.inf.antibiotics": { none: "No antibiotics", oral: "Oral empiric", iv: "IV / parenteral" },
    "r.std.debridement": { none: "None", sharp: "Sharp", enzymatic: "Enzymatic", autolytic: "Autolytic", mechanical: "Mechanical" },
    "r.std.offloading": { none: "None", tcc: "Total contact cast", walker: "Removable walker", felt: "Felt padding", custom: "Custom shoes / insoles" },
    "r.orders.labs": { cbc: "CBC", esr: "ESR", crp: "CRP", fbg: "Fasting blood glucose", hba1c: "HbA1c", creatinine: "Renal function (urea, creatinine, eGFR)", "wound-culture": "Wound culture (C&S)", procalcitonin: "Procalcitonin", "bone-culture": "Bone culture", "blood-culture": "Blood cultures", lactate: "Lactate", albumin: "Albumin" },
    "r.orders.imaging": { xray: "Plain radiograph", mri: "MRI", duplex: "Arterial duplex", cta: "CT / MR angiography" },
    "r.plan.followup": { "48h": "48 hours", "1w": "1 week", "2w": "2 weeks", "1m": "1 month", "1-3m": "1–3 months", "3-6m": "3–6 months", "6-12m": "6–12 months", "12m": "12 months" },
  };
  const optionText = (key, value) => [].concat(value ?? []).map((v) => OPTION[key]?.[v] ?? v).join(", ");

  const BOOKED_BY = { practitioner: "Practitioner", reception: "Reception", app: "Patient, through the app", website: "Patient, through the website" };

  // Fallback lab labels when clinical-rules.js isn't loaded
  const LAB_FALLBACK = {
    wbc: ["WBC", "×10⁹/L"], hb: ["Haemoglobin", "g/dL"], platelets: ["Platelets", "×10⁹/L"], fbg: ["Fasting glucose", "mg/dL"],
    hba1c: ["HbA1c", "%"], urea: ["Urea", "mg/dL"], creatinine: ["Creatinine", "mg/dL"], egfr: ["eGFR", "mL/min/1.73 m²"],
    crp: ["CRP", "mg/L"], esr: ["ESR", "mm/h"], procalcitonin: ["Procalcitonin", "ng/mL"], lactate: ["Lactate", "mmol/L"], albumin: ["Albumin", "g/dL"],
  };
  function labInfo(key) {
    const L = typeof ClinicalRules !== "undefined" ? ClinicalRules.LABS?.[key] : null;
    if (L) return { label: L.label, unit: L.unit };
    const f = LAB_FALLBACK[key];
    return f ? { label: f[0], unit: f[1] } : { label: key, unit: "" };
  }
  function labFlag(key, value, sex) {
    if (typeof ClinicalRules === "undefined" || value === "" || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? ClinicalRules.labFlag(key, n, sex) : null;
  }

  // Structured results recorded at a review: [{ key, label, unit, value, flag }]
  function labsOf(record, sex) {
    const a = record?.review?.answers ?? {};
    return Object.keys(a)
      .filter((k) => k.startsWith("r.lab.") && a[k] !== "" && a[k] !== null && a[k] !== undefined)
      .map((k) => {
        const key = k.slice(6);
        const info = labInfo(key);
        return { key, label: info.label, unit: info.unit, value: a[k], flag: labFlag(key, a[k], sex) };
      });
  }

  // Treatments prescribed at a review, as readable lines
  function treatmentsOf(record) {
    const r = record?.review ?? {};
    const a = r.answers ?? {};
    const out = [];
    if (r.medications?.trim()) out.push(["Medications", r.medications.trim()]);
    if (a["r.inf.antibiotics"] && a["r.inf.antibiotics"] !== "none") {
      out.push(["Antibiotics", [optionText("r.inf.antibiotics", a["r.inf.antibiotics"]), a["r.inf.agent"], a["r.inf.days"] ? `${a["r.inf.days"]} days` : null].filter(Boolean).join(", ")]);
    }
    if (a["r.inf.admit"] === "yes") out.push(["Admission", "Hospital admission arranged"]);
    if (a["r.std.debridement"] && a["r.std.debridement"] !== "none") out.push(["Debridement", optionText("r.std.debridement", a["r.std.debridement"])]);
    if (a["r.std.offloading"] && a["r.std.offloading"] !== "none") out.push(["Offloading", optionText("r.std.offloading", a["r.std.offloading"])]);
    if (a["r.std.dressing"]) out.push(["Dressing", a["r.std.dressing"]]);
    const adj = [].concat(a["r.adj"] ?? []).filter((x) => x && x !== "none");
    if (adj.length) out.push(["Adjunctive therapy", adj.join(", ")]);
    return out;
  }

  // Tests ordered for an encounter: TestOrders (tests.js) when present, else the review checkboxes
  function testsOrdered(record) {
    if (typeof TestOrders !== "undefined" && typeof TestOrders.forRecord === "function") {
      const list = TestOrders.forRecord(record.id) ?? [];
      if (list.length) return list.map((o) => ({ label: o.label ?? o.testLabel ?? o.testId ?? "Test", status: o.statusLabel ?? o.status ?? "", detail: o }));
    }
    const a = record?.review?.answers ?? {};
    return [
      ...[].concat(a["r.orders.labs"] ?? []).map((v) => ({ label: optionText("r.orders.labs", v), status: record.status === "reviewed" ? "Ordered" : "Planned" })),
      ...[].concat(a["r.orders.imaging"] ?? []).map((v) => ({ label: optionText("r.orders.imaging", v), status: record.status === "reviewed" ? "Ordered" : "Planned" })),
    ];
  }

  // Practitioner of an encounter (who signed, or who has it open)
  const practitionerOf = (r) => r.review?.signedBy ?? r.openedBy ?? (r.status === "in-review" ? r.holder?.name : null) ?? null;

  // ---------- Patients in scope ----------
  // A user sees a patient when one of the patient's encounters is in one of their clinics,
  // or the file was opened at a facility in their scope (UAT-01).
  function encountersOf(fileNumber) {
    const files = typeof Patients !== "undefined" && Patients.filesOf ? Patients.filesOf(fileNumber) : [fileNumber];
    const all = typeof ScreeningStore !== "undefined" ? ScreeningStore.all() : Db.read("ndfip.screenings", []) ?? [];
    return all.filter((r) => files.includes(r.fileNumber) && Org.inScope(r));
  }
  function patientInScope(patient) {
    if (!patient) return false;
    if (encountersOf(patient.fileNumber).length) return true;
    const facility = patient.registeredAt ?? "fac-nrc";
    return Org.scopeIds(Access.currentUser()?.id).has(facility) || Org.facilitiesInScope().some((f) => f.id === facility);
  }

  // ---------- File rules (Settings › Files) ----------
  const FILE_RULES_KEY = "ndfip.fileRules";
  const FILE_TYPES = [
    { mime: "application/pdf", ext: ".pdf", label: "PDF" },
    { mime: "image/jpeg", ext: ".jpg,.jpeg", label: "JPEG" },
    { mime: "image/png", ext: ".png", label: "PNG" },
    { mime: "image/webp", ext: ".webp", label: "WEBP" },
    { mime: "image/heic", ext: ".heic", label: "HEIC" },
  ];
  const DEFAULT_RULES = { types: ["application/pdf", "image/jpeg", "image/png"], maxMB: 2 };
  const fileRules = () => ({ ...DEFAULT_RULES, ...(Db.read(FILE_RULES_KEY, {}) ?? {}) });

  // ---------- States (UAT-19) ----------
  function stateBox(kind, title, text, action) {
    const box = el("section", `empty-state records-state records-state--${kind}`);
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    if (kind === "loading") {
      box.setAttribute("aria-busy", "true");
      box.append(el("div", "records-spinner"));
    } else {
      const ic = el("div", "empty-state__icon");
      ic.innerHTML = ICON[kind === "error" ? "error" : kind === "denied" ? "lock" : "info"];
      box.append(ic);
    }
    box.append(el("h2", "empty-state__title", title));
    if (text) box.append(el("p", "empty-state__text", text));
    if (action) box.append(action);
    return box;
  }
  const loading = (what = "Loading…") => stateBox("loading", what, null);

  function inlineError(message) {
    const p = el("p", "field-error");
    p.innerHTML = ICON.error;
    p.append(el("span", "", message));
    return p;
  }

  // ---------- CSV ----------
  function downloadCsv(filename, rows) {
    const cell = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Reason / confirm dialog ----------
  // Uses PrivacyUI.askReason when present; otherwise a local <dialog>.
  function askText({ title, description = "", label = "Reason", confirm = "Confirm", required = true }) {
    if (typeof PrivacyUI !== "undefined" && PrivacyUI.askReason && required) return PrivacyUI.askReason({ title, description, label, confirm });
    return new Promise((resolve) => {
      const dlg = el("dialog", "modal");
      const form = el("form", "modal__inner");
      form.method = "dialog";
      form.noValidate = true;
      const head = el("div", "modal__header");
      const hd = el("div");
      hd.append(el("h2", "modal__title", title));
      if (description) hd.append(el("p", "modal__description", description));
      head.append(hd);
      const field = el("div", "field");
      const id = `ask-${Date.now()}`;
      const lab = el("label", "label", label);
      lab.htmlFor = id;
      if (!required) lab.append(el("span", "label__optional", " (optional)"));
      const ta = el("textarea", "input textarea");
      ta.id = id;
      ta.rows = 3;
      const err = inlineError("Enter a reason.");
      err.hidden = true;
      field.append(lab, ta, err);
      const actions = el("div", "modal__actions");
      const cancel = el("button", "btn btn-outline", "Cancel");
      cancel.type = "button";
      const ok = el("button", "btn btn-primary", confirm);
      ok.type = "submit";
      actions.append(cancel, ok);
      form.append(head, field, actions);
      dlg.append(form);
      document.body.append(dlg);
      let result = null;
      cancel.addEventListener("click", () => dlg.close());
      form.addEventListener("submit", (e) => {
        if (required && !ta.value.trim()) {
          e.preventDefault();
          err.hidden = false;
          ta.setAttribute("aria-invalid", "true");
          ta.focus();
          return;
        }
        result = ta.value.trim();
      });
      dlg.addEventListener("close", () => {
        dlg.remove();
        resolve(result);
      });
      dlg.showModal();
      ta.focus();
    });
  }

  // Sticky bar with the patient's name and record number on every page of the file (EC-12)
  function patientBar(patient, { link = true, extra = null } = {}) {
    const bar = el("div", "records-patientbar");
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Patient");
    const name = link ? el("a", "records-patientbar__name", Privacy.name(patient.name, patient)) : el("strong", "records-patientbar__name", Privacy.name(patient.name, patient));
    if (link) name.href = `./patient.html?file=${encodeURIComponent(patient.fileNumber)}`;
    const meta = el("span", "records-patientbar__meta", [patient.fileNumber, patient.nationalId ? `ID ${Privacy.nationalId(patient.nationalId, patient)}` : null].filter(Boolean).join(" · "));
    bar.append(name, meta);
    if (extra) bar.append(extra);
    return bar;
  }

  // Patient object for a record: the registry entry when there is one
  function patientFor(record) {
    const p = typeof Patients !== "undefined" ? Patients.byFileNumber(record.fileNumber) : null;
    return p ?? { fileNumber: record.fileNumber, name: record.patientName };
  }

  return {
    $, $$, el, plural, icon, ICON,
    fmtDate, fmtTime, fmtDateTime, duration,
    OPTION, optionText, BOOKED_BY,
    labInfo, labFlag, labsOf, treatmentsOf, testsOrdered, practitionerOf,
    encountersOf, patientInScope, patientFor,
    FILE_TYPES, DEFAULT_RULES, FILE_RULES_KEY, fileRules,
    stateBox, loading, inlineError, downloadCsv, askText, patientBar,
  };
})();
