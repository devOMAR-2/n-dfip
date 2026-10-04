// System suggestions for the practitioner review. Pure functions over field values.
// Every result is { value, reasons[], source } so the page can show *why*, and every
// suggestion is confirmed or overridden by the practitioner before sign-off.
//
// Sources: MOH Comprehensive Model of Care v1.0 (MoC), MOH Criteria for Diabetic Foot
// Emergency/Admission v1.0 (MOH-EC), "Diabetic Foot 102" teaching deck (DF102),
// N-DFIP Primary Care Screening Form (Form).
// Rules marked DRAFT are interpretations that need clinical sign-off.

const ClinicalRules = (() => {
  const SIDES = ["left", "right"];
  const SIDE_LABEL = { left: "Left", right: "Right" };

  // v(name) → string | string[] | undefined
  const num = (v, name) => {
    const raw = v(name);
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const list = (v, name) => [].concat(v(name) ?? []).filter((x) => x !== "none");

  // ---------- SIRS (IWGDF/IDSA severe infection; MOH-EC) ----------
  // DECISION: the 4 IWGDF items. WBC comes from practitioner lab entry.
  function sirs(v, labs = {}) {
    const items = [];
    const temp = num(v, "a.temp");
    const hr = num(v, "a.hr");
    const rr = num(v, "a.rr");
    const wbc = labs.wbc ?? null;
    if (temp !== null && (temp > 38 || temp < 36)) items.push(`Temperature ${temp} °C`);
    if (hr !== null && hr > 90) items.push(`Heart rate ${hr} bpm`);
    if (rr !== null && rr > 20) items.push(`Respiratory rate ${rr} /min`);
    if (wbc !== null && (wbc > 12 || wbc < 4)) items.push(`WBC ${wbc} ×10⁹/L`);
    return { count: items.length, items, source: "MOH-EC / IWGDF-IDSA" };
  }

  // ---------- Neuropathy: LOPS per foot ----------
  // MoC: LOPS = inability to sense the 10 g monofilament (tuning fork or light touch
  // when no monofilament). DRAFT: absent at any site, or absent vibration → LOPS.
  const SITE_LABEL = { hallux: "hallux", mth1: "1st metatarsal head", mth5: "5th metatarsal head" };

  function lops(v, side) {
    const sites = ["hallux", "mth1", "mth5"].map((s) => [s, v(`c.${side}.${s}`)]);
    const absent = sites.filter(([, val]) => val === "absent").map(([s]) => SITE_LABEL[s]);
    const vibration = v(`c.${side}.vibration`);
    const method = v("c.method") === "light-touch" ? "light touch" : "monofilament";
    const reasons = [];
    if (absent.length) reasons.push(`Not felt (${method}): ${absent.join(", ")}`);
    if (vibration === "absent") reasons.push("Tuning fork vibration absent");
    if (reasons.length) return { value: "yes", reasons, source: "MoC (draft rule)" };
    const allTested = sites.every(([, val]) => val === "detected");
    if (allTested) {
      return {
        value: "no",
        reasons: [`All sites felt (${method})`, vibration ? `Vibration ${vibration.replace("-", " ")}` : "Vibration not recorded"],
        source: "MoC (draft rule)",
      };
    }
    return { value: null, reasons: ["Some sites not assessed — cannot decide"], source: "MoC (draft rule)" };
  }

  // ---------- PAD per foot (MoC PAD assessment pathway) ----------
  // Confirmed: abnormal Doppler waveform, ABI < 0.9, ankle pressure < 50, TBI < 0.75,
  // toe pressure < 60, TcPO2 < 55. ABI > 1.3 = medial calcinosis, use other tests.
  // Non-palpable / equivocal pulse → bedside testing needed.
  function pad(v, side) {
    const s = (k) => num(v, `e.${side}.${k}`);
    const abi = s("abi");
    const tbi = s("tbi");
    const ankle = s("ankle");
    const toe = s("toe");
    const tcpo2 = s("tcpo2");
    const doppler = v(`d.${side}.doppler`);
    const dp = v(`d.${side}.dp`);
    const pt = v(`d.${side}.pt`);
    const abnormal = [];
    if (doppler === "mono") abnormal.push("Monophasic Doppler waveform");
    if (abi !== null && abi < 0.9) abnormal.push(`ABI ${abi} (< 0.9)`);
    if (ankle !== null && ankle < 50) abnormal.push(`Ankle pressure ${ankle} mmHg (< 50)`);
    if (tbi !== null && tbi < 0.75) abnormal.push(`TBI ${tbi} (< 0.75)`);
    if (toe !== null && toe < 60) abnormal.push(`Toe pressure ${toe} mmHg (< 60)`);
    if (tcpo2 !== null && tcpo2 < 55) abnormal.push(`TcPO₂ ${tcpo2} mmHg (< 55)`);
    if (abnormal.length) return { value: "yes", reasons: abnormal, source: "MoC PAD pathway" };

    const reasons = [];
    if (abi !== null && abi > 1.3) reasons.push(`ABI ${abi} (> 1.3): possible calcinosis, use TBI / TcPO₂`);
    const palpable = dp === "present" || pt === "present";
    const tested = [abi !== null && abi <= 1.3 && abi >= 0.9, tbi !== null, toe !== null, tcpo2 !== null, doppler === "tri" || doppler === "bi"].some(Boolean);
    if (tested && !reasons.length) {
      return { value: "no", reasons: ["Bedside tests within normal limits"], source: "MoC PAD pathway" };
    }
    if (palpable && !reasons.length) {
      return { value: "no", reasons: [`Pulses palpable (DP ${dp ?? "—"}, PT ${pt ?? "—"})`], source: "MoC PAD pathway" };
    }
    reasons.push(`Pulses not clearly palpable (DP ${dp ?? "—"}, PT ${pt ?? "—"}): Doppler / ABI / TBI needed`);
    if (v("d.claudication") === "yes") reasons.push("History of intermittent claudication");
    return { value: null, reasons, source: "MoC PAD pathway" };
  }

  // MoC (PAD with ulcer): urgent vascular referral thresholds
  function severeIschaemia(v, side) {
    const s = (k) => num(v, `e.${side}.${k}`);
    const items = [];
    if (s("abi") !== null && s("abi") < 0.5) items.push(`ABI ${s("abi")} (< 0.5)`);
    if (s("ankle") !== null && s("ankle") < 50) items.push(`Ankle pressure ${s("ankle")} mmHg (< 50)`);
    if (s("toe") !== null && s("toe") < 30) items.push(`Toe pressure ${s("toe")} mmHg (< 30)`);
    if (s("tcpo2") !== null && s("tcpo2") < 25) items.push(`TcPO₂ ${s("tcpo2")} mmHg (< 25)`);
    return items;
  }

  function deformity(v, side) {
    const found = list(v, `f.${side}.deformity`);
    return found.length
      ? { value: "yes", reasons: [`${found.length} finding${found.length === 1 ? "" : "s"} recorded`], source: "Form F" }
      : { value: "no", reasons: [v(`f.${side}.deformity`) ? "None recorded" : "Not recorded"], source: "Form F" };
  }

  // ---------- IWGDF risk category (MoC Table 1) ----------
  const RISK_INTERVAL = { 0: "Once a year", 1: "Every 6–12 months", 2: "Every 3–6 months", 3: "Every 1–3 months" };

  // DECISION: "end-stage renal disease" from the patient record's dialysis flag,
  // because the nurse checklist merges CKD and dialysis.
  function history(v, patient) {
    const items = [];
    for (const side of SIDES) {
      if (v(`i.${side}.ulcer`) === "yes") items.push(`Previous ulcer, ${side} foot`);
      if (["minor", "hindfoot", "major"].some((k) => v(`i.${side}.${k}`) === "yes")) items.push(`Previous amputation, ${side} foot`);
    }
    if (patient?.riskHistory?.dialysis) items.push("End-stage renal disease (on dialysis)");
    return items;
  }

  // inputs: booleans (or null when undecided) for the patient (either foot)
  function iwgdfRisk({ lops: hasLops, pad: hasPad, deformity: hasDeformity, history: hist }) {
    const source = "MoC Table 1 (IWGDF)";
    if (hasLops === null || hasPad === null) {
      return { value: null, reasons: ["Confirm LOPS and PAD for both feet first"], source };
    }
    const reasons = [`LOPS: ${hasLops ? "yes" : "no"}`, `PAD: ${hasPad ? "yes" : "no"}`];
    if (!hasLops && !hasPad) return { value: 0, reasons, source };
    if (hist.length) return { value: 3, reasons: [...reasons, ...hist], source };
    if ((hasLops && hasPad) || hasDeformity) {
      return { value: 2, reasons: [...reasons, ...(hasDeformity ? ["Foot deformity"] : [])], source };
    }
    return { value: 1, reasons, source };
  }

  // ---------- Wound classification (per ulcer) ----------
  const FOREFOOT = new Set(["hallux", "toe2", "toe3", "toe4", "toe5", "mth1", "mth2", "mth3", "mth4", "mth5"]);

  // w: practitioner wound evaluation for one ulcer
  // ctx: { sirsCount, lops (bool|null), pulsesPalpable (bool), ischaemiaGrade (0-3|null), zone }
  function infectionGrade(w, ctx) {
    const source = "IWGDF/IDSA (MOH-EC)";
    const signs = w.signs.filter((s) => s !== "none");
    const erythema = w.erythemaCm ?? 0;
    const deep = w.ptb === "yes" || w.exposed.some((e) => e !== "none") || w.osteomyelitis === "confirmed";
    const osteo = w.osteomyelitis === "confirmed" ? " (O)" : "";
    if (!w.signs.length) return { value: null, reasons: ["Record local infection signs"], source };
    if (signs.length < 2) {
      return { value: 1, label: "1 · Uninfected", reasons: [`${signs.length} local sign${signs.length === 1 ? "" : "s"} (needs 2 or more)`], source };
    }
    const reasons = [`${signs.length} local signs`];
    if (ctx.sirsCount >= 2) {
      return { value: 4, label: "4 · Severe" + osteo, reasons: [...reasons, `${ctx.sirsCount} SIRS signs`], source };
    }
    if (erythema >= 2 || deep) {
      if (erythema >= 2) reasons.push(`Erythema ${erythema} cm (≥ 2 cm)`);
      if (deep) reasons.push("Deeper tissue involved");
      return { value: 3, label: "3 · Moderate" + osteo, reasons, source };
    }
    return { value: 2, label: "2 · Mild", reasons: [...reasons, "Erythema < 2 cm, superficial"], source };
  }

  // DRAFT mapping from the form's fields to Wagner 1–5 (DF102 / MOH-EC grades).
  function wagner(w) {
    const source = "Wagner (DF102)";
    if (!w.gangrene || !w.exposed.length || !w.ptb) return { value: null, reasons: ["Record gangrene, exposed structures and probe-to-bone"], source };
    if (w.gangrene === "extensive") return { value: 5, reasons: ["Extensive gangrene"], source };
    if (w.gangrene === "localized") return { value: 4, reasons: ["Localized gangrene"], source };
    if (w.ptb === "yes" || w.exposed.includes("bone") || w.osteomyelitis !== "no") {
      return { value: 3, reasons: [w.ptb === "yes" ? "Probe-to-bone positive" : w.exposed.includes("bone") ? "Bone exposed" : "Osteomyelitis suspected / confirmed"], source };
    }
    if (w.exposed.some((e) => e === "tendon" || e === "joint")) return { value: 2, reasons: ["Deep: tendon or joint capsule exposed"], source };
    return { value: 1, reasons: ["Superficial ulcer"], source };
  }

  // SINBAD (DF102 / MoC minimum audit set)
  function sinbad(w, ctx, infection) {
    const source = "SINBAD (MoC / DF102)";
    if (!w.length || !w.width || !w.exposed.length || !w.ptb || infection.value === null || ctx.lops === null) {
      return { value: null, reasons: ["Needs size, depth, infection grade and LOPS"], source };
    }
    const parts = [
      ["Site", FOREFOOT.has(ctx.zone) ? 0 : 1, FOREFOOT.has(ctx.zone) ? "forefoot" : "mid/hindfoot"],
      ["Ischaemia", ctx.pulsesPalpable ? 0 : 1, ctx.pulsesPalpable ? "pulse palpable" : "no palpable pulse"],
      ["Neuropathy", ctx.lops ? 1 : 0, ctx.lops ? "LOPS" : "sensation intact"],
      ["Bacterial infection", infection.value >= 2 ? 1 : 0, infection.value >= 2 ? "infected" : "none"],
      ["Area", w.length * w.width >= 1 ? 1 : 0, `${(w.length * w.width).toFixed(1)} cm²`],
      ["Depth", w.ptb === "yes" || w.exposed.some((e) => e !== "none") ? 1 : 0, w.ptb === "yes" || w.exposed.some((e) => e !== "none") ? "tendon / deeper" : "skin / subcutaneous"],
    ];
    const total = parts.reduce((sum, [, p]) => sum + p, 0);
    const band = total <= 2 ? "mild" : total <= 4 ? "moderate" : "severe";
    return { value: total, label: `${total} / 6 · ${band}`, reasons: parts.map(([k, p, why]) => `${k} ${p} (${why})`), source };
  }

  // WIfI components (DF102). No combined stage table in the source documents.
  function ischaemiaGrade(v, side) {
    const s = (k) => num(v, `e.${side}.${k}`);
    const grades = [];
    const abi = s("abi");
    if (abi !== null && abi <= 1.3) grades.push(abi >= 0.8 ? 0 : abi >= 0.6 ? 1 : abi >= 0.4 ? 2 : 3);
    const ankle = s("ankle");
    if (ankle !== null) grades.push(ankle > 100 ? 0 : ankle >= 70 ? 1 : ankle >= 50 ? 2 : 3);
    for (const k of ["toe", "tcpo2"]) {
      const val = s(k);
      if (val !== null) grades.push(val >= 60 ? 0 : val >= 40 ? 1 : val >= 30 ? 2 : 3);
    }
    return grades.length ? Math.max(...grades) : null;
  }

  function wifi(w, ctx, infection) {
    const source = "WIfI components (DF102)";
    if (!w.gangrene || !w.exposed.length || infection.value === null) {
      return { value: null, reasons: ["Needs gangrene, exposed structures and infection grade"], source };
    }
    const W = w.gangrene === "extensive" ? 3 : w.gangrene === "localized" || w.exposed.some((e) => e !== "none") ? 2 : 1;
    const I = ctx.ischaemiaGrade;
    const fI = infection.value - 1;
    return {
      value: `W${W} I${I ?? "?"} fI${fI}`,
      reasons: [`Wound ${W}`, I === null ? "Ischaemia: no ABI / pressures recorded" : `Ischaemia ${I}`, `Foot infection ${fI}`],
      source,
    };
  }

  // ---------- Stable / unstable diabetic foot (MOH-EC grid) ----------
  function footStability({ ulcers, sirsCount, ischaemia }) {
    const source = "MOH-EC emergency criteria";
    const reasons = [];
    for (const u of ulcers) {
      if (u.wagner >= 3) reasons.push(`Ulcer ${u.n}: Wagner ${u.wagner}`);
      if (u.infection >= 3) reasons.push(`Ulcer ${u.n}: IWGDF infection grade ${u.infection}`);
      if ((u.erythemaCm ?? 0) > 2) reasons.push(`Ulcer ${u.n}: cellulitis > 2 cm`);
      if (u.ptb === "yes") reasons.push(`Ulcer ${u.n}: probes to bone`);
    }
    if (sirsCount >= 2) reasons.push(`${sirsCount} SIRS signs`);
    if (ischaemia) reasons.push("Ischaemia present");
    if (!ulcers.length && sirsCount < 2) return { value: null, reasons: [], source };
    return reasons.length ? { value: "unstable", reasons, source } : { value: "stable", reasons: ["No unstable criteria met"], source };
  }

  // ---------- Suggested tests (Form, after MOH Table 7) ----------
  function suggestedTests({ ulcers, sirsCount }) {
    if (!ulcers.length) return [];
    const tests = [
      ["cbc", "CBC"], ["esr", "ESR"], ["crp", "CRP"], ["fbg", "Fasting blood glucose"],
      ["hba1c", "HbA1c"], ["creatinine", "Serum creatinine"], ["wound-culture", "Wound culture (C&S)"],
    ].map(([value, label]) => ({ value, label, why: "Baseline for any ulcer" }));
    if (ulcers.some((u) => u.signCount === 1)) tests.push({ value: "procalcitonin", label: "Procalcitonin", why: "Local infection signs ambiguous" });
    if (ulcers.some((u) => u.ptb === "yes" || u.osteomyelitis !== "no")) tests.push({ value: "bone-culture", label: "Bone culture", why: "Probe-to-bone positive or osteomyelitis suspected" });
    if (ulcers.some((u) => u.infection === 4) || sirsCount >= 2) tests.push({ value: "blood-culture", label: "Blood cultures", why: "Severe infection" });
    return tests;
  }

  // ---------- Referral suggestion (MoC segmentation guide + MOH-EC) ----------
  function referral({ stability, sirsCount, charcot, severeIschaemia: severe, ulcers, risk }) {
    const source = "MoC patient segmentation / MOH-EC";
    if (sirsCount >= 2 || stability === "unstable") {
      return { needed: "yes", destination: "tertiary", urgency: "emergency", timing: "today", reasons: ["Acute foot attack / unstable foot: send to ER, MDT review"], source };
    }
    if (charcot) return { needed: "yes", destination: "tertiary", urgency: "urgent", timing: "today", reasons: ["Suspected Charcot: same-day referral to tertiary"], source };
    if (severe) return { needed: "yes", destination: "vascular", urgency: "urgent", timing: "24h", reasons: ["Severe ischaemia: urgent vascular referral"], source };
    if (ulcers.some((u) => u.infection >= 2)) {
      return { needed: "yes", destination: "tertiary", urgency: "urgent", timing: "today", reasons: ["Infected ulcer without systemic illness (active foot disease)"], source };
    }
    if (ulcers.length) return { needed: "yes", destination: "wound-care", urgency: "soon", timing: "week", reasons: ["Ulcer present: wound care within 1 week"], source };
    if (risk === 3) return { needed: "yes", destination: "secondary", urgency: "soon", timing: "week", reasons: ["IWGDF 3: secondary care within 1 week"], source };
    if (risk === 2) return { needed: "yes", destination: "secondary", urgency: "routine", timing: "scheduled", reasons: ["IWGDF 2: secondary care within 3 weeks"], source };
    if (risk === 0 || risk === 1) return { needed: "no", reasons: [`IWGDF ${risk}: continue screening in primary care`], source };
    return null;
  }

  // Follow-up interval suggestion (values match the plan's follow-up options)
  function followUp({ risk, ulcers, infected }) {
    if (infected) return { value: "48h", reasons: ["Infected ulcer: review within 48 h (MoC)"] };
    if (ulcers) return { value: "1w", reasons: ["Active ulcer: weekly review"] };
    const map = { 0: "12m", 1: "6-12m", 2: "3-6m", 3: "1-3m" };
    return risk === null || risk === undefined ? null : { value: map[risk], reasons: [`IWGDF ${risk}: ${RISK_INTERVAL[risk].toLowerCase()} (MoC Table 1)`] };
  }

  // ---------- Lab reference ranges (DF102) ----------
  const LABS = {
    wbc: { label: "WBC", unit: "×10⁹/L", low: 4.5, high: 11 },
    platelets: { label: "Platelets", unit: "×10⁹/L", low: 150, high: 400 },
    fbg: { label: "Fasting glucose", unit: "mg/dL", low: 70, high: 100 },
    hba1c: { label: "HbA1c", unit: "%", high: 7, highLabel: "Above target" },
    creatinine: { label: "Creatinine", unit: "µmol/L" },
    crp: { label: "CRP", unit: "mg/L", high: 10 },
    esr: { label: "ESR", unit: "mm/hr", high: 20 },
    procalcitonin: { label: "Procalcitonin", unit: "ng/mL", high: 0.1 },
    lactate: { label: "Lactate", unit: "mmol/L", high: 2 },
    albumin: { label: "Albumin", unit: "g/L", low: 35, high: 50 },
  };

  function labFlag(key, value) {
    const ref = LABS[key];
    if (!ref || value === null) return null;
    if (ref.high !== undefined && value > ref.high) return ref.highLabel ?? "High";
    if (ref.low !== undefined && value < ref.low) return "Low";
    return null;
  }

  return {
    SIDES, SIDE_LABEL, RISK_INTERVAL, LABS,
    sirs, lops, pad, severeIschaemia, deformity, history, iwgdfRisk,
    infectionGrade, wagner, sinbad, ischaemiaGrade, wifi, footStability,
    suggestedTests, referral, followUp, labFlag,
  };
})();
