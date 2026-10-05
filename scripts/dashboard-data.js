// DEMO DATA for the dashboards: ~13 months of synthetic, encounter-level events built
// from a seeded PRNG, so numbers are stable across reloads and date filters behave
// like real data. Proportions are illustrative, loosely shaped on the source documents
// (IWGDF risk mix, ulcer and infection grades, referral pathway); they are not real.
// Patients are fictional. Every encounter belongs to one of the Diabetic Foot clinics in
// the demo organisation (org.js), so the dashboards can be filtered and scoped (UAT-01).
//
// Per encounter (s):
//   id, clinicId, practitionerId, nurseId, patient {name, fileNumber}
//   appointment {bookedBy, bookedAt, confirmed, source}
//   arrivedAt, sentAt (= at, nurse sends the screening), openedAt, signedAt
//   waitToOpen (h, sent -> opened), reviewTime (min, opened -> signed), turnaround (h, sent -> signed)
//   testsSuggested [{id, label, accepted, reason}], testsOrdered [label]
//   recs {total, overridden: [{title, reason}]}, alerts {urgent, attention, info}
//   referralSuggested {destination, urgency, made, reason}, referral (made, as before)
//   comment, treatments []

const DashboardData = (() => {
  // mulberry32: small seeded PRNG
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(20261004);
  const pick = (weights) => {
    let r = rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i;
    return weights.length - 1;
  };
  const between = (min, max) => min + rand() * (max - min);
  const choose = (arr) => arr[Math.floor(rand() * arr.length)];

  const DAY = 86400000;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const TODAY = startOfDay(new Date());
  const FIRST = new Date(TODAY.getTime() - 400 * DAY);
  const NOW = new Date();

  // ---------- Clinics, staff ----------
  // Staff ids match staff.js; the Dammam clinic has a locum not in the directory.
  const CLINICS = [
    { id: "cl-df-nrc", weight: 40, practitioners: ["100003", "100006"], nurses: ["100002", "200011"] },
    { id: "cl-df-krh", weight: 25, practitioners: ["200021", "100006"], nurses: ["200012"] },
    { id: "cl-df-jcc", weight: 22, practitioners: ["100005"], nurses: ["jcc-nurse"] },
    { id: "cl-df-dpc", weight: 13, practitioners: ["dpc-locum"], nurses: ["dpc-nurse"] },
  ];
  // People who only exist in the demo data
  const EXTRA_PEOPLE = {
    "dpc-locum": "Locum Practitioner (Dammam)",
    "jcc-nurse": "Clinic Nurse (Jeddah)",
    "dpc-nurse": "Clinic Nurse (Dammam)",
  };

  // ---------- Fixed lists ----------
  const FIRST_NAMES = ["Abdullah", "Mohammed", "Fahad", "Saad", "Khalid", "Ali", "Hassan", "Nasser", "Turki", "Majed", "Fatimah", "Noura", "Sara", "Huda", "Latifa", "Maha", "Reem", "Amal", "Hessa", "Mariam"];
  const FATHER_NAMES = ["Ibrahim", "Saleh", "Hamad", "Abdulaziz", "Yousef", "Omar", "Saeed", "Nasser", "Faisal", "Ahmed"];
  const FAMILY_NAMES = ["Al-Harbi", "Al-Shammari", "Al-Ghamdi", "Al-Zahrani", "Al-Qahtani", "Al-Mutairi", "Al-Dosari", "Al-Otaibi", "Al-Anazi", "Al-Shehri", "Al-Malki", "Al-Juhani"];

  const TESTS = [
    ["cbc", "CBC"], ["esr", "ESR"], ["crp", "CRP"], ["fbg", "Fasting blood glucose"], ["hba1c", "HbA1c"],
    ["renal", "Renal function (urea, creatinine, eGFR)"], ["wound-culture", "Wound culture (C&S)"],
    ["xray", "Foot X-ray"], ["abi", "Ankle-brachial index"], ["lipids", "Lipid profile"],
  ];
  const TEST_LABEL = Object.fromEntries(TESTS);
  const DISMISS_REASONS = ["Done recently elsewhere", "Not clinically indicated", "Patient declined", "Not available at this facility", "Insurance not approved"];
  const OVERRIDE_REASONS = ["Clinical examination differs", "Recent results not in the system", "Measurement error at screening", "Patient history changes the picture"];
  const REC_TITLES = ["LOPS", "PAD", "Deformity", "IWGDF risk category", "Screening interval", "Infection grade", "Wagner grade"];
  const MISSED_REASONS = ["Patient declined referral", "Already under a specialist", "Managed locally", null];
  const BOOKED_BY = [
    { type: "reception", name: "Reception desk" },
    { type: "practitioner", name: "Practitioner" },
    { type: "app", name: "Patient (mobile app)" },
    { type: "website", name: "Patient (website)" },
  ];

  const screenings = [];
  const ulcers = [];
  const referrals = [];
  const amputations = [];
  let seq = 0;

  for (let t = FIRST.getTime(); t <= TODAY.getTime(); t += DAY) {
    const day = new Date(t);
    const weekend = day.getDay() === 5 || day.getDay() === 6; // Friday / Saturday
    const progress = (t - FIRST.getTime()) / (TODAY.getTime() - FIRST.getTime()); // 0 → 1 over the year
    const count = weekend ? Math.round(between(0, 4)) : Math.round(between(14, 24) + progress * 5);

    for (let i = 0; i < count; i++) {
      const at = new Date(t + between(7.5, 15.5) * 3600000);
      if (at > NOW) continue; // today: only what has happened so far
      const clinic = CLINICS[pick(CLINICS.map((c) => c.weight))];
      const risk = pick([38, 24, 19, 19]);
      const lops = risk >= 1 && (risk >= 2 || rand() < 0.7);
      const pad = risk >= 1 && (!lops || (risk >= 2 && rand() < 0.45));
      const deformity = risk >= 2 && rand() < 0.55;
      const prevUlcer = risk === 3 && rand() < 0.7;
      const amputationHx = risk === 3 && rand() < 0.15;
      const dialysis = risk === 3 && rand() < 0.15;
      const hba1c = pick([32, 43, 25]); // 0: < 7 %, 1: 7–9 %, 2: > 9 %
      const charcot = risk >= 1 && rand() < 0.012;

      const ulcerP = [0.01, 0.04, 0.1, 0.3][risk];
      let ulcer = null;
      if (rand() < ulcerP) {
        const infection = 1 + pick([45, 30, 18, 7]);
        const wagner = 1 + pick([40, 30, 18, 10, 2]);
        ulcer = { at, clinicId: clinic.id, infection, wagner, unstable: infection >= 3 || wagner >= 3 };
        // Most heal within 4 months; slow healers close within 8
        ulcer.healedAt = new Date(at.getTime() + (rand() < 0.85 ? between(25, 120) : between(120, 240)) * DAY);
        ulcers.push(ulcer);
        if (wagner >= 4) {
          if (rand() < 0.3) amputations.push({ at: new Date(at.getTime() + between(3, 20) * DAY), level: "minor", clinicId: clinic.id });
          else if (rand() < 0.1) amputations.push({ at: new Date(at.getTime() + between(5, 30) * DAY), level: "major", clinicId: clinic.id });
        }
      }

      // Review: most are signed within hours; the last day or two still has a queue
      const ageHours = (TODAY.getTime() + DAY - at.getTime()) / 3600000;
      const turnaround = 1.5 + Math.exp(between(0, 3.6)); // ~2 h … ~38 h, median ~8 h
      const reviewed = turnaround < ageHours && rand() < 0.985;
      const corrections = pick([70, 20, 7, 3]);
      // Wait from the nurse sending to the practitioner opening, then time spent reviewing
      const reviewMin = Math.max(6, 18 - progress * 4 + between(-5, 8));
      const waitToOpen = reviewed ? Math.max(0.1, turnaround - reviewMin / 60 - between(0, turnaround * 0.15)) : null;
      const opened = !reviewed && rand() < 0.3 && ageHours < 24;
      const openedWait = opened ? Math.max(0.1, Math.min(ageHours - 0.2, between(0.2, 4))) : null;

      // Referral suggested by the rules (MoC segmentation, simplified); the practitioner makes most
      let suggestion = null;
      if (ulcer?.unstable || charcot) suggestion = { destination: ulcer?.infection === 4 ? "er" : "tertiary", urgency: ulcer?.infection === 4 ? "emergency" : "urgent", wait: between(0, 3) };
      else if (ulcer) suggestion = { destination: "tertiary", urgency: "urgent", wait: between(1, 6) };
      else if (pad && rand() < 0.25) suggestion = { destination: "vascular", urgency: "soon", wait: between(5, 21) };
      else if (risk === 3 && rand() < 0.6) suggestion = { destination: "secondary", urgency: "soon", wait: between(4, 14) };
      else if (risk === 2 && rand() < 0.4) suggestion = { destination: "secondary", urgency: "routine", wait: between(10, 35) };
      let referral = null;
      let referralSuggested = null;
      if (suggestion && reviewed) {
        const made = rand() < (suggestion.urgency === "routine" ? 0.8 : 0.92);
        referralSuggested = { destination: suggestion.destination, urgency: suggestion.urgency, made, reason: made ? null : choose(MISSED_REASONS) };
        if (made) {
          referral = { ...suggestion, clinicId: clinic.id };
          referral.at = new Date(at.getTime() + turnaround * 3600000);
          referral.apptAt = new Date(referral.at.getTime() + referral.wait * DAY);
          referral.status = referral.apptAt > TODAY ? "pending" : ["seen", "redirected", "dna"][pick([82, 6, 12])];
          referrals.push(referral);
        }
      }

      // Follow-up (interval by risk; urgent cases sooner)
      const followDays = ulcer ? 7 : [365, 270, 135, 60][risk];
      const followDue = new Date(at.getTime() + followDays * DAY);
      const followDone = followDue <= TODAY ? rand() < 0.79 - (ulcer ? 0 : 0.04) : null;

      // Tests suggested by the system; the practitioner accepts or dismisses each (UAT-24)
      const suggestedIds = ulcer
        ? ["cbc", "esr", "crp", "fbg", "hba1c", "renal", "wound-culture", ...(ulcer.wagner >= 3 ? ["xray"] : [])]
        : [...(rand() < 0.75 ? ["hba1c"] : []), ...(pad ? ["abi"] : []), ...(risk >= 2 && rand() < 0.4 ? ["renal"] : []), ...(rand() < 0.2 ? ["lipids"] : [])];
      const testsSuggested = reviewed
        ? suggestedIds.map((id) => {
            const accepted = rand() < 0.82;
            return { id, label: TEST_LABEL[id], accepted, reason: accepted ? null : DISMISS_REASONS[pick([34, 26, 14, 14, 12])] };
          })
        : [];
      const testsOrdered = [...testsSuggested.filter((x) => x.accepted).map((x) => x.label), ...(reviewed && rand() < 0.08 ? ["Lipid profile"] : [])];

      // Recommendations: per foot (LOPS, PAD, deformity), risk, interval, plus four per ulcer
      const recTotal = reviewed ? 8 + (ulcer ? 4 : 0) : 0;
      const overridden = [];
      for (let k = 0; k < recTotal; k++) if (rand() < 0.07) overridden.push({ title: REC_TITLES[k < 6 ? Math.floor(k / 2) : Math.min(k - 3, REC_TITLES.length - 1)], reason: choose(OVERRIDE_REASONS) });

      // Alerts raised at review, by level
      const alerts = {
        urgent: (charcot ? 1 : 0) + (ulcer?.unstable ? 1 : 0),
        attention: (ulcer ? 1 : 0) + (pad ? 1 : 0) + (hba1c === 2 ? 1 : 0) + (lops && rand() < 0.3 ? 1 : 0),
        info: pick([40, 35, 18, 7]),
      };

      const practitionerId = choose(clinic.practitioners);
      const nurseId = choose(clinic.nurses);
      const nursePrep = Math.max(6, 16 - progress * 3 + between(-3, 3));
      const arrivedAt = new Date(at.getTime() - (nursePrep + between(5, 50)) * 60000);
      const bookedBy = BOOKED_BY[pick([45, 25, 20, 10])];
      const source = rand() < 0.18 ? "referral" : "regular";

      const treatments = [];
      if (ulcer) treatments.push(choose(["Sharp debridement", "Dressing: hydrocolloid", "Dressing: silver alginate", "Dressing: foam"]), choose(["Offloading: total contact cast", "Offloading: removable walker", "Offloading: felted foam"]));
      if (ulcer && ulcer.infection >= 2) treatments.push(choose(["Amoxicillin-clavulanate 875/125 mg twice daily, 10 days", "Clindamycin 300 mg three times daily, 14 days", "Cefalexin 500 mg four times daily, 10 days"]));
      if (!ulcer && risk >= 2) treatments.push(choose(["Therapeutic footwear prescribed", "Custom insoles", "Callus care by podiatry"]));
      if (hba1c === 2) treatments.push("Diabetes treatment review requested");

      const comment = !reviewed
        ? null
        : ulcer
          ? `${ulcer.unstable ? "Limb-threatening ulcer" : "Ulcer"}, Wagner ${ulcer.wagner}, infection grade ${ulcer.infection}. ${referral ? "Referred as suggested." : "Managed in clinic."} Review in ${ulcer.infection >= 2 ? "48 hours" : "1 week"}.`
          : risk >= 2
            ? `IWGDF ${risk}. ${lops ? "Loss of protective sensation. " : ""}${pad ? "Signs of PAD. " : ""}Foot care education given${referral ? "; referred as suggested" : ""}.`
            : `IWGDF ${risk}. Feet intact. Education and leaflet given; routine recall.`;

      seq += 1;
      const signedAt = reviewed ? new Date(at.getTime() + turnaround * 3600000) : null;
      screenings.push({
        id: `S-${String(seq).padStart(6, "0")}`,
        clinicId: clinic.id, practitionerId, nurseId,
        patient: {
          name: `${choose(FIRST_NAMES)} ${choose(FATHER_NAMES)} ${choose(FAMILY_NAMES)}`,
          fileNumber: `N-DFIP-${String(100000 + Math.floor(rand() * 899999)).padStart(6, "0")}`,
        },
        appointment: { bookedBy, bookedAt: new Date(at.getTime() - between(1, 30) * DAY), confirmed: rand() < 0.93, source },
        at, sentAt: at, arrivedAt,
        openedAt: reviewed ? new Date(at.getTime() + waitToOpen * 3600000) : opened ? new Date(at.getTime() + openedWait * 3600000) : null,
        signedAt,
        waitToOpen: reviewed ? waitToOpen : openedWait,
        reviewTime: reviewed ? reviewMin : null,
        risk, lops, pad, deformity, prevUlcer, amputationHx, dialysis, hba1c, charcot, ulcer,
        reviewed, turnaround: reviewed ? turnaround : null, corrections,
        nursePrep,
        doctorDoc: Math.max(5, 13 - progress * 2.5 + between(-3, 3)),
        referral, referralSuggested, followDue, followDone,
        testsSuggested, testsOrdered,
        recs: { total: recTotal, overridden },
        alerts,
        comment, treatments,
      });
    }
  }

  // Display name for a person id (staff directory, else demo-only people)
  const personName = (id) => (typeof Staff !== "undefined" ? Staff.get(id)?.name : null) ?? EXTRA_PEOPLE[id] ?? id ?? "—";

  return {
    TODAY, FIRST, DAY, screenings, ulcers, referrals, amputations,
    CLINICS, TESTS, DISMISS_REASONS, OVERRIDE_REASONS, MISSED_REASONS, personName,
  };
})();
