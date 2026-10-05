// Dashboards: shared core (scope, filters, drill-down lists, export, page states) and the
// Operations, Clinical and landing renderers. The System value page (dashboard-value.js)
// and the staff dashboard (staff-page.js) use the same core.
// Needs dashboard-data.js and charts.js; screening-store.js for the live queue tile.
//
// Scope (UAT-01): only clinics the signed-in user is assigned to (or sits above) are
// counted. Filters (UAT-23): city / region, facility, clinic and date range; every figure
// opens the list of appointments behind it, each appointment opens its details, and
// lists and figures export to CSV (logged in the audit log).

const DashCore = (() => {
  const { TODAY, FIRST, DAY } = DashboardData;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };

  const fmtDate = (d, opts = { month: "short", day: "numeric", year: "numeric" }) => d.toLocaleDateString("en-US", opts);
  const fmtDateTime = (d) => (d ? `${fmtDate(d)}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "—");
  const median = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const pct = (part, whole) => (whole ? (part / whole) * 100 : null);
  const change = (now, before) => (now === null || before === null || before === 0 ? NaN : ((now - before) / before) * 100);
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // ---------- Date range ----------

  const PRESETS = {
    "7d": { label: "Last 7 days", days: 7 },
    "30d": { label: "Last 30 days", days: 30 },
    "90d": { label: "Last 90 days", days: 90 },
    ytd: { label: "Year to date" },
    "12m": { label: "Last 12 months", days: 365 },
  };

  function rangeFor(key) {
    if (key === "ytd") return { from: new Date(TODAY.getFullYear(), 0, 1), to: TODAY };
    return { from: new Date(TODAY.getTime() - (PRESETS[key].days - 1) * DAY), to: TODAY };
  }
  const lengthDays = ({ from, to }) => Math.round((to - from) / DAY) + 1;
  const previous = (r) => {
    const n = lengthDays(r);
    return { from: new Date(r.from.getTime() - n * DAY), to: new Date(r.from.getTime() - DAY) };
  };
  const within = (d, r) => !!d && d >= r.from && d < new Date(r.to.getTime() + DAY);
  const rangeText = (r) => `${fmtDate(r.from)} – ${fmtDate(r.to)}`;

  function buckets(r) {
    const n = lengthDays(r);
    const out = [];
    if (n <= 31 && !r.forceWeekly) {
      for (let t = r.from.getTime(); t <= r.to.getTime(); t += DAY) {
        const d = new Date(t);
        out.push({ from: d, to: d, label: fmtDate(d, { month: "short", day: "numeric" }), full: fmtDate(d, { weekday: "short", month: "short", day: "numeric" }) });
      }
    } else if (n <= 180 || r.forceWeekly) {
      for (let t = r.from.getTime(); t <= r.to.getTime(); t += 7 * DAY) {
        const from = new Date(t);
        const to = new Date(Math.min(t + 6 * DAY, r.to.getTime()));
        out.push({ from, to, label: fmtDate(from, { month: "short", day: "numeric" }), full: `Week of ${fmtDate(from, { month: "short", day: "numeric" })} – ${fmtDate(to, { month: "short", day: "numeric" })}` });
      }
    } else {
      let d = new Date(r.from.getFullYear(), r.from.getMonth(), 1);
      while (d <= r.to) {
        const from = d < r.from ? r.from : d;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const to = end > r.to ? r.to : end;
        out.push({ from, to, label: fmtDate(d, { month: "short" }), full: fmtDate(d, { month: "long", year: "numeric" }) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    return out;
  }
  // Sparse series read better weekly even in a 30-day view
  function coarseBuckets(r) {
    const n = lengthDays(r);
    return n <= 14 || n > 31 ? buckets(r) : buckets({ ...r, forceWeekly: true });
  }
  const bucketLabel = (r) => (lengthDays(r) <= 31 ? "Day" : lengthDays(r) <= 180 ? "Week" : "Month");

  // ---------- Scope and place filters ----------

  const place = { region: "", facility: "", clinic: "" };
  const clinicMeta = Object.fromEntries(
    DashboardData.CLINICS.map((c) => [c.id, { region: Org.regionOf(c.id)?.id, facility: Org.facilityOf(c.id)?.id }]),
  );

  // Clinics in the user's scope (read at call time: an assignment change applies at once)
  const scopeClinics = () => DashboardData.CLINICS.map((c) => c.id).filter((id) => Org.canSeeClinic(id));

  function selectedClinics() {
    return new Set(
      scopeClinics().filter((id) =>
        (!place.region || clinicMeta[id].region === place.region) &&
        (!place.facility || clinicMeta[id].facility === place.facility) &&
        (!place.clinic || id === place.clinic)),
    );
  }

  // Data for the selected place, all dates
  function data() {
    const ids = selectedClinics();
    const D = DashboardData;
    return {
      clinics: ids,
      screenings: D.screenings.filter((s) => ids.has(s.clinicId)),
      ulcers: D.ulcers.filter((u) => ids.has(u.clinicId)),
      referrals: D.referrals.filter((x) => ids.has(x.clinicId)),
      amputations: D.amputations.filter((a) => ids.has(a.clinicId)),
    };
  }

  // "All of Al-Noor Health Group", "Riyadh region", ...
  function scopeText() {
    const u = Access.currentUser();
    const nodes = Org.assignedNodes(u?.id).map(Org.get).filter(Boolean);
    if (!nodes.length) return "No clinics assigned to you";
    return nodes
      .map((n) => (n.level === "organisation" ? `All of ${n.name}` : n.level === "region" ? `${n.name} region` : n.level === "clinic" ? Org.clinicLabel(n.id) : n.name))
      .join("; ");
  }

  function placeText() {
    if (place.clinic) return Org.clinicLabel(place.clinic);
    if (place.facility) return Org.get(place.facility)?.name;
    if (place.region) return `${Org.get(place.region)?.name} (all facilities in scope)`;
    return "All clinics in your scope";
  }

  function fillPlaceFilters(onChange) {
    const box = $("#org-filter");
    if (!box) return;
    const region = $("#f-region");
    const facility = $("#f-facility");
    const clinic = $("#f-clinic");
    const ids = scopeClinics();

    // A single choice shows as that choice, fixed (nothing else is in scope)
    function options(select, items, allLabel, value) {
      if (items.length === 1) {
        select.replaceChildren(new Option(items[0][1], ""));
        select.disabled = true;
        return;
      }
      select.replaceChildren(new Option(allLabel, ""));
      items.forEach(([id, label]) => select.append(new Option(label, id, false, id === value)));
      select.disabled = items.length === 0;
    }
    function refresh() {
      const regions = [...new Set(ids.map((id) => clinicMeta[id].region))].map((id) => [id, Org.get(id)?.name ?? id]);
      options(region, regions, "All cities / regions", place.region);
      const facs = [...new Set(ids.filter((id) => !place.region || clinicMeta[id].region === place.region).map((id) => clinicMeta[id].facility))].map((id) => [id, Org.get(id)?.name ?? id]);
      options(facility, facs, "All facilities", place.facility);
      const clinics = ids
        .filter((id) => (!place.region || clinicMeta[id].region === place.region) && (!place.facility || clinicMeta[id].facility === place.facility))
        .map((id) => [id, Org.clinicLabel(id)]);
      options(clinic, clinics, "All clinics", place.clinic);
    }
    region.addEventListener("change", () => {
      place.region = region.value;
      place.facility = "";
      place.clinic = "";
      refresh();
      onChange();
    });
    facility.addEventListener("change", () => {
      place.facility = facility.value;
      place.clinic = "";
      refresh();
      onChange();
    });
    clinic.addEventListener("change", () => {
      place.clinic = clinic.value;
      onChange();
    });
    refresh();
  }

  // ---------- Labels ----------

  const DEST = { er: "Emergency department", tertiary: "Tertiary / Center of Excellence", secondary: "Secondary Care", vascular: "Vascular", "wound-care": "Wound Care" };
  const URGENCY = { routine: "Routine", soon: "Soon", urgent: "Urgent", emergency: "Emergency" };
  const BOOKED = { reception: "Reception", practitioner: "Practitioner", app: "Patient (app)", website: "Patient (website)" };
  const REF_STATUS = { seen: "Seen", pending: "Pending appointment", redirected: "Redirected", dna: "Did not attend" };
  const statusOf = (s) => (s.reviewed ? "Signed" : s.openedAt ? "In review" : "Waiting for practitioner");
  const hours = (h) => (h === null || h === undefined ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`);
  const patientName = (s) => Privacy.name(s.patient.name, s.patient.fileNumber);
  const shortClinic = (id) => Org.facilityOf(id)?.name ?? Org.clinicLabel(id);

  // ---------- CSV export ----------

  function csvCell(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function download(filename, rows, what) {
    const text = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof Audit !== "undefined") Audit.log("export", { action: `Exported ${what} (${rows.length - 1} rows, CSV)` });
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function listRows(list) {
    return [
      ["Appointment", "Sent to practitioner", "Patient", "File number", "Clinic", "Practitioner", "Status", "Wait sent to opened (h)", "Review time (min)", "Tests ordered", "Referral"],
      ...list.map((s) => [
        s.id, s.sentAt.toISOString(), patientName(s), s.patient.fileNumber, Org.clinicLabel(s.clinicId),
        DashboardData.personName(s.practitionerId), statusOf(s),
        s.waitToOpen === null ? "" : s.waitToOpen.toFixed(2), s.reviewTime === null ? "" : Math.round(s.reviewTime),
        s.testsOrdered.join("; "), s.referral ? `${DEST[s.referral.destination] ?? s.referral.destination} (${URGENCY[s.referral.urgency]})` : "",
      ]),
    ];
  }

  // ---------- Drill-down list (dialog) ----------

  let dialog = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el("dialog", "modal list-dialog");
    dialog.setAttribute("aria-labelledby", "list-dialog-title");
    dialog.innerHTML = `<div class="modal__inner">
      <div class="modal__header">
        <div><h2 class="modal__title" id="list-dialog-title"></h2><p class="modal__description" id="list-dialog-desc"></p></div>
        <form method="dialog"><button type="submit" class="btn btn-icon" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button></form>
      </div>
      <div class="list-dialog__body" id="list-dialog-body"></div>
    </div>`;
    document.body.append(dialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
    return dialog;
  }

  const PAGE = 100;

  function openList(title, list, context = "") {
    const d = ensureDialog();
    const sorted = [...list].sort((a, b) => b.sentAt - a.sentAt);
    let shown = PAGE;
    const titleEl = $("#list-dialog-title", d);
    const desc = $("#list-dialog-desc", d);
    const body = $("#list-dialog-body", d);

    function renderList() {
      titleEl.textContent = title;
      desc.textContent = `${sorted.length.toLocaleString("en-US")} appointment${sorted.length === 1 ? "" : "s"} · ${context || placeText()}`;
      body.replaceChildren();
      const bar = el("div", "list-dialog__bar");
      const exp = el("button", "btn btn-outline btn-sm", "Export CSV");
      exp.type = "button";
      exp.disabled = !sorted.length;
      exp.addEventListener("click", () => download(`appointments-${stamp()}.csv`, listRows(sorted), `appointment list "${title}"`));
      bar.append(el("p", "field-hint", "Select an appointment to see the practitioner's comment, treatments and waiting time."), exp);
      body.append(bar);
      if (!sorted.length) {
        body.append(el("p", "empty-line", "No appointments for these filters."));
        return;
      }
      const wrap = el("div", "table-wrap");
      const table = el("table", "data-table list-table");
      table.innerHTML = "<thead><tr><th>Sent</th><th>Patient</th><th>Clinic</th><th>Practitioner</th><th>Status</th><th>Wait to open</th></tr></thead>";
      const tbody = el("tbody");
      for (const s of sorted.slice(0, shown)) {
        const tr = el("tr");
        const th = el("th");
        const b = el("button", "btn-link", fmtDateTime(s.sentAt));
        b.type = "button";
        b.addEventListener("click", () => renderDetail(s));
        th.append(b);
        const who = el("td");
        who.append(el("span", "", patientName(s)), el("span", "list-table__sub", s.patient.fileNumber));
        tr.append(th, who, el("td", "", shortClinic(s.clinicId)), el("td", "", DashboardData.personName(s.practitionerId)), el("td", "", statusOf(s)), el("td", "", hours(s.waitToOpen)));
        tbody.append(tr);
      }
      table.append(tbody);
      wrap.append(table);
      body.append(wrap);
      if (shown < sorted.length) {
        const more = el("button", "btn btn-outline btn-sm", `Show ${Math.min(PAGE, sorted.length - shown)} more of ${(sorted.length - shown).toLocaleString("en-US")}`);
        more.type = "button";
        more.addEventListener("click", () => {
          shown += PAGE;
          renderList();
        });
        body.append(more);
      }
    }

    function renderDetail(s) {
      titleEl.textContent = `Appointment ${s.id}`;
      desc.textContent = `${patientName(s)} · ${s.patient.fileNumber}`;
      body.replaceChildren();
      const back = el("button", "btn btn-ghost btn-sm", "← Back to the list");
      back.type = "button";
      back.addEventListener("click", renderList);
      body.append(back);

      const dl = (pairs) => {
        const list = el("dl", "detail-list");
        for (const [k, v] of pairs) list.append(el("dt", "", k), el("dd", "", v ?? "—"));
        return list;
      };
      const section = (h, content) => {
        const sec = el("section", "detail-section");
        sec.append(el("h3", "detail-section__title", h), content);
        return sec;
      };
      const a = s.appointment;
      body.append(
        section("Appointment", dl([
          ["Clinic", Org.clinicLabel(s.clinicId)],
          ["Booked by", `${BOOKED[a.bookedBy.type] ?? a.bookedBy.type}${a.bookedBy.type === "practitioner" ? `: ${DashboardData.personName(s.practitionerId)}` : ""}`],
          ["Booked on", fmtDateTime(a.bookedAt)],
          ["Confirmed", a.confirmed ? "Yes" : "No"],
          ["Type", a.source === "referral" ? "From a referral" : "Regular booking"],
          ["Nurse", DashboardData.personName(s.nurseId)],
          ["Practitioner", DashboardData.personName(s.practitionerId)],
        ])),
        section("Times", dl([
          ["Arrived", fmtDateTime(s.arrivedAt)],
          ["Screening sent by the nurse", fmtDateTime(s.sentAt)],
          ["Opened by the practitioner", fmtDateTime(s.openedAt)],
          ["Wait from sending to opening", hours(s.waitToOpen)],
          ["Signed", fmtDateTime(s.signedAt)],
          ["Review time", s.reviewTime === null ? "—" : `${Math.round(s.reviewTime)} min`],
        ])),
      );
      if (Privacy.medicalVisible(s.patient.fileNumber)) {
        const tx = s.treatments.length ? el("ul", "detail-bullets") : el("p", "field-hint", "No treatments prescribed.");
        s.treatments.forEach((t) => tx.append(el("li", "", t)));
        body.append(
          section("Practitioner's comment", el("p", "", s.comment ?? "Not signed yet.")),
          section("Treatments prescribed", tx),
          section("Orders and referral", dl([
            ["Tests ordered", s.testsOrdered.length ? s.testsOrdered.join(", ") : "None"],
            ["Tests dismissed", s.testsSuggested.filter((t) => !t.accepted).map((t) => `${t.label} (${t.reason})`).join(", ") || "None"],
            ["Referral", s.referral ? `${DEST[s.referral.destination]}, ${URGENCY[s.referral.urgency].toLowerCase()} · ${REF_STATUS[s.referral.status]}` : s.referralSuggested && !s.referralSuggested.made ? `Suggested (${DEST[s.referralSuggested.destination]}) but not made${s.referralSuggested.reason ? `: ${s.referralSuggested.reason}` : ""}` : "None"],
          ])),
        );
      } else {
        body.append(el("p", "callout callout-warning", "The medical record (comment, treatments, tests) is hidden for your role."));
      }
      back.focus();
    }

    renderList();
    if (!d.open) d.showModal();
  }

  // ---------- Page states (UAT-19) ----------

  function state(host, kind, text, retry) {
    const box = el("div", `dash-state dash-state--${kind}`);
    box.setAttribute("role", kind === "error" ? "alert" : "status");
    if (kind === "loading") box.append(el("span", "dash-state__spinner"));
    box.append(el("p", "dash-state__title", kind === "loading" ? "Loading…" : kind === "empty" ? "No data for these filters" : "The dashboard couldn't load"));
    if (text) box.append(el("p", "field-hint", text));
    if (retry) {
      const b = el("button", "btn btn-outline btn-sm", "Try again");
      b.type = "button";
      b.addEventListener("click", retry);
      box.append(b);
    }
    host.replaceChildren(box);
  }

  // ---------- Page wiring ----------
  // init({ render(range, preset), figures() }) — render draws the page for the current
  // filters; figures returns [[label, value]] for "Export figures".

  function init({ render, figures, exportName = "dashboard" }) {
    let range = rangeFor("30d");
    let preset = "30d";
    let token = 0;
    const content = $("[data-dash-content]");
    const states = $("[data-dash-state]");

    async function run() {
      const mine = ++token;
      if (states) {
        states.hidden = false;
        state(states, "loading");
      }
      if (content) content.hidden = true;
      $("#scope-note") && ($("#scope-note").textContent = `Your scope: ${scopeText()}. Showing: ${placeText()}.`);
      $("#range-summary") && ($("#range-summary").textContent = `${rangeText(range)} · ${lengthDays(range)} days. Compared with ${rangeText(previous(range))}.`);
      await Db.delay(120);
      if (mine !== token) return;
      try {
        const D = data();
        if (!D.clinics.size) {
          state(states, "empty", "No clinics are in your scope. Ask an administrator to assign you to a clinic, facility or region.");
          return;
        }
        const any = D.screenings.some((s) => within(s.at, range));
        if (!any) {
          state(states, "empty", "There are no appointments in this period for the selected place. Try a longer date range or another clinic.");
          return;
        }
        if (content) content.hidden = false;
        render({ D, range, preset });
        if (states) states.hidden = true;
      } catch (e) {
        Db.logError("dashboard", e);
        if (content) content.hidden = true;
        if (states) {
          states.hidden = false;
          state(states, "error", "Something went wrong while preparing the figures. The error was recorded for the support team.", run);
        }
      }
    }

    // Date range controls
    const customBox = $("#custom-range");
    const fromInput = $("#range-from");
    const toInput = $("#range-to");
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (fromInput) {
      fromInput.min = toInput.min = iso(new Date(FIRST.getTime() + 35 * DAY));
      fromInput.max = toInput.max = iso(TODAY);
    }

    function setPreset(key) {
      preset = key;
      $$("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === key)));
      if (customBox) customBox.hidden = key !== "custom";
      if (key === "custom") {
        fromInput.value ||= iso(range.from);
        toInput.value ||= iso(range.to);
        fromInput.focus();
        return;
      }
      range = rangeFor(key);
      run();
    }
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => setPreset(b.dataset.preset)));

    function fieldError(input, message) {
      const wrap = input.closest(".q");
      const err = $(".field-error", wrap);
      err.hidden = !message;
      $("span", err).textContent = message ?? "";
      wrap.classList.toggle("q--invalid", !!message);
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }

    $("#apply-range")?.addEventListener("click", () => {
      fieldError(fromInput, null);
      fieldError(toInput, null);
      const parse = (v) => (v ? new Date(`${v}T00:00:00`) : null);
      const from = parse(fromInput.value);
      const to = parse(toInput.value);
      if (!from) return fieldError(fromInput, "Choose a start date."), fromInput.focus();
      if (!to) return fieldError(toInput, "Choose an end date."), toInput.focus();
      if (to > TODAY) return fieldError(toInput, "End date can't be in the future."), toInput.focus();
      if (from < new Date(fromInput.min + "T00:00:00")) return fieldError(fromInput, `Data starts ${fmtDate(new Date(fromInput.min + "T00:00:00"))}.`), fromInput.focus();
      if (from > to) return fieldError(toInput, "End date must be on or after the start date."), toInput.focus();
      range = { from, to };
      run();
    });
    [fromInput, toInput].forEach((i) => i?.addEventListener("input", () => fieldError(i, null)));

    fillPlaceFilters(run);

    $("#export-figures")?.addEventListener("click", () => {
      const rows = [["Figure", "Value"], ["Place", placeText()], ["Period", rangeText(range)], ...(figures?.() ?? [])];
      download(`${exportName}-${stamp()}.csv`, rows, `${exportName} figures`);
    });

    setPreset("30d");
  }

  return {
    $, $$, el, fmtDate, fmtDateTime, median, mean, pct, change, sum,
    PRESETS, rangeFor, lengthDays, previous, within, rangeText, buckets, coarseBuckets, bucketLabel,
    data, scopeClinics, scopeText, placeText, place,
    DEST, URGENCY, BOOKED, REF_STATUS, statusOf, hours, patientName, shortClinic,
    openList, download, listRows, stamp, state, init,
  };
})();

