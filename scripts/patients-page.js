// Patients list and search (UAT-21 entry point). Patients are listed only when one of
// their encounters is in the user's clinics, or their file was opened at a facility in
// the user's scope (UAT-01). Identifiers follow Data visibility (UAT-02). Two files with
// the same national ID show as one patient with a "possible duplicate" flag (EC-12).

(() => {
  if (Access.denied) return;
  const { $, el, fmtDate, plural } = Records;
  const list = $("#patients-list");
  const form = $("#patients-search");
  const by = $("#search-by");
  const query = $("#search-query");
  const errorBox = $("#search-error");
  const title = $("#patients-list-title");
  const clearBtn = $("#clear-search");

  const user = Access.currentUser();
  const clinics = Org.clinicsInScope();
  $("#patients-scope").textContent = clinics.length
    ? `${plural(clinics.length, "clinic")} in your scope: ${clinics.slice(0, 3).map((c) => Org.clinicLabel(c.id)).join("; ")}${clinics.length > 3 ? "; …" : ""}`
    : "You aren't assigned to any clinic yet. Ask an administrator.";

  const PLACEHOLDER = { name: "At least 3 letters of the name", fileNumber: "N-DFIP-004271 or the last digits", nationalId: "10 digits", phone: "05XXXXXXXX" };
  by.addEventListener("change", () => {
    query.placeholder = PLACEHOLDER[by.value];
    query.inputMode = by.value === "name" ? "text" : "numeric";
    setError(null);
  });

  function setError(message) {
    errorBox.hidden = !message;
    $("span", errorBox).textContent = message ?? "";
    query.toggleAttribute("aria-invalid", !!message);
  }

  // One row per patient (merged files left out; duplicates shown once, flagged)
  function onePerPerson(patients) {
    const seen = new Set();
    const out = [];
    for (const p of patients) {
      const kept = Patients.resolve(p.fileNumber) ?? p;
      if (seen.has(kept.fileNumber)) continue;
      const dupes = Patients.duplicatesOf(kept.fileNumber);
      if (dupes.some((d) => seen.has(d.fileNumber))) continue;
      seen.add(kept.fileNumber);
      out.push(kept);
    }
    return out;
  }

  function lastEncounter(p) {
    const encs = Records.encountersOf(p.fileNumber);
    return encs.sort((a, b) => String(b.arrivedAt).localeCompare(String(a.arrivedAt)))[0] ?? null;
  }

  function row(p) {
    const li = el("li", "records-row");
    const a = el("a", "records-row__link");
    a.href = `./patient.html?file=${encodeURIComponent(p.fileNumber)}`;
    const main = el("div", "records-row__main");
    main.append(el("span", "records-row__name", Privacy.name(p.name, p)));
    const meta = [p.fileNumber];
    if (p.nationalId) meta.push(`ID ${Privacy.nationalId(p.nationalId, p)}`);
    if (p.dob && Privacy.ageVisible(p)) meta.push(Privacy.level("identifiers", p.fileNumber) === "visible" ? `${Patients.ageOn(p.dob)} years` : `born ${Privacy.dob(p.dob, p)}`);
    if (p.sex) meta.push(p.sex);
    main.append(el("span", "records-row__meta", meta.join(" · ")));
    const side = el("div", "records-row__side");
    const last = lastEncounter(p);
    if (last) {
      const st = ScreeningStore.stageOf(last);
      side.append(el("span", `badge stage-badge stage-badge--${st.n}`, st.n === 5 ? "Signed" : st.label));
      side.append(el("span", "records-row__meta", `${fmtDate(last.arrivedAt)} · ${Org.get(last.clinicId)?.name ?? "Clinic"}, ${Org.facilityOf(last.clinicId)?.name ?? ""}`));
    } else {
      side.append(el("span", "records-row__meta", "No visits in your clinics"));
    }
    if (Patients.duplicatesOf(p.fileNumber).length) {
      const b = el("span", "badge badge-status-attention", "Possible duplicate");
      b.title = "Another file has the same national ID. Open the file to review.";
      main.append(b);
    }
    a.append(main, side);
    li.append(a);
    return li;
  }

  function render(patients, { heading, emptyTitle, emptyText }) {
    title.textContent = heading;
    list.replaceChildren();
    if (!patients.length) {
      list.append(Records.stateBox("empty", emptyTitle, emptyText));
      return;
    }
    const ul = el("ul", "records-list");
    patients.forEach((p) => ul.append(row(p)));
    list.append(el("p", "result-count", `${plural(patients.length, "patient")}`), ul);
  }

  function showAll() {
    const patients = onePerPerson(Patients.listed().filter(Records.patientInScope))
      .sort((a, b) => String(lastEncounter(b)?.arrivedAt ?? "").localeCompare(String(lastEncounter(a)?.arrivedAt ?? "")));
    clearBtn.hidden = true;
    render(patients, {
      heading: "Patients seen in your clinics",
      emptyTitle: "No patients yet",
      emptyText: "Patients appear here once they have a visit in one of your clinics.",
    });
  }

  function search(type, raw) {
    if (type === "name") {
      const q = raw.trim().toLowerCase();
      if (q.length < 3) return { error: "Enter at least 3 letters of the name." };
      return { results: Patients.all.filter((p) => p.name.toLowerCase().includes(q)) };
    }
    return Patients.search(type, raw);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error, results } = search(by.value, query.value);
    if (error) {
      setError(error);
      query.focus();
      return;
    }
    setError(null);
    list.replaceChildren(Records.loading("Searching…"));
    await Db.delay(250);
    // Searching by name only matches names the role may see in full
    const visibleResults = results.filter(Records.patientInScope).filter((p) => by.value !== "name" || Privacy.level("general", p.fileNumber) === "visible");
    clearBtn.hidden = false;
    render(onePerPerson(visibleResults), {
      heading: "Search results",
      emptyTitle: "No patient found",
      emptyText: results.length && !visibleResults.length
        ? "A file matches, but it belongs to a clinic outside your assignment."
        : "Check the details and try again, or search by another field.",
    });
  });

  clearBtn.addEventListener("click", () => {
    query.value = "";
    setError(null);
    showAll();
  });

  async function init() {
    list.replaceChildren(Records.loading("Loading patients…"));
    try {
      await Db.delay(200);
      showAll();
    } catch (err) {
      Db.logError("patients list", err);
      const retry = el("button", "btn btn-primary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", init);
      list.replaceChildren(Records.stateBox("error", "The patient list couldn't be loaded", "Nothing was changed. Try again; if it keeps failing, contact support.", retry));
    }
  }
  if (!user) return;
  init();
})();
