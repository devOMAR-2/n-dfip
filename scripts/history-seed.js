// DEMO DATA: past signed encounters (fictional) for the patient file timeline, appointment
// pages and reports (UAT-11, UAT-21, UAT-23/24). Loads in <head>, before screening-store.js,
// so it writes straight into "ndfip.screenings": only ids that are missing are added
// ("hist-" prefix); nothing already stored is touched. Also seeds demo attachments
// ("ndfip.files") that point at files under ./assets/.

(() => {
  if (typeof Db === "undefined") return;

  const NURSES = {
    amal: "Amal Saeed Al-Harthi",
    huda: "Huda Ali Al-Qarni",
    salma: "Salma Nasser Al-Dossary",
  };
  const DOCTORS = {
    yousef: "Yousef Khalid Al-Rashidi",
    omar: "Omar Fahad Al-Sulami",
    rana: "Rana Saad Al-Otaibi",
    fahad: "Dr. Fahad Nasser Al-Qahtani",
  };

  // A visit on `date` (YYYY-MM-DD) starting at `time` (HH:MM, local); minutes are offsets
  function visit(id, { file, name, clinic, date, time = "09:10", nurse, doctor, booked, answers = {}, review = {}, flags = [], urgent = false, waitMin = 35, reviewMin = 25 }) {
    const at = (offsetMin) => {
      const d = new Date(`${date}T${time}:00`);
      d.setMinutes(d.getMinutes() + offsetMin);
      return d.toISOString();
    };
    const bookedDaysBefore = booked?.daysBefore ?? 14;
    const bookedAt = new Date(`${date}T08:00:00`);
    bookedAt.setDate(bookedAt.getDate() - bookedDaysBefore);
    return {
      id,
      fileNumber: file,
      patientName: name,
      clinicId: clinic,
      appointment: {
        bookedBy: booked?.by ?? { type: "reception", name: "Reception desk" },
        bookedAt: bookedAt.toISOString(),
        confirmed: true,
        source: booked?.source ?? "regular",
        ...(booked?.referralFrom ? { referralFrom: booked.referralFrom } : {}),
      },
      status: "reviewed",
      arrivedAt: at(0),
      startedAt: at(6),
      startedBy: nurse,
      submittedAt: at(20),
      submittedBy: nurse,
      openedAt: at(20 + waitMin),
      openedBy: doctor,
      urgent,
      flags,
      answers: { "a.confirmed": "yes", ...answers },
      review: {
        answers: review.answers ?? {},
        decisions: {},
        corrections: [],
        noteEdited: false,
        instructionsEdited: false,
        medications: review.medications ?? "",
        finalNote: review.note ?? review.answers?.["r.note"] ?? "",
        signedBy: doctor,
        signedAt: at(20 + waitMin + reviewMin),
        ack: { text: "Decision-support notice acknowledged", at: at(20 + waitMin + reviewMin) },
      },
      rev: 1,
      demo: true,
      updatedAt: at(20 + waitMin + reviewMin),
    };
  }

  const LAB_ULCER = { "r.lab.wbc": "9.8", "r.lab.hb": "12.9", "r.lab.platelets": "310", "r.lab.fbg": "182", "r.lab.hba1c": "9.6", "r.lab.urea": "38", "r.lab.creatinine": "1.1", "r.lab.egfr": "71", "r.lab.crp": "24", "r.lab.esr": "41" };

  const HISTORY = [
    // Mansour: neuropathic ulcer journey, North Riyadh then the hospital clinic
    visit("hist-004742-1", {
      file: "N-DFIP-004742", name: "Mansour Ibrahim Al-Ghamdi", clinic: "cl-df-nrc", date: "2025-06-18",
      nurse: NURSES.amal, doctor: DOCTORS.yousef,
      answers: { "a.reason": "annual-review", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "8.9", "r.lab.fbg": "164", "r.lab.creatinine": "0.98", "r.lab.egfr": "84", "r.plan.followup": "3-6m", "r.ref.needed": "no", "r.plan.education": ["daily-check"] },
        note: "Annual foot screening. LOPS both feet, claw toes. No ulcer. IWGDF 2. Footwear advice, review in 3–6 months.",
      },
    }),
    visit("hist-004742-2", {
      file: "N-DFIP-004742", name: "Mansour Ibrahim Al-Ghamdi", clinic: "cl-df-nrc", date: "2025-12-03", time: "10:20",
      nurse: NURSES.huda, doctor: DOCTORS.yousef, waitMin: 52,
      answers: { "a.reason": "foot-problem", "j.count": "1", "j.1.foot": "right", "j.1.zone": "mth1", "j.1.aspect": "plantar" },
      flags: [{ level: "attention", text: "1 ulcer: hands-on practitioner evaluation required" }],
      review: {
        answers: { ...LAB_ULCER, "r.orders.labs": ["cbc", "esr", "crp", "hba1c", "creatinine", "wound-culture"], "r.orders.imaging": ["xray"], "r.inf.antibiotics": "oral", "r.inf.agent": "Amoxicillin-clavulanate 875/125 mg", "r.inf.days": "10", "r.std.debridement": "sharp", "r.std.offloading": "walker", "r.std.dressing": "Silver alginate, change every 2 days", "r.ref.needed": "yes", "r.ref.destination": "secondary", "r.ref.urgency": "soon", "r.ref.timing": "week", "r.ref.reason": "Neuropathic plantar ulcer with mild infection", "r.plan.followup": "1w" },
        medications: "Amoxicillin-clavulanate 875/125 mg by mouth twice daily for 10 days. Paracetamol 1 g up to 3 times daily if needed.",
        note: "New plantar ulcer right 1st MTH, 2.0 × 1.5 cm, mild infection (IWGDF 2). Wagner 2. Sharp debridement, removable walker, oral antibiotics. Referred to secondary care within 1 week.",
      },
    }),
    visit("hist-004742-3", {
      file: "N-DFIP-004742", name: "Mansour Ibrahim Al-Ghamdi", clinic: "cl-df-krh", date: "2025-12-09", time: "11:00",
      nurse: NURSES.salma, doctor: DOCTORS.omar, waitMin: 28,
      booked: { daysBefore: 6, by: { type: "practitioner", name: DOCTORS.yousef }, source: "referral", referralFrom: "Diabetic Foot Clinic, North Riyadh Medical Complex" },
      answers: { "a.reason": "follow-up", "j.count": "1", "j.1.foot": "right", "j.1.zone": "mth1", "j.1.aspect": "plantar" },
      review: {
        answers: { "r.lab.wbc": "8.1", "r.lab.crp": "11", "r.std.debridement": "sharp", "r.std.offloading": "tcc", "r.std.dressing": "Foam dressing", "r.plan.followup": "1w", "r.ref.needed": "no" },
        medications: "Continue the antibiotic course. No new medication.",
        note: "Referral attended. Infection settling. Total contact cast applied. Weekly review.",
      },
    }),
    visit("hist-004742-4", {
      file: "N-DFIP-004742", name: "Mansour Ibrahim Al-Ghamdi", clinic: "cl-df-nrc", date: "2026-09-28", time: "09:40",
      nurse: NURSES.amal, doctor: DOCTORS.fahad,
      answers: { "a.reason": "foot-problem", "j.count": "1", "j.1.foot": "right", "j.1.zone": "mth1", "j.1.aspect": "plantar" },
      review: {
        answers: { ...LAB_ULCER, "r.lab.hba1c": "10.2", "r.inf.antibiotics": "oral", "r.inf.agent": "Doxycycline 100 mg", "r.inf.days": "7", "r.std.offloading": "walker", "r.plan.followup": "1w", "r.ref.needed": "no" },
        medications: "Doxycycline 100 mg by mouth twice daily for 7 days.",
        note: "Recurrent ulcer right 1st MTH, Wagner 2, mild infection. Oral antibiotics, walker. Smoking cessation advised. Weekly review.",
      },
    }),
    // Hassan: acute foot attack at the hospital clinic
    visit("hist-004867-1", {
      file: "N-DFIP-004867", name: "Hassan Ali Al-Yami", clinic: "cl-df-krh", date: "2026-03-14", time: "08:45",
      nurse: NURSES.salma, doctor: DOCTORS.omar, urgent: true, waitMin: 8, reviewMin: 40,
      flags: [{ level: "urgent", text: "Fever and spreading redness: possible systemic infection" }],
      answers: { "a.temp": "38.6", "a.hr": "112", "a.reason": "foot-problem", "j.count": "1", "j.1.foot": "left", "j.1.zone": "toe2", "j.1.aspect": "dorsal" },
      review: {
        answers: { "r.lab.wbc": "17.2", "r.lab.hb": "11.0", "r.lab.platelets": "455", "r.lab.crp": "168", "r.lab.esr": "92", "r.lab.creatinine": "1.9", "r.lab.urea": "64", "r.lab.egfr": "34", "r.lab.lactate": "2.8", "r.inf.antibiotics": "iv", "r.inf.agent": "Piperacillin-tazobactam", "r.inf.admit": "yes", "r.orders.labs": ["cbc", "crp", "esr", "creatinine", "blood-culture", "wound-culture", "lactate"], "r.orders.imaging": ["xray", "duplex"], "r.ref.needed": "yes", "r.ref.destination": "er", "r.ref.urgency": "emergency", "r.ref.timing": "today", "r.ref.reason": "Acute foot attack: SIRS, cellulitis > 2 cm, toe gangrene" },
        medications: "Piperacillin-tazobactam 4.5 g IV every 8 hours (renal dose review). Insulin sliding scale per inpatient protocol.",
        note: "Acute foot attack. Fever, tachycardia, cellulitis > 2 cm and 2nd toe gangrene, left foot. Sent to the ER for admission and MDT review.",
      },
    }),
    visit("hist-004867-2", {
      file: "N-DFIP-004867", name: "Hassan Ali Al-Yami", clinic: "cl-df-krh", date: "2026-05-02", time: "10:05",
      nurse: NURSES.salma, doctor: DOCTORS.fahad,
      booked: { daysBefore: 21, by: { type: "practitioner", name: DOCTORS.omar } },
      answers: { "a.reason": "follow-up", "j.count": "1", "j.1.foot": "left", "j.1.zone": "toe2", "j.1.aspect": "dorsal" },
      review: {
        answers: { "r.lab.wbc": "8.9", "r.lab.crp": "14", "r.lab.creatinine": "1.6", "r.lab.egfr": "41", "r.std.dressing": "Non-adherent dressing", "r.plan.followup": "2w", "r.ref.needed": "yes", "r.ref.destination": "vascular", "r.ref.urgency": "urgent", "r.ref.timing": "24h", "r.ref.reason": "Post-amputation wound, ABI 0.48" },
        medications: "Clopidogrel 75 mg daily (started by vascular team). Atorvastatin 40 mg at night.",
        note: "Post 2nd toe amputation. Wound granulating. Severe ischaemia on duplex. Urgent vascular referral.",
      },
    }),
    // Latifa: Charcot, referred in
    visit("hist-004801-1", {
      file: "N-DFIP-004801", name: "Latifa Hamad Al-Subaie", clinic: "cl-df-nrc", date: "2026-01-21", time: "13:15",
      nurse: NURSES.huda, doctor: DOCTORS.yousef,
      booked: { daysBefore: 3, by: { type: "app", name: "Patient (mobile app)" } },
      answers: { "a.reason": "annual-review", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "8.1", "r.lab.fbg": "150", "r.plan.followup": "3-6m", "r.ref.needed": "no" },
        note: "LOPS both feet, no deformity yet. IWGDF 1. Education given.",
      },
    }),
    // Noura: Jeddah clinic
    visit("hist-004318-1", {
      file: "N-DFIP-004318", name: "Noura Fahad Al-Otaibi", clinic: "cl-df-jcc", date: "2026-02-10", time: "09:30",
      nurse: "Clinic nurse (Jeddah)", doctor: DOCTORS.rana,
      booked: { daysBefore: 30, by: { type: "website", name: "Patient (website)" } },
      answers: { "a.reason": "annual-review", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "7.6", "r.lab.hb": "11.6", "r.lab.creatinine": "0.82", "r.lab.egfr": "88", "r.plan.followup": "6-12m", "r.ref.needed": "no" },
        note: "Normal sensation and pulses. IWGDF 0. Annual review.",
      },
    }),
    visit("hist-004318-2", {
      file: "N-DFIP-004318", name: "Noura Fahad Al-Otaibi", clinic: "cl-df-jcc", date: "2026-08-19", time: "11:45",
      nurse: "Clinic nurse (Jeddah)", doctor: DOCTORS.rana,
      answers: { "a.reason": "foot-problem", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "7.9", "r.plan.followup": "3-6m", "r.ref.needed": "yes", "r.ref.destination": "secondary", "r.ref.urgency": "routine", "r.ref.timing": "3weeks", "r.ref.reason": "New neuropathy (moderate risk)" },
        note: "New loss of sensation, right foot. Moderate risk: secondary care within 3 weeks.",
      },
    }),
    // Duplicate file opened in Jeddah for Mansour (EC-12)
    visit("hist-J00917-1", {
      file: "N-DFIP-J00917", name: "Mansour Ibrahim Al Ghamdi", clinic: "cl-df-jcc", date: "2025-11-12", time: "12:00",
      nurse: "Clinic nurse (Jeddah)", doctor: DOCTORS.rana,
      booked: { daysBefore: 0, by: { type: "reception", name: "Reception desk (walk-in)" } },
      answers: { "a.reason": "annual-review", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "9.6", "r.plan.followup": "3-6m", "r.ref.needed": "no" },
        note: "Visiting Jeddah. Screening done; advised to continue care in Riyadh.",
      },
    }),
    // Khalid and Saad: North Riyadh routine
    visit("hist-004402-1", {
      file: "N-DFIP-004402", name: "Khalid Mohammed Al-Harbi", clinic: "cl-df-nrc", date: "2026-04-07", time: "08:30",
      nurse: NURSES.amal, doctor: DOCTORS.yousef,
      answers: { "a.reason": "annual-review", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "7.1", "r.lab.creatinine": "1.0", "r.plan.followup": "6-12m", "r.ref.needed": "no" },
        note: "Screening normal apart from dry skin. IWGDF 1.",
      },
    }),
    visit("hist-004519-1", {
      file: "N-DFIP-004519", name: "Saad Nasser Al-Dosari", clinic: "cl-df-nrc", date: "2026-07-22", time: "10:50",
      nurse: NURSES.huda, doctor: DOCTORS.fahad,
      answers: { "a.reason": "follow-up", "j.count": "0" },
      review: {
        answers: { "r.lab.hba1c": "8.4", "r.lab.hb": "12.4", "r.lab.creatinine": "1.4", "r.lab.egfr": "52", "r.plan.followup": "1-3m", "r.ref.needed": "yes", "r.ref.destination": "secondary", "r.ref.urgency": "soon", "r.ref.timing": "week", "r.ref.reason": "High risk: previous amputation" },
        medications: "Emollient cream twice daily to both feet (not between the toes).",
        note: "Previous minor amputation. High risk: secondary care within 1 week, recall 1–2 months.",
      },
    }),
  ];

  const KEY = "ndfip.screenings";
  const stored = Db.read(KEY, []) ?? [];
  const missing = HISTORY.filter((h) => !stored.some((r) => r.id === h.id));
  if (missing.length) {
    try {
      localStorage.setItem(KEY, JSON.stringify([...stored, ...missing]));
    } catch {}
  }

  // Demo attachments: a wound photo and a lab report (fictional, under ./assets/)
  const FILES_KEY = "ndfip.files";
  const files = Db.read(FILES_KEY, []) ?? [];
  const DEMO_FILES = [
    {
      id: "file-demo-1", fileNumber: "N-DFIP-004742", recordId: "hist-004742-2", clinicId: "cl-df-nrc",
      name: "Wound photo, right 1st MTH.svg", type: "image/svg+xml", size: 1767, src: "./assets/demo-wound-photo.svg",
      category: "Wound photo", uploadedBy: NURSES.huda, uploadedAt: "2025-12-03T07:35:00.000Z", demo: true,
    },
    {
      id: "file-demo-2", fileNumber: "N-DFIP-004742", recordId: "hist-004742-2", clinicId: "cl-df-nrc",
      name: "Laboratory report 2025-12-03.pdf", type: "application/pdf", size: 2164, src: "./assets/demo-lab-report.pdf",
      category: "Lab report", uploadedBy: "Laboratory (interface)", uploadedAt: "2025-12-03T11:10:00.000Z", demo: true,
    },
  ];
  const missingFiles = DEMO_FILES.filter((f) => !files.some((x) => x.id === f.id));
  if (missingFiles.length) {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify([...files, ...missingFiles]));
    } catch {}
  }
})();
