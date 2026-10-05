// Organisation structure and scoped access (UAT-01). Load after staff.js and access.js.
//
// Five levels, stored as a tree where each unit points to its parent (HL7 FHIR
// Organization / Location / HealthcareService):
//   organisation > region (city) > facility > department (optional) > clinic
// A clinic is one instance of a clinic definition (e.g. "diabetic-foot"); the same
// definition can run under many facilities.
// A user is assigned to one or more nodes and sees everything below them. Scope is
// computed at call time, so a change of assignment applies at once (EC-07).
// FRONT-END ONLY: the server must filter every query by the same scope.

const Org = (() => {
  const KEY = "ndfip.org";

  const LEVELS = [
    { id: "organisation", label: "Organisation" },
    { id: "region", label: "Region or city" },
    { id: "facility", label: "Facility" },
    { id: "department", label: "Department" },
    { id: "clinic", label: "Clinic" },
  ];

  // Saudi Private Health Institutions Law facility types (configurable list)
  const FACILITY_TYPES = ["Hospital", "General medical complex", "Specialised medical complex", "Clinic", "Primary healthcare centre"];

  // Fictional demo organisation
  const SEED = [
    { id: "org-1", parent: null, level: "organisation", name: "Al-Noor Health Group" },
    { id: "reg-ruh", parent: "org-1", level: "region", name: "Riyadh" },
    { id: "reg-jed", parent: "org-1", level: "region", name: "Jeddah" },
    { id: "reg-dmm", parent: "org-1", level: "region", name: "Dammam" },
    { id: "fac-nrc", parent: "reg-ruh", level: "facility", name: "North Riyadh Medical Complex", type: "Specialised medical complex" },
    { id: "fac-krh", parent: "reg-ruh", level: "facility", name: "Al-Noor General Hospital, Riyadh", type: "Hospital" },
    { id: "fac-jcc", parent: "reg-jed", level: "facility", name: "Jeddah Corniche Medical Complex", type: "General medical complex" },
    { id: "fac-dpc", parent: "reg-dmm", level: "facility", name: "Dammam Al-Faisaliah PHC Centre", type: "Primary healthcare centre" },
    { id: "dep-krh-endo", parent: "fac-krh", level: "department", name: "Endocrinology" },
    { id: "cl-df-nrc", parent: "fac-nrc", level: "clinic", name: "Diabetic Foot Clinic", definition: "diabetic-foot" },
    { id: "cl-df-krh", parent: "dep-krh-endo", level: "clinic", name: "Diabetic Foot Clinic", definition: "diabetic-foot" },
    { id: "cl-df-jcc", parent: "fac-jcc", level: "clinic", name: "Diabetic Foot Clinic", definition: "diabetic-foot" },
    { id: "cl-df-dpc", parent: "fac-dpc", level: "clinic", name: "Diabetic Foot Clinic", definition: "diabetic-foot" },
  ];

  // Saved changes replace the seed (Settings › Organisation):
  // { nodes, facilityTypes, rev, savedBy, savedAt }
  const data = () => (typeof Db !== "undefined" ? Db.read(KEY, null) : null) ?? {};
  const nodes = () => data().nodes ?? SEED;
  const facilityTypes = () => data().facilityTypes ?? FACILITY_TYPES;
  // Revision of the saved structure, so two admins can't overwrite each other (EC-11)
  const meta = () => ({ rev: data().rev ?? 0, savedBy: data().savedBy ?? null, savedAt: data().savedAt ?? null });
  const get = (id) => nodes().find((n) => n.id === id) ?? null;
  const children = (id) => nodes().filter((n) => n.parent === id);
  const active = (n) => n && n.status !== "closed";

  function path(id) {
    const out = [];
    let n = get(id);
    while (n) {
      out.unshift(n);
      n = get(n.parent);
    }
    return out;
  }

  function descendants(id) {
    const out = [];
    const walk = (pid) => children(pid).forEach((c) => (out.push(c), walk(c.id)));
    walk(id);
    return out;
  }

  const ancestorAt = (id, level) => path(id).find((n) => n.level === level) ?? null;
  const facilityOf = (id) => ancestorAt(id, "facility");
  const regionOf = (id) => ancestorAt(id, "region");

  // "Diabetic Foot Clinic · North Riyadh Medical Complex"
  function clinicLabel(id) {
    const c = get(id);
    if (!c) return id ?? "—";
    const f = facilityOf(id);
    return f ? `${c.name} · ${f.name}` : c.name;
  }

  // ---------- Scope ----------

  function assignedNodes(userId) {
    const s = typeof Staff !== "undefined" ? Staff.get(userId) : null;
    return s?.assigned ?? [];
  }

  // Every node id the user can see (their assignments and everything below)
  function scopeIds(userId) {
    const ids = new Set();
    for (const a of assignedNodes(userId)) {
      if (!get(a)) continue;
      ids.add(a);
      descendants(a).forEach((d) => ids.add(d.id));
    }
    return ids;
  }

  function currentUserId() {
    return typeof Access !== "undefined" ? Access.currentUser()?.id : null;
  }

  const clinicsInScope = (userId = currentUserId()) => {
    const ids = scopeIds(userId);
    return nodes().filter((n) => n.level === "clinic" && ids.has(n.id));
  };
  const facilitiesInScope = (userId = currentUserId()) => {
    const ids = new Set(clinicsInScope(userId).map((c) => facilityOf(c.id)?.id));
    return nodes().filter((n) => ids.has(n.id));
  };
  const regionsInScope = (userId = currentUserId()) => {
    const ids = new Set(clinicsInScope(userId).map((c) => regionOf(c.id)?.id));
    return nodes().filter((n) => ids.has(n.id));
  };

  const canSeeClinic = (clinicId, userId = currentUserId()) => !!clinicId && scopeIds(userId).has(clinicId);
  // A record with no clinic (legacy) belongs to the first demo clinic
  const clinicOfRecord = (r) => r?.clinicId ?? "cl-df-nrc";
  const inScope = (record, userId) => canSeeClinic(clinicOfRecord(record), userId);

  // The clinic a user works in today (first clinic assignment in scope)
  const homeClinic = (userId = currentUserId()) => clinicsInScope(userId)[0]?.id ?? null;

  // Clinic chosen on the clinic page for this browser session ("Working in"), used for
  // walk-in screenings. Falls back to the first open clinic in scope.
  const WORK_KEY = "ndfip.clinic";
  function workingClinic(userId = currentUserId()) {
    const open = clinicsInScope(userId).filter(active);
    let chosen = null;
    try {
      chosen = sessionStorage.getItem(WORK_KEY);
    } catch {}
    if (chosen && open.some((c) => c.id === chosen)) return chosen;
    return open[0]?.id ?? homeClinic(userId);
  }
  function setWorkingClinic(id) {
    try {
      sessionStorage.setItem(WORK_KEY, id);
    } catch {}
  }

  class ConflictError extends Error {
    constructor(current) {
      const when = current.savedAt ? new Date(current.savedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "just now";
      super(`Changed by ${current.savedBy ?? "another administrator"} at ${when} after you opened this page. Your changes were not saved. Reload to see the current structure.`);
      this.name = "ConflictError";
    }
  }

  // Saves the structure. expectedRev: the revision the editor started from; when someone
  // else saved since, throws ConflictError and nothing is written. Throws Db.SaveError too.
  function save(next, { rev: expectedRev, facilityTypes: types } = {}) {
    const cur = data();
    if (expectedRev !== undefined && (cur.rev ?? 0) !== expectedRev) throw new ConflictError(meta());
    const u = typeof Access !== "undefined" ? Access.currentUser() : null;
    Db.write(KEY, {
      nodes: next,
      facilityTypes: types ?? cur.facilityTypes ?? FACILITY_TYPES,
      rev: (cur.rev ?? 0) + 1,
      savedBy: u?.name ?? null,
      savedAt: new Date().toISOString(),
    }, { where: "organisation" });
  }

  return {
    LEVELS, FACILITY_TYPES, SEED, ConflictError,
    nodes, facilityTypes, meta, get, children, descendants, path, active,
    facilityOf, regionOf, clinicLabel,
    assignedNodes, scopeIds, clinicsInScope, facilitiesInScope, regionsInScope,
    canSeeClinic, clinicOfRecord, inScope, homeClinic, workingClinic, setWorkingClinic,
    save,
  };
})();
