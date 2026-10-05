// Patient file (UAT-21): details, all appointments as a timeline, previous tests,
// medications, referrals and attached files (images and PDFs open inside the page).
// - Scope: only patients with a visit in the user's clinics, or registered in their scope (UAT-01)
// - Data visibility per role, with emergency access (UAT-02); print respects it (UAT-20)
// - Possible duplicates flagged; merge for users with patients.merge, logged (EC-12)
// - Uploads follow Settings › Files; a failed or interrupted upload attaches nothing (EC-14)
// - Name and file number stay visible at the top of the file (sticky bar)

(() => {
  if (Access.denied) return;
  const { $, el, icon, fmtDate, fmtDateTime, plural } = Records;
  const host = $("#patient-file");
  const params = new URLSearchParams(location.search);
  const requested = params.get("file");
  const FILES_KEY = "ndfip.files";
  let viewLogged = false;

  const canUpload = () => Access.canAny(["review.orders", "screening.perform", "patients.edit"]);

  function denied(title, text) {
    const back = el("a", "btn btn-primary", "Back to patients");
    back.href = "./patients.html";
    host.replaceChildren(Records.stateBox("denied", title, text, back));
  }

  // ---------- Load ----------

  async function load() {
    host.replaceChildren(Records.loading("Loading the patient file…"));
    try {
      await Db.delay(250);
      if (!requested) {
        const go = el("a", "btn btn-primary", "Find a patient");
        go.href = "./patients.html";
        host.replaceChildren(Records.stateBox("empty", "No patient selected", "Open a patient from the patient list.", go));
        return;
      }
      const asked = Patients.byFileNumber(requested);
      const patient = Patients.resolve(requested);
      if (!asked || !patient) {
        denied("Patient file not found", `There is no file numbered ${requested}.`);
        return;
      }
      if (!Records.patientInScope(patient)) {
        denied("You don't have access to this patient", "This file belongs to clinics outside your assignment. Ask an administrator if you need it.");
        return;
      }
      if (!viewLogged) {
        Audit.log("patient.view", { patient: patient.fileNumber, action: "Patient file viewed" });
        viewLogged = true;
      }
      render(patient, asked.fileNumber !== patient.fileNumber ? asked.fileNumber : null);
    } catch (err) {
      Db.logError("patient file", err);
      const retry = el("button", "btn btn-primary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", load);
      host.replaceChildren(Records.stateBox("error", "The patient file couldn't be loaded", "Nothing was changed. Try again; if it keeps failing, contact support.", retry));
    }
  }

  // ---------- Render ----------

  function section(id, titleText, ...children) {
    const s = el("section", "page-section records-card");
    s.id = id;
    s.setAttribute("aria-labelledby", `${id}-title`);
    const h = el("h2", "section-title", titleText);
    h.id = `${id}-title`;
    s.append(h, ...children);
    return s;
  }

  function hiddenMedical(patient, what) {
    const wrap = el("div", "records-hidden");
    const text = `${what} hidden for your role.`;
    if (typeof PrivacyUI !== "undefined" && PrivacyUI.hiddenValue) wrap.append(PrivacyUI.hiddenValue(text, patient, () => load()));
    else wrap.append(el("p", "empty-line", text));
    return wrap;
  }

  function render(patient, mergedFrom) {
    const medical = Privacy.medicalVisible(patient);
    // Possible duplicates are shown as one patient: their visits appear here, badged with their file number
    const files = [patient.fileNumber, ...Patients.duplicatesOf(patient.fileNumber).map((d) => d.fileNumber)];
    const encounters = [...new Map(files.flatMap((f) => Records.encountersOf(f)).map((r) => [r.id, r])).values()]
      .sort((a, b) => String(b.arrivedAt).localeCompare(String(a.arrivedAt)));
    const crumb = document.querySelector('.breadcrumb [aria-current="page"]');
    if (crumb) crumb.textContent = Privacy.name(patient.name, patient);
    document.title = `${patient.fileNumber} · Patient file · N-DFIP`;

    const printBtn = el("button", "btn btn-outline btn-sm records-noprint");
    printBtn.type = "button";
    printBtn.append(icon("print"), " Print / PDF");
    printBtn.addEventListener("click", () => {
      Audit.log("export", { patient: patient.fileNumber, action: "Patient file printed or saved as PDF" });
      window.print();
    });
    const out = [Records.patientBar(patient, { link: false, extra: printBtn })];

    // Print-only line: who printed it, when, and that it follows data visibility
    const me = Access.currentUser();
    out.push(el("p", "records-printonly field-hint", `Printed ${fmtDateTime(new Date().toISOString())} by ${me?.name ?? ""}. Fields hidden for this role are left out.`));

    if (mergedFrom) {
      const m = Patients.merges()[mergedFrom];
      out.push(callout("info", "Merged file", `File ${mergedFrom} was merged into this file on ${fmtDate(m?.at)} by ${m?.by ?? "—"}. You are viewing the kept file.`));
    }
    const mergedHere = Object.entries(Patients.merges()).filter(([, m]) => m.into === patient.fileNumber);
    for (const [from, m] of mergedHere) {
      out.push(callout("info", `Includes merged file ${from}`, `Merged on ${fmtDate(m.at)} by ${m.by}. Reason: ${m.reason}. Its visits and tests are shown here.`));
    }

    // Possible duplicate (EC-12)
    const dupes = Patients.duplicatesOf(patient.fileNumber);
    if (dupes.length) {
      const box = callout("alert", "Possible duplicate file", `${plural(dupes.length, "other file")} ${dupes.length === 1 ? "has" : "have"} the same national ID: ${dupes.map((d) => `${d.fileNumber} (${Org.get(d.registeredAt ?? "fac-nrc")?.name ?? "another facility"})`).join(", ")}. Flagged for review; they are shown here as one patient.`, "warning");
      if (Access.can("patients.merge")) {
        const btn = el("button", "btn btn-outline btn-sm records-noprint", "Review and merge");
        btn.type = "button";
        btn.addEventListener("click", () => openMerge(patient, dupes));
        $("div", box).append(btn);
      }
      out.push(box);
    }

    // Emergency access when part of the record is hidden
    if (Privacy.anythingHidden(patient) && !Privacy.hasGrant(patient) && typeof PrivacyUI !== "undefined") {
      const btn = PrivacyUI.emergencyButton(patient, () => load());
      if (btn) {
        const box = callout("lock", "Part of this record is hidden for your role", "In an emergency you can open it by giving a reason. The reason is logged and flagged for review.", "warning");
        btn.classList.add("records-noprint");
        $("div", box).append(btn);
        out.push(box);
      }
    } else if (Privacy.hasGrant(patient)) {
      out.push(callout("lock", "Emergency access", "You opened this record with emergency access. It is logged and flagged for review.", "warning"));
    }

    // Header
    const header = el("div", "page-header");
    header.append(el("h1", "page-title", Privacy.name(patient.name, patient)));
    const sub = [patient.fileNumber, patient.sex, patient.diabetesType ? `${patient.diabetesType} diabetes` : null].filter(Boolean);
    header.append(el("p", "page-subtitle", sub.join(" · ")));
    out.push(header);

    out.push(detailsSection(patient, medical));
    out.push(section("timeline", `Appointments (${encounters.length})`, timeline(encounters, medical, patient)));
    out.push(medical ? section("tests", "Previous tests", testsTable(encounters, patient)) : section("tests", "Previous tests", hiddenMedical(patient, "Test results are")));
    out.push(medical ? section("medications", "Medications", medicationsList(encounters)) : section("medications", "Medications", hiddenMedical(patient, "Medications are")));
    out.push(medical ? section("referrals", "Referrals", referralsList(patient)) : section("referrals", "Referrals", hiddenMedical(patient, "Referrals are")));
    out.push(medical ? section("files", "Attached files", filesBlock(patient, encounters)) : section("files", "Attached files", hiddenMedical(patient, "Files are")));

    host.replaceChildren(...out);
  }

  function callout(kind, title, text, tone = "info") {
    const box = el("div", `callout ${tone === "warning" ? "callout-warning" : "records-callout-info"}`);
    box.setAttribute("role", tone === "warning" ? "alert" : "note");
    box.innerHTML = Records.ICON[kind] ?? Records.ICON.info;
    const body = el("div");
    body.append(el("strong", "", title), el("p", "", text));
    box.append(body);
    return box;
  }

  function detailsSection(p, medical) {
    const dl = el("dl", "detail-grid detail-grid--plain");
    const add = (term, value, wide = false) => {
      const d = el("div", wide ? "detail-grid__wide" : "");
      d.append(el("dt", "", term));
      const dd = el("dd");
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value ?? "—";
      d.append(dd);
      dl.append(d);
    };
    add("File number", p.fileNumber);
    add("National ID", Privacy.nationalId(p.nationalId, p));
    add("Date of birth", Privacy.dob(p.dob, p));
    if (p.dob && Privacy.level("identifiers", p.fileNumber) === "visible") add("Age", `${Patients.ageOn(p.dob)} years`);
    add("Sex", p.sex);
    add("Phone", Privacy.phone(p.phone, p));
    add("Registered at", Org.get(p.registeredAt ?? "fac-nrc")?.name ?? "—");
    if (medical) {
      add("Diabetes", p.diabetesType ? `${p.diabetesType}, ${plural(p.diabetesDurationYears, "year")}` : "—");
      add("Last HbA1c", p.lastHbA1c ? `${p.lastHbA1c.value}% (${fmtDate(p.lastHbA1c.date)})` : "—");
      add("Risk", p.iwgdfRisk !== null && p.iwgdfRisk !== undefined ? Patients.RISK[p.iwgdfRisk].label : "Not yet assessed");
      const allergies = el("span", p.allergies?.length ? "records-allergy" : "", p.allergies?.length ? p.allergies.join(", ") : "No known allergies");
      add("Allergies", allergies);
    } else {
      add("Medical details", hiddenMedical(p, "Diabetes, risk and allergies are"), true);
    }
    return section("details", "Patient details", dl);
  }

  function timeline(encounters, medical, patient) {
    if (!encounters.length) return el("p", "empty-line", "No appointments in your clinics yet.");
    const ol = el("ol", "records-timeline");
    for (const r of encounters) {
      const li = el("li", "records-timeline__item");
      const st = ScreeningStore.stageOf(r);
      const head = el("div", "records-timeline__head");
      const a = el("a", "records-timeline__date", fmtDate(r.arrivedAt));
      a.href = `./appointment.html?id=${encodeURIComponent(r.id)}`;
      a.setAttribute("aria-label", `Appointment on ${fmtDate(r.arrivedAt)}, open details`);
      head.append(a, el("span", `badge stage-badge stage-badge--${st.n}`, st.n === 5 ? "Signed" : st.label));
      if (r.urgent) head.append(el("span", "badge badge-danger", "Urgent"));
      if (r.appointment?.source === "referral") head.append(el("span", "badge badge-secondary", "From a referral"));
      if (r.fileNumber !== patient.fileNumber) head.append(el("span", "badge badge-muted", `File ${r.fileNumber}`));
      li.append(head);
      const who = Records.practitionerOf(r);
      li.append(el("p", "records-timeline__meta", [Org.clinicLabel(r.clinicId), who ? `Practitioner: ${who}` : "No practitioner yet"].join(" · ")));
      const note = r.review?.finalNote || r.review?.answers?.["r.note"];
      if (medical && note) li.append(el("p", "records-timeline__note", note.length > 220 ? `${note.slice(0, 217)}…` : note));
      ol.append(li);
    }
    return ol;
  }

  function testsTable(encounters, patient) {
    const rows = [];
    for (const r of encounters) for (const lab of Records.labsOf(r, patient.sex)) rows.push({ r, lab });
    if (!rows.length) return el("p", "empty-line", "No structured test results recorded yet.");
    const wrap = el("div", "table-wrap");
    const t = el("table", "data-table records-table");
    t.innerHTML = '<caption class="sr-only">Previous test results, newest first</caption><thead><tr><th scope="col">Date</th><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Flag</th><th scope="col">Facility</th></tr></thead>';
    const tb = el("tbody");
    for (const { r, lab } of rows) {
      const tr = el("tr");
      tr.append(el("td", "", Records.fmtDate(r.review?.signedAt ?? r.arrivedAt)), el("th", "", lab.label));
      tr.lastChild.scope = "row";
      tr.append(el("td", "records-num", `${lab.value} ${lab.unit}`));
      const flag = el("td");
      if (lab.flag) flag.append(el("span", `badge lab-flag ${lab.flag === "Low" ? "badge-risk-1" : "badge-risk-3"}`, lab.flag));
      else flag.append(el("span", "records-muted", "—"));
      tr.append(flag, el("td", "", Org.facilityOf(r.clinicId)?.name ?? "—"));
      tb.append(tr);
    }
    t.append(tb);
    wrap.append(t);
    return wrap;
  }

  function medicationsList(encounters) {
    const items = encounters.filter((r) => r.review?.medications?.trim());
    if (!items.length) return el("p", "empty-line", "No medications recorded at a visit yet.");
    const ul = el("ul", "records-plainlist");
    for (const r of items) {
      const li = el("li");
      li.append(el("p", "records-plainlist__meta", `${fmtDate(r.review.signedAt ?? r.arrivedAt)} · ${Records.practitionerOf(r) ?? "—"}`), el("p", "", r.review.medications.trim()));
      ul.append(li);
    }
    return ul;
  }

  function referralsList(patient) {
    const refs = Referrals.forPatient(patient.fileNumber);
    if (!refs.length) return el("p", "empty-line", "No referrals.");
    const ul = el("ul", "records-plainlist");
    for (const ref of refs) {
      const li = el("li");
      const head = el("p", "records-plainlist__head");
      head.append(el("strong", "", `${Referrals.DESTINATION[ref.destination] ?? ref.destination}`), ` · ${Referrals.URGENCY[ref.urgency] ?? ref.urgency} · due ${fmtDate(ref.dueDate)} `);
      head.append(el("span", `badge ${ref.status === "closed" || ref.status === "attended" ? "badge-status-complete" : ref.status === "cancelled" ? "badge-muted" : "badge-status-progress"}`, Referrals.STATUS_LABEL[ref.status]));
      if (Referrals.isOverdue(ref)) head.append(" ", el("span", "badge badge-danger", "Overdue"));
      li.append(head);
      if (ref.reason) li.append(el("p", "records-plainlist__meta", ref.reason));
      ul.append(li);
    }
    const more = el("p", "records-noprint");
    if (Access.canAny(["referrals.track", "review.referral"])) {
      const a = el("a", "btn-link", "Track referrals");
      a.href = "./referrals.html";
      more.append(a);
    }
    const frag = el("div");
    frag.append(ul, more);
    return frag;
  }

  // ---------- Files ----------

  const filesFor = (patient) => {
    const files = [patient, ...Patients.duplicatesOf(patient.fileNumber)].flatMap((p) => Patients.filesOf(p.fileNumber));
    return (Db.read(FILES_KEY, []) ?? []).filter((f) => files.includes(f.fileNumber)).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
  };
  const sizeText = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
  const isImage = (f) => f.type?.startsWith("image/");
  const isPdf = (f) => f.type === "application/pdf";

  function filesBlock(patient, encounters) {
    const wrap = el("div", "records-files");
    const files = filesFor(patient);
    if (!files.length) wrap.append(el("p", "empty-line", "No files attached yet."));
    else {
      const grid = el("ul", "records-filegrid");
      for (const f of files) {
        const li = el("li");
        const btn = el("button", "records-filecard");
        btn.type = "button";
        btn.setAttribute("aria-label", `Open ${f.name}`);
        const thumb = el("span", "records-filecard__thumb");
        if (isImage(f)) {
          const img = el("img");
          img.src = f.data ?? f.src;
          img.alt = "";
          thumb.append(img);
        } else thumb.append(icon("file"));
        const text = el("span", "records-filecard__text");
        text.append(el("span", "records-filecard__name", f.name), el("span", "records-filecard__meta", `${f.category ?? "File"} · ${fmtDate(f.uploadedAt)} · ${sizeText(f.size ?? 0)}`), el("span", "records-filecard__meta", `Added by ${f.uploadedBy ?? "—"}`));
        btn.append(thumb, text);
        btn.addEventListener("click", () => openViewer(f, patient));
        li.append(btn);
        grid.append(li);
      }
      wrap.append(grid);
    }
    if (canUpload()) wrap.append(uploadForm(patient, encounters));
    return wrap;
  }

  function openViewer(f, patient) {
    const dlg = el("dialog", "modal records-viewer");
    dlg.setAttribute("aria-labelledby", "viewer-title");
    const inner = el("div", "modal__inner");
    const head = el("div", "modal__header");
    const hd = el("div");
    const t = el("h2", "modal__title", f.name);
    t.id = "viewer-title";
    hd.append(t, el("p", "modal__description", `${f.category ?? "File"} · ${fmtDateTime(f.uploadedAt)} · ${Privacy.name(patient.name, patient)}, ${patient.fileNumber}`));
    const close = el("button", "btn btn-icon");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.append(icon("close"));
    close.addEventListener("click", () => dlg.close());
    head.append(hd, close);
    const body = el("div", "records-viewer__body");
    let blobUrl = null;
    const url = () => {
      if (!f.data) return f.src;
      if (!blobUrl) {
        const [meta, b64] = f.data.split(",");
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blobUrl = URL.createObjectURL(new Blob([bytes], { type: meta.slice(5).split(";")[0] }));
      }
      return blobUrl;
    };
    try {
      if (isImage(f)) {
        const img = el("img");
        img.src = url();
        img.alt = `${f.category ?? "Image"}: ${f.name}`;
        body.append(img);
      } else if (isPdf(f)) {
        const frame = el("iframe");
        frame.src = url();
        frame.title = f.name;
        body.append(frame);
      } else body.append(el("p", "empty-line", "This file type can't be shown in the page. Download it instead."));
    } catch (err) {
      Db.logError("file viewer", err);
      body.append(Records.inlineError("This file is damaged and can't be opened."));
    }
    const actions = el("div", "modal__actions");
    const dl = el("a", "btn btn-outline");
    dl.append(icon("download"), " Download");
    dl.href = url();
    dl.download = f.name;
    dl.addEventListener("click", () => Audit.log("export", { patient: patient.fileNumber, action: `File downloaded: ${f.name}` }));
    actions.append(dl);
    inner.append(head, body, actions);
    dlg.append(inner);
    document.body.append(dlg);
    dlg.addEventListener("close", () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      dlg.remove();
    });
    dlg.showModal();
  }

  function uploadForm(patient, encounters) {
    const rules = Records.fileRules();
    const allowed = Records.FILE_TYPES.filter((t) => rules.types.includes(t.mime));
    const form = el("form", "records-upload records-noprint");
    form.noValidate = true;
    form.append(el("h3", "subsection__title", "Attach a result"));
    form.append(el("p", "field-hint", `Allowed: ${allowed.map((t) => t.label).join(", ") || "none"} · up to ${rules.maxMB} MB. Set in Settings › Files.`));

    const row = el("div", "records-upload__row");
    const fileField = el("div", "field");
    const fileLabel = el("label", "label", "File");
    fileLabel.htmlFor = "upload-file";
    const input = el("input", "file-input");
    input.type = "file";
    input.id = "upload-file";
    input.accept = allowed.map((t) => `${t.mime},${t.ext}`).join(",");
    fileField.append(fileLabel, input);

    const catField = el("div", "field");
    const catLabel = el("label", "label", "Type");
    catLabel.htmlFor = "upload-category";
    const cat = el("select", "input select");
    cat.id = "upload-category";
    ["Lab report", "Wound photo", "Imaging", "Referral letter", "Other"].forEach((c) => cat.append(new Option(c, c)));
    catField.append(catLabel, cat);

    const encField = el("div", "field");
    const encLabel = el("label", "label", "Visit");
    encLabel.htmlFor = "upload-visit";
    const enc = el("select", "input select");
    enc.id = "upload-visit";
    enc.append(new Option("Not linked to a visit", ""));
    encounters.forEach((r) => enc.append(new Option(`${fmtDate(r.arrivedAt)} · ${Org.get(r.clinicId)?.name ?? ""}`, r.id)));
    encField.append(encLabel, enc);
    row.append(fileField, catField, encField);
    form.append(row);

    const status = el("div", "records-upload__status");
    status.setAttribute("aria-live", "polite");
    const actions = el("div", "records-upload__actions");
    const submit = el("button", "btn btn-primary");
    submit.type = "submit";
    submit.append(icon("upload"), " Attach");
    const cancel = el("button", "btn btn-outline", "Cancel upload");
    cancel.type = "button";
    cancel.hidden = true;
    actions.append(submit, cancel);
    form.append(status, actions);

    let busy = false;
    let cancelled = false;
    let reader = null;

    function fail(message, retry = true) {
      status.replaceChildren(Records.inlineError(message));
      if (retry) {
        const again = el("button", "btn btn-ghost btn-sm", "Try again");
        again.type = "button";
        again.addEventListener("click", () => form.requestSubmit());
        status.append(again);
      }
    }

    function done() {
      busy = false;
      submit.disabled = false;
      cancel.hidden = true;
      input.disabled = false;
    }

    cancel.addEventListener("click", () => {
      cancelled = true;
      reader?.abort();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return; // EC-02: one upload at a time
      const file = input.files?.[0];
      if (!file) {
        fail("Choose a file to attach.", false);
        input.focus();
        return;
      }
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      const type = allowed.find((t) => t.mime === file.type || t.ext.split(",").includes(ext));
      if (!type) {
        fail(`${file.name} is not an allowed type. Allowed: ${allowed.map((t) => t.label).join(", ")}.`, false);
        return;
      }
      if (file.size > rules.maxMB * 1048576) {
        fail(`${file.name} is ${sizeText(file.size)}. The limit is ${rules.maxMB} MB. Nothing was attached.`, false);
        return;
      }
      busy = true;
      cancelled = false;
      submit.disabled = true;
      input.disabled = true;
      cancel.hidden = false;
      const progress = el("progress", "records-progress");
      progress.max = 100;
      progress.value = 0;
      status.replaceChildren(el("span", "field-hint", `Uploading ${file.name}…`), progress);
      try {
        const data = await new Promise((resolve, reject) => {
          reader = new FileReader();
          reader.onprogress = (ev) => ev.lengthComputable && (progress.value = Math.round((ev.loaded / ev.total) * 80));
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("read"));
          reader.onabort = () => reject(new Error("abort"));
          reader.readAsDataURL(file);
        });
        // Simulated transfer; Cancel still interrupts it
        for (let i = 0; i < 8 && !cancelled; i++) {
          await Db.delay(200);
          progress.value = 80 + i * 2.5;
        }
        if (cancelled) throw new Error("abort");
        const u = Access.currentUser();
        const entry = {
          id: `file-${Date.now().toString(36)}`,
          fileNumber: patient.fileNumber,
          recordId: enc.value || null,
          clinicId: encounters.find((r) => r.id === enc.value)?.clinicId ?? Org.homeClinic(),
          name: file.name,
          type: file.type || type.mime,
          size: file.size,
          data,
          category: cat.value,
          uploadedBy: u?.name ?? "unknown",
          uploadedAt: new Date().toISOString(),
        };
        // One write: the file is attached completely or not at all
        Db.update(FILES_KEY, [], (list) => {
          list.push(entry);
        }, { where: "file upload" });
        Audit.log("value.edit", { patient: patient.fileNumber, record: entry.recordId, field: "Attachment", new: `${entry.category}: ${entry.name}`, action: "File attached" });
        done();
        load();
      } catch (err) {
        done();
        if (err.message === "abort") fail("Upload interrupted. Nothing was attached.");
        else if (err.message === "read") fail("The file couldn't be read (it may be damaged). Nothing was attached.");
        else if (err instanceof Db.SaveError) fail(`${err.message}${/full/.test(err.message) ? " Try a smaller file." : ""}`);
        else {
          Db.logError("file upload", err);
          fail("The upload failed. Nothing was attached.");
        }
      }
    });
    return form;
  }

  // ---------- Merge (EC-12) ----------

  function openMerge(patient, dupes) {
    const all = [patient, ...dupes];
    const dlg = el("dialog", "modal");
    const form = el("form", "modal__inner");
    form.noValidate = true;
    const head = el("div", "modal__header");
    const hd = el("div");
    hd.append(el("h2", "modal__title", "Merge duplicate files"), el("p", "modal__description", "Nothing is deleted. The merged file points to the kept one and its visits, tests and files show in the kept file. The merge is logged."));
    head.append(hd);
    const fs = el("fieldset", "q");
    fs.append(el("legend", "label", "Keep this file"));
    const list = el("div", "records-merge-list");
    all.forEach((p, i) => {
      const lab = el("label", "records-merge-option");
      const r = el("input", "checkbox");
      r.type = "radio";
      r.name = "keep";
      r.value = p.fileNumber;
      r.checked = i === 0;
      const visits = Records.encountersOf(p.fileNumber).filter((x) => x.fileNumber === p.fileNumber).length;
      const text = el("span");
      text.append(el("strong", "", p.fileNumber), el("span", "records-row__meta", ` ${Privacy.name(p.name, p)} · ${Org.get(p.registeredAt ?? "fac-nrc")?.name ?? ""} · ${plural(visits, "visit")} in your scope`));
      lab.append(r, text);
      list.append(lab);
    });
    fs.append(list);
    const field = el("div", "field");
    const lab = el("label", "label", "Reason");
    lab.htmlFor = "merge-reason";
    const ta = el("textarea", "input textarea");
    ta.id = "merge-reason";
    ta.rows = 3;
    ta.placeholder = "e.g. Same national ID, name and date of birth confirmed with the patient";
    const err = el("div");
    field.append(lab, ta, err);
    const actions = el("div", "modal__actions");
    const cancel = el("button", "btn btn-outline", "Cancel");
    cancel.type = "button";
    cancel.addEventListener("click", () => dlg.close());
    const ok = el("button", "btn btn-primary", "Merge files");
    ok.type = "submit";
    actions.append(cancel, ok);
    form.append(head, fs, field, actions);
    dlg.append(form);
    document.body.append(dlg);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      err.replaceChildren();
      const keep = form.elements.keep.value;
      if (!ta.value.trim()) {
        err.append(Records.inlineError("Give a reason for the merge."));
        ta.setAttribute("aria-invalid", "true");
        ta.focus();
        return;
      }
      ok.disabled = true;
      try {
        for (const p of all) if (p.fileNumber !== keep) Patients.merge(p.fileNumber, keep, ta.value);
        dlg.close();
        if (keep !== patient.fileNumber) location.href = `./patient.html?file=${encodeURIComponent(keep)}`;
        else load();
      } catch (ex) {
        ok.disabled = false;
        err.append(Records.inlineError(ex.message || "The merge failed. Nothing was changed."));
      }
    });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }

  load();
})();
