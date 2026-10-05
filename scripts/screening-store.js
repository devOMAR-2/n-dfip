// Encounters (arrival, nurse screening, practitioner review, sign-off), kept in
// localStorage. Load after auth.js:  <script src="./scripts/screening-store.js"></script>
//
// Stages (UAT-07):
//   1 waiting-screening  patient has arrived, nobody has started the screening
//   2 screening          nurse part in progress (draft answers saved as you go)
//   3 awaiting-review    screening sent; waiting for the practitioner
//   4 in-review          practitioner review in progress
//   5 reviewed           signed and locked
// One person holds an open file at a time (editing lock, UAT-09). A lock expires after
// LOCK_TIMEOUT of inactivity. Nurse answers are never overwritten once sent;
// practitioner corrections live alongside them.
// Every record carries:
//   clinicId      the clinic it is booked in (org.js); queues only show clinics in scope (UAT-08)
//   appointment   who booked it, when, confirmed, regular or from a referral (UAT-11)
//   rev           revision number; a save based on an older revision is refused (EC-01, EC-05)
//   layoutVersion the clinic setup version it started with (UAT-14, EC-10)
// FRONT-END ONLY: the back end must enforce stages and locks (EC-01, EC-05, EC-06).

const ScreeningStore = (() => {
  const KEY = "ndfip.screenings";

  const read = () => Db.read(KEY, []) ?? [];
  // Throws Db.SaveError when the save fails; stored data is then unchanged (EC-15)
  const write = (all) => Db.write(KEY, all, { where: "encounters" });

  // ---------- Stages, holder and lock ----------

  const STAGES = [
    { id: "waiting-screening", n: 1, label: "Waiting for screening" },
    { id: "screening", n: 2, label: "Screening (nurse)" },
    { id: "awaiting-review", n: 3, label: "Waiting for practitioner" },
    { id: "in-review", n: 4, label: "Practitioner review" },
    { id: "reviewed", n: 5, label: "Signed" },
  ];
  const stageOf = (record) => STAGES.find((st) => st.id === record.status) ?? STAGES[0];
  const LOCK_TIMEOUT = 20 * 60 * 1000;
  const lockActive = (record) => !!record.holder && Date.now() - new Date(record.holder.lastActive).getTime() < LOCK_TIMEOUT;

  // ---------- Demo encounters (fictional patients from patients.js) ----------

  // Times are relative to "now" so waiting times look like a live clinic day
  const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
  const NURSE = "Amal Saeed Al-Harthi";
  const bothFeet = (prefix, value) => ({ [`${prefix.replace("*", "left")}`]: value, [`${prefix.replace("*", "right")}`]: value });

  const booked = (minutesAgo, by = { type: "reception", name: "Reception desk" }, extra = {}) => ({
    bookedBy: by, bookedAt: ago(minutesAgo), confirmed: true, source: "regular", ...extra,
  });

  const SEEDS = [
    {
      id: "demo-004742",
      clinicId: "cl-df-nrc",
      appointment: booked(60 * 24 * 9, { type: "practitioner", name: "Yousef Khalid Al-Rashidi" }),
      fileNumber: "N-DFIP-004742",
      patientName: "Mansour Ibrahim Al-Ghamdi",
      submittedBy: NURSE,
      arrivedAt: ago(150),
      submittedAt: ago(95),
      status: "awaiting-review",
      urgent: false,
      flags: [{ level: "attention", text: "1 ulcer: hands-on practitioner evaluation required" }],
      answers: {
        "a.confirmed": "yes",
        "a.temp": "37.2",
        "a.hr": "88",
        "a.rr": "16",
        "a.reason": "foot-problem",
        "a.complaint": "Wound under right big toe joint for about 5 weeks, some discharge.",
        "b.history": ["neuropathy"],
        "b.smoking": "current",
        "c.method": "monofilament",
        ...bothFeet("c.*.hallux", "absent"),
        "c.left.mth1": "absent",
        "c.right.mth1": "absent",
        "c.left.mth5": "detected",
        "c.right.mth5": "absent",
        ...bothFeet("c.*.vibration", "reduced"),
        "c.symptoms": ["numbness", "burning"],
        "c.severity": "4",
        "c.night": "yes",
        "d.claudication": "no",
        ...bothFeet("d.*.dp", "present"),
        ...bothFeet("d.*.pt", "present"),
        ...bothFeet("d.*.doppler", "tri"),
        "e.available": "yes",
        "e.left.abi": "1.02",
        "e.right.abi": "0.98",
        "f.left.deformity": ["claw-toes"],
        "f.right.deformity": ["claw-toes", "prominent-mth"],
        "f.right.skin": ["callus", "dry"],
        "f.left.skin": ["dry"],
        "g.footwear": "no",
        "g.concerns": ["poor-fit", "needs-insole"],
        ...bothFeet("h.*.flags", ["none"]),
        "i.left.ulcer": "no",
        "i.right.ulcer": "yes",
        ...bothFeet("i.*.minor", "no"),
        ...bothFeet("i.*.hindfoot", "no"),
        ...bothFeet("i.*.major", "no"),
        "j.count": "1",
        "j.1.foot": "right",
        "j.1.zone": "mth1",
        "j.1.aspect": "plantar",
      },
    },
    {
      id: "demo-004801",
      clinicId: "cl-df-nrc",
      appointment: booked(60 * 24 * 2, { type: "app", name: "Patient (mobile app)" }, { source: "referral", referralFrom: "Al-Faisaliah PHC Centre" }),
      fileNumber: "N-DFIP-004801",
      patientName: "Latifa Hamad Al-Subaie",
      submittedBy: NURSE,
      arrivedAt: ago(70),
      submittedAt: ago(25),
      status: "awaiting-review",
      urgent: true,
      flags: [{ level: "urgent", text: "Charcot red flag (left foot): immediate practitioner alert" }],
      answers: {
        "a.confirmed": "yes",
        "a.temp": "36.9",
        "a.hr": "82",
        "a.rr": "15",
        "a.reason": "foot-problem",
        "a.complaint": "Left foot swollen and warm for 10 days. Not painful.",
        "b.history": ["neuropathy"],
        "b.smoking": "never",
        "c.method": "monofilament",
        ...bothFeet("c.*.hallux", "absent"),
        ...bothFeet("c.*.mth1", "absent"),
        ...bothFeet("c.*.mth5", "detected"),
        ...bothFeet("c.*.vibration", "absent"),
        "c.symptoms": ["numbness"],
        "c.severity": "3",
        "c.night": "no",
        "d.claudication": "no",
        ...bothFeet("d.*.dp", "present"),
        ...bothFeet("d.*.pt", "present"),
        "e.available": "no",
        "f.left.deformity": ["none"],
        "f.right.deformity": ["none"],
        "g.footwear": "yes",
        "h.left.flags": ["warmth", "swelling", "redness", "minimal-pain"],
        "h.right.flags": ["none"],
        "h.left.temp": "33.6",
        "h.right.temp": "30.5",
        ...bothFeet("i.*.ulcer", "no"),
        ...bothFeet("i.*.minor", "no"),
        ...bothFeet("i.*.hindfoot", "no"),
        ...bothFeet("i.*.major", "no"),
        "j.count": "0",
      },
    },
    {
      id: "demo-004318",
      fileNumber: "N-DFIP-004318",
      patientName: "Noura Fahad Al-Otaibi",
      submittedBy: NURSE,
      arrivedAt: ago(110),
      submittedAt: ago(55),
      status: "awaiting-review",
      urgent: false,
      flags: [],
      answers: {
        "a.confirmed": "yes",
        "a.temp": "36.7",
        "a.hr": "76",
        "a.rr": "14",
        "a.reason": "annual-review",
        "b.history": ["neuropathy", "retinopathy"],
        "b.smoking": "never",
        "c.method": "monofilament",
        ...bothFeet("c.*.hallux", "absent"),
        ...bothFeet("c.*.mth1", "detected"),
        ...bothFeet("c.*.mth5", "detected"),
        ...bothFeet("c.*.vibration", "reduced"),
        "c.symptoms": ["tingling"],
        "c.severity": "2",
        "c.night": "yes",
        "d.claudication": "no",
        ...bothFeet("d.*.dp", "present"),
        ...bothFeet("d.*.pt", "present"),
        "e.available": "no",
        ...bothFeet("f.*.deformity", ["none"]),
        ...bothFeet("f.*.skin", ["dry"]),
        "g.footwear": "yes",
        ...bothFeet("h.*.flags", ["none"]),
        ...bothFeet("i.*.ulcer", "no"),
        ...bothFeet("i.*.minor", "no"),
        ...bothFeet("i.*.hindfoot", "no"),
        ...bothFeet("i.*.major", "no"),
        "j.count": "0",
      },
    },
  ];

  const arrival = (id, fileNumber, patientName, minutesAgo, extra = {}) => ({
    id, fileNumber, patientName, arrivedAt: ago(minutesAgo), status: "waiting-screening",
    clinicId: "cl-df-nrc", appointment: booked(60 * 24 * 5),
    urgent: false, flags: [], answers: {}, ...extra,
  });
  SEEDS.push(
    arrival("demo-arr-004271", "N-DFIP-004271", "Abdulrahman Saleh Al-Qahtani", 40),
    arrival("demo-arr-004455", "N-DFIP-004455", "Fatimah Ali Al-Zahrani", 22),
    arrival("demo-arr-004633", "N-DFIP-004633", "Reem Turki Al-Mutairi", 9, { appointment: booked(60 * 3, { type: "website", name: "Patient (website)" }, { confirmed: false }) }),
    arrival("demo-arr-004690", "N-DFIP-004690", "Imran Yousef Siddiqui", 55, {
      status: "screening",
      startedAt: ago(35),
      startedBy: "Huda Ali Al-Qarni",
      // Another nurse is mid-screening: the lock shows until it times out
      holder: { id: "200011", name: "Huda Ali Al-Qarni", role: "Screening Nurse", since: ago(35), lastActive: ago(2) },
      answers: { "a.confirmed": "yes", "a.temp": "36.8", "a.hr": "84", "a.rr": "16", "a.reason": "annual-review" },
    }),
    // Other clinics: only staff assigned there (or above) see these (UAT-01, UAT-08)
    arrival("demo-jcc-004318", "N-DFIP-004318", "Noura Fahad Al-Otaibi", 30, { clinicId: "cl-df-jcc" }),
    arrival("demo-krh-004742", "N-DFIP-004742", "Mansour Ibrahim Al-Ghamdi", 15, { clinicId: "cl-df-krh", appointment: booked(60 * 24 * 20, { type: "practitioner", name: "Omar Fahad Al-Sulami" }) }),
  );

  // Add any demo screening that isn't stored yet (first visit, or after storage was cleared)
  function seed(list = SEEDS) {
    // Records saved before stages / clinics existed: count as "sent", in the first clinic
    const all = read().map((r) => ({
      ...r,
      status: r.status ?? "awaiting-review",
      arrivedAt: r.arrivedAt ?? r.submittedAt,
      clinicId: r.clinicId ?? "cl-df-nrc",
      appointment: r.appointment ?? booked(60 * 24, { type: "reception", name: "Reception desk" }),
      rev: r.rev ?? 1,
    }));
    const missing = list.filter((s) => !all.some((r) => r.id === s.id));
    try {
      write([...all, ...missing.map((s) => ({ rev: 1, ...s, demo: true }))]);
    } catch {}
  }

  seed();

  // ---------- Audit trail (audit.js; the page is audit.html) ----------
  // audit(action, record, detail[, type]) kept for the existing call sites
  function audit(action, record, detail = "", type = "encounter") {
    if (typeof Audit === "undefined") return;
    Audit.forRecord(type, record, detail ? `${action}: ${detail}` : action);
  }

  const getById = (id) => read().find((r) => r.id === id) || null;

  class ConflictError extends Error {
    constructor(current) {
      const who = current?.updatedBy ? ` by ${current.updatedBy}` : "";
      super(`This file was changed${who} after you opened it. Your change was not saved. Reload to see the current version.`);
      this.name = "ConflictError";
      this.current = current;
    }
  }

  // Saves the record. If the stored copy has moved on since this one was read (another tab,
  // another user, an old page restored with Back), the save is refused (EC-01, EC-05).
  // Throws ConflictError or Db.SaveError; nothing is written in either case.
  // The lock is owned by storage: a save keeps the stored holder unless releaseLock is set,
  // and is refused when someone else now holds the file (lock forced open and retaken).
  function save(record, { force = false, releaseLock = false } = {}) {
    const all = read();
    const stored = all.find((r) => r.id === record.id);
    if (stored && !force && (stored.rev ?? 1) !== (record.rev ?? 1)) throw new ConflictError(stored);
    const u = typeof Access !== "undefined" ? Access.currentUser() : null;
    if (stored && !force && lockActive(stored) && u && stored.holder.id !== u.id) {
      const err = new ConflictError(stored);
      err.message = `${stored.holder.name} holds this file now. Your change was not saved.`;
      throw err;
    }
    const holder = releaseLock ? undefined : stored?.holder;
    const next = { ...record, holder, rev: (record.rev ?? 1) + 1, updatedAt: new Date().toISOString(), updatedBy: u?.name ?? null };
    if (!holder) delete next.holder;
    write(stored ? all.map((r) => (r.id === record.id ? next : r)) : [...all, next]);
    Object.assign(record, next);
    return record;
  }

  // Lock bookkeeping only: never conflicts with content saves
  function touch(id, mutate) {
    const all = read();
    const r = all.find((x) => x.id === id);
    if (!r) return null;
    mutate(r);
    try {
      write(all);
    } catch {}
    return r;
  }

  // Take the file for editing. Returns { ok, record, holder }; holder is the other
  // person when someone else has an active lock.
  function acquire(id, user) {
    const record = getById(id);
    if (!record) return { ok: false };
    if (lockActive(record) && record.holder.id !== user.id) return { ok: false, record, holder: record.holder };
    const now = new Date().toISOString();
    const keepSince = record.holder?.id === user.id && lockActive(record);
    const fresh = !keepSince;
    const updated = touch(id, (r) => {
      r.holder = { id: user.id, name: user.name, role: user.roleLabel, since: keepSince ? r.holder.since : now, lastActive: now };
    });
    if (fresh) audit("Editing lock taken", updated, "", "lock");
    return { ok: true, record: updated };
  }

  function heartbeat(id, user) {
    touch(id, (r) => {
      if (r.holder?.id === user.id) r.holder.lastActive = new Date().toISOString();
    });
  }

  function release(id, user) {
    const r = getById(id);
    if (r?.holder?.id !== user.id) return;
    touch(id, (x) => delete x.holder);
    audit("Editing lock released", r, "", "lock");
  }

  // A supervisor frees a file someone else holds (UAT-09). Reason required.
  function forceRelease(id, reason) {
    const r = getById(id);
    if (!r?.holder) return false;
    const was = r.holder.name;
    touch(id, (x) => delete x.holder);
    audit("Editing lock forced open", r, `held by ${was}. Reason: ${reason}`, "lock");
    return true;
  }

  const visible = (r) => typeof Org === "undefined" || Org.inScope(r);

  // Waiting for the practitioner, most urgent first (UAT-08): critical alert, then other
  // alerts, then longest wait since the screening was sent.
  function reviewQueue() {
    const rank = (r) => (r.urgent ? 0 : r.flags?.length ? 1 : 2);
    return read()
      .filter((r) => (r.status === "awaiting-review" || r.status === "in-review") && visible(r))
      .sort((a, b) => rank(a) - rank(b) || a.submittedAt.localeCompare(b.submittedAt));
  }

  // Arrived and not yet sent (stages 1 and 2), first come first served
  function screeningQueue() {
    return read()
      .filter((r) => (r.status === "waiting-screening" || r.status === "screening") && visible(r))
      .sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt));
  }

  return {
    STAGES, stageOf, LOCK_TIMEOUT, lockActive, ConflictError,
    all: read,
    // Records in the signed-in user's scope (UAT-01)
    visible: () => read().filter(visible),
    getById,
    add(record) {
      write([...read(), { rev: 1, ...record }]);
    },
    save, touch,
    acquire, heartbeat, release, forceRelease, audit,
    reviewQueue, screeningQueue,
    // Extra demo records (history, other clinics) added by other scripts if missing
    ensureSeeds: (list) => seed(list),
    // Everything not yet signed, in scope
    pending: () => read().filter((r) => r.status !== "reviewed" && visible(r)),
  };
})();
