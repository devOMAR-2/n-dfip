// Staff (UAT-22): directory, one profile per staff member (staff.html?id=...), and a staff
// dashboard with four figures per practitioner (staff.html#dashboard).
// Only staff working in the signed-in user's scope are listed (UAT-01). Contact details
// show to staff administrators and on your own profile.
// Needs dashboard.js (DashCore), dashboard-data.js, charts.js and screening-store.js.

(() => {
  if (Access.denied) return;
  const K = DashCore;
  const C = Charts;
  const { $, $$, el } = K;
  const me = Access.currentUser();
  const params = new URLSearchParams(location.search);

  const initials = (name) =>
    name.replace(/^Dr\.\s*/, "").split(/\s+/).filter((w) => !w.startsWith("Al-")).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const roleName = (id) => Access.roles().find((r) => r.id === id)?.name ?? id;
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—");

  // Staff whose assignments overlap the user's scope (and always yourself)
  const myClinics = new Set(Org.clinicsInScope(me.id).map((c) => c.id));
  function inScope(person) {
    if (person.id === me.id) return true;
    for (const id of Org.scopeIds(person.id)) if (myClinics.has(id)) return true;
    return false;
  }

  function assignedText(person) {
    const nodes = (person.assigned ?? []).map(Org.get).filter(Boolean);
    if (!nodes.length) return ["Not assigned"];
    return nodes.map((n) => (n.level === "clinic" ? Org.clinicLabel(n.id) : `${Org.LEVELS.find((l) => l.id === n.level)?.label ?? n.level}: ${n.name}`));
  }

  $("#staff-scope").textContent = `Staff working in your scope: ${K.scopeText()}.`;

  // ---------- Profile ----------

  const profileId = params.get("id");
  if (profileId) {
    renderProfile(profileId);
    return;
  }

  // ---------- Directory ----------

  const q = $("#staff-q");
  const roleSelect = $("#staff-role");
  roleSelect.append(new Option("All roles", ""));
  Access.roles().forEach((r) => roleSelect.append(new Option(r.name, r.id)));

  function renderDirectory() {
    const grid = $("#staff-grid");
    let list;
    try {
      list = Staff.list().filter(inScope);
    } catch (e) {
      Db.logError("staff directory", e);
      K.state(grid, "error", "The staff list couldn't load. The error was recorded for the support team.", renderDirectory);
      return;
    }
    const term = q.value.trim().toLowerCase();
    const shown = list
      .filter((p) => (!roleSelect.value || p.role === roleSelect.value) && (!term || `${p.name} ${p.title}`.toLowerCase().includes(term)))
      .sort((a, b) => a.name.replace(/^Dr\.\s*/, "").localeCompare(b.name.replace(/^Dr\.\s*/, "")));
    $("#staff-count").textContent = `${shown.length} of ${list.length} staff`;
    if (!shown.length) {
      K.state(grid, "empty", term || roleSelect.value ? "No staff match the search. Clear the search or choose another role." : "No staff are assigned in your scope.");
      $(".dash-state__title", grid).textContent = "No staff found";
      return;
    }
    grid.replaceChildren(
      ...shown.map((p) => {
        const a = el("a", `staff-card${p.status === "disabled" ? " is-disabled" : ""}`);
        a.href = `./staff.html?id=${encodeURIComponent(p.id)}`;
        const text = el("div");
        text.append(
          el("p", "staff-card__name", p.name),
          el("p", "staff-card__meta", `${p.title} · ${roleName(p.role)}${p.status === "disabled" ? " · Disabled" : ""}`),
          el("p", "staff-card__meta", assignedText(p).join("; ")),
        );
        a.append(el("span", "staff-avatar", initials(p.name)), text);
        return a;
      }),
    );
  }
  q.addEventListener("input", renderDirectory);
  roleSelect.addEventListener("change", renderDirectory);

  // ---------- Staff dashboard ----------

  let preset = "30d";
  let rows = [];

  // Four figures per practitioner, from the demo dataset, in scope and range
  function figuresFor(screenings, range) {
    const S = screenings.filter((s) => K.within(s.at, range));
    const ids = [...new Set(S.map((s) => s.practitionerId))];
    return ids
      .map((id) => {
        const mine = S.filter((s) => s.practitionerId === id);
        const signed = mine.filter((s) => s.reviewed);
        return {
          id,
          name: DashboardData.personName(id),
          inDirectory: !!Staff.get(id),
          rows: signed,
          patients: new Set(signed.map((s) => s.patient.fileNumber)).size,
          signed: signed.length,
          reviewTime: K.mean(signed.map((s) => s.reviewTime)),
          tests: K.sum(signed.map((s) => s.testsOrdered.length)),
          referrals: signed.filter((s) => s.referral).length,
        };
      })
      .sort((a, b) => b.signed - a.signed);
  }

  async function renderDashboard() {
    const host = $("#staff-dash-content");
    const stateBox = $("#staff-dash-state");
    const range = K.rangeFor(preset);
    $("#staff-range").textContent = `${K.rangeText(range)} · ${K.lengthDays(range)} days. Scope: ${K.scopeText()}.`;
    $$("[data-staff-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.staffPreset === preset)));
    stateBox.hidden = false;
    K.state(stateBox, "loading");
    host.hidden = true;
    await Db.delay(120);
    try {
      rows = figuresFor(K.data().screenings, range);
      if (!rows.length) {
        K.state(stateBox, "empty", "No practitioner signed an encounter in this period in your scope.");
        return;
      }
      const table = el("table", "data-table figures-table");
      table.innerHTML = "<caption class='sr-only'>Four figures per practitioner</caption><thead><tr><th scope='col'>Practitioner</th><th scope='col'>Patients served</th><th scope='col'>Encounters signed</th><th scope='col'>Average review time</th><th scope='col'>Tests and referrals ordered</th></tr></thead>";
      const tbody = el("tbody");
      for (const r of rows) {
        const tr = el("tr");
        const th = el("th");
        th.scope = "row";
        if (r.inDirectory) {
          const a = el("a", "", r.name);
          a.href = `./staff.html?id=${encodeURIComponent(r.id)}`;
          th.append(a);
        } else th.textContent = r.name;
        const signedCell = el("td");
        const b = el("button", "btn-link", C.fmt.count(r.signed));
        b.type = "button";
        b.setAttribute("aria-label", `List the ${r.signed} encounters signed by ${r.name}`);
        b.addEventListener("click", () => K.openList(`Signed by ${r.name}`, r.rows, `${K.rangeText(range)}`));
        signedCell.append(b);
        tr.append(
          th,
          el("td", "", C.fmt.count(r.patients)),
          signedCell,
          el("td", "", r.reviewTime === null ? "—" : `${Math.round(r.reviewTime)} min`),
          el("td", "", `${C.fmt.count(r.tests + r.referrals)} (${r.tests} tests, ${r.referrals} referrals)`),
        );
        tbody.append(tr);
      }
      table.append(tbody);
      const wrap = el("div", "table-wrap");
      wrap.append(table);
      const grid = el("div", "chart-grid");
      grid.append(
        C.bars({
          title: "Encounters signed",
          subtitle: "Select a bar to list them",
          name: "Encounters signed", tableHead: "Practitioner",
          items: rows.map((r) => ({ label: r.name, value: r.signed })),
          onSelect: (i) => K.openList(`Signed by ${rows[i].name}`, rows[i].rows, K.rangeText(range)),
        }),
        C.bars({
          title: "Average review time",
          subtitle: "Minutes from opening the file to signing",
          name: "Average review time", tableHead: "Practitioner", format: (v) => `${Math.round(v)} min`,
          items: rows.map((r) => ({ label: r.name, value: r.reviewTime ?? 0 })),
        }),
      );
      host.replaceChildren(wrap, grid);
      host.hidden = false;
      stateBox.hidden = true;
    } catch (e) {
      Db.logError("staff dashboard", e);
      K.state(stateBox, "error", "The staff dashboard couldn't load. The error was recorded for the support team.", renderDashboard);
    }
  }
  $$("[data-staff-preset]").forEach((b) =>
    b.addEventListener("click", () => {
      preset = b.dataset.staffPreset;
      renderDashboard();
    }),
  );
  $("#staff-export").addEventListener("click", () => {
    const range = K.rangeFor(preset);
    K.download(`staff-figures-${K.stamp()}.csv`, [
      ["Practitioner", "Patients served", "Encounters signed", "Average review time (min)", "Tests ordered", "Referrals ordered", "Period"],
      ...rows.map((r) => [r.name, r.patients, r.signed, r.reviewTime === null ? "" : Math.round(r.reviewTime), r.tests, r.referrals, K.rangeText(range)]),
    ], "staff dashboard figures");
  });

  // ---------- Views ----------

  function route() {
    const dash = location.hash === "#dashboard";
    $("#view-directory").hidden = dash;
    $("#view-dashboard").hidden = !dash;
    $("#tab-directory").setAttribute("aria-selected", String(!dash));
    $("#tab-dashboard").setAttribute("aria-selected", String(dash));
    if (dash) renderDashboard();
    else renderDirectory();
  }
  window.addEventListener("hashchange", route);
  route();

  // ---------- Profile page ----------

  function renderProfile(id) {
    $("#staff-home").hidden = true;
    const host = $("#staff-profile");
    host.hidden = false;
    const person = Staff.get(id);
    if (!person || !inScope(person)) {
      host.replaceChildren();
      const box = el("section", "empty-state");
      box.append(el("h1", "empty-state__title", "Staff member not found"), el("p", "empty-state__text", "This profile doesn't exist or is outside your scope."));
      const back = el("a", "btn btn-primary", "Back to staff");
      back.href = "./staff.html";
      box.append(back);
      host.append(box);
      return;
    }
    document.title = `${person.name} · Staff · N-DFIP`;
    $("#crumb-sep").hidden = false;
    $("#crumb-current").hidden = false;
    $("#crumb-current").textContent = person.name;

    const showContact = Access.can("admin.users") || person.id === me.id;
    const head = el("div", "staff-profile__head");
    const titleBox = el("div");
    titleBox.append(el("h1", "page-title", person.name), el("p", "page-subtitle", `${person.title} · ${roleName(person.role)}${person.status === "disabled" ? " · Account disabled" : ""}`));
    head.append(el("span", "staff-avatar staff-avatar--lg", initials(person.name)), titleBox);

    const dl = (pairs) => {
      const list = el("dl", "detail-list");
      for (const [k, v] of pairs) list.append(el("dt", "", k), el("dd", "", v || "—"));
      return list;
    };
    const panel = (title, ...content) => {
      const p = el("section", "staff-panel");
      p.append(el("h2", "staff-panel__title", title), ...content);
      return p;
    };

    const general = panel(
      "General information",
      dl([
        ["Employee number", person.id],
        ["Title", person.title],
        ["Role", roleName(person.role)],
        ["Specialty", person.specialty],
        ["Joined", fmtDate(person.joined)],
        ["Status", person.status === "disabled" ? "Disabled" : "Active"],
        ["E-mail", showContact ? person.email || "No e-mail on file" : "Visible to staff administrators"],
        ["Phone", showContact ? person.phone : "Visible to staff administrators"],
      ]),
    );
    const experience = panel("Experience", el("p", "", person.experience || "Not recorded."));
    const clinics = el("ul", "detail-bullets");
    assignedText(person).forEach((t) => clinics.append(el("li", "", t)));
    const assigned = panel("Assigned clinics", clinics);

    // Latest patients from the encounters in this browser (real records), in your scope
    const involved = (r) => [r.review?.signedBy, r.openedBy, r.review?.openedBy, r.submittedBy, r.startedBy].includes(person.name);
    const when = (r) => r.review?.signedAt ?? r.openedAt ?? r.submittedAt ?? r.startedAt ?? r.arrivedAt ?? "";
    const part = (r) => (r.review?.signedBy === person.name ? "Signed" : r.openedBy === person.name || r.review?.openedBy === person.name ? "Reviewed" : "Screened");
    let latest = [];
    try {
      latest = ScreeningStore.all().filter((r) => involved(r) && Org.inScope(r)).sort((a, b) => String(when(b)).localeCompare(String(when(a)))).slice(0, 10);
    } catch (e) {
      Db.logError("staff profile", e);
    }
    const patients = latest.length ? el("ul", "staff-patients") : el("p", "empty-line", "No patients yet.");
    for (const r of latest) {
      const li = el("li");
      const a = el("a", "", Privacy.name(r.patientName, r.fileNumber));
      a.href = `./appointment.html?id=${encodeURIComponent(r.id)}`;
      const left = el("span");
      left.append(a, el("span", "list-table__sub", `${r.fileNumber} · ${Org.clinicLabel(Org.clinicOfRecord(r))}`));
      li.append(left, el("span", "staff-card__meta", `${part(r)} · ${fmtDate(when(r))} · ${ScreeningStore.stageOf(r).label}`));
      patients.append(li);
    }
    const latestPanel = panel("Latest patients", patients);

    const blocks = [general, experience, assigned, latestPanel];

    // Four figures for practitioners (last 30 days, demo data)
    if (["practitioner", "senior"].includes(person.role)) {
      const range = K.rangeFor("30d");
      const f = figuresFor(DashboardData.screenings.filter((s) => Org.canSeeClinic(s.clinicId)), range).find((r) => r.id === person.id);
      const grid = el("div", "kpi-grid kpi-grid--compact");
      grid.append(
        C.stat({ label: "Patients served", value: C.fmt.count(f?.patients ?? 0) }),
        C.stat({ label: "Encounters signed", value: C.fmt.count(f?.signed ?? 0), action: f?.rows.length ? { label: "View appointments", onClick: () => K.openList(`Signed by ${person.name}`, f.rows, K.rangeText(range)) } : undefined }),
        C.stat({ label: "Average review time", value: f?.reviewTime ? `${Math.round(f.reviewTime)} min` : "—" }),
        C.stat({ label: "Tests and referrals ordered", value: C.fmt.count((f?.tests ?? 0) + (f?.referrals ?? 0)), note: f ? `${f.tests} tests, ${f.referrals} referrals` : undefined }),
      );
      blocks.push(panel("Last 30 days", el("p", "field-hint", `${K.rangeText(range)} · demo data`), grid));
    }

    const back = el("a", "btn btn-outline", "← All staff");
    back.href = "./staff.html";
    const top = el("div", "page-header page-header--split");
    top.append(head, back);
    const grid = el("div", "staff-profile__grid");
    grid.append(...blocks);
    host.replaceChildren(top, grid);
  }
})();
