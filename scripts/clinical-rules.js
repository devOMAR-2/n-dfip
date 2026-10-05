// Clinical rules for the diabetic foot clinic, as written in the N-DFIP Developer Handbook
// (Clinical Logic and Terminology), sections 5 to 8. Pure functions: findings in, results
// out, no storage or page code. Every result carries the reasons behind it.
//
// Thresholds live in RULESET (versioned), not in the code: the clinical lead approves a rule
// set, and a signed encounter stores the version it used (handbook section 10).
// "Not assessed" is never "normal": a missing value is null, and a comparison with null is
// false, so the rule moves on (handbook sections 1 and 10).
// Items marked (prototype) in the handbook still need the clinical lead's sign-off.

const ClinicalRules = (() => {
  const RULESET = {
    id: "df-rules",
    version: "1.0",
    source: "N-DFIP Developer Handbook, Clinical Logic and Terminology (Oct 2026)",
    approved: false, // clinical lead sign-off pending (handbook section 10, open points)
    t: {
      // Step 2: PAD per foot
      abiLow: 0.9, abiHigh: 1.3, anklePAD: 100 /* (prototype) */, tbiLow: 0.75, toePAD: 60, tcpo2PAD: 55,
      abiCritical: 0.5, ankleCritical: 50, toeCritical: 30, tcpo2Critical: 25,
      // Step 4
      charcotTempDiff: 2.0, sirsTempHigh: 38, sirsTempLow: 36, sirsHr: 90, sirsRr: 20, sirsWbcHigh: 12, sirsWbcLow: 4,
      // Section 6
      erythemaModerate: 2, sinbadArea: 1, wifiLargeArea: 10, nonHealingWeeks: 4, nonHealingChange: -50,
      // Section 8 alerts (all need clinical sign-off)
      glucoseLow: 70, glucoseHigh: 300, sbpLow: 100, hba1cPoor: 9, albuminLow: 35, hbLow: 10, egfrLow: 60,
      creatinineHigh: 1.35, esrOsteo: 70, areaOsteo: 2, depthOsteo: 0.3, areaLarge: 4, painInsensate: 6,
      crtSlow: 3, worseningChange: 20, lactateHigh: 2, painNeuropathy: 7,
      // Section 7 teams
      hba1cDiabetologist: 8, hba1cDietician: 9, egfrNephrology: 30,
    },
  };
  const T = RULESET.t;
  const SIDES = ["left", "right"];
  const SIDE_LABEL = { left: "Left", right: "Right" };
  const SOURCE = "Handbook";

  // ---------- Value helpers ----------
  const numOf = (raw) => {
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const num = (v, name) => numOf(v(name));
  const list = (v, name) => [].concat(v(name) ?? []).filter((x) => x && x !== "none");
  const has = (v, name, value) => list(v, name).includes(value);
  const lt = (a, b) => a !== null && a < b;
  const gt = (a, b) => a !== null && a > b;
  const gte = (a, b) => a !== null && a >= b;
  const plural = (n, w) => `${n} ${n === 1 ? w : w + "s"}`;

  // ---------- Step 4: SIRS ----------
  function sirs(v, labs = {}) {
    const items = [];
    const temp = num(v, "a.temp");
    const hr = num(v, "a.hr");
    const rr = num(v, "a.rr");
    const wbc = labs.wbc ?? null;
    if (gt(temp, T.sirsTempHigh) || lt(temp, T.sirsTempLow)) items.push(`Temperature ${temp} °C`);
    if (gt(hr, T.sirsHr)) items.push(`Heart rate ${hr} bpm`);
    if (gt(rr, T.sirsRr)) items.push(`Respiratory rate ${rr} /min`);
    if (gt(wbc, T.sirsWbcHigh) || lt(wbc, T.sirsWbcLow)) items.push(`WBC ${wbc} ×10⁹/L`);
    return { count: items.length, items, positive: items.length >= 2, source: `${SOURCE} §5 step 4` };
  }

  // ---------- Step 1: LOPS per foot ----------
  const SITE_LABEL = { hallux: "hallux", mth1: "1st metatarsal head", mth5: "5th metatarsal head" };

  function lops(v, side) {
    const source = `${SOURCE} §5 step 1`;
    const sites = ["hallux", "mth1", "mth5"].map((s) => [s, v(`c.${side}.${s}`)]);
    const absent = sites.filter(([, val]) => val === "absent").map(([s]) => SITE_LABEL[s]);
    const fork = v(`c.${side}.vibration`);
    const method = v("c.method") === "light-touch" ? "light touch" : "monofilament";
    const reasons = [];
    if (absent.length) reasons.push(`Not felt (${method}): ${absent.join(", ")}`);
    if (fork === "absent") reasons.push("Tuning fork: absent");
    if (reasons.length) return { value: "yes", reasons, source };
    if (sites.every(([, val]) => val === "detected")) {
      return { value: "no", reasons: [`All 3 sites felt (${method})`, `Tuning fork: ${fork ? fork.replace("-", " ") : "not recorded"}`], source };
    }
    return { value: null, reasons: ["Some sites not assessed: can't decide (not assessed is never normal)"], source };
  }

  // ---------- Step 2: PAD per foot ----------
  function perfusion(v, side) {
    const s = (k) => num(v, `e.${side}.${k}`);
    return { abi: s("abi"), tbi: s("tbi"), ankle: s("ankle"), toe: s("toe"), tcpo2: s("tcpo2"), doppler: v(`d.${side}.doppler`), dp: v(`d.${side}.dp`), pt: v(`d.${side}.pt`) };
  }

  function pad(v, side) {
    const source = `${SOURCE} §5 step 2`;
    const p = perfusion(v, side);
    const abnormal = [];
    if (p.doppler === "mono") abnormal.push("Monophasic Doppler waveform");
    if (lt(p.abi, T.abiLow)) abnormal.push(`ABI ${p.abi} (< ${T.abiLow})`);
    if (lt(p.ankle, T.anklePAD)) abnormal.push(`Ankle pressure ${p.ankle} mmHg (< ${T.anklePAD}, prototype threshold)`);
    if (lt(p.tbi, T.tbiLow)) abnormal.push(`TBI ${p.tbi} (< ${T.tbiLow})`);
    if (lt(p.toe, T.toePAD)) abnormal.push(`Toe pressure ${p.toe} mmHg (< ${T.toePAD})`);
    if (lt(p.tcpo2, T.tcpo2PAD)) abnormal.push(`TcPO₂ ${p.tcpo2} mmHg (< ${T.tcpo2PAD})`);
    if (p.dp === "absent" && p.pt === "absent") abnormal.push("Both foot pulses absent");
    const calcification = gt(p.abi, T.abiHigh) && p.tbi === null && p.toe === null && p.tcpo2 === null;
    if (abnormal.length) return { value: "yes", reasons: abnormal, source, calcification };
    const reasons = [];
    if (calcification) reasons.push(`ABI ${p.abi} (> ${T.abiHigh}): possible arterial calcification, use TBI or toe pressure. An ABI above 1.30 is unreliable, not good.`);
    const measured = [p.abi !== null && p.abi <= T.abiHigh, p.tbi !== null, p.toe !== null, p.tcpo2 !== null, p.ankle !== null, p.doppler === "tri" || p.doppler === "bi"].some(Boolean);
    const pulses = [p.dp, p.pt].some((x) => x === "present" || x === "weak");
    if (measured || pulses) return { value: "no", reasons: [...reasons, measured ? "Measurements within limits" : `Pulses: DP ${p.dp ?? "—"}, PT ${p.pt ?? "—"}`], source, calcification };
    return { value: null, reasons: [...reasons, "No pulses or perfusion values recorded"], source, calcification };
  }

  function critical(v, side) {
    const p = perfusion(v, side);
    const items = [];
    if (lt(p.abi, T.abiCritical)) items.push(`ABI ${p.abi} (< ${T.abiCritical})`);
    if (lt(p.ankle, T.ankleCritical)) items.push(`Ankle pressure ${p.ankle} mmHg (< ${T.ankleCritical})`);
    if (lt(p.toe, T.toeCritical)) items.push(`Toe pressure ${p.toe} mmHg (< ${T.toeCritical})`);
    if (lt(p.tcpo2, T.tcpo2Critical)) items.push(`TcPO₂ ${p.tcpo2} mmHg (< ${T.tcpo2Critical})`);
    return items;
  }
  // Older name used by pages
  const severeIschaemia = critical;

  // ---------- Step 3: supporting flags ----------
  const DEFORMITY = ["claw-toes", "hammer-toes", "prominent-mth", "hallux-valgus"];

  function deformity(v, side) {
    const source = `${SOURCE} §5 step 3`;
    const found = list(v, `f.${side}.deformity`).filter((d) => DEFORMITY.includes(d));
    const shape = has(v, `h.${side}.flags`, "shape");
    const reasons = [...found.map((d) => d.replace("-", " ").replace("mth", "MTH")), ...(shape ? ["Change in foot shape (Charcot red flag)"] : [])];
    if (reasons.length) return { value: "yes", reasons, source };
    return { value: v(`f.${side}.deformity`) ? "no" : null, reasons: [v(`f.${side}.deformity`) ? "No claw or hammer toes, prominent MTH or hallux valgus" : "Not recorded"], source };
  }

  function history(v, patient) {
    const h = list(v, "b.history");
    const rh = patient?.riskHistory ?? {};
    const ulcerHx = SIDES.some((s) => v(`i.${s}.ulcer`) === "yes");
    const ampHx = SIDES.some((s) => ["minor", "hindfoot", "major"].some((k) => v(`i.${s}.${k}`) === "yes"));
    const ESRD = h.includes("dialysis") || !!rh.dialysis;
    const CKD = ESRD || h.includes("ckd") || !!rh.ckd;
    const items = [];
    if (ulcerHx) items.push("Previous ulcer");
    if (ampHx) items.push("Previous amputation");
    if (ESRD) items.push("Dialysis or end-stage renal disease");
    return { ulcerHx, ampHx, ESRD, CKD, padHx: h.includes("pad") || !!rh.pad || !!rh.revascularisation, prevCharcot: h.includes("previous-charcot"), immuno: h.includes("immunosuppression") || !!rh.immunosuppression, poorVision: h.includes("poor-vision") || !!rh.poorVisionOrSelfCare, items };
  }

  // ---------- Step 4: Charcot flag ----------
  const INFLAMMATORY = ["warmth", "swelling", "redness"];
  function charcot(v) {
    const source = `${SOURCE} §5 step 4`;
    const tr = num(v, "h.right.temp");
    const tl = num(v, "h.left.temp");
    const tempDiff = tr !== null && tl !== null ? Math.round(Math.abs(tr - tl) * 10) / 10 : null;
    const reasons = [];
    const sides = [];
    for (const s of SIDES) {
      const flags = list(v, `h.${s}.flags`);
      if (flags.length >= 2 && flags.some((f) => INFLAMMATORY.includes(f))) {
        reasons.push(`${SIDE_LABEL[s]} foot: ${flags.length} red flags including ${flags.filter((f) => INFLAMMATORY.includes(f)).join(", ")}`);
        sides.push(s);
      }
    }
    if (gt(tempDiff, T.charcotTempDiff)) {
      reasons.push(`Skin temperature differs by ${tempDiff} °C (> ${T.charcotTempDiff})`);
      const warmer = tr > tl ? "right" : "left";
      if (!sides.includes(warmer)) sides.push(warmer);
    }
    const redFlagCount = Math.max(...SIDES.map((s) => list(v, `h.${s}.flags`).length));
    return { flag: reasons.length > 0, reasons, sides, tempDiff, redFlagCount, source };
  }

  // ---------- Step 5: IWGDF risk category ----------
  const RISK_INTERVAL = { 0: "Once a year", 1: "Every 6–12 months", 2: "Every 3–6 months", 3: "Every 1–3 months" };

  function iwgdfRisk({ lops: anyLOPS, pad: anyPAD, deformity: def, history: hist }) {
    const source = `${SOURCE} §5 step 5 (IWGDF)`;
    if (anyLOPS === null || anyPAD === null) return { value: null, reasons: ["Confirm LOPS and PAD for both feet first"], source };
    const reasons = [`LOPS: ${anyLOPS ? "yes" : "no"}`, `PAD: ${anyPAD ? "yes" : "no"}`];
    let category = 0;
    if (anyLOPS || anyPAD) {
      category = 1;
      if ((anyLOPS && anyPAD) || def) {
        category = 2;
        if (def) reasons.push("Foot deformity");
      }
      if (hist.ulcerHx || hist.ampHx || hist.ESRD) {
        category = 3;
        reasons.push(...hist.items);
      }
    } else if (def) reasons.push("Deformity alone, without LOPS or PAD, stays category 0");
    return { value: category, reasons, source };
  }

  // ---------- Step 6: MOH segment ----------
  const SEGMENTS = {
    0: { name: "Low risk", action: "Annual foot review and education.", referral: { needed: "no" }, recall: "Annual review" },
    1: { name: "Moderate risk", action: "Refer to secondary care within 3 weeks. Recall in 3 to 6 months.", referral: { needed: "yes", destination: "secondary", urgency: "routine", timing: "3weeks" }, recall: "3 to 6 months" },
    2: { name: "High risk", action: "Refer to secondary care within 1 week. Recall in 1 to 2 months.", referral: { needed: "yes", destination: "secondary", urgency: "soon", timing: "week" }, recall: "1 to 2 months" },
    3: { name: "Active foot disease", action: "Same-day referral to the tertiary care unit. Recall in 1 to 2 months.", referral: { needed: "yes", destination: "tertiary", urgency: "urgent", timing: "today" }, recall: "1 to 2 months" },
    4: { name: "Acute foot attack", action: "Send directly to the Emergency Department.", referral: { needed: "yes", destination: "er", urgency: "emergency", timing: "today" }, recall: "After discharge" },
  };

  function segment(x) {
    const source = `${SOURCE} §5 step 6 (MOH segmentation, MoC p.91)`;
    const out = (value, reasons) => ({ value, ...SEGMENTS[value], tier: SEGMENTS[value].name, reasons, source });
    if (x.activeUlcer) {
      const acute = [];
      for (const u of x.ulcers) {
        if (u.infection >= 2) acute.push(`Ulcer ${u.n}: ${INFECTION[u.infection]} infection`);
        if (u.gangrene) acute.push(`Ulcer ${u.n}: gangrene`);
        if (u.abscess) acute.push(`Ulcer ${u.n}: abscess`);
        if (u.osteoConfirmed) acute.push(`Ulcer ${u.n}: confirmed bone infection`);
        if (u.critical) acute.push(`Ulcer ${u.n}: critical perfusion on that foot`);
      }
      if (x.unwell) acute.push("Patient looks unwell");
      if (acute.length) return out(4, acute);
    }
    if (x.activeUlcer || x.charcotFlag) return out(3, [...(x.activeUlcer ? [`${plural(x.ulcers.length, "active ulcer")} (any active ulcer counts, prototype)`] : []), ...(x.charcotFlag ? ["Suspected Charcot foot"] : [])]);
    const high = [];
    if (x.anyLOPS && x.anyPAD) high.push("LOPS and PAD");
    if ((x.anyLOPS || x.anyPAD) && (x.callus || x.deformity)) high.push(`${x.anyLOPS ? "LOPS" : "PAD"} with ${x.callus ? "callus" : "deformity"}`);
    if (x.ulcerHx) high.push("Previous ulcer");
    if (x.ampHx) high.push("Previous amputation");
    if (x.ESRD) high.push("Dialysis or end-stage renal disease");
    if (high.length) return out(2, high);
    const moderate = [];
    if (x.anyLOPS) moderate.push("LOPS");
    if (x.anyPAD) moderate.push("PAD");
    if (x.deformity) moderate.push("Deformity");
    if (x.skinOther) moderate.push("Dry skin, fissures or nail changes");
    if (x.CKD) moderate.push("Chronic kidney disease (prototype: CKD without dialysis counts here)");
    if (moderate.length) return out(1, moderate);
    return out(0, ["None of the risk factors"]);
  }

  // ---------- Section 6: wound logic, per ulcer ----------
  const FOREFOOT = new Set(["hallux", "toe2", "toe3", "toe4", "toe5", "mth1", "mth2", "mth3", "mth4", "mth5"]);
  const INFECTION = { 0: "Uninfected", 1: "Mild", 2: "Moderate", 3: "Severe" };
  // Older saves used "localized" / "extensive"
  const gangreneOf = (g) => ({ localized: "digits", extensive: "whole" })[g] ?? g ?? null;

  // w: practitioner evaluation of one ulcer (see review.js woundInput)
  function woundHelpers(w) {
    const signs = (w.signs ?? []).filter((s) => s !== "none").length;
    const reaches = (w.exposed ?? []).some((e) => e !== "none") || w.ptb === "yes" || w.osteomyelitis === "confirmed";
    const abscess = w.abscess === "yes";
    const deep = reaches || abscess;
    const area = w.length !== null && w.width !== null && w.length !== undefined && w.width !== undefined ? Math.round(w.length * w.width * 100) / 100 : null;
    const change = area !== null && numOf(w.prevArea) ? Math.round(((area - w.prevArea) / w.prevArea) * 1000) / 10 : null;
    const gangrene = gangreneOf(w.gangrene);
    return { signs, reaches, abscess, deep, area, change, gangrene: gangrene && gangrene !== "none" ? gangrene : null };
  }

  function infectionGrade(w, ctx) {
    const source = `${SOURCE} §6 (IWGDF/IDSA)`;
    if (!w.signs?.length) return { value: null, reasons: ["Record the local infection signs"], source };
    const h = woundHelpers(w);
    const osteo = w.osteomyelitis === "confirmed";
    if (h.signs >= 2 || h.abscess || osteo) {
      const why = [h.signs >= 2 ? `${h.signs} local signs` : null, h.abscess ? "abscess" : null, osteo ? "osteomyelitis confirmed" : null].filter(Boolean);
      const suffix = osteo ? " (O)" : "";
      if (ctx.sirs) return { value: 3, label: `Severe${suffix}`, reasons: [...why, "SIRS present"], source };
      if (gte(w.erythemaCm, T.erythemaModerate) || h.deep) {
        return { value: 2, label: `Moderate${suffix}`, reasons: [...why, gte(w.erythemaCm, T.erythemaModerate) ? `Erythema ${w.erythemaCm} cm (≥ ${T.erythemaModerate})` : "Deeper tissue involved"], source };
      }
      return { value: 1, label: "Mild", reasons: [...why, "Erythema under 2 cm, superficial"], source };
    }
    return { value: 0, label: "Uninfected", reasons: [`${plural(h.signs, "local sign")} (needs 2 or more)`, "Antibiotics are not indicated"], source };
  }

  function wagner(w) {
    const source = `${SOURCE} §6 (Wagner)`;
    if (!w.gangrene || !w.abscess || !w.exposed?.length || !w.ptb) return { value: null, reasons: ["Record gangrene, abscess, exposed structures and probe-to-bone"], source };
    const h = woundHelpers(w);
    if (h.gangrene === "whole") return { value: 5, reasons: ["Gangrene of the whole foot"], source };
    if (h.gangrene) return { value: 4, reasons: [`Gangrene (${h.gangrene === "digits" ? "limited to digits" : "forefoot or midfoot"})`], source };
    if (h.abscess || w.osteomyelitis === "confirmed") return { value: 3, reasons: [h.abscess ? "Abscess" : "Osteomyelitis confirmed"], source };
    if ((w.exposed ?? []).some((e) => e !== "none") || w.ptb === "yes") return { value: 2, reasons: [w.ptb === "yes" ? "Probe-to-bone positive" : "Exposed structure"], source };
    return { value: 1, reasons: ["Superficial ulcer"], source };
  }

  function sinbad(w, ctx, infection) {
    const source = `${SOURCE} §6 (SINBAD)`;
    const h = woundHelpers(w);
    if (h.area === null || !w.exposed?.length || !w.ptb || infection.value === null || infection.value === undefined || ctx.lops === null) {
      return { value: null, reasons: ["Needs size, depth, infection and LOPS"], source };
    }
    const forefoot = FOREFOOT.has(ctx.zone);
    const parts = [
      ["Site", forefoot ? 0 : 1, forefoot ? "forefoot" : "midfoot, heel or ankle"],
      ["Ischaemia", ctx.pulsePresent ? 0 : 1, ctx.pulsePresent ? "a pulse is present" : "neither DP nor PT present"],
      ["Neuropathy", ctx.lops ? 1 : 0, ctx.lops ? "LOPS on that foot" : "sensation intact"],
      ["Bacterial infection", infection.value >= 1 ? 1 : 0, INFECTION[infection.value].toLowerCase()],
      ["Area", h.area >= T.sinbadArea ? 1 : 0, `${h.area} cm²`],
      ["Depth", h.reaches ? 1 : 0, h.reaches ? "reaches deeper structures" : "superficial"],
    ];
    const total = parts.reduce((s, [, p]) => s + p, 0);
    const band = total <= 2 ? "mild" : total <= 4 ? "moderate" : "severe";
    return { value: total, label: `${total} / 6 · ${band}`, reasons: parts.map(([k, p, why]) => `${k} ${p} (${why})`), source };
  }

  // WIfI ischaemia grade for a foot: worst grade across the values that exist
  function ischaemiaGrade(v, side) {
    const p = perfusion(v, side);
    const grades = [];
    if (p.abi !== null && p.abi <= T.abiHigh) grades.push(p.abi >= 0.8 ? 0 : p.abi >= 0.6 ? 1 : p.abi >= 0.4 ? 2 : 3);
    if (p.ankle !== null) grades.push(p.ankle > 100 ? 0 : p.ankle >= 70 ? 1 : p.ankle >= 50 ? 2 : 3);
    for (const val of [p.toe, p.tcpo2]) if (val !== null) grades.push(val >= 60 ? 0 : val >= 40 ? 1 : val >= 30 ? 2 : 3);
    if (grades.length) return { value: Math.max(...grades), estimated: false };
    // (prototype) estimate from bedside signs, flagged as estimated
    if (p.doppler === "mono" || (p.dp === "absent" && p.pt === "absent")) return { value: 2, estimated: true };
    if (p.doppler === "bi" || [p.dp, p.pt].some((x) => x && x !== "present" && x !== "not-assessed")) return { value: 1, estimated: true };
    if (p.dp || p.pt || p.doppler) return { value: 0, estimated: true };
    return { value: null, estimated: true };
  }

  // TABLE[I][W] = [fI0, fI1, fI2, fI3] (handbook section 6)
  const WIFI_TABLE = [
    [[1, 1, 2, 3], [1, 1, 2, 3], [2, 2, 3, 4], [3, 3, 4, 4]],
    [[1, 2, 3, 4], [1, 2, 3, 4], [3, 3, 4, 4], [4, 4, 4, 4]],
    [[2, 2, 3, 4], [2, 3, 4, 4], [3, 4, 4, 4], [4, 4, 4, 4]],
    [[2, 3, 3, 4], [3, 3, 4, 4], [4, 4, 4, 4], [4, 4, 4, 4]],
  ];

  function wifiW(w, zone) {
    const h = woundHelpers(w);
    const heel = zone === "heel";
    let W = 1;
    if (h.reaches || h.gangrene === "digits" || heel) W = 2;
    if (h.gangrene === "forefoot" || h.gangrene === "whole" || (h.reaches && (heel || gte(h.area, T.wifiLargeArea)))) W = 3;
    return W;
  }

  // fI is the highest infection severity among the ulcers on the same foot
  function wifi(w, ctx, fI) {
    const source = `${SOURCE} §6 (WIfI)`;
    if (!w.gangrene || !w.exposed?.length || fI === null || fI === undefined) return { value: null, reasons: ["Needs gangrene, exposed structures and infection"], source };
    const W = wifiW(w, ctx.zone);
    const I = ctx.ischaemia?.value;
    if (I === null || I === undefined) return { value: null, W, fI, reasons: [`W${W}`, "Ischaemia: no pulses or perfusion values on that foot", `fI${fI}`], source };
    const stage = WIFI_TABLE[I][W][fI];
    return {
      value: stage, W, I, fI, estimated: ctx.ischaemia.estimated,
      label: `Stage ${stage} · W${W} I${I}${ctx.ischaemia.estimated ? " (estimated)" : ""} fI${fI}`,
      reasons: [`Wound ${W}`, `Ischaemia ${I}${ctx.ischaemia.estimated ? " (estimated from pulses / Doppler, prototype)" : ""}`, `Foot infection ${fI}`, "Stage 4 is the highest amputation risk"],
      source,
    };
  }

  function healing(w) {
    const h = woundHelpers(w);
    const weeks = numOf(w.weeksCare);
    const nonHealing = gte(weeks, T.nonHealingWeeks) && h.change !== null && h.change > T.nonHealingChange;
    return { area: h.area, change: h.change, nonHealing };
  }

  function suggestedType(lopsSide, padSide) {
    if (lopsSide && padSide) return "neuroischaemic";
    if (padSide) return "ischaemic";
    if (lopsSide) return "neuropathic";
    return null;
  }

  function offloadingSuggestion({ aspect, zone, fI, I }) {
    if (aspect && aspect !== "plantar") return "Removable device, medical footwear, felted foam or orthoses";
    if (zone === "heel") return "Non-removable knee-high device, or another heel-offloading method";
    if (fI === 3 || I === 3 || (fI === 2 && I === 2)) return "Treat infection and ischaemia first, then a removable knee-high device";
    if (fI === 2 || I === 2 || (fI === 1 && I === 1)) return "Removable knee-high device";
    return "Non-removable knee-high device (total contact cast)";
  }

  function dressingSuggestion({ infection, tissue = [], exudate, padSide }) {
    const highExudate = exudate === "moderate" || exudate === "high";
    if (infection >= 1) return "Cleansing, antimicrobial dressing, exudate and odour control";
    if (tissue.includes("necrosis") && padSide) return "Do not debride. Keep dry. Refer for vascular assessment.";
    if (tissue.includes("necrosis")) return "Debridement, hydrogel or honey, film as secondary";
    if (tissue.includes("slough")) return highExudate ? "Absorbent alginate or foam" : "Hydrogel or honey with film";
    if (tissue.includes("granulation")) return highExudate ? "Absorbent alginate or foam" : "Hydrogel or low-adherent silicone";
    if (tissue.includes("epithelialising")) return "Thin hydrocolloid, film or low-adherent silicone";
    return null;
  }

  // ---------- Section 7: suggestions ----------
  const BASELINE = [["cbc", "CBC"], ["esr", "ESR"], ["crp", "CRP"], ["fbg", "Fasting blood glucose"], ["hba1c", "HbA1c"], ["creatinine", "Renal function (urea, creatinine, eGFR)"], ["wound-culture", "Wound culture (C&S)"]];

  // catalog: optional active tests [{id, label, baseline}] from Clinic setup (only those are suggested)
  function suggestedTests(x, catalog = null) {
    const out = [];
    const add = (value, label, why) => {
      if (out.some((t) => t.value === value)) return;
      if (catalog && !catalog.some((t) => t.id === value)) return;
      out.push({ value, label: catalog?.find((t) => t.id === value)?.label ?? label, why });
    };
    if (x.activeUlcer) {
      const panel = catalog ? catalog.filter((t) => t.baseline).map((t) => [t.id, t.label]) : BASELINE;
      for (const [id, label] of panel) add(id, label, "Baseline panel for an active ulcer");
    }
    if (x.ulcers.some((u) => u.signs === 1)) add("procalcitonin", "Procalcitonin", "An ulcer has exactly 1 local infection sign (ambiguous)");
    if (x.maxSev >= 2 || x.seriousIndicators) add("electrolytes", "Electrolytes", x.maxSev >= 2 ? "Moderate or severe infection" : "Indicator of serious infection");
    if (x.maxSev === 3 || x.unwell) {
      const why = x.maxSev === 3 ? "Severe infection" : "Patient looks unwell";
      add("lactate", "Lactate", why);
      add("deep-tissue-culture", "Deep tissue culture", why);
      add("blood-culture", "Blood cultures", why);
    }
    if (x.ulcers.some((u) => u.nonHealing || u.onset === "gt3m")) add("albumin", "Albumin", "Ulcer not healing, or present over 3 months");
    if (x.ulcers.some((u) => u.ptb || u.exposedBone || u.osteoConfirmed)) add("bone-culture", "Bone culture", "Probe-to-bone positive, exposed bone or confirmed osteomyelitis");
    if (x.ulcers.some((u) => u.ptb || u.exposed || u.abscess || u.infection === 3)) add("xray-foot", "Plain X-ray of the foot", "Probe-to-bone, exposed structure, abscess or severe infection");
    if (x.charcotFlag) add("wb-xray", "Weight-bearing X-ray, foot and ankle", "Suspected Charcot foot");
    if (x.charcotFlag && x.xrayNormal) add("mri-foot", "MRI of the foot", "Suspected Charcot foot with a normal X-ray");
    return out;
  }

  // Older name kept for pages that only need the referral part
  const referral = (seg) => (seg ? { ...seg.referral, tier: seg.name, reasons: [...seg.reasons, seg.action], source: seg.source } : null);

  function followUp({ segment: seg, risk }) {
    const map = { 0: "12m", 1: "6-12m", 2: "3-6m", 3: "1-3m" };
    if (seg === null || seg === undefined) return null;
    if (seg >= 2) return { value: "1-2m", reasons: [`${SEGMENTS[seg].name}: every 1 to 2 months`] };
    if (seg === 1) return { value: "3-6m", reasons: ["Moderate risk: every 3 to 6 months"] };
    if (risk === null || risk === undefined) return null;
    return { value: map[risk], reasons: [`Low risk: the IWGDF interval for category ${risk} (${RISK_INTERVAL[risk].toLowerCase()})`] };
  }

  function disposition(x) {
    if (x.sepsis || x.deepInfection || (x.limbIschaemia && x.maxSev >= 1) || (x.activeUlcer && x.unwell)) return { value: "emergency", label: "Emergency department and admission today" };
    if (x.maxSev >= 2 || x.seriousIndicators || x.limbIschaemia) return { value: "admission", label: "Admission to be considered, specialist review today" };
    if (x.segment >= 3) return { value: "tertiary", label: "Same-day referral to the tertiary foot service, outpatient" };
    if (x.segment === 2) return { value: "secondary-1w", label: "Secondary care referral within 1 week" };
    if (x.segment === 1) return { value: "secondary-3w", label: "Secondary care referral within 3 weeks" };
    return { value: "primary", label: "Routine primary care follow-up" };
  }

  function teams(x) {
    const out = [];
    const add = (team, why) => out.push({ team, why });
    if (x.sepsis || x.deepInfection || x.anyGangrene || x.osteoConfirmed) add("Surgery", "Sepsis, deep infection, gangrene or confirmed osteomyelitis");
    if (x.padOnUlcerFoot || x.limbIschaemia || x.restPain) add("Vascular surgery", "PAD on an ulcer's foot, limb ischaemia or rest pain");
    if (x.maxSev >= 2 || x.osteoLikely) add("Infectious disease", "Moderate or severe infection, or osteomyelitis likely");
    if (x.activeUlcer || gte(x.hba1c, T.hba1cDiabetologist)) add("Diabetologist", x.activeUlcer ? "Active ulcer" : `HbA1c ${x.hba1c}%`);
    if (x.activeUlcer) add("Wound-care nursing", "Active ulcer");
    if (x.activeUlcer || x.footwearNo || x.deformity) add("Orthotics and footwear", "Active ulcer, footwear not appropriate, or deformity");
    if (lt(x.albumin, T.albuminLow) || gte(x.hba1c, T.hba1cDietician)) add("Dietician", "Albumin under 35 g/L or HbA1c 9% or more");
    if (x.charcotFlag || x.ampHx) add("Physiotherapy", "Suspected Charcot foot or previous amputation");
    if (x.ESRD || lt(x.egfr, T.egfrNephrology)) add("Nephrology", "Dialysis / end-stage renal disease, or eGFR under 30");
    if (x.livesAlone && (x.activeUlcer || x.category >= 2)) add("Social worker", "Lives alone with an active ulcer or IWGDF 2 or more");
    return out;
  }

  // ---------- Section 8: clinical alerts ----------
  const LEVEL = { critical: "Act now", warning: "Check", info: "Note" };
  const BETA_LACTAM = /cillin|cef|ceph|penem|clav|tazobactam|sulbactam/i;

  function alerts(x) {
    const out = [];
    const add = (level, title, reason, action) => out.push({ level, label: LEVEL[level], title, reason, action });
    const U = (u) => `Ulcer ${u.n} (${u.side} ${u.zoneLabel})`;

    // Critical
    if (x.sepsis) add("critical", "Possible sepsis from a foot infection", `Active ulcer with ${x.maxSev === 3 ? "severe infection" : x.lactateHigh ? "lactate 2 or more" : "the patient unwell or with low blood pressure"}.`, "Emergency department and admission today. Blood cultures and lactate.");
    if (x.activeUlcer && x.unwell && !x.sepsis) add("critical", "Patient looks unwell with an active ulcer", "General appearance recorded as unwell.", "Assess for systemic infection now.");
    for (const u of x.ulcers) {
      if (u.abscess || (u.gangrene && u.infection >= 1)) add("critical", "Limb-threatening deep infection", `${U(u)}: ${u.abscess ? "abscess" : "wet gangrene (gangrene with infection)"}.`, "Urgent surgical review and drainage or debridement.");
      if (u.gangrene && u.infection === 0 && u.pad) add("critical", "Dry gangrene on an ischaemic foot", `${U(u)}: gangrene without infection, PAD on that foot.`, "Do not debride. Keep dry. Urgent vascular referral.");
      if (u.critical) add("critical", "Chronic limb-threatening ischaemia", `${U(u)}: ${u.criticalReasons.join(", ")}.`, "Urgent vascular referral.");
    }
    const warmFoot = x.charcot.tempDiff !== null && x.charcot.tempDiff > T.charcotTempDiff && x.charcot.redFlagCount < 2 && x.maxSev >= 1;
    if (x.charcotFlag && !warmFoot) add("critical", "Suspected active Charcot foot", x.charcot.reasons.join("; ") + ".", "Immobilise the foot and refer the same day. Weight-bearing X-ray.");
    if (x.restPain) add(x.anyPAD ? "critical" : "warning", "Rest pain", x.anyPAD ? "Rest pain with PAD." : "Rest pain recorded, PAD not confirmed.", "Vascular assessment.");
    if (x.allergyBetaLactam && BETA_LACTAM.test(x.antibioticText ?? "")) add("critical", "Antibiotic conflicts with the recorded allergy", `Beta-lactam allergy recorded; prescribed: "${x.antibioticText}".`, "Choose another antibiotic.");
    if (lt(x.glucose, T.glucoseLow)) add("critical", "Hypoglycaemia", `Capillary glucose ${x.glucose} mg/dL.`, "Treat hypoglycaemia now.");
    if (gte(x.glucose, T.glucoseHigh)) add(x.maxSev >= 1 ? "critical" : "warning", x.maxSev >= 1 ? "Marked hyperglycaemia with infection" : "Marked hyperglycaemia", `Capillary glucose ${x.glucose} mg/dL.`, "Check ketones and review glycaemic control.");

    // Warning
    for (const u of x.ulcers) {
      if (u.gangrene && u.infection === 0 && !u.pad) add("warning", "Gangrene without proven PAD", `${U(u)}: gangrene, no infection, PAD not shown on that foot.`, "Perfusion studies.");
      if (u.pad && !u.critical && u.infection >= 1) add("warning", "PAD, ulcer and infection together", `${U(u)}.`, "Vascular and infection plans together.");
      if (u.wifiStage === 4) add("warning", "WIfI stage 4", `${U(u)}: highest amputation risk.`, "Multidisciplinary review.");
      if ((u.ptb || u.exposedBone) && !u.osteoConfirmed) add("warning", "Osteomyelitis likely", `${U(u)}: ${u.ptb ? "probe-to-bone positive" : "bone exposed"}, not yet confirmed.`, "X-ray, bone culture; consider MRI.");
      else if (gt(x.esr, T.esrOsteo) || (gte(u.area, T.areaOsteo) && gte(u.depth, T.depthOsteo) && ["1-3m", "gt3m"].includes(u.onset))) add("warning", "Osteomyelitis possible", `${U(u)}: ${gt(x.esr, T.esrOsteo) ? `ESR ${x.esr}` : "large, deep ulcer present over a month"}.`, "Probe-to-bone and X-ray.");
      if (u.lops && u.aspect === "plantar") add("warning", gte(u.area, T.areaLarge) ? "Large plantar ulcer on an insensate foot" : "Plantar ulcer on an insensate foot", `${U(u)}.`, "Offload the ulcer.");
      if (u.lops && gte(u.pain, T.painInsensate)) add("warning", "Unexpected pain in an insensate foot", `${U(u)}: pain ${u.pain}/10.`, "Look for deep infection or Charcot.");
      if (u.nonHealing) add("warning", "Not healing", `${U(u)}: area shrank by less than half after 4 or more weeks.`, "Reassess perfusion, infection and offloading.");
      if (u.progression === "worsening" || gt(u.change, T.worseningChange)) add("warning", "Getting worse", `${U(u)}: ${u.progression === "worsening" ? "recorded as worsening" : `area up ${u.change}%`}.`, "Reassess today.");
      if (u.cast && (u.fI >= 2 || u.I >= 2)) add("warning", "Total contact cast not advised", `${U(u)}: infection or ischaemia grade 2 or more.`, "Use a removable device.");
      if (u.cast && x.mobility && x.mobility !== "independent") add("warning", "Fall risk with a non-removable cast", `${U(u)}: mobility ${x.mobility.replace("-", " ")}.`, "Consider a removable device.");
      if (u.sharp && (u.critical || (u.necrosis && u.pad))) add("warning", "Sharp debridement on an ischaemic foot", `${U(u)}.`, "Vascular assessment before sharp debridement.");
    }
    if (warmFoot) add("warning", "Warm foot with an infected ulcer", `Temperature difference ${x.charcot.tempDiff} °C with fewer than 2 red flags and an infected ulcer.`, "Likely infection rather than Charcot; reassess.");
    for (const f of x.feet) {
      if (f.calcification) add("warning", "ABI not reliable", `${SIDE_LABEL[f.side]} foot: ABI above 1.30 and no TBI, toe pressure or TcPO₂.`, "Measure TBI or toe pressure.");
      if (f.abi !== null && f.abi >= T.abiLow && f.abi <= T.abiHigh && f.toe === null && f.tbi === null && (f.doppler === "mono" || f.bothAbsent)) add("warning", "ABI and bedside signs disagree", `${SIDE_LABEL[f.side]} foot: ABI ${f.abi} with ${f.doppler === "mono" ? "monophasic Doppler" : "both pulses absent"}.`, "Measure TBI or toe pressure.");
      if (!f.anyValue && (f.skinSigns >= 2 || gt(f.crt, T.crtSlow))) add("warning", "Signs of poor perfusion without measurements", `${SIDE_LABEL[f.side]} foot: ${f.skinSigns >= 2 ? `${f.skinSigns} skin signs` : `capillary refill ${f.crt} s`}.`, "Record ABI, TBI or toe pressure.");
      if (!f.hasUlcer && f.callus && f.lops) add("warning", "Pre-ulcerative callus on an insensate foot", `${SIDE_LABEL[f.side]} foot.`, "Callus care and offloading footwear.");
      if (f.preUlcer) add(f.lops || f.pad ? "warning" : "info", "Pre-ulcerative lesion", `${SIDE_LABEL[f.side]} foot: ${f.preUlcer}.`, "Treat the lesion and protect the foot.");
      if (f.nailChanges && (f.lops || f.pad)) add("info", "Nail care", `${SIDE_LABEL[f.side]} foot: nail changes with ${f.lops ? "LOPS" : "PAD"}.`, "Professional nail care.");
      for (const k of f.fissureFindings) add("info", k === "maceration" ? "Interdigital maceration" : "Fissures", `${SIDE_LABEL[f.side]} foot.`, "Skin care.");
    }
    if ((x.claudication || x.restPain) && !x.feet.some((f) => f.anyValue)) add("warning", "Ischaemic symptoms without perfusion measurements", "Claudication or rest pain, and no perfusion value on either foot.", "Record ABI, TBI or toe pressure.");
    if (x.antibioticText && x.activeUlcer && x.maxSev === 0) add("warning", "Antibiotic recorded for an uninfected ulcer", "Infection severity is Uninfected.", "Antibiotics are not indicated for an uninfected ulcer.");
    if (x.maxSev >= 1 && (lt(x.egfr, T.egfrLow) || gt(x.creatinine, T.creatinineHigh) || x.CKD)) add("warning", "Adjust antibiotics for renal function", "Infection with reduced kidney function.", "Check doses against eGFR.");
    if (gte(x.hba1c, T.hba1cPoor)) add("warning", "Poor glycaemic control", `HbA1c ${x.hba1c}%.`, "Diabetologist review.");
    if (x.activeUlcer && (lt(x.albumin, T.albuminLow) || lt(x.hb, T.hbLow))) add("warning", "Nutrition or anaemia may delay healing", [lt(x.albumin, T.albuminLow) ? `Albumin ${x.albumin} g/L` : null, lt(x.hb, T.hbLow) ? `Haemoglobin ${x.hb} g/dL` : null].filter(Boolean).join(", ") + ".", "Dietician; check iron and nutrition.");
    if (x.immuno && x.activeUlcer) add("warning", "Immunosuppressed patient", "Signs of infection may be muted.", "Lower threshold for investigation.");
    if (x.smokingCurrent && (x.anyPAD || x.activeUlcer)) add("warning", "Current smoker", "Smoking with PAD or an active ulcer.", "Smoking cessation support.");
    if (x.footwearNo && (x.anyLOPS || x.anyPAD || x.deformity)) add("warning", "Inappropriate footwear on an at-risk foot", "Footwear not appropriate for the foot's risk.", "Footwear advice or referral to orthotics.");
    if (!x.activeUlcer && x.ulcerHx) add("warning", "Healed ulcer, foot in remission", "Previous ulcer, none active now.", "Remission care: footwear, regular review.");

    // Info
    for (const u of x.ulcers) {
      if (u.aspect === "plantar" && !u.lops && !u.offloadingChosen) add("info", "No offloading recorded", `${U(u)}: plantar ulcer.`, "Choose an offloading method.");
      if (u.exudateType === "purulent" && !u.purulentTicked) add("info", "Check the infection signs", `${U(u)}: purulent exudate, but "purulent discharge" isn't ticked.`, "Review the local signs.");
      if (u.odour && u.infection === 0) add("info", "Malodour without infection signs", `${U(u)}.`, "Look again for infection.");
      if (u.sharesTotal !== null && u.sharesTotal !== 100) add("info", "Tissue shares do not add up to 100%", `${U(u)}: ${u.sharesTotal}%.`, "Correct the tissue shares.");
      if (u.type && u.suggestedType && u.type !== u.suggestedType) add("info", "Ulcer type differs from the findings", `${U(u)}: recorded ${u.type.replace("neuroischaemic", "neuro-ischaemic")}, findings suggest ${u.suggestedType.replace("neuroischaemic", "neuro-ischaemic")}.`, "Check the ulcer type.");
      if (u.onset === "gt3m" && u.progression !== "improving") add("info", "Long-standing ulcer", `${U(u)}: over 3 months, not improving.`, "Review the care plan.");
      if (x.anticoagulant && u.sharp) add("info", "Bleeding risk with sharp debridement", `${U(u)}: on an anticoagulant.`, "Plan haemostasis.");
    }
    if (x.maxSev >= 1 && !x.antibioticText) add("info", "No antibiotic recorded", "An ulcer is infected.", "Record the antibiotic plan.");
    if (x.anyPAD && !(x.meds.includes("antiplatelet") && x.meds.includes("statin"))) add("info", "PAD without full cardiovascular prevention", `Medications lack ${["antiplatelet", "statin"].filter((m) => !x.meds.includes(m)).join(" and ")}.`, "Review cardiovascular prevention.");
    if (x.prevCharcot && !x.charcotFlag) add("info", "Previous Charcot foot", "Recorded in the history.", "Protective footwear and regular review.");
    if (x.ampHx) add("info", "Previous amputation", "Recorded in the history.", "Protect the remaining foot.");
    if ((x.poorVision || x.livesAlone || x.mobility === "wheelchair") && (x.activeUlcer || x.category >= 2)) add("info", "Limited self-care", "Poor vision, lives alone or uses a wheelchair.", "Involve a carer or community nursing.");
    if (x.ulcers.length >= 2) add("info", "More than one ulcer", `${x.ulcers.length} ulcers.`, "Plan care for each ulcer.");
    if (x.painfulNeuropathy) add("info", "Painful neuropathy", `Neuropathic pain severity ${x.symptomSeverity}/10.`, "Consider neuropathic pain treatment.");
    if (x.lopsBoth) add("info", "Loss of sensation in both feet", "LOPS left and right.", "Daily foot checks and education.");

    const order = { critical: 0, warning: 1, info: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  }

  // Nurse page, before sending: "Tell the practitioner now" (handbook section 8)
  function nurseAlerts(v) {
    const out = [];
    const unwell = v("a.appearance") === "unwell";
    const ulcers = v("j.count") && v("j.count") !== "0";
    const abnormalVitals = [gt(num(v, "a.temp"), T.sirsTempHigh) || lt(num(v, "a.temp"), T.sirsTempLow), gt(num(v, "a.hr"), T.sirsHr), gt(num(v, "a.rr"), T.sirsRr), lt(num(v, "a.sbp"), T.sbpLow)].filter(Boolean).length;
    const restPainNoPulses = v("d.restpain") === "yes" && SIDES.some((s) => v(`d.${s}.dp`) === "absent" && v(`d.${s}.pt`) === "absent");
    if (unwell) out.push("The patient looks unwell");
    if (ulcers && abnormalVitals >= 2) out.push(`An ulcer with ${abnormalVitals} abnormal vital signs`);
    if (restPainNoPulses) out.push("Rest pain with both pulses absent on a foot");
    const ch = charcot(v);
    return { now: out, charcot: ch.flag ? ch.reasons : [] };
  }

  // ---------- Everything at once ----------
  // input: { v, patient, labs, decided: {lops,pad,deformity: {left,right}}, ulcers: [...], prac: {...}, catalog }
  function evaluate(input) {
    const { v, patient, labs = {}, decided = {}, prac = {} } = input;
    const s = sirs(v, labs);
    const hist = history(v, patient);
    const ch = charcot(v);
    const val = (kind, side, sys) => {
      const d = decided[kind]?.[side];
      return d === undefined || d === null ? sys.value : d;
    };
    const feet = SIDES.map((side) => {
      const L = lops(v, side);
      const P = pad(v, side);
      const D = deformity(v, side);
      const p = perfusion(v, side);
      const skin = list(v, `f.${side}.skin`);
      const nails = list(v, `g.${side}.nails`);
      return {
        side, lopsSys: L, padSys: P, deformitySys: D,
        lops: val("lops", side, L) === "yes", pad: val("pad", side, P) === "yes", deformity: val("deformity", side, D) === "yes",
        lopsKnown: val("lops", side, L) !== null, padKnown: val("pad", side, P) !== null,
        critical: critical(v, side), calcification: P.calcification, ischaemia: ischaemiaGrade(v, side),
        abi: p.abi, tbi: p.tbi, toe: p.toe, doppler: p.doppler, bothAbsent: p.dp === "absent" && p.pt === "absent",
        pulsePresent: p.dp === "present" || p.pt === "present",
        anyValue: [p.abi, p.tbi, p.ankle, p.toe, p.tcpo2].some((x) => x !== null),
        skinSigns: list(v, `d.${side}.skin`).length, crt: num(v, `d.${side}.crt`),
        callus: skin.includes("callus"),
        preUlcer: [skin.includes("blister") && "blister", skin.includes("haemorrhage") && "haemorrhage under callus", nails.includes("ingrown") && "ingrown nail"].filter(Boolean).join(", "),
        nailChanges: nails.some((n) => n !== "ingrown"),
        fissureFindings: [skin.includes("fissures") && "fissures", skin.includes("maceration") && "maceration"].filter(Boolean),
        skinOther: skin.some((k) => k === "dry" || k === "fissures") || nails.some((n) => n !== "ingrown"),
        hasUlcer: false,
      };
    });
    const foot = (side) => feet.find((f) => f.side === side);
    const anyLOPS = feet.some((f) => f.lops);
    const anyPAD = feet.some((f) => f.pad) || hist.padHx;
    const def = feet.some((f) => f.deformity) || hist.prevCharcot;
    const lopsKnown = feet.every((f) => f.lopsKnown) || anyLOPS;
    const padKnown = feet.every((f) => f.padKnown) || anyPAD;
    const risk = iwgdfRisk({ lops: lopsKnown ? anyLOPS : null, pad: padKnown ? anyPAD : null, deformity: def, history: hist });

    // Ulcers: grades use the practitioner's decision where there is one
    const ulcers = (input.ulcers ?? []).map((u) => {
      const f = u.side ? foot(u.side) : null;
      if (f) f.hasUlcer = true;
      const w = u.w;
      const h = woundHelpers(w);
      const ctx = { sirs: s.positive, zone: u.zone, lops: f ? (f.lopsKnown ? f.lops : null) : null, pulsePresent: f?.pulsePresent ?? false, ischaemia: f?.ischaemia ?? { value: null } };
      const infSys = infectionGrade(w, ctx);
      const infection = u.decided?.infection ?? infSys.value;
      return { u, f, w, h, ctx, infSys, infection };
    });
    for (const x of ulcers) {
      x.fI = Math.max(...ulcers.filter((y) => y.u.side === x.u.side).map((y) => y.infection ?? -1));
      if (x.fI < 0) x.fI = null;
      x.wagSys = wagner(x.w);
      x.sinSys = sinbad(x.w, x.ctx, { value: x.infection });
      x.wifiSys = wifi(x.w, x.ctx, x.fI);
      x.heal = healing(x.w);
    }
    const ulcerFacts = ulcers.map((x) => ({
      n: x.u.n, side: x.u.side, zone: x.u.zone, zoneLabel: x.u.zoneLabel ?? x.u.zone ?? "", aspect: x.u.aspect,
      signs: x.h.signs, infection: x.infection ?? 0, gangrene: !!x.h.gangrene, abscess: x.h.abscess,
      osteoConfirmed: x.w.osteomyelitis === "confirmed", ptb: x.w.ptb === "yes", exposedBone: (x.w.exposed ?? []).includes("bone"),
      exposed: (x.w.exposed ?? []).some((e) => e !== "none"), critical: !!x.f?.critical.length, criticalReasons: x.f?.critical ?? [],
      pad: !!x.f?.pad, lops: !!x.f?.lops, area: x.heal.area, change: x.heal.change, nonHealing: x.heal.nonHealing,
      depth: numOf(x.w.depth), onset: x.w.onset, progression: x.w.progression, pain: numOf(x.w.pain),
      wifiStage: x.u.decided?.wifi ?? x.wifiSys.value, fI: x.fI, I: x.f?.ischaemia?.value ?? null,
      cast: x.w.offloading === "tcc", sharp: x.w.debridement === "sharp", necrosis: (x.w.tissue ?? []).includes("necrosis"),
      offloadingChosen: !!x.w.offloading && x.w.offloading !== "none", exudateType: x.w.exudateType, odour: x.w.odour === "yes",
      purulentTicked: (x.w.signs ?? []).includes("purulent"),
      sharesTotal: x.w.shares && Object.values(x.w.shares).some((n) => n !== null) ? Object.values(x.w.shares).reduce((a, n) => a + (n ?? 0), 0) : null,
      type: x.w.type, suggestedType: suggestedType(!!x.f?.lops, !!x.f?.pad),
    }));
    const maxSev = ulcerFacts.length ? Math.max(...ulcerFacts.map((u) => u.infection)) : 0;
    const activeUlcer = ulcerFacts.length > 0;
    const unwell = v("a.appearance") === "unwell";
    const lowBP = lt(num(v, "a.sbp"), T.sbpLow);
    const lactate = labs.lactate ?? null;
    const sepsis = activeUlcer && (maxSev === 3 || ((unwell || lowBP) && maxSev >= 1) || (gte(lactate, T.lactateHigh) && maxSev >= 1));
    const deepInfection = ulcerFacts.some((u) => u.abscess || (u.gangrene && u.infection >= 1));
    const limbIschaemia = ulcerFacts.some((u) => u.critical);
    const flags = {
      deformity: def, callus: feet.some((f) => f.callus), skinOther: feet.some((f) => f.skinOther),
      ulcerHx: hist.ulcerHx, ampHx: hist.ampHx, ESRD: hist.ESRD, CKD: hist.CKD,
    };
    const seg = segment({ activeUlcer, ulcers: ulcerFacts, unwell, charcotFlag: ch.flag, anyLOPS, anyPAD, ...flags });
    const decidedRisk = input.decidedRisk ?? risk.value;
    const ctx = {
      ...flags, activeUlcer, ulcers: ulcerFacts, unwell, lowBP, sepsis, deepInfection, limbIschaemia, maxSev,
      charcot: ch, charcotFlag: ch.flag, anyLOPS, anyPAD, segment: seg.value, category: decidedRisk,
      feet, restPain: v("d.restpain") === "yes", claudication: v("d.claudication") === "yes",
      glucose: num(v, "a.glucose"), mobility: v("a.mobility") ?? null, livesAlone: v("a.support") === "lives-alone",
      meds: list(v, "b.meds"), anticoagulant: has(v, "b.meds", "anticoagulant"),
      allergyBetaLactam: v("b.allergy") === "beta-lactam" || (patient?.allergies ?? []).some((a) => /penicillin|cephalosporin|beta/i.test(a)),
      antibioticText: [prac.antibioticAgent, prac.antibiotics && prac.antibiotics !== "none" ? prac.antibiotics : null].filter(Boolean).join(" ").trim() || null,
      seriousIndicators: (prac.serious ?? []).filter((x) => x !== "none").length > 0, xrayNormal: prac.xray === "normal",
      smokingCurrent: v("b.smoking") === "current", footwearNo: v("g.footwear") === "no",
      immuno: hist.immuno, poorVision: hist.poorVision, prevCharcot: hist.prevCharcot,
      painfulNeuropathy: list(v, "c.symptoms").some((x) => ["burning", "electric", "allodynia"].includes(x)) && gte(num(v, "c.severity"), T.painNeuropathy),
      symptomSeverity: num(v, "c.severity"), lopsBoth: feet.every((f) => f.lops),
      esr: labs.esr ?? null, egfr: labs.egfr ?? null, creatinine: labs.creatinine ?? null, hba1c: labs.hba1c ?? null, albumin: labs.albumin ?? null, hb: labs.hb ?? null,
      lactateHigh: gte(lactate, T.lactateHigh), anyGangrene: ulcerFacts.some((u) => u.gangrene), osteoConfirmed: ulcerFacts.some((u) => u.osteoConfirmed),
      osteoLikely: ulcerFacts.some((u) => u.ptb || u.exposedBone), padOnUlcerFoot: ulcerFacts.some((u) => u.pad),
    };
    return {
      ruleset: { id: RULESET.id, version: RULESET.version, approved: RULESET.approved },
      sirs: s, history: hist, charcot: ch, feet, anyLOPS, anyPAD, deformity: def, flags, risk, segment: seg,
      ulcers: ulcers.map((x, i) => ({
        ...ulcerFacts[i], infectionSys: x.infSys, wagnerSys: x.wagSys, sinbadSys: x.sinSys, wifiSys: x.wifiSys,
        offloading: offloadingSuggestion({ aspect: x.u.aspect, zone: x.u.zone, fI: x.fI, I: x.f?.ischaemia?.value ?? null }),
        dressing: dressingSuggestion({ infection: x.infection ?? 0, tissue: x.w.tissue ?? [], exudate: x.w.exudateVolume, padSide: !!x.f?.pad }),
      })),
      maxSev, activeUlcer, unwell, sepsis, deepInfection, limbIschaemia,
      tests: suggestedTests(ctx, input.catalog ?? null),
      referral: referral(seg),
      followUp: followUp({ segment: seg.value, risk: decidedRisk }),
      disposition: disposition(ctx),
      teams: teams(ctx),
      alerts: alerts(ctx),
    };
  }

  // ---------- Lab reference checks (handbook section 7) ----------
  const LABS = {
    wbc: { label: "WBC", unit: "×10⁹/L", low: 4.5, high: 11 },
    hb: { label: "Haemoglobin", unit: "g/dL", bySex: { Male: [13.8, 17.2], Female: [12.1, 15.1] } },
    // Upper limit 400 (training deck) vs 450 (MOH table): the clinical lead chooses one
    platelets: { label: "Platelets", unit: "×10⁹/L", low: 150, high: 400 },
    fbg: { label: "Fasting glucose", unit: "mg/dL", low: 70, high: 100 },
    hba1c: { label: "HbA1c", unit: "%", high: 7, highLabel: "Above goal" },
    urea: { label: "Urea", unit: "mg/dL" },
    creatinine: { label: "Creatinine", unit: "mg/dL", bySex: { Male: [0.74, 1.35], Female: [0.59, 1.04] } },
    egfr: { label: "eGFR", unit: "mL/min/1.73 m²" },
    crp: { label: "CRP", unit: "mg/L", high: 10 },
    esr: { label: "ESR", unit: "mm/hr", high: 20 },
    procalcitonin: { label: "Procalcitonin", unit: "ng/mL", high: 0.1 },
    lactate: { label: "Lactate", unit: "mmol/L", high: 2 },
    albumin: { label: "Albumin", unit: "g/L", low: 35, high: 50 },
  };

  function labFlag(key, value, sex) {
    const base = LABS[key];
    if (!base || value === null || value === undefined) return null;
    const ref = base.bySex?.[sex] ? { ...base, low: base.bySex[sex][0], high: base.bySex[sex][1] } : base;
    if (ref.high !== undefined && value > ref.high) return ref.highLabel ?? "High";
    if (ref.low !== undefined && value < ref.low) return "Low";
    return null;
  }

  return {
    RULESET, SIDES, SIDE_LABEL, RISK_INTERVAL, LABS, INFECTION, SEGMENTS, WIFI_TABLE, LEVEL,
    sirs, lops, pad, critical, severeIschaemia, deformity, history, charcot, iwgdfRisk, segment,
    infectionGrade, wagner, sinbad, ischaemiaGrade, wifi, healing, suggestedType, offloadingSuggestion, dressingSuggestion,
    suggestedTests, referral, followUp, disposition, teams, alerts, nurseAlerts, evaluate, labFlag,
  };
})();

if (typeof module !== "undefined") module.exports = ClinicalRules;
