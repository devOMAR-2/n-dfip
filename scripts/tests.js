// Test catalogue, approval rules and test orders (UAT-17, EC-13). Load in <head> after
// db, staff, access, org and audit.
//
// TestCatalog (Db "ndfip.tests"): the tests a clinic definition can order, each with
//   approval  { mode: "none" | "role" | "person" | "people", role, people }
//               role    one approver at that role level or higher (practitioner < senior)
//               person  one named staff member
//               people  several named staff members, all must approve, whatever their role
//   insurance  insurance approval tracked separately (waiting / approved / rejected)
//   escalateAfterHours + backup  an approval waiting longer goes to the backup, else the
//                                facility supervisor (EC-13)
//   status    active | retired  (retired, never deleted: old orders keep their label, EC-09)
// TestOrders (Db "ndfip.orders"): one order per test per encounter, with its own clinical
// approval and insurance status, who decided and when.
// Suggestions (Db "ndfip.suggestions"): suggested tests accepted or dismissed, with reasons
// (UAT-24 counts).
// FRONT-END ONLY: the server must check every approval rule and refuse anything else.

const TestCatalog = (() => {
  const KEY = "ndfip.tests";
  const DEFINITION = "diabetic-foot";

  const GROUPS = [
    ["lab", "Laboratory"],
    ["microbiology", "Microbiology"],
    ["imaging", "Imaging & vascular"],
  ];
  const MODES = [
    ["none", "No approval needed"],
    ["role", "A role level or higher"],
    ["person", "One named person"],
    ["people", "Several named people (all approve)"],
  ];
  // Approval role levels, lowest first
  const ROLE_LEVELS = [
    ["practitioner", "Practitioner or higher"],
    ["senior", "Senior doctor"],
  ];

  const t = (id, label, group, approval = { mode: "none" }, extra = {}) => ({
    id, label, group, approval: { role: "practitioner", people: [], ...approval },
    insurance: false, escalateAfterHours: 24, backup: "", status: "active", ...extra,
  });

  // Fictional demo rules. Values match ClinicalRules.suggestedTests
  const SEED = [
    t("cbc", "CBC (WBC, Hb, platelets)", "lab"),
    t("esr", "ESR", "lab"),
    t("crp", "CRP", "lab"),
    t("fbg", "Fasting blood glucose", "lab"),
    t("hba1c", "HbA1c", "lab"),
    t("creatinine", "Renal function (urea, creatinine, eGFR)", "lab"),
    t("lipids", "Lipid profile", "lab"),
    t("procalcitonin", "Procalcitonin", "lab", { mode: "role", role: "senior" }, { escalateAfterHours: 4 }),
    t("wound-culture", "Wound culture (C&S)", "microbiology"),
    t("bone-culture", "Bone culture", "microbiology", { mode: "person", people: ["100006"] }, { escalateAfterHours: 8, backup: "200021" }),
    t("blood-culture", "Blood cultures", "microbiology"),
    t("xray-foot", "X-ray foot", "imaging"),
    t("mri-foot", "MRI foot", "imaging", { mode: "person", people: ["100006"] }, { insurance: true, escalateAfterHours: 24 }),
    t("duplex", "Arterial duplex", "imaging", { mode: "people", people: ["100006", "200021"] }, { insurance: true, escalateAfterHours: 48 }),
    t("abi-tbi", "ABI / TBI", "imaging"),
  ];

  function load() {
    const saved = Db.read(KEY, null);
    if (saved?.[DEFINITION]) return saved;
    return { [DEFINITION]: { rev: 1, updatedAt: null, updatedBy: null, tests: SEED } };
  }

  const state = (definition = DEFINITION) => load()[definition] ?? { rev: 1, tests: [] };
  const list = (definition = DEFINITION) => state(definition).tests;
  const active = (definition = DEFINITION) => list(definition).filter((x) => x.status !== "retired");
  const get = (id, definition = DEFINITION) => list(definition).find((x) => x.id === id) ?? null;

  class StaleError extends Error {}

  // Saves the whole catalogue. Refused when someone saved after `rev` was loaded (EC-11).
  // Throws StaleError or Db.SaveError.
  function save(tests, rev, definition = DEFINITION) {
    const all = load();
    const cur = all[definition] ?? { rev: 1 };
    if ((cur.rev ?? 1) !== rev) {
      const when = cur.updatedAt ? new Date(cur.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "earlier";
      throw new StaleError(`Changed by ${cur.updatedBy ?? "someone else"} at ${when} after you opened it. Reload to see their changes; yours were not saved.`);
    }
    const u = Access.currentUser();
    all[definition] = { rev: rev + 1, updatedAt: new Date().toISOString(), updatedBy: u?.name ?? null, tests };
    Db.write(KEY, all, { where: "test catalogue" });
    return all[definition];
  }

  return { DEFINITION, GROUPS, MODES, ROLE_LEVELS, StaleError, state, list, active, get, save };
})();

const TestOrders = (() => {
  const KEY = "ndfip.orders";
  const SUGGEST_KEY = "ndfip.suggestions";
  const LEVEL = { practitioner: 1, senior: 2 };

  const all = () => Db.read(KEY, []) ?? [];
  const write = (list) => Db.write(KEY, list, { where: "test orders" });
  const me = () => Access.currentUser();
  const staffName = (id) => (typeof Staff !== "undefined" ? Staff.get(id)?.name : null) ?? id;
  const uid = () => `ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const audit = (order, action, extra = {}) =>
    Audit.log("test", { action, patient: order.fileNumber, record: order.recordId, clinicId: order.clinicId, ...extra });

  class RefusedError extends Error {}

  // An order still counts while not rejected (one order per test per encounter)
  const isLive = (o) => o.approval.status !== "rejected" && o.status !== "cancelled";

  // Facility supervisors for a clinic (staff with role supervisor whose scope holds it)
  function supervisorsFor(clinicId) {
    return Staff.active().filter((s) => s.role === "supervisor" && Org.scopeIds(s.id).has(clinicId)).map((s) => s.id);
  }

  // Who may approve an order now: [{ id, name }] or a role rule
  function approverIds(order) {
    const a = order.approval;
    if (a.status !== "waiting") return [];
    let ids = [];
    if (a.mode === "person" || a.mode === "people") {
      const decided = new Set(a.decisions.filter((d) => d.decision === "approved").map((d) => d.byId));
      ids = a.people.filter((p) => !decided.has(p));
    } else if (a.mode === "role") {
      const min = LEVEL[a.role] ?? 1;
      ids = Staff.active()
        .filter((s) => (LEVEL[s.role] ?? 0) >= min && s.id !== order.orderedById && Org.scopeIds(s.id).has(order.clinicId))
        .map((s) => s.id);
    }
    if (a.escalatedTo) ids = [...new Set([...ids, ...a.escalatedTo])];
    return ids;
  }

  function canApprove(order, userId = me()?.id) {
    return !!userId && order.approval.status === "waiting" && approverIds(order).includes(userId);
  }

  const canRecordInsurance = () => Access.canAny(["tests.approve", "admin.system"]);

  // Text for the order state, e.g. "Waiting for Dr. X"
  function stateText(order) {
    const a = order.approval;
    const fmt = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    if (a.status === "rejected") {
      const d = a.decisions.find((x) => x.decision === "rejected");
      return `Rejected by ${d?.by ?? "approver"}${d?.reason ? `: ${d.reason}` : ""}`;
    }
    if (a.status === "waiting") {
      const names = a.mode === "role"
        ? `a ${a.role === "senior" ? "senior doctor" : "practitioner"}`
        : approverIds(order).filter((id) => a.people.includes(id)).map(staffName).join(" and ") || "approval";
      const esc = a.escalatedTo?.length ? ` (escalated to ${a.escalatedTo.map(staffName).join(", ")})` : "";
      return `Waiting for ${names}${esc}`;
    }
    const approved = a.decisions.filter((x) => x.decision === "approved");
    const clinical = a.status === "approved" ? `Approved by ${approved.map((d) => d.by).join(" and ")} at ${fmt(approved.at(-1).at)}` : "No approval needed";
    const ins = order.insurance;
    if (!ins.required) return clinical;
    if (ins.status === "waiting") return `${clinical}. Waiting for insurance`;
    if (ins.status === "rejected") return `${clinical}. Insurance rejected${ins.reason ? `: ${ins.reason}` : ""}`;
    return `${clinical}. Insurance approved`;
  }

  // Overall: waiting | approved | rejected (clinical and insurance together)
  function overall(order) {
    if (order.approval.status === "rejected" || order.insurance.status === "rejected") return "rejected";
    if (order.approval.status === "waiting" || (order.insurance.required && order.insurance.status === "waiting")) return "waiting";
    return "approved";
  }

  // Places an order. Returns the existing live order for the same test (EC-02).
  function order(record, testId, { suggested = false } = {}) {
    const u = me();
    if (!Access.can("review.orders")) throw new RefusedError("Your role can't order tests.");
    const test = TestCatalog.get(testId);
    if (!test) throw new RefusedError("That test isn't in the catalogue.");
    if (test.status === "retired") throw new RefusedError(`${test.label} has been taken off the list and can't be ordered.`);
    const list = all();
    const existing = list.find((o) => o.recordId === record.id && o.testId === testId && isLive(o));
    if (existing) return existing;
    const needs = test.approval.mode !== "none";
    const o = {
      id: uid(),
      recordId: record.id,
      fileNumber: record.fileNumber,
      patientName: record.patientName,
      clinicId: record.clinicId ?? "cl-df-nrc",
      testId,
      label: test.label,
      suggested,
      orderedBy: u.name,
      orderedById: u.id,
      orderedAt: new Date().toISOString(),
      approval: {
        status: needs ? "waiting" : "not-needed",
        mode: test.approval.mode,
        role: test.approval.role,
        people: test.approval.mode === "person" ? test.approval.people.slice(0, 1) : [...(test.approval.people ?? [])],
        decisions: [],
        escalateAfterHours: test.escalateAfterHours,
        backup: test.backup || "",
      },
      insurance: { required: !!test.insurance, status: test.insurance ? "waiting" : "not-needed" },
    };
    write([...list, o]);
    audit(o, `Test ordered: ${o.label}${needs ? " (needs approval)" : ""}${o.insurance.required ? " (needs insurance)" : ""}`);
    return o;
  }

  function decide(orderId, decision, reason = "") {
    const u = me();
    const list = all();
    const o = list.find((x) => x.id === orderId);
    if (!o) throw new RefusedError("This order no longer exists.");
    const a = o.approval;
    if (a.status !== "waiting") {
      const last = a.decisions.at(-1);
      throw new RefusedError(`Already ${a.status === "approved" ? "approved" : "rejected"}${last ? ` by ${last.by}` : ""}. Nothing changed.`);
    }
    if (a.decisions.some((d) => d.byId === u.id)) throw new RefusedError("You have already decided on this order.");
    if (!canApprove(o, u.id)) throw new RefusedError("You are not an approver for this test.");
    if (decision === "rejected" && !reason.trim()) throw new RefusedError("Give a reason for rejecting.");
    a.decisions.push({ by: u.name, byId: u.id, role: u.roleLabel, at: new Date().toISOString(), decision, reason: reason.trim() || null });
    if (decision === "rejected") a.status = "rejected";
    // "people": all named approvers, unless the decision comes from the person it was
    // escalated to, who stands in for those still missing (EC-13)
    else if (a.mode === "people" && !(a.escalatedTo?.includes(u.id) && !a.people.includes(u.id))) {
      a.status = a.people.every((p) => a.decisions.some((d) => d.byId === p && d.decision === "approved")) ? "approved" : "waiting";
    }
    else a.status = "approved";
    write(list);
    audit(o, decision === "approved" ? `Test approved: ${o.label}` : `Test rejected: ${o.label}`, { reason: reason.trim() || null, old: "waiting", new: a.status });
    return o;
  }

  function setInsurance(orderId, status, reason = "") {
    if (!canRecordInsurance()) throw new RefusedError("Your role can't record insurance decisions.");
    const u = me();
    const list = all();
    const o = list.find((x) => x.id === orderId);
    if (!o?.insurance.required) throw new RefusedError("This order doesn't need insurance approval.");
    if (o.insurance.status !== "waiting") throw new RefusedError(`Insurance already ${o.insurance.status} by ${o.insurance.by ?? "someone"}. Nothing changed.`);
    if (status === "rejected" && !reason.trim()) throw new RefusedError("Give the insurer's reason.");
    o.insurance = { ...o.insurance, status, by: u.name, byId: u.id, at: new Date().toISOString(), reason: reason.trim() || null };
    write(list);
    audit(o, `Insurance ${status}: ${o.label}`, { old: "waiting", new: status, reason: reason.trim() || null });
    return o;
  }

  // Waiting approvals past their limit are escalated once, to the backup or supervisor
  function overdue() {
    const list = all();
    const now = Date.now();
    const changed = [];
    for (const o of list) {
      const a = o.approval;
      if (a.status !== "waiting" || a.escalatedAt) continue;
      const limit = Number(a.escalateAfterHours) * 3600000;
      if (!limit || now - new Date(o.orderedAt).getTime() < limit) continue;
      const to = a.backup ? [a.backup] : supervisorsFor(o.clinicId);
      a.escalatedTo = to;
      a.escalatedAt = new Date().toISOString();
      changed.push(o);
    }
    if (changed.length) {
      try {
        write(list);
        changed.forEach((o) => audit(o, `Approval escalated: ${o.label} to ${o.approval.escalatedTo.map(staffName).join(", ") || "nobody (no backup or supervisor)"}`));
      } catch {}
    }
    return list.filter((o) => o.approval.escalatedAt && o.approval.status === "waiting");
  }

  const forRecord = (recordId) => all().filter((o) => o.recordId === recordId);
  const pendingFor = (userId = me()?.id) => all().filter((o) => canApprove(o, userId));
  const insuranceQueue = () => (canRecordInsurance() ? all().filter((o) => o.insurance.required && o.insurance.status === "waiting" && Org.canSeeClinic(o.clinicId)) : []);

  // ---------- Suggested tests: accepted or dismissed (UAT-24) ----------
  const suggestions = () => Db.read(SUGGEST_KEY, []) ?? [];
  function recordSuggestion(record, testValue, decision, reason) {
    const u = me();
    const label = TestCatalog.get(testValue)?.label ?? testValue;
    const list = suggestions().filter((s) => !(s.recordId === record.id && s.testId === testValue));
    list.push({ recordId: record.id, fileNumber: record.fileNumber, clinicId: record.clinicId, testId: testValue, label, decision, reason: reason || null, by: u.name, at: new Date().toISOString() });
    Db.write(SUGGEST_KEY, list, { where: "suggestions" });
    Audit.log("suggestion", { action: `Suggested test ${decision}: ${label}`, patient: record.fileNumber, record: record.id, clinicId: record.clinicId, reason: reason || null });
  }
  function acceptSuggestion(record, testValue) {
    const o = order(record, testValue, { suggested: true });
    recordSuggestion(record, testValue, "accepted");
    return o;
  }
  function dismissSuggestion(record, testValue, reason) {
    if (!reason?.trim()) throw new RefusedError("Give a reason for dismissing the suggestion.");
    recordSuggestion(record, testValue, "dismissed", reason.trim());
  }
  const suggestionFor = (recordId, testValue) => suggestions().find((s) => s.recordId === recordId && s.testId === testValue) ?? null;

  return {
    RefusedError, all, order, approve: (id) => decide(id, "approved"), reject: (id, reason) => decide(id, "rejected", reason),
    setInsurance, overdue, forRecord, pendingFor, insuranceQueue, canApprove, canRecordInsurance, approverIds,
    stateText, overall, acceptSuggestion, dismissSuggestion, suggestions, suggestionFor, staffName,
  };
})();
