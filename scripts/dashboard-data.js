// DEMO DATA for the dashboards: ~13 months of synthetic, encounter-level events built
// from a seeded PRNG, so numbers are stable across reloads and date filters behave
// like real data. Proportions are illustrative, loosely shaped on the source documents
// (IWGDF risk mix, ulcer and infection grades, referral pathway); they are not real.

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

  const DAY = 86400000;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const TODAY = startOfDay(new Date());
  const FIRST = new Date(TODAY.getTime() - 400 * DAY);

  const screenings = [];
  const ulcers = [];
  const referrals = [];
  const amputations = [];

  for (let t = FIRST.getTime(); t <= TODAY.getTime(); t += DAY) {
    const day = new Date(t);
    const weekend = day.getDay() === 5 || day.getDay() === 6; // Friday / Saturday
    const progress = (t - FIRST.getTime()) / (TODAY.getTime() - FIRST.getTime()); // 0 → 1 over the year
    const count = weekend ? Math.round(between(0, 3)) : Math.round(between(8, 15) + progress * 3);

    for (let i = 0; i < count; i++) {
      const at = new Date(t + between(7.5, 15.5) * 3600000);
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
        ulcer = { at, infection, wagner, unstable: infection >= 3 || wagner >= 3 };
        // Most heal within 4 months; slow healers close within 8
        ulcer.healedAt = new Date(at.getTime() + (rand() < 0.85 ? between(25, 120) : between(120, 240)) * DAY);
        ulcers.push(ulcer);
        if (wagner >= 4) {
          if (rand() < 0.3) amputations.push({ at: new Date(at.getTime() + between(3, 20) * DAY), level: "minor" });
          else if (rand() < 0.1) amputations.push({ at: new Date(at.getTime() + between(5, 30) * DAY), level: "major" });
        }
      }

      // Review: most are signed within hours; the last day or two still has a queue
      const ageHours = (TODAY.getTime() + DAY - at.getTime()) / 3600000;
      const turnaround = 1.5 + Math.exp(between(0, 3.6)); // ~2 h … ~38 h, median ~8 h
      const reviewed = turnaround < ageHours && rand() < 0.985;
      const corrections = pick([70, 20, 7, 3]);

      // Referral (MoC segmentation, simplified)
      let referral = null;
      if (ulcer?.unstable || charcot) referral = { destination: "tertiary", urgency: ulcer?.infection === 4 ? "emergency" : "urgent", wait: between(0, 3) };
      else if (ulcer && ulcer.infection >= 2) referral = { destination: "tertiary", urgency: "urgent", wait: between(1, 6) };
      else if (ulcer) referral = { destination: "wound-care", urgency: "soon", wait: between(3, 12) };
      else if (pad && rand() < 0.25) referral = { destination: "vascular", urgency: "soon", wait: between(5, 21) };
      else if (risk === 3 && rand() < 0.6) referral = { destination: "secondary", urgency: "soon", wait: between(4, 14) };
      else if (risk === 2 && rand() < 0.4) referral = { destination: "secondary", urgency: "routine", wait: between(10, 35) };
      if (referral && reviewed) {
        referral.at = new Date(at.getTime() + turnaround * 3600000);
        referral.apptAt = new Date(referral.at.getTime() + referral.wait * DAY);
        referral.status = referral.apptAt > TODAY ? "pending" : ["seen", "redirected", "dna"][pick([82, 6, 12])];
        referrals.push(referral);
      } else referral = null;

      // Follow-up (interval by risk; urgent cases sooner)
      const followDays = ulcer ? 7 : [365, 270, 135, 60][risk];
      const followDue = new Date(at.getTime() + followDays * DAY);
      const followDone = followDue <= TODAY ? rand() < 0.79 - (ulcer ? 0 : 0.04) : null;

      screenings.push({
        at, risk, lops, pad, deformity, prevUlcer, amputationHx, dialysis, hba1c, charcot, ulcer,
        reviewed, turnaround: reviewed ? turnaround : null, corrections,
        nursePrep: Math.max(6, 16 - progress * 3 + between(-3, 3)),
        doctorDoc: Math.max(5, 13 - progress * 2.5 + between(-3, 3)),
        referral, followDue, followDone,
      });
    }
  }

  return { TODAY, FIRST, DAY, screenings, ulcers, referrals, amputations };
})();
