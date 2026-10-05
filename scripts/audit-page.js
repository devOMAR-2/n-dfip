// Audit log page (UAT-05). Read only: nothing here edits or deletes an entry.
// Scope: users assigned at organisation level see every entry; everyone else sees entries
// for the facilities and clinics in their scope (a supervisor sees their own facility).
// Old/new values of medical-record events follow the viewer's data visibility (UAT-02).
// FRONT-END ONLY: the server filters the log by the same scope.

(() => {
  if (Access.denied) return;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const fmt = (iso) =>
    new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  const PAGE = 100;
  const MEDICAL = new Set(["value.edit", "medication", "recommendation", "suggestion", "test"]);
  const LEGACY_CLINIC = "cl-df-nrc"; // entries written before clinics existed

  const me = Access.currentUser();
  const orgWide = Org.assignedNodes(me.id).some((id) => Org.get(id)?.level === "organisation");
  const results = $("#audit-results");
  const count = $("#audit-count");
  const exportBtn = $("#audit-export");
  let shown = PAGE;
  let filtered = [];

  // Older entries (before audit.js) have no type or units
  const normalise = (e) => ({
    ...e,
    type: e.type ?? "encounter",
    clinicId: e.clinicId === undefined ? LEGACY_CLINIC : e.clinicId,
    facilityId: e.facilityId === undefined ? Org.facilityOf(e.clinicId ?? LEGACY_CLINIC)?.id ?? "" : e.facilityId,
    action: e.detail ? `${e.action}: ${e.detail}` : e.action,
  });

  function inScope(e) {
    if (orgWide) return true;
    const ids = Org.scopeIds(me.id);
    return (e.clinicId && ids.has(e.clinicId)) || (e.facilityId && ids.has(e.facilityId)) || e.byId === me.id;
  }

  const scoped = () => Audit.all().map(normalise).filter(inScope).reverse();

  // ---------- Filters ----------

  const f = {
    user: $("#f-user"), patient: $("#f-patient"), type: $("#f-type"), from: $("#f-from"), to: $("#f-to"),
    facility: $("#f-facility"), clinic: $("#f-clinic"), flagged: $("#f-flagged"),
  };

  function fillFilters(entries) {
    const keep = (select, options) => {
      const current = select.value;
      const first = select.options[0];
      select.replaceChildren(first, ...options.map(([v, l]) => new Option(l, v, false, v === current)));
    };
    const users = [...new Map(entries.map((e) => [e.byId ?? `name:${e.by}`, e.by])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    keep(f.user, users);
    keep(f.type, Object.entries(Audit.TYPES));
    keep(f.facility, (orgWide ? Org.nodes().filter((n) => n.level === "facility") : Org.facilitiesInScope(me.id)).map((n) => [n.id, n.name]));
    const clinics = (orgWide ? Org.nodes().filter((n) => n.level === "clinic") : Org.clinicsInScope(me.id))
      .filter((c) => !f.facility.value || Org.facilityOf(c.id)?.id === f.facility.value);
    keep(f.clinic, clinics.map((c) => [c.id, Org.clinicLabel(c.id)]));
  }

  function setDateError(message) {
    const err = $("#f-to-error");
    err.hidden = !message;
    $("span", err).textContent = message ?? "";
    if (message) f.to.setAttribute("aria-invalid", "true");
    else f.to.removeAttribute("aria-invalid");
  }

  function apply(entries) {
    const patient = f.patient.value.trim().toLowerCase();
    const from = f.from.value ? new Date(`${f.from.value}T00:00:00`) : null;
    const to = f.to.value ? new Date(`${f.to.value}T23:59:59.999`) : null;
    if (from && to && to < from) {
      setDateError("The end date is before the start date.");
      return null;
    }
    setDateError(null);
    return entries.filter((e) => {
      if (f.user.value && (e.byId ?? `name:${e.by}`) !== f.user.value) return false;
      if (patient && ![e.patient, e.record].some((v) => String(v ?? "").toLowerCase().includes(patient))) return false;
      if (f.type.value && e.type !== f.type.value) return false;
      const at = new Date(e.at);
      if (from && at < from) return false;
      if (to && at > to) return false;
      if (f.facility.value && e.facilityId !== f.facility.value) return false;
      if (f.clinic.value && e.clinicId !== f.clinic.value) return false;
      if (f.flagged.checked && !e.flagged) return false;
      return true;
    });
  }

  // ---------- Rendering ----------

  const unitText = (e) => {
    const facility = e.facilityId ? Org.get(e.facilityId)?.name : null;
    const clinic = e.clinicId ? Org.get(e.clinicId)?.name : null;
    return [facility, clinic].filter(Boolean).join(" · ") || "Organisation";
  };

  function changeCell(e) {
    const td = el("td", "audit-change");
    td.dataset.label = "Change";
    if (e.old === null && e.new === null) {
      td.textContent = "—";
      return td;
    }
    if (MEDICAL.has(e.type) && e.patient && !Privacy.medicalVisible(e.patient)) {
      td.append(el("span", "audit-hidden", "Hidden (medical record)"));
      return td;
    }
    if (e.field) td.append(el("span", "audit-change__field", e.field));
    const line = el("span", "audit-change__values");
    line.append(el("del", "", e.old === null || e.old === "" ? "(empty)" : String(e.old)), el("span", "audit-change__arrow", " → "), el("ins", "", e.new === null || e.new === "" ? "(empty)" : String(e.new)));
    td.append(line);
    return td;
  }

  function row(e) {
    const tr = el("tr");
    if (e.flagged) tr.classList.add("audit-row--flagged");
    const cell = (label, text, cls = "") => {
      const td = el("td", cls, text ?? "—");
      td.dataset.label = label;
      return td;
    };
    const when = el("td", "audit-when");
    when.dataset.label = "When";
    const time = el("time", "", fmt(e.at));
    time.dateTime = e.at;
    when.append(time);

    const who = el("td");
    who.dataset.label = "Who";
    who.append(el("span", "audit-who", e.by), el("span", "audit-role", e.role || "No role"));

    const action = el("td");
    action.dataset.label = "Action";
    action.append(el("span", "audit-action", e.action));
    const meta = el("span", "audit-type");
    meta.append(el("span", "badge badge-muted", Audit.TYPES[e.type] ?? e.type));
    if (e.flagged) meta.append(el("span", "badge badge-danger", "Flagged for review"));
    action.append(meta);

    const subject = [e.patient, e.record && e.record !== e.patient ? e.record : null].filter(Boolean).join(" · ");
    tr.append(when, who, cell("Facility · clinic", unitText(e)), action, cell("Patient / record", subject || "—"), changeCell(e), cell("Reason", e.reason || "—"));
    return tr;
  }

  function renderTable() {
    results.replaceChildren();
    count.textContent = filtered.length ? `${plural(filtered.length, "entry", "entries")}${filtered.length > shown ? `, showing the newest ${shown}` : ""}` : "";
    exportBtn.disabled = !filtered.length;
    if (!filtered.length) {
      const empty = el("section", "empty-state");
      empty.innerHTML = '<div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></svg></div>';
      const any = scoped().length;
      empty.append(
        el("h2", "empty-state__title", any ? "No entries match these filters" : "No audit entries yet"),
        el("p", "empty-state__text", any ? "Change or clear the filters to see more." : "Events in your facilities and clinics appear here as soon as they happen."),
      );
      results.append(empty);
      return;
    }
    const wrap = el("div", "table-wrap audit-table-wrap");
    const table = el("table", "data-table audit-table");
    const cap = el("caption", "sr-only", "Audit log entries, newest first");
    const thead = el("thead");
    const hr = el("tr");
    ["When", "Who", "Facility · clinic", "Action", "Patient / record", "Change", "Reason"].forEach((h) => {
      const th = el("th", "", h);
      th.scope = "col";
      hr.append(th);
    });
    thead.append(hr);
    const tbody = el("tbody");
    filtered.slice(0, shown).forEach((e) => tbody.append(row(e)));
    table.append(cap, thead, tbody);
    wrap.append(table);
    results.append(wrap);
    if (filtered.length > shown) {
      const more = el("button", "btn btn-outline audit-more", `Show ${Math.min(PAGE, filtered.length - shown)} more`);
      more.type = "button";
      more.addEventListener("click", () => {
        shown += PAGE;
        renderTable();
      });
      results.append(more);
    }
  }

  function refresh({ resetPaging = false } = {}) {
    try {
      const entries = scoped();
      fillFilters(entries);
      const next = apply(entries);
      if (next === null) return;
      filtered = next;
      if (resetPaging) shown = PAGE;
      renderTable();
    } catch (e) {
      showError(e);
    }
  }

  function showError(e) {
    Db.logError("audit page", e);
    exportBtn.disabled = true;
    count.textContent = "";
    const box = el("section", "empty-state");
    box.setAttribute("role", "alert");
    box.innerHTML = '<div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg></div>';
    const retry = el("button", "btn btn-primary", "Try again");
    retry.type = "button";
    retry.addEventListener("click", () => load());
    box.append(el("h2", "empty-state__title", "The audit log couldn't be loaded"), el("p", "empty-state__text", "Something went wrong while reading the log. The error was recorded for the support team."), retry);
    results.replaceChildren(box);
  }

  async function load() {
    count.textContent = "";
    exportBtn.disabled = true;
    const loading = el("p", "loading-line", "Loading the audit log…");
    loading.setAttribute("role", "status");
    results.replaceChildren(loading);
    await Db.delay(250);
    refresh({ resetPaging: true });
  }

  // ---------- Export ----------

  const csvCell = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  exportBtn.addEventListener("click", () => {
    if (!filtered.length) return;
    const header = ["When", "Who", "Role", "Facility", "Clinic", "Action type", "Action", "Patient", "Record", "Field", "Old value", "New value", "Reason", "Flagged"];
    const lines = filtered.map((e) => {
      const hidden = MEDICAL.has(e.type) && e.patient && !Privacy.medicalVisible(e.patient);
      return [
        e.at, e.by, e.role, e.facilityId ? Org.get(e.facilityId)?.name : "", e.clinicId ? Org.get(e.clinicId)?.name : "",
        Audit.TYPES[e.type] ?? e.type, e.action, e.patient, e.record, e.field,
        hidden ? "Hidden" : e.old, hidden ? "Hidden" : e.new, e.reason, e.flagged ? "yes" : "",
      ].map(csvCell).join(",");
    });
    const blob = new Blob([`﻿${[header.join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const a = el("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ndfip-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    Audit.log("export", { ...Auth.unitsOf(me.id), action: `Audit log exported as CSV (${plural(filtered.length, "entry", "entries")})` });
    refresh();
  });

  // ---------- Wiring ----------

  $("#audit-scope").textContent = orgWide
    ? "Every event across the organisation, newest first."
    : `Events in your scope, newest first: ${Org.facilitiesInScope(me.id).map((n) => n.name).join(", ") || "no facility assigned"}.`;

  Object.values(f).forEach((input) => input.addEventListener(input.tagName === "INPUT" && input.type !== "checkbox" && input.type !== "date" ? "input" : "change", () => refresh({ resetPaging: true })));
  $("#audit-filters").addEventListener("reset", () => setTimeout(() => refresh({ resetPaging: true })));
  $("#audit-filters").addEventListener("submit", (e) => e.preventDefault());
  window.addEventListener("storage", (e) => e.key === "ndfip.audit" && refresh());

  load();
})();
