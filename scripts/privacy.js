// Patient data visibility (UAT-02, PDPL). Load after access.js and audit.js.
//
// Per role, each group of patient data is "hidden", "masked" or "visible":
//   identifiers  national ID, date of birth      masked: last 4 digits of the ID, year of birth
//   general      name, phone                       masked: initials, last 2 digits of the phone
//   medical      tests, findings, notes            masked counts as hidden (no partial view)
// Used everywhere patient data appears: lists, search, timeline, dashboards, exports, print.
// Emergency access: a user can open a hidden record by giving a reason. The grant lasts for
// this browser session, is logged and flagged for review.
// FRONT-END ONLY: the server must apply the same rules to every response.

const Privacy = (() => {
  const KEY = "ndfip.privacy";
  const GRANTS_KEY = "ndfip.emergency";
  const GROUPS = [
    { id: "identifiers", label: "Sensitive identifiers", fields: "National ID, date of birth" },
    { id: "general", label: "General data", fields: "Name, phone" },
    { id: "medical", label: "Medical record", fields: "Tests, findings, notes" },
  ];
  const LEVELS = [
    ["visible", "Visible"],
    ["masked", "Masked"],
    ["hidden", "Hidden"],
  ];

  const DEFAULTS = {
    admin: { identifiers: "masked", general: "visible", medical: "hidden" },
    director: { identifiers: "hidden", general: "masked", medical: "visible" },
    supervisor: { identifiers: "masked", general: "visible", medical: "visible" },
    nurse: { identifiers: "visible", general: "visible", medical: "visible" },
    practitioner: { identifiers: "visible", general: "visible", medical: "visible" },
    senior: { identifiers: "visible", general: "visible", medical: "visible" },
  };

  // Stored: { [roleId]: { identifiers, general, medical }, _meta: { rev, savedBy, savedAt } }
  const stored = () => (typeof Db !== "undefined" ? Db.read(KEY, {}) : {}) ?? {};
  function settings() {
    const { _meta, ...roles } = stored();
    return { ...DEFAULTS, ...roles };
  }
  const meta = () => ({ rev: stored()._meta?.rev ?? 0, savedBy: stored()._meta?.savedBy ?? null, savedAt: stored()._meta?.savedAt ?? null });

  class ConflictError extends Error {
    constructor(m) {
      const when = m.savedAt ? new Date(m.savedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "just now";
      super(`Changed by ${m.savedBy ?? "another administrator"} at ${when} after you opened this page. Your changes were not saved. Reload to see the current settings.`);
      this.name = "ConflictError";
    }
  }

  function grants() {
    try {
      return JSON.parse(sessionStorage.getItem(GRANTS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  // Level for the signed-in user; an emergency grant for this patient opens everything
  function level(group, patientKey = null) {
    if (patientKey && grants()[patientKey]) return "visible";
    const role = typeof Access !== "undefined" ? Access.currentUser()?.role : null;
    return settings()[role]?.[group] ?? "hidden";
  }

  const HIDDEN = "Hidden";
  const keyOf = (p) => (typeof p === "string" ? p : p?.fileNumber ?? null);

  function nationalId(value, patient) {
    if (!value) return "—";
    const l = level("identifiers", keyOf(patient));
    return l === "visible" ? value : l === "masked" ? `••••••${String(value).slice(-4)}` : HIDDEN;
  }

  function dob(value, patient) {
    if (!value) return "—";
    const l = level("identifiers", keyOf(patient));
    return l === "visible" ? value : l === "masked" ? `${String(value).slice(0, 4)} (year only)` : HIDDEN;
  }

  // Age is derived from the date of birth, so it follows the identifiers setting
  const ageVisible = (patient) => level("identifiers", keyOf(patient)) !== "hidden";

  function name(value, patient) {
    if (!value) return "—";
    const l = level("general", keyOf(patient));
    if (l === "visible") return value;
    if (l === "masked") return value.split(/\s+/).map((w) => (w.startsWith("Al-") ? "Al-" + w[3] + "." : w[0] + ".")).join(" ");
    return "Patient (name hidden)";
  }

  function phone(value, patient) {
    if (!value) return "—";
    const l = level("general", keyOf(patient));
    return l === "visible" ? value : l === "masked" ? `••••••••${String(value).slice(-2)}` : HIDDEN;
  }

  const medicalVisible = (patient) => level("medical", keyOf(patient)) === "visible";

  // Emergency access: returns the audit entry. reason is required.
  function emergency(patient, reason) {
    const key = keyOf(patient);
    if (!key || !reason?.trim()) return null;
    const g = grants();
    g[key] = { at: new Date().toISOString(), reason: reason.trim() };
    try {
      sessionStorage.setItem(GRANTS_KEY, JSON.stringify(g));
    } catch {}
    return typeof Audit !== "undefined"
      ? Audit.log("emergency.access", { patient: key, reason: reason.trim(), flagged: true, action: "Emergency access to a hidden record" })
      : null;
  }

  const hasGrant = (patient) => !!grants()[keyOf(patient)];

  // Anything hidden for this patient that emergency access would open?
  const anythingHidden = (patient) => GROUPS.some((g) => level(g.id, keyOf(patient)) !== "visible");

  return {
    GROUPS, LEVELS, DEFAULTS, KEY, ConflictError,
    settings, meta, level, nationalId, dob, ageVisible, name, phone, medicalVisible,
    emergency, hasGrant, anythingHidden,
    // next: { [roleId]: { identifiers, general, medical } }. Pass the rev the editor started
    // from; a newer save by someone else throws ConflictError (EC-11). Throws Db.SaveError.
    save(next, { rev } = {}) {
      const m = meta();
      if (rev !== undefined && m.rev !== rev) throw new ConflictError(m);
      const u = typeof Access !== "undefined" ? Access.currentUser() : null;
      Db.write(KEY, { ...next, _meta: { rev: m.rev + 1, savedBy: u?.name ?? null, savedAt: new Date().toISOString() } }, { where: "data visibility" });
    },
  };
})();
