// DEMO DATA — FICTIONAL PATIENTS. Not real people, not a real registry.
// Each record covers a scenario from the MOH Model of Care / IWGDF risk table /
// emergency criteria so the clinic screens can be exercised end to end.
// Load after auth.js:  <script src="./scripts/patients.js"></script>
//
// Conventions
// - `null` means "not assessed", never "normal".
// - Preventive risk (`iwgdfRisk` 0–3) is kept separate from active-problem
//   urgency (`activeProblem`), as the N-DFIP dossier requires.

const Patients = (() => {
  const RISK = {
    0: { label: "IWGDF 0 · Very low", interval: "Every 12 months" },
    1: { label: "IWGDF 1 · Low", interval: "Every 6–12 months" },
    2: { label: "IWGDF 2 · Moderate", interval: "Every 3–6 months" },
    3: { label: "IWGDF 3 · High", interval: "Every 1–3 months" },
  };

  const ACTIVE_PROBLEM = {
    ulcer: "Active ulcer",
    "suspected-charcot": "Suspected Charcot foot",
    "acute-foot-attack": "Acute foot attack",
  };

  const CARE_LEVEL = {
    primary: "Primary Care Unit",
    secondary: "Secondary Care Unit",
    tertiary: "Center of Excellence",
  };

  // Section B risk-history checklist of the screening form
  const noHistory = {
    ckd: false,
    dialysis: false,
    cardiovascular: false,
    retinopathy: false,
    immunosuppression: false,
    pad: false,
    revascularisation: false,
    smoking: null, // "current" | "former" | null
    neuropathy: false,
    poorVisionOrSelfCare: false,
  };

  const noEvents = { left: false, right: false };

  const records = [
    {
      fileNumber: "N-DFIP-004271",
      nationalId: "1082345671",
      phone: "0501234561",
      name: "Abdulrahman Saleh Al-Qahtani",
      sex: "Male",
      dob: "1975-03-14",
      diabetesType: "Type 2",
      diabetesDurationYears: 1,
      lastHbA1c: { value: 7.4, date: "2026-09-02" },
      allergies: [],
      riskHistory: { ...noHistory },
      lops: false,
      pad: false,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 0,
      activeProblem: null,
      careLevel: "primary",
      lastVisit: "2026-09-02",
      nextReview: "2027-09-02",
      note: "New diagnosis, first annual foot screening completed.",
    },
    {
      fileNumber: "N-DFIP-004318",
      nationalId: "1093456782",
      phone: "0552345672",
      name: "Noura Fahad Al-Otaibi",
      sex: "Female",
      dob: "1968-07-22",
      diabetesType: "Type 2",
      diabetesDurationYears: 12,
      lastHbA1c: { value: 8.1, date: "2026-08-15" },
      allergies: ["Penicillin"],
      riskHistory: { ...noHistory, neuropathy: true, retinopathy: true },
      lops: true,
      pad: false,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 1,
      activeProblem: null,
      careLevel: "primary",
      lastVisit: "2026-08-15",
      nextReview: "2027-02-15",
      note: "Loss of protective sensation, both feet. Pulses palpable.",
    },
    {
      fileNumber: "N-DFIP-004402",
      nationalId: "1074567893",
      phone: "0533456783",
      name: "Khalid Mohammed Al-Harbi",
      sex: "Male",
      dob: "1959-11-03",
      diabetesType: "Type 2",
      diabetesDurationYears: 18,
      lastHbA1c: { value: 7.9, date: "2026-07-28" },
      allergies: [],
      riskHistory: { ...noHistory, cardiovascular: true, pad: true, smoking: "former" },
      lops: false,
      pad: true,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 1,
      activeProblem: null,
      careLevel: "primary",
      lastVisit: "2026-07-28",
      nextReview: "2027-01-28",
      note: "ABI 0.82 right, 0.86 left. Intermittent claudication at 200 m.",
    },
    {
      fileNumber: "N-DFIP-004455",
      nationalId: "1065678904",
      phone: "0564567894",
      name: "Fatimah Ali Al-Zahrani",
      sex: "Female",
      dob: "1962-01-30",
      diabetesType: "Type 2",
      diabetesDurationYears: 20,
      lastHbA1c: { value: 9.2, date: "2026-09-10" },
      allergies: ["Sulfonamides"],
      riskHistory: { ...noHistory, neuropathy: true, poorVisionOrSelfCare: true },
      lops: true,
      pad: false,
      deformity: true,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 2,
      activeProblem: null,
      careLevel: "secondary",
      lastVisit: "2026-09-10",
      nextReview: "2026-12-10",
      note: "LOPS with claw toes and prominent metatarsal heads. Callus, right forefoot.",
    },
    {
      fileNumber: "N-DFIP-004519",
      nationalId: "1056789015",
      phone: "0545678905",
      name: "Saad Nasser Al-Dosari",
      sex: "Male",
      dob: "1955-05-18",
      diabetesType: "Type 2",
      diabetesDurationYears: 25,
      lastHbA1c: { value: 8.6, date: "2026-09-21" },
      allergies: [],
      riskHistory: { ...noHistory, neuropathy: true, cardiovascular: true, smoking: "current" },
      lops: true,
      pad: false,
      deformity: true,
      previousUlcer: { left: true, right: false },
      previousAmputation: null,
      iwgdfRisk: 3,
      activeProblem: null,
      careLevel: "secondary",
      lastVisit: "2026-09-21",
      nextReview: "2026-11-21",
      note: "Healed plantar ulcer, left 1st metatarsal head (2025). Custom insoles issued.",
    },
    {
      fileNumber: "N-DFIP-004587",
      nationalId: "1047890126",
      phone: "0576789016",
      name: "Huda Abdullah Al-Shehri",
      sex: "Female",
      dob: "1958-09-09",
      diabetesType: "Type 2",
      diabetesDurationYears: 22,
      lastHbA1c: { value: 7.1, date: "2026-09-25" },
      allergies: ["Vancomycin"],
      riskHistory: { ...noHistory, ckd: true, dialysis: true, retinopathy: true, neuropathy: true },
      lops: true,
      pad: false,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 3,
      activeProblem: null,
      careLevel: "secondary",
      lastVisit: "2026-09-25",
      nextReview: "2026-10-25",
      note: "End-stage renal disease on haemodialysis 3×/week. LOPS, no ulcer.",
    },
    {
      fileNumber: "N-DFIP-004633",
      nationalId: "1118901237",
      phone: "0507890127",
      name: "Reem Turki Al-Mutairi",
      sex: "Female",
      dob: "2000-12-05",
      diabetesType: "Type 1",
      diabetesDurationYears: 14,
      lastHbA1c: { value: 8.8, date: "2026-08-30" },
      allergies: [],
      riskHistory: { ...noHistory },
      lops: false,
      pad: false,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 0,
      activeProblem: null,
      careLevel: "secondary",
      lastVisit: "2026-08-30",
      nextReview: "2027-08-30",
      note: "Type 1 diabetes, annual screening in secondary care per MOH T1DM pathway.",
    },
    {
      fileNumber: "N-DFIP-004690",
      nationalId: "2129012348",
      phone: "0558901238",
      name: "Imran Yousef Siddiqui",
      sex: "Male",
      dob: "1966-04-11",
      diabetesType: "Type 2",
      diabetesDurationYears: 16,
      lastHbA1c: { value: 9.6, date: "2026-09-14" },
      allergies: [],
      riskHistory: { ...noHistory, neuropathy: true, pad: true, revascularisation: true, smoking: "former" },
      lops: true,
      pad: true,
      deformity: true,
      previousUlcer: { left: false, right: true },
      previousAmputation: { side: "right", level: "Minor — 2nd toe (digital)", date: "2025-11-03" },
      iwgdfRisk: 3,
      activeProblem: null,
      careLevel: "tertiary",
      lastVisit: "2026-09-14",
      nextReview: "2026-10-14",
      note: "Right 2nd toe amputation after osteomyelitis. Angioplasty right SFA 2025.",
    },
    {
      fileNumber: "N-DFIP-004742",
      nationalId: "1030123459",
      phone: "0539012349",
      name: "Mansour Ibrahim Al-Ghamdi",
      sex: "Male",
      dob: "1961-08-27",
      diabetesType: "Type 2",
      diabetesDurationYears: 19,
      lastHbA1c: { value: 10.2, date: "2026-09-28" },
      allergies: [],
      riskHistory: { ...noHistory, neuropathy: true, smoking: "current" },
      lops: true,
      pad: false,
      deformity: true,
      previousUlcer: { left: false, right: true },
      previousAmputation: null,
      iwgdfRisk: 3,
      activeProblem: {
        type: "ulcer",
        ulcers: [
          {
            site: "Plantar, right 1st metatarsal head",
            wagner: 2,
            infection: "IWGDF 2 · Mild",
            sizeCm: "2.1 × 1.6 × 0.4",
          },
        ],
      },
      careLevel: "secondary",
      lastVisit: "2026-09-28",
      nextReview: "2026-10-05",
      note: "Neuropathic ulcer, Wagner 2, mild infection. Oral antibiotics, offloading walker.",
    },
    {
      fileNumber: "N-DFIP-004801",
      nationalId: "1021234560",
      phone: "0560123450",
      name: "Latifa Hamad Al-Subaie",
      sex: "Female",
      dob: "1964-02-16",
      diabetesType: "Type 2",
      diabetesDurationYears: 21,
      lastHbA1c: { value: 8.4, date: "2026-10-01" },
      allergies: [],
      riskHistory: { ...noHistory, neuropathy: true },
      lops: true,
      pad: false,
      deformity: false,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: 2,
      activeProblem: {
        type: "suspected-charcot",
        detail: "Left foot warm and swollen, 3.1 °C warmer than right. Minimal pain.",
      },
      careLevel: "tertiary",
      lastVisit: "2026-10-01",
      nextReview: "2026-10-02",
      note: "Charcot red flags positive. Same-day referral to Center of Excellence.",
    },
    {
      fileNumber: "N-DFIP-004867",
      nationalId: "1012345671",
      phone: "0541234562",
      name: "Hassan Ali Al-Yami",
      sex: "Male",
      dob: "1952-10-08",
      diabetesType: "Type 2",
      diabetesDurationYears: 30,
      lastHbA1c: { value: 11.4, date: "2026-10-03" },
      allergies: ["Ciprofloxacin"],
      riskHistory: { ...noHistory, ckd: true, cardiovascular: true, pad: true, neuropathy: true, smoking: "former" },
      lops: true,
      pad: true,
      deformity: true,
      previousUlcer: { left: true, right: false },
      previousAmputation: null,
      iwgdfRisk: 3,
      activeProblem: {
        type: "acute-foot-attack",
        ulcers: [
          {
            site: "Dorsal, left forefoot",
            wagner: 4,
            infection: "IWGDF 4 · Severe",
            sizeCm: "4.5 × 3.0 × 1.2",
          },
        ],
        detail: "Fever 38.6 °C, HR 112. Cellulitis > 2 cm with toe gangrene.",
      },
      careLevel: "tertiary",
      lastVisit: "2026-10-03",
      nextReview: null,
      note: "Unstable diabetic foot. Sent to ER for admission and MDT review.",
    },
    {
      fileNumber: "N-DFIP-004912",
      nationalId: "2203456782",
      phone: "0572345673",
      name: "Maryam Joseph Thomas",
      sex: "Female",
      dob: "1979-06-19",
      diabetesType: "Type 2",
      diabetesDurationYears: 6,
      lastHbA1c: null,
      allergies: [],
      riskHistory: { ...noHistory },
      lops: null,
      pad: null,
      deformity: null,
      previousUlcer: { ...noEvents },
      previousAmputation: null,
      iwgdfRisk: null,
      activeProblem: null,
      careLevel: "primary",
      lastVisit: null,
      nextReview: null,
      note: "Registered, foot screening not yet done.",
    },
  ];

  // ---------- Search ----------

  const digits = (value) => value.replace(/\D/g, "");

  function normalizePhone(value) {
    let d = digits(value);
    if (d.startsWith("966")) d = "0" + d.slice(3); // +966 5x → 05x
    else if (d.startsWith("5")) d = "0" + d;
    return d;
  }

  // Returns { error } for bad input, or { results } (possibly empty).
  function search(type, rawQuery) {
    const query = rawQuery.trim();

    if (type === "fileNumber") {
      if (!query) return { error: "Enter a file number." };
      // Full number or its last digits (≥ 3) — no browsing the whole list by prefix
      const qDigits = digits(query);
      if (qDigits.length < 3) return { error: "Enter at least the last 3 digits of the file number." };
      return { results: records.filter((p) => digits(p.fileNumber).endsWith(qDigits)) };
    }

    if (type === "nationalId") {
      if (!query) return { error: "Enter a national ID." };
      const q = digits(query);
      if (!/^[12]\d{9}$/.test(q)) return { error: "National ID must be 10 digits starting with 1 or 2." };
      return { results: records.filter((p) => p.nationalId === q) };
    }

    if (type === "phone") {
      if (!query) return { error: "Enter a phone number." };
      const q = normalizePhone(query);
      if (!/^05\d{8}$/.test(q)) return { error: "Phone must look like 05XXXXXXXX or +966 5XXXXXXXX." };
      return { results: records.filter((p) => p.phone === q) };
    }

    return { error: "Choose what to search by." };
  }

  function byFileNumber(fileNumber) {
    return records.find((p) => p.fileNumber === fileNumber) || null;
  }

  function ageOn(dob, today = new Date()) {
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }

  return { RISK, ACTIVE_PROBLEM, CARE_LEVEL, all: records, search, byFileNumber, ageOn };
})();
