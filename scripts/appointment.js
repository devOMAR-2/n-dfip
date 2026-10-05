// Appointment details (UAT-11): who booked it and how, when, whether it is confirmed,
// whether it came from a referral; the stage of the file and its times (UAT-07, UAT-23:
// time from the nurse sending the screening to the practitioner opening the file); the
// practitioner's comment, treatments prescribed, tests ordered and the referral.

(() => {
  if (Access.denied) return;
  const { $, el, fmtDate, fmtDateTime, duration } = Records;
  const host = $("#appointment");
  const id = new URLSearchParams(location.search).get("id");

  function state(kind, title, text) {
    const back = el("a", "btn btn-primary", "Back to patients");
    back.href = "./patients.html";
    host.replaceChildren(Records.stateBox(kind, title, text, back));
  }

  function card(idAttr, title, ...children) {
    const s = el("section", "page-section records-card");
    s.setAttribute("aria-labelledby", `${idAttr}-title`);
    const h = el("h2", "section-title", title);
    h.id = `${idAttr}-title`;
    s.append(h, ...children);
    return s;
  }

  function dl(items) {
    const d = el("dl", "detail-grid detail-grid--plain");
    for (const [term, value, wide] of items) {
      const w = el("div", wide ? "detail-grid__wide" : "");
      w.append(el("dt", "", term));
      const dd = el("dd");
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value ?? "—";
      w.append(dd);
      d.append(w);
    }
    return d;
  }

  function hidden(patient, what) {
    if (typeof PrivacyUI !== "undefined" && PrivacyUI.hiddenValue) return PrivacyUI.hiddenValue(`${what} hidden for your role.`, patient, () => load());
    return el("p", "empty-line", `${what} hidden for your role.`);
  }

  async function load() {
    host.replaceChildren(Records.loading("Loading the appointment…"));
    try {
      await Db.delay(200);
      if (!id) return state("empty", "No appointment selected", "Open an appointment from a patient file.");
      const r = ScreeningStore.getById(id);
      if (!r) return state("empty", "Appointment not found", `There is no appointment with the reference ${id}.`);
      if (!Org.inScope(r)) return state("denied", "You don't have access to this appointment", "It belongs to a clinic outside your assignment. Ask an administrator if you need it.");
      render(r);
      Audit.forRecord("patient.view", r, "Appointment details viewed");
    } catch (err) {
      Db.logError("appointment", err);
      const retry = el("button", "btn btn-primary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", load);
      host.replaceChildren(Records.stateBox("error", "The appointment couldn't be loaded", "Nothing was changed. Try again; if it keeps failing, contact support.", retry));
    }
  }

  function render(r) {
    const patient = Records.patientFor(r);
    const medical = Privacy.medicalVisible(patient);
    const ap = r.appointment ?? {};
    const st = ScreeningStore.stageOf(r);
    const crumb = document.querySelector('.breadcrumb [aria-current="page"]');
    if (crumb) crumb.textContent = `Appointment ${fmtDate(r.arrivedAt ?? ap.bookedAt)}`;
    document.title = `Appointment ${fmtDate(r.arrivedAt)} · ${r.fileNumber} · N-DFIP`;

    const out = [Records.patientBar(patient)];

    const header = el("div", "page-header page-header--split");
    const titles = el("div");
    titles.append(el("h1", "page-title", `Appointment, ${fmtDate(r.arrivedAt ?? ap.bookedAt)}`), el("p", "page-subtitle", Org.clinicLabel(r.clinicId)));
    const actions = el("div", "page-header__actions records-noprint");
    if (st.n <= 2 && Access.canAny(["screening.perform", "screening.pull"])) {
      const a = el("a", "btn btn-primary", st.n === 1 ? "Start screening" : "Open screening");
      a.href = `./screening.html?id=${encodeURIComponent(r.id)}`;
      actions.append(a);
    }
    if (st.n >= 3 && Access.can("review.queue")) {
      const a = el("a", st.n === 5 ? "btn btn-outline" : "btn btn-primary", st.n === 5 ? "View signed review" : "Open review");
      a.href = `./review.html?id=${encodeURIComponent(r.id)}`;
      actions.append(a);
    }
    const file = el("a", "btn btn-outline", "Patient file");
    file.href = `./patient.html?file=${encodeURIComponent(r.fileNumber)}`;
    actions.append(file);
    header.append(titles, actions);
    out.push(header);

    if (typeof EncounterUI !== "undefined") out.push(EncounterUI.tracker(r));

    // Booking (UAT-11)
    const confirmed = el("span", `badge ${ap.confirmed ? "badge-status-complete" : "badge-status-attention"}`, ap.confirmed ? "Confirmed" : "Not confirmed");
    const source = ap.source === "referral" ? `From a referral${ap.referralFrom ? `: ${ap.referralFrom}` : ""}` : "Regular booking";
    out.push(card("booking", "Booking", dl([
      ["Booked by", ap.bookedBy ? `${Records.BOOKED_BY[ap.bookedBy.type] ?? ap.bookedBy.type}${ap.bookedBy.name && !/^(Patient|Reception desk$)/.test(ap.bookedBy.name) ? `: ${ap.bookedBy.name}` : ""}` : "—"],
      ["Booked on", fmtDateTime(ap.bookedAt)],
      ["Status", confirmed],
      ["Type", source],
      ["Clinic", Org.clinicLabel(r.clinicId)],
      ["Region", Org.regionOf(r.clinicId)?.name ?? "—"],
    ])));

    // Times
    out.push(card("times", "Times", dl([
      ["Arrived", fmtDateTime(r.arrivedAt)],
      ["Screening started", r.startedAt ? `${fmtDateTime(r.startedAt)}${r.startedBy ? ` · ${r.startedBy}` : ""}` : "—"],
      ["Screening sent", r.submittedAt ? `${fmtDateTime(r.submittedAt)}${r.submittedBy ? ` · ${r.submittedBy}` : ""}` : "—"],
      ["Review opened", r.openedAt ? `${fmtDateTime(r.openedAt)}${r.openedBy ? ` · ${r.openedBy}` : ""}` : "—"],
      ["Signed", r.review?.signedAt ? `${fmtDateTime(r.review.signedAt)} · ${r.review.signedBy}` : "—"],
      ["Waiting for the practitioner", r.submittedAt ? (r.openedAt ? duration(r.submittedAt, r.openedAt) : `${duration(r.submittedAt, new Date().toISOString())} so far`) : "—"],
    ])));

    if (!medical) {
      out.push(card("clinical", "Clinical details", hidden(patient, "The comment, treatments, tests and referral are")));
      host.replaceChildren(...out);
      return;
    }

    // Practitioner's comment
    const note = r.review?.finalNote || r.review?.answers?.["r.note"];
    out.push(card("comment", "Practitioner's comment", note ? el("p", "records-prewrap", note) : el("p", "empty-line", r.status === "reviewed" ? "No comment recorded." : "The practitioner hasn't signed this visit yet.")));

    // Treatments
    const tx = Records.treatmentsOf(r);
    out.push(card("treatments", "Treatments prescribed", tx.length ? dl(tx.map(([k, v]) => [k, v, k === "Medications"])) : el("p", "empty-line", "No treatments recorded.")));

    // Tests ordered and results
    const tests = Records.testsOrdered(r);
    const testsBody = el("div", "records-stack");
    if (tests.length) {
      const ul = el("ul", "records-plainlist");
      for (const t of tests) {
        const li = el("li", "records-plainlist__row");
        li.append(el("span", "", t.label));
        if (t.status) li.append(el("span", "badge badge-muted", t.status));
        ul.append(li);
      }
      testsBody.append(ul);
    } else testsBody.append(el("p", "empty-line", "No tests ordered."));
    const labs = Records.labsOf(r, patient.sex);
    if (labs.length) {
      testsBody.append(el("h3", "subsection__title", "Results recorded"));
      const wrap = el("div", "table-wrap");
      const t = el("table", "data-table records-table");
      t.innerHTML = '<caption class="sr-only">Results recorded at this visit</caption><thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Flag</th></tr></thead>';
      const tb = el("tbody");
      for (const lab of labs) {
        const tr = el("tr");
        const th = el("th", "", lab.label);
        th.scope = "row";
        const flag = el("td");
        if (lab.flag) flag.append(el("span", `badge lab-flag ${lab.flag === "Low" ? "badge-risk-1" : "badge-risk-3"}`, lab.flag));
        else flag.append(el("span", "records-muted", "—"));
        tr.append(th, el("td", "records-num", `${lab.value} ${lab.unit}`), flag);
        tb.append(tr);
      }
      t.append(tb);
      wrap.append(t);
      testsBody.append(wrap);
    }
    out.push(card("tests", "Tests", testsBody));

    // Referral
    const refs = Referrals.forRecord(r.id);
    const declined = Referrals.declinedFor(r.id);
    const refBody = el("div", "records-stack");
    for (const ref of refs) {
      const p = el("p", "records-plainlist__head");
      p.append(el("strong", "", Referrals.DESTINATION[ref.destination] ?? ref.destination), ` · ${Referrals.URGENCY[ref.urgency] ?? ref.urgency} · due ${fmtDate(ref.dueDate)} `, el("span", "badge badge-status-progress", Referrals.STATUS_LABEL[ref.status]));
      if (Referrals.isOverdue(ref)) p.append(" ", el("span", "badge badge-danger", "Overdue"));
      refBody.append(p);
      if (ref.reason) refBody.append(el("p", "field-hint", ref.reason));
    }
    for (const d of declined) {
      refBody.append(el("p", "", `Suggested ${Referrals.DESTINATION[d.suggestion.destination] ?? "referral"}${d.suggestion.tier ? ` (${d.suggestion.tier})` : ""} was not made. Reason: ${d.reason || "none given"}.`));
    }
    if (!refs.length && !declined.length) {
      const a = r.review?.answers ?? {};
      refBody.append(el("p", "empty-line", a["r.ref.needed"] === "no" ? "No referral needed." : "No referral."));
    }
    out.push(card("referral", "Referral", refBody));

    host.replaceChildren(...out);
  }

  load();
})();
