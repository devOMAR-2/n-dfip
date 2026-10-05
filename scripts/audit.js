// Audit log (UAT-05). Append-only: there is no edit or delete anywhere in the app.
// Load after access.js and org.js:  <script src="./scripts/audit.js"></script>
//
//   Audit.log("value.edit", { patient, record, field, old, new, reason, clinicId })
//
// Each entry: id, at, by, byId, role, facilityId, clinicId, type, action (readable text),
// patient (file number), record (encounter id), field, old, new, reason, flagged.
// FRONT-END ONLY: the real log is written by the server, in the same transaction as the
// change, and no user (including the system administrator) can change or delete it.

const Audit = (() => {
  const KEY = "ndfip.audit";

  // Action types, used by the filters on the audit page
  const TYPES = {
    "auth.signin": "Signed in",
    "auth.signout": "Signed out",
    "auth.failed": "Failed sign-in",
    "auth.expired": "Session expired",
    "password.reset": "Password reset",
    "user.created": "User created",
    "user.updated": "User details changed",
    "user.status": "User enabled or disabled",
    "permission.change": "Permission changed",
    "assignment.change": "Assignment changed",
    "setup.change": "Clinic setup changed",
    "patient.view": "Patient file viewed",
    "patient.merge": "Patient files merged",
    "emergency.access": "Emergency access",
    "value.edit": "Value edited",
    "recommendation": "Recommendation confirmed or overridden",
    "suggestion": "Suggestion accepted or dismissed",
    "test": "Test ordered, approved or rejected",
    "referral": "Referral created or updated",
    "medication": "Medication entered",
    "signoff": "Sign-off",
    "encounter": "Encounter stage changed",
    "lock": "Editing lock",
    "discard": "Changes discarded",
    "export": "Export or print",
    "error": "System error",
  };

  const all = () => (typeof Db !== "undefined" ? Db.read(KEY, []) : []) ?? [];

  function log(type, detail = {}) {
    const u = typeof Access !== "undefined" ? Access.currentUser() : null;
    const clinicId = detail.clinicId ?? (typeof Org !== "undefined" ? Org.homeClinic(u?.id) : null);
    const facilityId = detail.facilityId ?? (clinicId && typeof Org !== "undefined" ? Org.facilityOf(clinicId)?.id : null);
    const entry = {
      id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      by: detail.by ?? u?.name ?? "unknown",
      byId: detail.byId ?? u?.id ?? null,
      role: detail.role ?? u?.roleLabel ?? "",
      facilityId,
      clinicId,
      type,
      action: detail.action ?? TYPES[type] ?? type,
      patient: detail.patient ?? null,
      record: detail.record ?? null,
      field: detail.field ?? null,
      old: detail.old ?? null,
      new: detail.new ?? null,
      reason: detail.reason ?? null,
      flagged: !!detail.flagged,
    };
    // Written straight to storage: the log must survive even when saves are failing
    try {
      const list = all();
      list.push(entry);
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {}
    return entry;
  }

  // Convenience for encounter events: fills patient, record and clinic from the record
  function forRecord(type, record, action, extra = {}) {
    return log(type, { action, patient: record?.fileNumber, record: record?.id, clinicId: record?.clinicId, ...extra });
  }

  return { TYPES, all, log, forRecord };
})();
