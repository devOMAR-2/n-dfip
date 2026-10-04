// Screening records (Part 1 + practitioner review), kept in localStorage.
// Load after auth.js and patients.js:  <script src="./scripts/screening-store.js"></script>
//
// Lifecycle: "awaiting-review" (nurse sent) → "in-review" (practitioner opened;
// nurse can no longer edit) → "reviewed" (signed off, locked).
// Nurse answers are never modified; practitioner corrections live alongside them.

const ScreeningStore = (() => {
  const KEY = "ndfip.screenings";

  function read() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function write(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
  }

  // ---------- Demo screenings (fictional patients from patients.js) ----------

  const NURSE = "Screening Nurse (demo)";
  const bothFeet = (prefix, value) => ({ [`${prefix.replace("*", "left")}`]: value, [`${prefix.replace("*", "right")}`]: value });

  const SEEDS = [
    {
      id: "demo-004742",
      fileNumber: "N-DFIP-004742",
      patientName: "Mansour Ibrahim Al-Ghamdi",
      submittedBy: NURSE,
      submittedAt: "2026-10-04T08:40:00",
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
      fileNumber: "N-DFIP-004801",
      patientName: "Latifa Hamad Al-Subaie",
      submittedBy: NURSE,
      submittedAt: "2026-10-04T09:15:00",
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
      submittedAt: "2026-10-03T13:05:00",
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

  // Add any demo screening that isn't stored yet (first visit, or after storage was cleared)
  function seed() {
    const all = read();
    const missing = SEEDS.filter((s) => !all.some((r) => r.id === s.id));
    if (missing.length) write([...all, ...missing.map((s) => ({ ...s, demo: true }))]);
  }

  seed();

  return {
    all: read,
    getById: (id) => read().find((r) => r.id === id) || null,
    add(record) {
      write([...read(), record]);
    },
    save(record) {
      write(read().map((r) => (r.id === record.id ? record : r)));
    },
    // Awaiting or in review, urgent first, then oldest first
    pending() {
      return read()
        .filter((r) => r.status !== "reviewed")
        .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.submittedAt.localeCompare(b.submittedAt));
    },
  };
})();
