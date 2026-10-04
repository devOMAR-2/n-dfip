// Dashboard page: one date filter scoping both the Operations and Clinical dashboards.
// Needs dashboard-data.js, charts.js, screening-store.js.

(() => {
  const { TODAY, FIRST, DAY, screenings, ulcers, referrals, amputations } = DashboardData;
  const C = Charts;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // Validated palette slots (see shared.css / dataviz validator)
  const RAMP4 = ["var(--ramp-250)", "var(--ramp-400)", "var(--ramp-550)", "var(--ramp-700)"];
  const RAMP5 = ["var(--ramp-250)", "var(--ramp-350)", "var(--ramp-450)", "var(--ramp-550)", "var(--ramp-650)"];

  const fmtDate = (d, opts = { month: "short", day: "numeric", year: "numeric" }) => d.toLocaleDateString("en-US", opts);
  const median = (arr) => {
    if (!arr.length) return null;
    const a = [...arr].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const pct = (part, whole) => (whole ? (part / whole) * 100 : null);
  const change = (now, before) => (now === null || before === null || before === 0 ? NaN : ((now - before) / before) * 100);

  // ---------- Filter ----------

  const PRESETS = {
    "7d": { label: "Last 7 days", days: 7 },
    "30d": { label: "Last 30 days", days: 30 },
    "90d": { label: "Last 90 days", days: 90 },
    ytd: { label: "Year to date" },
    "12m": { label: "Last 12 months", days: 365 },
  };
  let range = rangeFor("30d");
  let preset = "30d";

  function rangeFor(key) {
    if (key === "ytd") return { from: new Date(TODAY.getFullYear(), 0, 1), to: TODAY };
    return { from: new Date(TODAY.getTime() - (PRESETS[key].days - 1) * DAY), to: TODAY };
  }

  const lengthDays = ({ from, to }) => Math.round((to - from) / DAY) + 1;
  const previous = (r) => {
    const n = lengthDays(r);
    return { from: new Date(r.from.getTime() - n * DAY), to: new Date(r.from.getTime() - DAY) };
  };
  const within = (d, r) => d >= r.from && d < new Date(r.to.getTime() + DAY);

  // ---------- Buckets ----------

  function buckets(r) {
    const n = lengthDays(r);
    const out = [];
    if (n <= 31 && !r.forceWeekly) {
      for (let t = r.from.getTime(); t <= r.to.getTime(); t += DAY) {
        const d = new Date(t);
        out.push({ from: d, to: d, label: fmtDate(d, { month: "short", day: "numeric" }), full: fmtDate(d, { weekday: "short", month: "short", day: "numeric" }) });
      }
    } else if (n <= 180 || r.forceWeekly) {
      for (let t = r.from.getTime(); t <= r.to.getTime(); t += 7 * DAY) {
        const from = new Date(t);
        const to = new Date(Math.min(t + 6 * DAY, r.to.getTime()));
        out.push({ from, to, label: fmtDate(from, { month: "short", day: "numeric" }), full: `Week of ${fmtDate(from, { month: "short", day: "numeric" })} – ${fmtDate(to, { month: "short", day: "numeric" })}` });
      }
    } else {
      let d = new Date(r.from.getFullYear(), r.from.getMonth(), 1);
      while (d <= r.to) {
        const from = d < r.from ? r.from : d;
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const to = end > r.to ? r.to : end;
        out.push({ from, to, label: fmtDate(d, { month: "short" }), full: fmtDate(d, { month: "long", year: "numeric" }) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    return out;
  }

  // Sparse series (ulcers) read better weekly even in a 30-day view
  function coarseBuckets(r) {
    const n = lengthDays(r);
    return n <= 14 || n > 31 ? buckets(r) : buckets({ ...r, from: r.from, to: r.to, forceWeekly: true });
  }

  const bucketLabel = (r) => (lengthDays(r) <= 31 ? "Day" : lengthDays(r) <= 180 ? "Week" : "Month");

  // ---------- Measures for a period ----------

  function measures(r) {
    const S = screenings.filter((s) => within(s.at, r));
    const reviewed = S.filter((s) => s.reviewed);
    const refsMade = referrals.filter((x) => within(x.at, r));
    const refsDue = referrals.filter((x) => within(x.apptAt, r) && x.status !== "pending");
    const followDue = screenings.filter((s) => within(s.followDue, r) && s.followDone !== null);
    const newUlcers = S.filter((s) => s.ulcer).map((s) => s.ulcer);
    const activeAtEnd = ulcers.filter((u) => u.at < new Date(r.to.getTime() + DAY) && (!u.healedAt || u.healedAt >= new Date(r.to.getTime() + DAY))).length;
    const amps = amputations.filter((a) => within(a.at, r));
    return {
      S, reviewed, refsMade, newUlcers, amps,
      count: S.length,
      turnaround: median(reviewed.map((s) => s.turnaround)),
      wait: median(refsDue.filter((x) => x.status === "seen").map((x) => x.wait)),
      followUp: pct(followDue.filter((s) => s.followDone).length, followDue.length),
      dna: pct(refsDue.filter((x) => x.status === "dna").length, refsDue.filter((x) => x.status === "dna" || x.status === "seen").length),
      corrections: mean(reviewed.map((s) => s.corrections)),
      atRisk: pct(S.filter((s) => s.risk >= 2).length, S.length),
      ulcersNew: newUlcers.length,
      activeAtEnd,
      infected: pct(newUlcers.filter((u) => u.infection >= 2).length, newUlcers.length),
      limb: newUlcers.filter((u) => u.unstable).length,
      ampsTotal: amps.length,
      hba1cGood: pct(S.filter((s) => s.hba1c === 0).length, S.length),
    };
  }

  // ---------- Render ----------

  const rangeText = (r) => `${fmtDate(r.from)} – ${fmtDate(r.to)}`;

  function render() {
    const prev = previous(range);
    const now = measures(range);
    const before = measures(prev);
    const B = buckets(range);
    const labels = B.map((b) => b.label);
    const full = B.map((b) => b.full);
    const per = (fn) => B.map((b) => fn(b));
    const vs = preset in PRESETS && preset !== "ytd" ? `previous ${PRESETS[preset].label.replace("Last ", "")}` : "previous period";
    const delta = (key, good) => ({ pct: change(now[key], before[key]), good, vs });
    const show = (v, f) => (v === null ? "—" : f(v));

    $("#range-summary").textContent = `${rangeText(range)} · ${lengthDays(range)} days. Compared with ${rangeText(prev)}.`;

    if ($("#ops-kpis")) renderOperations();
    if ($("#clin-kpis")) renderClinical();

    function renderOperations() {
    const live = typeof ScreeningStore !== "undefined" ? ScreeningStore.pending().length : 0;
    $("#ops-kpis").replaceChildren(
      C.stat({ label: "Screenings completed", value: C.fmt.count(now.count), delta: delta("count", "up"), spark: per((b) => screenings.filter((s) => within(s.at, b)).length) }),
      C.stat({ label: "Awaiting review now", value: C.fmt.count(live), note: "Live: this browser's queue" }),
      C.stat({ label: "Median review turnaround", value: show(now.turnaround, C.fmt.hours), delta: delta("turnaround", "down") }),
      C.stat({ label: "Median wait to specialist", value: show(now.wait, C.fmt.days), delta: delta("wait", "down") }),
      C.stat({ label: "Follow-up completion", value: show(now.followUp, C.fmt.pct), delta: delta("followUp", "up") }),
      C.stat({ label: "Did-not-attend rate", value: show(now.dna, C.fmt.pct), delta: delta("dna", "down") }),
    );

    const statusCount = (st) => now.refsMade.filter((x) => x.status === st).length;
    const destLabel = { secondary: "Secondary Care", "wound-care": "Wound Care", vascular: "Vascular", tertiary: "Center of Excellence" };
    const seenDue = referrals.filter((x) => within(x.apptAt, range) && x.status === "seen");
    const bins = [["< 4 h", 0, 4], ["4–12 h", 4, 12], ["12–24 h", 12, 24], ["1–2 days", 24, 48], ["> 2 days", 48, Infinity]];

    $("#ops-charts").replaceChildren(
      C.columns({
        title: "Screenings",
        subtitle: `Completed per ${bucketLabel(range).toLowerCase()}`,
        labels, fullLabels: full, tableHead: bucketLabel(range), name: "Screenings",
        values: per((b) => screenings.filter((s) => within(s.at, b)).length),
      }),
      C.lines({
        title: "Documentation time",
        subtitle: "Average minutes per encounter",
        labels, fullLabels: full, tableHead: bucketLabel(range), format: C.fmt.minutes, tickFormat: (v) => v.toFixed(0),
        series: [
          { name: "Nurse preparation", color: "var(--viz-1)", values: per((b) => mean(screenings.filter((s) => within(s.at, b)).map((s) => s.nursePrep))) },
          { name: "Practitioner documentation", color: "var(--viz-2)", values: per((b) => mean(screenings.filter((s) => within(s.at, b)).map((s) => s.doctorDoc))) },
        ],
      }),
      C.bars({
        title: "Pathway completion",
        subtitle: "Screenings in the period reaching each step (follow-up completion is a KPI above)",
        name: "Patients", tableHead: "Step",
        items: [
          ["Screened", now.count],
          ["Reviewed", now.reviewed.length],
          ["Referred", now.S.filter((s) => s.referral).length],
          ["Seen by specialist", now.S.filter((s) => s.referral?.status === "seen").length],
        ].map(([label, value], i) => ({ label, value, color: RAMP4[i] })),
      }),
      C.bars({
        title: "Referral status",
        subtitle: "Referrals made in the period",
        name: "Referrals", tableHead: "Status",
        items: [["Seen", "seen"], ["Pending appointment", "pending"], ["Redirected", "redirected"], ["Did not attend", "dna"]].map(([label, st]) => ({ label, value: statusCount(st) })),
      }),
      C.bars({
        title: "Wait to first specialist appointment",
        subtitle: "Median days, appointments attended in the period",
        name: "Median wait", tableHead: "Destination", format: C.fmt.days,
        items: Object.entries(destLabel).map(([k, label]) => ({ label, value: median(seenDue.filter((x) => x.destination === k).map((x) => x.wait)) ?? 0 })),
      }),
      C.columns({
        title: "Review turnaround",
        subtitle: "Screenings by time from sending to sign-off",
        labels: bins.map((b) => b[0]), tableHead: "Turnaround", name: "Screenings", labelAll: true,
        values: bins.map(([, lo, hi]) => now.reviewed.filter((s) => s.turnaround >= lo && s.turnaround < hi).length),
      }),
    );

    }

    function renderClinical() {
    const activeAt = (b) => ulcers.filter((u) => u.at < new Date(b.to.getTime() + DAY) && (!u.healedAt || u.healedAt >= new Date(b.to.getTime() + DAY))).length;
    $("#clin-kpis").replaceChildren(
      C.stat({ label: "At risk (IWGDF 2–3)", value: show(now.atRisk, C.fmt.pct), delta: delta("atRisk", null) }),
      C.stat({ label: "New ulcers", value: C.fmt.count(now.ulcersNew), delta: delta("ulcersNew", "down"), spark: per((b) => screenings.filter((s) => s.ulcer && within(s.at, b)).length) }),
      C.stat({ label: "Active ulcers at period end", value: C.fmt.count(now.activeAtEnd), delta: delta("activeAtEnd", "down"), spark: per(activeAt) }),
      C.stat({ label: "Infected ulcers (grade 2–4)", value: show(now.infected, C.fmt.pct), delta: delta("infected", "down") }),
      C.stat({ label: "Limb-threatening cases", value: C.fmt.count(now.limb), delta: delta("limb", "down") }),
      C.stat({ label: "HbA1c below 7%", value: show(now.hba1cGood, C.fmt.pct), delta: delta("hba1cGood", "up") }),
    );

    const factor = (fn) => pct(now.S.filter(fn).length, now.count) ?? 0;
    const minor = now.amps.filter((a) => a.level === "minor").length;
    const major = now.amps.filter((a) => a.level === "major").length;
    const healedIn = (b) => ulcers.filter((u) => u.healedAt && within(u.healedAt, b)).length;

    $("#clin-charts").replaceChildren(
      C.columns({
        title: "IWGDF risk category",
        subtitle: "Patients screened in the period",
        labels: ["0 · Very low", "1 · Low", "2 · Moderate", "3 · High"], tableHead: "Risk category", name: "Patients", labelAll: true,
        values: [0, 1, 2, 3].map((r) => now.S.filter((s) => s.risk === r).length), colors: RAMP4,
      }),
      (() => {
        const UB = coarseBuckets(range);
        const unit = lengthDays(range) <= 14 ? "day" : lengthDays(range) <= 180 ? "week" : "month";
        return C.lines({
          title: "New and healed ulcers",
          subtitle: `Per ${unit}`,
          labels: UB.map((b) => b.label), fullLabels: UB.map((b) => b.full), tableHead: unit[0].toUpperCase() + unit.slice(1),
          series: [
            { name: "New", color: "var(--viz-1)", values: UB.map((b) => screenings.filter((s) => s.ulcer && within(s.at, b)).length) },
            { name: "Healed", color: "var(--viz-2)", values: UB.map(healedIn) },
          ],
        });
      })(),
      C.columns({
        title: "Infection grade (IWGDF/IDSA)",
        subtitle: "New ulcers in the period",
        labels: ["1 · None", "2 · Mild", "3 · Moderate", "4 · Severe"], tableHead: "Grade", name: "Ulcers", labelAll: true,
        values: [1, 2, 3, 4].map((g) => now.newUlcers.filter((u) => u.infection === g).length), colors: RAMP4,
      }),
      C.columns({
        title: "Wagner grade",
        subtitle: "New ulcers in the period",
        labels: ["1", "2", "3", "4", "5"], tableHead: "Wagner grade", name: "Ulcers", labelAll: true,
        values: [1, 2, 3, 4, 5].map((g) => now.newUlcers.filter((u) => u.wagner === g).length), colors: RAMP5,
      }),
      C.bars({
        title: "Risk factors",
        subtitle: "Share of patients screened",
        name: "Share", tableHead: "Risk factor", format: C.fmt.pct, max: 100,
        items: [
          ["Loss of protective sensation", (s) => s.lops],
          ["Peripheral arterial disease", (s) => s.pad],
          ["Foot deformity", (s) => s.deformity],
          ["Previous ulcer", (s) => s.prevUlcer],
          ["Previous amputation", (s) => s.amputationHx],
          ["On dialysis", (s) => s.dialysis],
          ["Suspected Charcot", (s) => s.charcot],
        ].map(([label, fn]) => ({ label, value: factor(fn) })),
      }),
      C.stacked({
        title: "HbA1c control",
        subtitle: "Patients screened, by last HbA1c (MoC target below 7%)",
        name: "Patients",
        segments: [
          { label: "Below 7%", value: now.S.filter((s) => s.hba1c === 0).length, color: "var(--ramp-250)", ink: "#0b0b0b" },
          { label: "7–9%", value: now.S.filter((s) => s.hba1c === 1).length, color: "var(--ramp-450)" },
          { label: "Above 9%", value: now.S.filter((s) => s.hba1c === 2).length, color: "var(--ramp-650)" },
        ],
      }),
      C.columns({
        title: "Referrals by urgency",
        subtitle: "Referrals made in the period",
        labels: ["Routine", "Soon", "Urgent", "Emergency"], tableHead: "Urgency", name: "Referrals", labelAll: true,
        values: ["routine", "soon", "urgent", "emergency"].map((u) => now.refsMade.filter((x) => x.urgency === u).length), colors: RAMP4,
      }),
      C.bars({
        title: "Amputations",
        subtitle: `In the period: ${minor} minor, ${major} major`,
        name: "Amputations", tableHead: "Level",
        items: [{ label: "Minor (toe / ray / TMA)", value: minor }, { label: "Major (below / above knee)", value: major }],
      }),
    );
    }
  }

  // ---------- Landing page: headline numbers per dashboard (last 30 days) ----------

  const landing = $("#dash-landing");
  if (landing) {
    const r = rangeFor("30d");
    const now = measures(r);
    const before = measures(previous(r));
    const tile = (label, value, key, good, format) =>
      C.stat({ label, value: now[key] === null ? "—" : format(now[key]), delta: { pct: change(now[key], before[key]), good, vs: "previous 30 days" } });
    $("#preview-ops").replaceChildren(
      tile("Screenings", null, "count", "up", C.fmt.count),
      tile("Median review turnaround", null, "turnaround", "down", C.fmt.hours),
      tile("Follow-up completion", null, "followUp", "up", C.fmt.pct),
    );
    $("#preview-clin").replaceChildren(
      tile("At risk (IWGDF 2–3)", null, "atRisk", null, C.fmt.pct),
      tile("New ulcers", null, "ulcersNew", "down", C.fmt.count),
      tile("Limb-threatening cases", null, "limb", "down", C.fmt.count),
    );
    $("#preview-range").textContent = `Last 30 days: ${rangeText(r)}`;
    return;
  }

  // ---------- Filter controls ----------

  const customBox = $("#custom-range");
  const fromInput = $("#range-from");
  const toInput = $("#range-to");
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  fromInput.min = toInput.min = iso(new Date(FIRST.getTime() + 35 * DAY));
  fromInput.max = toInput.max = iso(TODAY);

  function setPreset(key) {
    preset = key;
    $$("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preset === key)));
    customBox.hidden = key !== "custom";
    if (key === "custom") {
      fromInput.value ||= iso(range.from);
      toInput.value ||= iso(range.to);
      fromInput.focus();
      return;
    }
    range = rangeFor(key);
    render();
  }
  $$("[data-preset]").forEach((b) => b.addEventListener("click", () => setPreset(b.dataset.preset)));

  function fieldError(input, message) {
    const wrap = input.closest(".q");
    const err = $(".field-error", wrap);
    err.hidden = !message;
    $("span", err).textContent = message ?? "";
    wrap.classList.toggle("q--invalid", !!message);
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  $("#apply-range").addEventListener("click", () => {
    fieldError(fromInput, null);
    fieldError(toInput, null);
    const parse = (v) => (v ? new Date(`${v}T00:00:00`) : null);
    const from = parse(fromInput.value);
    const to = parse(toInput.value);
    if (!from) return fieldError(fromInput, "Choose a start date."), fromInput.focus();
    if (!to) return fieldError(toInput, "Choose an end date."), toInput.focus();
    if (to > TODAY) return fieldError(toInput, "End date can't be in the future."), toInput.focus();
    if (from < new Date(fromInput.min + "T00:00:00")) return fieldError(fromInput, `Data starts ${fmtDate(new Date(fromInput.min + "T00:00:00"))}.`), fromInput.focus();
    if (from > to) return fieldError(toInput, "End date must be on or after the start date."), toInput.focus();
    range = { from, to };
    render();
  });
  [fromInput, toInput].forEach((i) => i.addEventListener("input", () => fieldError(i, null)));

  setPreset("30d");
})();
