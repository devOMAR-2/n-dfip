// Referral tracking (UAT-12). Loads in every page head after audit.js and org.js.
//
//   Referrals.create({ record, destination, urgency, timing, reason, suggested })
//   Referrals.setStatus(id, status, note)          sent -> received -> attended -> closed, or cancelled
//   Referrals.decline({ record, suggestion: { tier, destination, urgency, timing }, reason })
//   Referrals.all() / forPatient(fileNumber) / forRecord(recordId) / declined() / get(id)
//   Referrals.isOverdue(ref)
//
// Stored in "ndfip.referrals" as { made: [...], declined: [...] }. Lists only return
// referrals whose clinic is in the signed-in user's scope (UAT-01). Every change is
// written to the audit log ("referral"). Writes throw Db.SaveError (EC-15).
// FRONT-END ONLY: the server owns referral state and repeats every check.

const Referrals = (() => {
  const KEY = "ndfip.referrals";

  const DESTINATION = {
    er: "Emergency department",
    tertiary: "Tertiary",
    secondary: "Secondary Care",
    vascular: "Vascular",
    "wound-care": "Wound Care",
    private: "Private Center",
  };
  const URGENCY = { routine: "Routine", soon: "Soon", urgent: "Urgent", emergency: "Emergency" };
  const TIMING = { today: "Today", "24h": "Within 24 h", week: "Within 1 week", "3weeks": "Within 3 weeks", scheduled: "Scheduled" };
  const STATUSES = [
    { id: "sent", label: "Sent" },
    { id: "received", label: "Received" },
    { id: "attended", label: "Attended" },
    { id: "closed", label: "Closed" },
    { id: "cancelled", label: "Cancelled" },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]));
  // Allowed next steps
  const NEXT = { sent: ["received", "cancelled"], received: ["attended", "cancelled"], attended: ["closed"], closed: [], cancelled: [] };

  const TIMING_DAYS = { today: 0, "24h": 1, week: 7, "3weeks": 21, scheduled: 42 };

  function dueDate(timing, from = new Date()) {
    const d = new Date(from);
    d.setDate(d.getDate() + (TIMING_DAYS[timing] ?? 7));
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }

  const store = () => {
    const s = Db.read(KEY, null);
    return { made: s?.made ?? [], declined: s?.declined ?? [] };
  };

  const me = () => (typeof Access !== "undefined" ? Access.currentUser() : null);
  const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const inScope = (x) => typeof Org === "undefined" || Org.canSeeClinic(x.clinicId ?? "cl-df-nrc");

  // ---------- Demo referrals for past encounters ----------

  function seed() {
    const s = store();
    const records = Db.read("ndfip.screenings", []) ?? [];
    const hist = (id) => records.find((r) => r.id === id);
    const at = (iso, minutes) => new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
    const SEEDS = [];
    const make = (recordId, steps, extra = {}) => {
      const r = hist(recordId);
      if (!r || s.made.some((x) => x.id === `ref-${recordId}`)) return;
      const a = r.review?.answers ?? {};
      const sentAt = r.review?.signedAt ?? r.updatedAt;
      const history = [{ status: "sent", at: sentAt, by: r.review?.signedBy ?? "practitioner", note: "Referral sent at sign-off" }];
      for (const [status, minutes, by, note] of steps) history.push({ status, at: at(sentAt, minutes), by, note });
      SEEDS.push({
        id: `ref-${recordId}`,
        fileNumber: r.fileNumber,
        patientName: r.patientName,
        recordId,
        clinicId: r.clinicId,
        destination: a["r.ref.destination"],
        urgency: a["r.ref.urgency"],
        timing: a["r.ref.timing"],
        reason: a["r.ref.reason"] ?? "",
        suggested: true,
        createdAt: sentAt,
        createdBy: r.review?.signedBy ?? "practitioner",
        dueDate: dueDate(a["r.ref.timing"], sentAt),
        status: history[history.length - 1].status,
        history,
        demo: true,
        ...extra,
      });
    };
    make("hist-004742-2", [["received", 180, "Diabetic Foot Clinic, Al-Noor General Hospital", "Appointment booked for 9 December"], ["attended", 60 * 24 * 6, "Omar Fahad Al-Sulami", "Seen; total contact cast applied"], ["closed", 60 * 24 * 7, "Omar Fahad Al-Sulami", "Care continues at the hospital clinic"]]);
    make("hist-004867-1", [["received", 25, "Emergency department, Al-Noor General Hospital", "Patient arrived by ambulance"], ["attended", 60, "ER triage", "Admitted under vascular surgery"], ["closed", 60 * 24 * 12, "Inpatient team", "Discharged after 2nd toe amputation"]]);
    make("hist-004867-2", [["received", 60 * 5, "Vascular clinic", "Urgent slot next morning"]]);
    make("hist-004318-2", []); // still "sent": overdue after 3 weeks
    make("hist-004519-1", [["received", 60 * 24, "Secondary Care Unit, North Riyadh", "Appointment booked"]]);

    const declinedSeeds = [];
    const dec = (recordId, suggestion, reason) => {
      const r = hist(recordId);
      if (!r || s.declined.some((x) => x.id === `dec-${recordId}`)) return;
      declinedSeeds.push({
        id: `dec-${recordId}`, fileNumber: r.fileNumber, patientName: r.patientName, recordId, clinicId: r.clinicId,
        suggestion, reason, at: r.review?.signedAt, by: r.review?.signedBy ?? "practitioner", demo: true,
      });
    };
    dec("hist-004742-1", { tier: "Moderate risk", destination: "secondary", urgency: "routine", timing: "3weeks" }, "Already under regular follow-up in this clinic; patient prefers to stay here.");
    dec("hist-004402-1", { tier: "Moderate risk", destination: "secondary", urgency: "routine", timing: "3weeks" }, "Dry skin only, managed in primary care.");

    if (SEEDS.length || declinedSeeds.length) {
      try {
        localStorage.setItem(KEY, JSON.stringify({ made: [...s.made, ...SEEDS], declined: [...s.declined, ...declinedSeeds] }));
      } catch {}
    }
  }
  seed();

  // ---------- Reads (scoped) ----------

  const sortNewest = (list, field) => list.sort((a, b) => String(b[field]).localeCompare(String(a[field])));
  const all = () => sortNewest(store().made.filter(inScope), "createdAt");
  const declined = () => sortNewest(store().declined.filter(inScope), "at");
  const get = (id) => store().made.find((x) => x.id === id && inScope(x)) ?? null;
  const forPatient = (fileNumber) => {
    const files = typeof Patients !== "undefined" && Patients.filesOf ? Patients.filesOf(fileNumber) : [fileNumber];
    return all().filter((x) => files.includes(x.fileNumber));
  };
  const forRecord = (recordId) => all().filter((x) => x.recordId === recordId);
  const declinedFor = (recordId) => declined().filter((x) => x.recordId === recordId);
  const isOverdue = (ref) => (ref.status === "sent" || ref.status === "received") && new Date(ref.dueDate).getTime() < Date.now();

  // ---------- Writes ----------

  function create({ record, destination, urgency, timing, reason = "", suggested = false }) {
    if (!record?.id) throw new Error("A referral needs an encounter.");
    if (!DESTINATION[destination]) throw new Error("Choose the destination.");
    const u = me();
    const now = new Date().toISOString();
    const ref = {
      id: uid("ref"),
      fileNumber: record.fileNumber,
      patientName: record.patientName,
      recordId: record.id,
      clinicId: record.clinicId ?? "cl-df-nrc",
      destination,
      urgency: urgency ?? "routine",
      timing: timing ?? "week",
      reason,
      suggested: !!suggested,
      createdAt: now,
      createdBy: u?.name ?? "unknown",
      dueDate: dueDate(timing, now),
      status: "sent",
      history: [{ status: "sent", at: now, by: u?.name ?? "unknown", note: "Referral created" }],
    };
    Db.update(KEY, { made: [], declined: [] }, (s) => {
      s.made ??= [];
      s.made.push(ref);
    }, { where: "referrals" });
    if (typeof Audit !== "undefined") {
      Audit.forRecord("referral", record, `Referral created: ${DESTINATION[destination]}, ${URGENCY[ref.urgency] ?? ref.urgency}, ${TIMING[ref.timing] ?? ref.timing}`, { new: "sent", reason: reason || null });
    }
    return ref;
  }

  function setStatus(id, status, note = "") {
    const current = store().made.find((x) => x.id === id);
    if (!current) throw new Error("Referral not found.");
    if (!inScope(current)) throw new Error("This referral is outside your assigned clinics.");
    if (typeof Access !== "undefined" && !Access.can("referrals.track")) throw new Error("Your role can't update referral status.");
    if (!NEXT[current.status]?.includes(status)) throw new Error(`A ${STATUS_LABEL[current.status].toLowerCase()} referral can't move to ${STATUS_LABEL[status]?.toLowerCase() ?? status}.`);
    const u = me();
    const entry = { status, at: new Date().toISOString(), by: u?.name ?? "unknown", note: note.trim() };
    let updated = null;
    Db.update(KEY, { made: [], declined: [] }, (s) => {
      const ref = s.made.find((x) => x.id === id);
      // Someone else moved it on since this page loaded (EC-01)
      if (ref.status !== current.status) throw new Error(`This referral was already marked ${STATUS_LABEL[ref.status].toLowerCase()} by ${ref.history.at(-1)?.by ?? "someone else"}.`);
      ref.status = status;
      ref.history.push(entry);
      updated = ref;
    }, { where: "referrals" });
    if (typeof Audit !== "undefined") {
      Audit.log("referral", { patient: updated.fileNumber, record: updated.recordId, clinicId: updated.clinicId, field: "Referral status", old: STATUS_LABEL[current.status], new: STATUS_LABEL[status], reason: note.trim() || null, action: `Referral to ${DESTINATION[updated.destination]} marked ${STATUS_LABEL[status].toLowerCase()}` });
    }
    return updated;
  }

  function decline({ record, suggestion, reason = "" }) {
    if (!record?.id || !suggestion) throw new Error("Nothing to decline.");
    const u = me();
    const item = {
      id: uid("dec"),
      fileNumber: record.fileNumber,
      patientName: record.patientName,
      recordId: record.id,
      clinicId: record.clinicId ?? "cl-df-nrc",
      suggestion: { tier: suggestion.tier ?? null, destination: suggestion.destination ?? null, urgency: suggestion.urgency ?? null, timing: suggestion.timing ?? null },
      reason: reason.trim(),
      at: new Date().toISOString(),
      by: u?.name ?? "unknown",
    };
    Db.update(KEY, { made: [], declined: [] }, (s) => {
      s.declined ??= [];
      // One decline per encounter: a second sign-off attempt replaces the first
      s.declined = s.declined.filter((x) => x.recordId !== record.id);
      s.declined.push(item);
    }, { where: "referrals" });
    if (typeof Audit !== "undefined") {
      Audit.forRecord("suggestion", record, `Suggested referral not made: ${DESTINATION[item.suggestion.destination] ?? "referral"}${item.suggestion.tier ? ` (${item.suggestion.tier})` : ""}`, { reason: item.reason || null, old: "suggested", new: "declined" });
    }
    return item;
  }

  return {
    DESTINATION, URGENCY, TIMING, STATUSES, STATUS_LABEL, NEXT,
    all, declined, get, forPatient, forRecord, declinedFor, isOverdue, dueDate,
    create, setStatus, decline,
  };
})();