// ---------- Operations, Clinical and landing pages ----------

(() => {
  if (typeof Access !== "undefined" && Access.denied) return;
  const K = DashCore;
  const C = Charts;
  const { $, within, pct, median, mean, change } = K;
  const DAY = DashboardData.DAY;

  const RAMP4 = ["var(--ramp4-1)", "var(--ramp4-2)", "var(--ramp4-3)", "var(--ramp4-4)"];
  const RAMP5 = ["var(--ramp5-1)", "var(--ramp5-2)", "var(--ramp5-3)", "var(--ramp5-4)", "var(--ramp5-5)"];

  function measures(D, r) {
    const S = D.screenings.filter((s) => within(s.at, r));
    const reviewed = S.filter((s) => s.reviewed);
    const refsMade = D.referrals.filter((x) => within(x.at, r));
    const refsDue = D.referrals.filter((x) => within(x.apptAt, r) && x.status !== "pending");
    const followDue = D.screenings.filter((s) => within(s.followDue, r) && s.followDone !== null);
    const newUlcers = S.filter((s) => s.ulcer).map((s) => s.ulcer);
    const end = new Date(r.to.getTime() + DAY);
    const activeAtEnd = D.ulcers.filter((u) => u.at < end && (!u.healedAt || u.healedAt >= end)).length;
    const amps = D.amputations.filter((a) => within(a.at, r));
    return {
      S, reviewed, refsMade, refsDue, followDue, newUlcers, amps,
      count: S.length,
      testsOrdered: K.sum(S.map((s) => s.testsOrdered.length)),
      turnaround: median(reviewed.map((s) => s.turnaround)),
      waitOpen: median(S.filter((s) => s.waitToOpen !== null).map((s) => s.waitToOpen)),
      wait: median(refsDue.filter((x) => x.status === "seen").map((x) => x.wait)),
      followUp: pct(followDue.filter((s) => s.followDone).length, followDue.length),
      dna: pct(refsDue.filter((x) => x.status === "dna").length, refsDue.filter((x) => x.status === "dna" || x.status === "seen").length),
      atRisk: pct(S.filter((s) => s.risk >= 2).length, S.length),
      ulcersNew: newUlcers.length,
      activeAtEnd,
      infected: pct(newUlcers.filter((u) => u.infection >= 2).length, newUlcers.length),
      limb: newUlcers.filter((u) => u.unstable).length,
      ampsTotal: amps.length,
      hba1cGood: pct(S.filter((s) => s.hba1c === 0).length, S.length),
    };
  }

  // ---------- Landing ----------

  const landing = $("#dash-landing");
  if (landing) {
    const r = K.rangeFor("30d");
    const D = K.data();
    $("#landing-scope").textContent = `Your scope: ${K.scopeText()}.`;
    if (!D.clinics.size) {
      K.state($("#landing-state"), "empty", "No clinics are in your scope, so there is nothing to show.");
      $("#landing-state").hidden = false;
      return;
    }
    const now = measures(D, r);
    const before = measures(D, K.previous(r));
    const tile = (label, key, good, format) =>
      C.stat({ label, value: now[key] === null ? "—" : format(now[key]), delta: { pct: change(now[key], before[key]), good, vs: "previous 30 days" } });
    $("#preview-ops").replaceChildren(
      tile("Appointments", "count", "up", C.fmt.count),
      tile("Tests ordered", "testsOrdered", null, C.fmt.count),
      tile("Median wait to open", "waitOpen", "down", C.fmt.hours),
    );
    $("#preview-clin").replaceChildren(
      tile("At risk (IWGDF 2–3)", "atRisk", null, C.fmt.pct),
      tile("New ulcers", "ulcersNew", "down", C.fmt.count),
      tile("Limb-threatening cases", "limb", "down", C.fmt.count),
    );
    const sugg = now.S.flatMap((s) => s.testsSuggested);
    const recs = K.sum(now.S.map((s) => s.recs.total));
    const over = K.sum(now.S.map((s) => s.recs.overridden.length));
    $("#preview-value")?.replaceChildren(
      C.stat({ label: "Suggested tests accepted", value: sugg.length ? C.fmt.pct(pct(sugg.filter((t) => t.accepted).length, sugg.length)) : "—" }),
      C.stat({ label: "Recommendations confirmed unchanged", value: recs ? C.fmt.pct(pct(recs - over, recs)) : "—" }),
    );
    $("#preview-range").textContent = `Last 30 days: ${K.rangeText(r)}`;
    return;
  }

  const opsPage = $("#ops-kpis");
  const clinPage = $("#clin-kpis");
  if (!opsPage && !clinPage) return;

  let figures = [];

  function render({ D, range, preset }) {
    const prev = K.previous(range);
    const now = measures(D, range);
    const before = measures(D, prev);
    const B = K.buckets(range);
    const labels = B.map((b) => b.label);
    const full = B.map((b) => b.full);
    const per = (fn) => B.map((b) => fn(b));
    const vs = preset in K.PRESETS && preset !== "ytd" ? `previous ${K.PRESETS[preset].label.replace("Last ", "")}` : "previous period";
    const delta = (key, good) => ({ pct: change(now[key], before[key]), good, vs });
    const show = (v, f) => (v === null ? "—" : f(v));
    const list = (title, rows, ctx) => ({ label: "View appointments", onClick: () => K.openList(title, rows, ctx) });
    const inBucket = (b) => now.S.filter((s) => within(s.at, b));

    if (opsPage) {
      const live = typeof ScreeningStore !== "undefined" ? ScreeningStore.reviewQueue().filter((r) => D.clinics.has(Org.clinicOfRecord(r))).length : 0;
      const withTests = now.S.filter((s) => s.testsOrdered.length);
      const opened = now.S.filter((s) => s.waitToOpen !== null);
      const followRows = now.followDue;
      const dnaRows = now.S.filter((s) => s.referral && s.referral.status === "dna");
      figures = [
        ["Appointments", now.count],
        ["Tests ordered", now.testsOrdered],
        ["Appointments with tests ordered", withTests.length],
        ["Awaiting review now (live)", live],
        ["Median wait from sending to opening (h)", now.waitOpen?.toFixed(2) ?? ""],
        ["Median review turnaround (h)", now.turnaround?.toFixed(2) ?? ""],
        ["Follow-up completion (%)", now.followUp?.toFixed(1) ?? ""],
        ["Did-not-attend rate (%)", now.dna?.toFixed(1) ?? ""],
      ];
      opsPage.replaceChildren(
        C.stat({ label: "Appointments", value: C.fmt.count(now.count), delta: delta("count", "up"), spark: per((b) => inBucket(b).length), action: list("Appointments", now.S) }),
        C.stat({ label: "Tests ordered", value: C.fmt.count(now.testsOrdered), delta: delta("testsOrdered", null), action: list("Appointments with tests ordered", withTests, `${K.placeText()} · ${C.fmt.count(now.testsOrdered)} tests on ${withTests.length} appointments`) }),
        C.stat({ label: "Awaiting review now", value: C.fmt.count(live), note: "Live queue for the selected place" }),
        C.stat({ label: "Median wait to open", value: show(now.waitOpen, C.fmt.hours), delta: delta("waitOpen", "down"), action: list("Wait from sending to opening", opened) }),
        C.stat({ label: "Median review turnaround", value: show(now.turnaround, C.fmt.hours), delta: delta("turnaround", "down"), action: list("Signed appointments", now.reviewed) }),
        C.stat({ label: "Follow-up completion", value: show(now.followUp, C.fmt.pct), delta: delta("followUp", "up"), action: list("Follow-ups due in the period", followRows) }),
        C.stat({ label: "Did-not-attend rate", value: show(now.dna, C.fmt.pct), delta: delta("dna", "down"), action: list("Referrals not attended", dnaRows) }),
      );

      const statusRows = (st) => now.S.filter((s) => s.referral?.status === st);
      const seenDue = now.refsDue.filter((x) => x.status === "seen");
      const waitBins = [["< 1 h", 0, 1], ["1–4 h", 1, 4], ["4–12 h", 4, 12], ["12–24 h", 12, 24], ["> 24 h", 24, Infinity]];
      const clinicIds = [...D.clinics];
      const testNames = DashboardData.TESTS.map(([, l]) => l).concat("Lipid profile").filter((v, i, a) => a.indexOf(v) === i);
      const testCounts = testNames.map((t) => ({ t, rows: now.S.filter((s) => s.testsOrdered.includes(t)) })).filter((x) => x.rows.length).sort((a, b) => b.rows.length - a.rows.length);
      const channels = Object.keys(K.BOOKED);
      const steps = [
        ["Booked", now.S],
        ["Screened and sent", now.S],
        ["Signed", now.reviewed],
        ["Referred", now.S.filter((s) => s.referral)],
        ["Seen by specialist", now.S.filter((s) => s.referral?.status === "seen")],
      ];

      $("#ops-charts").replaceChildren(
        C.columns({
          title: "Appointments",
          subtitle: `Per ${K.bucketLabel(range).toLowerCase()} · select a column to list them`,
          labels, fullLabels: full, tableHead: K.bucketLabel(range), name: "Appointments",
          values: per((b) => inBucket(b).length),
          onSelect: (i) => K.openList(`Appointments · ${full[i]}`, inBucket(B[i])),
        }),
        C.bars({
          title: "Appointments by clinic",
          subtitle: "Select a bar to list them",
          name: "Appointments", tableHead: "Clinic",
          items: clinicIds.map((id) => ({ label: K.shortClinic(id), value: now.S.filter((s) => s.clinicId === id).length })),
          onSelect: (i) => K.openList(`Appointments · ${K.shortClinic(clinicIds[i])}`, now.S.filter((s) => s.clinicId === clinicIds[i]), Org.clinicLabel(clinicIds[i])),
        }),
        C.bars({
          title: "Tests ordered",
          subtitle: "By test · select a bar to list the appointments",
          name: "Tests ordered", tableHead: "Test",
          items: testCounts.map((x) => ({ label: x.t, value: x.rows.length })),
          onSelect: (i) => K.openList(`Appointments with ${testCounts[i].t}`, testCounts[i].rows),
        }),
        C.columns({
          title: "Wait from sending to opening",
          subtitle: "Appointments by time from the nurse sending the screening to the practitioner opening the file",
          labels: waitBins.map((b) => b[0]), tableHead: "Wait", name: "Appointments", labelAll: true,
          values: waitBins.map(([, lo, hi]) => now.S.filter((s) => s.waitToOpen !== null && s.waitToOpen >= lo && s.waitToOpen < hi).length),
          onSelect: (i) => K.openList(`Wait ${waitBins[i][0]}`, now.S.filter((s) => s.waitToOpen !== null && s.waitToOpen >= waitBins[i][1] && s.waitToOpen < waitBins[i][2])),
        }),
        C.bars({
          title: "Booking channel",
          subtitle: "Who booked the appointment",
          name: "Appointments", tableHead: "Booked by",
          items: channels.map((c) => ({ label: K.BOOKED[c], value: now.S.filter((s) => s.appointment.bookedBy.type === c).length })),
          onSelect: (i) => K.openList(`Booked by ${K.BOOKED[channels[i]]}`, now.S.filter((s) => s.appointment.bookedBy.type === channels[i])),
        }),
        C.bars({
          title: "Pathway completion",
          subtitle: "Appointments in the period reaching each step",
          name: "Appointments", tableHead: "Step",
          items: steps.map(([label, rows], i) => ({ label, value: rows.length, color: RAMP5[i] })),
          onSelect: (i) => K.openList(`Pathway: ${steps[i][0]}`, steps[i][1]),
        }),
        C.bars({
          title: "Referral status",
          subtitle: "Referrals made from appointments in the period",
          name: "Referrals", tableHead: "Status",
          items: Object.entries(K.REF_STATUS).map(([st, label]) => ({ label, value: statusRows(st).length })),
          onSelect: (i) => {
            const st = Object.keys(K.REF_STATUS)[i];
            K.openList(`Referrals: ${K.REF_STATUS[st]}`, statusRows(st));
          },
        }),
        C.bars({
          title: "Wait to first specialist appointment",
          subtitle: "Median days, appointments attended in the period",
          name: "Median wait", tableHead: "Destination", format: C.fmt.days,
          items: ["tertiary", "secondary", "vascular", "er"].map((k) => ({ label: K.DEST[k], value: median(seenDue.filter((x) => x.destination === k).map((x) => x.wait)) ?? 0 })),
        }),
        C.lines({
          title: "Documentation time",
          subtitle: "Average minutes per appointment",
          labels, fullLabels: full, tableHead: K.bucketLabel(range), format: C.fmt.minutes, tickFormat: (v) => v.toFixed(0),
          series: [
            { name: "Nurse preparation", color: "var(--viz-1)", values: per((b) => mean(inBucket(b).map((s) => s.nursePrep)) ?? 0) },
            { name: "Practitioner documentation", color: "var(--viz-2)", values: per((b) => mean(inBucket(b).map((s) => s.doctorDoc)) ?? 0) },
          ],
        }),
      );
    }

    if (clinPage) {
      const end = (b) => new Date(b.to.getTime() + DAY);
      const activeAt = (b) => D.ulcers.filter((u) => u.at < end(b) && (!u.healedAt || u.healedAt >= end(b))).length;
      const ulcerRows = now.S.filter((s) => s.ulcer);
      figures = [
        ["At risk IWGDF 2-3 (%)", now.atRisk?.toFixed(1) ?? ""],
        ["New ulcers", now.ulcersNew],
        ["Active ulcers at period end", now.activeAtEnd],
        ["Infected ulcers grade 2-4 (%)", now.infected?.toFixed(1) ?? ""],
        ["Limb-threatening cases", now.limb],
        ["HbA1c below 7% (%)", now.hba1cGood?.toFixed(1) ?? ""],
      ];
      clinPage.replaceChildren(
        C.stat({ label: "At risk (IWGDF 2–3)", value: show(now.atRisk, C.fmt.pct), delta: delta("atRisk", null), action: list("Patients at risk (IWGDF 2–3)", now.S.filter((s) => s.risk >= 2)) }),
        C.stat({ label: "New ulcers", value: C.fmt.count(now.ulcersNew), delta: delta("ulcersNew", "down"), spark: per((b) => inBucket(b).filter((s) => s.ulcer).length), action: list("Appointments with a new ulcer", ulcerRows) }),
        C.stat({ label: "Active ulcers at period end", value: C.fmt.count(now.activeAtEnd), delta: delta("activeAtEnd", "down"), spark: per(activeAt) }),
        C.stat({ label: "Infected ulcers (grade 2–4)", value: show(now.infected, C.fmt.pct), delta: delta("infected", "down"), action: list("Infected ulcers", ulcerRows.filter((s) => s.ulcer.infection >= 2)) }),
        C.stat({ label: "Limb-threatening cases", value: C.fmt.count(now.limb), delta: delta("limb", "down"), action: list("Limb-threatening cases", ulcerRows.filter((s) => s.ulcer.unstable)) }),
        C.stat({ label: "HbA1c below 7%", value: show(now.hba1cGood, C.fmt.pct), delta: delta("hba1cGood", "up") }),
      );

      const factor = (fn) => pct(now.S.filter(fn).length, now.count) ?? 0;
      const minor = now.amps.filter((a) => a.level === "minor").length;
      const major = now.amps.filter((a) => a.level === "major").length;
      const healedIn = (b) => D.ulcers.filter((u) => u.healedAt && within(u.healedAt, b)).length;
      const UB = K.coarseBuckets(range);
      const unit = K.lengthDays(range) <= 14 ? "day" : K.lengthDays(range) <= 180 ? "week" : "month";

      $("#clin-charts").replaceChildren(
        C.columns({
          title: "IWGDF risk category",
          subtitle: "Patients screened in the period · select a column to list them",
          labels: ["0 · Very low", "1 · Low", "2 · Moderate", "3 · High"], tableHead: "Risk category", name: "Patients", labelAll: true,
          values: [0, 1, 2, 3].map((r) => now.S.filter((s) => s.risk === r).length), colors: RAMP4,
          onSelect: (i) => K.openList(`IWGDF ${i}`, now.S.filter((s) => s.risk === i)),
        }),
        C.lines({
          title: "New and healed ulcers",
          subtitle: `Per ${unit}`,
          labels: UB.map((b) => b.label), fullLabels: UB.map((b) => b.full), tableHead: unit[0].toUpperCase() + unit.slice(1),
          series: [
            { name: "New", color: "var(--viz-1)", values: UB.map((b) => D.screenings.filter((s) => s.ulcer && within(s.at, b)).length) },
            { name: "Healed", color: "var(--viz-2)", values: UB.map(healedIn) },
          ],
        }),
        C.columns({
          title: "Infection grade (IWGDF/IDSA)",
          subtitle: "New ulcers in the period",
          labels: ["1 · None", "2 · Mild", "3 · Moderate", "4 · Severe"], tableHead: "Grade", name: "Ulcers", labelAll: true,
          values: [1, 2, 3, 4].map((g) => now.newUlcers.filter((u) => u.infection === g).length), colors: RAMP4,
          onSelect: (i) => K.openList(`Infection grade ${i + 1}`, ulcerRows.filter((s) => s.ulcer.infection === i + 1)),
        }),
        C.columns({
          title: "Wagner grade",
          subtitle: "New ulcers in the period",
          labels: ["1", "2", "3", "4", "5"], tableHead: "Wagner grade", name: "Ulcers", labelAll: true,
          values: [1, 2, 3, 4, 5].map((g) => now.newUlcers.filter((u) => u.wagner === g).length), colors: RAMP5,
          onSelect: (i) => K.openList(`Wagner grade ${i + 1}`, ulcerRows.filter((s) => s.ulcer.wagner === i + 1)),
        }),
        C.bars({
          title: "Risk factors",
          subtitle: "Share of patients screened",
          name: "Share", tableHead: "Risk factor", format: C.fmt.pct, max: 100,
          items: [
            ["Loss of protective sensation", (s) => s.lops],
            ["Peripheral arterial disease", (s) => s.pad],
            ["Foot deformity", (s) => s.deformity],
            ["Previous ulcer", (s) => s.prevUlcer],
            ["Previous amputation", (s) => s.amputationHx],
            ["On dialysis", (s) => s.dialysis],
            ["Suspected Charcot", (s) => s.charcot],
          ].map(([label, fn]) => ({ label, value: factor(fn) })),
        }),
        C.stacked({
          title: "HbA1c control",
          subtitle: "Patients screened, by last HbA1c (MoC target below 7%)",
          name: "Patients",
          segments: [
            { label: "Below 7%", value: now.S.filter((s) => s.hba1c === 0).length, color: "var(--ramp3-1)", ink: "#0b0b0b" },
            { label: "7–9%", value: now.S.filter((s) => s.hba1c === 1).length, color: "var(--ramp3-2)" },
            { label: "Above 9%", value: now.S.filter((s) => s.hba1c === 2).length, color: "var(--ramp3-3)" },
          ],
        }),
        C.columns({
          title: "Referrals by urgency",
          subtitle: "Referrals made in the period",
          labels: ["Routine", "Soon", "Urgent", "Emergency"], tableHead: "Urgency", name: "Referrals", labelAll: true,
          values: ["routine", "soon", "urgent", "emergency"].map((u) => now.refsMade.filter((x) => x.urgency === u).length), colors: RAMP4,
        }),
        C.bars({
          title: "Amputations",
          subtitle: `In the period: ${minor} minor, ${major} major`,
          name: "Amputations", tableHead: "Level",
          items: [{ label: "Minor (toe / ray / TMA)", value: minor }, { label: "Major (below / above knee)", value: major }],
        }),
      );
    }
  }

  K.init({ render, figures: () => figures, exportName: opsPage ? "operations" : "clinical" });
})();
