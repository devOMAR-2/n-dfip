// System value dashboard (UAT-24): what the decision support contributes.
//   Tests suggested       accepted + dismissed = suggested (reasons for dismissals)
//   Recommendations       confirmed unchanged + overridden = total (reasons for overrides)
//   Alerts raised         by level: urgent, attention, info
//   Referrals             suggested = made + missed (reasons where given)
// Every count is over appointments signed in the period and the selected place, so the
// table views add up to the figures. Needs dashboard.js (DashCore) and charts.js.

(() => {
  if (typeof Access !== "undefined" && Access.denied) return;
  const kpis = document.getElementById("value-kpis");
  if (!kpis) return;
  const K = DashCore;
  const C = Charts;
  const { within, pct, sum } = K;
  const RAMP3 = ["var(--ramp3-1)", "var(--ramp3-2)", "var(--ramp3-3)"];

  let figures = [];

  function render({ D, range }) {
    const S = D.screenings.filter((s) => within(s.at, range) && s.reviewed);
    const B = K.buckets(range);
    const inBucket = (b) => S.filter((s) => within(s.at, b));
    const list = (title, rows) => ({ label: "View appointments", onClick: () => K.openList(title, rows) });

    // Tests
    const sugg = S.flatMap((s) => s.testsSuggested.map((t) => ({ ...t, s })));
    const accepted = sugg.filter((t) => t.accepted);
    const dismissed = sugg.filter((t) => !t.accepted);
    const rowsWith = (fn) => S.filter(fn);
    // Recommendations
    const recTotal = sum(S.map((s) => s.recs.total));
    const overrides = S.flatMap((s) => s.recs.overridden.map((o) => ({ ...o, s })));
    // Alerts
    const levels = [["urgent", "Urgent"], ["attention", "Attention"], ["info", "Information"]];
    const alertCount = (lvl) => sum(S.map((s) => s.alerts[lvl]));
    const alertTotal = sum(levels.map(([l]) => alertCount(l)));
    // Referrals
    const refSugg = S.filter((s) => s.referralSuggested);
    const refMade = refSugg.filter((s) => s.referralSuggested.made);
    const refMissed = refSugg.filter((s) => !s.referralSuggested.made);

    figures = [
      ["Signed appointments", S.length],
      ["Tests suggested", sugg.length],
      ["Tests accepted", accepted.length],
      ["Tests dismissed", dismissed.length],
      ...DashboardData.DISMISS_REASONS.map((r) => [`Dismissed: ${r}`, dismissed.filter((t) => t.reason === r).length]),
      ["Recommendations", recTotal],
      ["Confirmed unchanged", recTotal - overrides.length],
      ["Overridden", overrides.length],
      ...DashboardData.OVERRIDE_REASONS.map((r) => [`Overridden: ${r}`, overrides.filter((o) => o.reason === r).length]),
      ...levels.map(([l, label]) => [`Alerts: ${label}`, alertCount(l)]),
      ["Referrals suggested", refSugg.length],
      ["Referrals made", refMade.length],
      ["Referrals missed", refMissed.length],
    ];

    kpis.replaceChildren(
      C.stat({ label: "Tests suggested", value: C.fmt.count(sugg.length), note: (() => { const n = rowsWith((s) => s.testsSuggested.length).length; return `On ${C.fmt.count(n)} appointment${n === 1 ? "" : "s"}`; })(), action: list("Appointments with suggested tests", rowsWith((s) => s.testsSuggested.length)) }),
      C.stat({ label: "Suggested tests accepted", value: C.fmt.count(accepted.length), note: `${sugg.length ? C.fmt.pct(pct(accepted.length, sugg.length)) : "—"} of suggested`, action: list("Appointments with accepted tests", rowsWith((s) => s.testsSuggested.some((t) => t.accepted))) }),
      C.stat({ label: "Suggested tests dismissed", value: C.fmt.count(dismissed.length), note: `${sugg.length ? C.fmt.pct(pct(dismissed.length, sugg.length)) : "—"} of suggested`, action: list("Appointments with dismissed tests", rowsWith((s) => s.testsSuggested.some((t) => !t.accepted))) }),
      C.stat({ label: "Recommendations confirmed unchanged", value: C.fmt.count(recTotal - overrides.length), note: `${recTotal ? C.fmt.pct(pct(recTotal - overrides.length, recTotal)) : "—"} of ${C.fmt.count(recTotal)}` }),
      C.stat({ label: "Recommendations overridden", value: C.fmt.count(overrides.length), note: `${recTotal ? C.fmt.pct(pct(overrides.length, recTotal)) : "—"} of ${C.fmt.count(recTotal)}`, action: list("Appointments with an overridden recommendation", rowsWith((s) => s.recs.overridden.length)) }),
      C.stat({ label: "Alerts raised", value: C.fmt.count(alertTotal), note: `${C.fmt.count(alertCount("urgent"))} urgent`, action: list("Appointments with an urgent alert", rowsWith((s) => s.alerts.urgent)) }),
      C.stat({ label: "Referrals suggested", value: C.fmt.count(refSugg.length), action: list("Appointments with a suggested referral", refSugg) }),
      C.stat({ label: "Referrals made", value: C.fmt.count(refMade.length), note: `${refSugg.length ? C.fmt.pct(pct(refMade.length, refSugg.length)) : "—"} of suggested`, action: list("Suggested referrals that were made", refMade) }),
      C.stat({ label: "Referrals missed", value: C.fmt.count(refMissed.length), note: "Suggested, not made", action: list("Suggested referrals that were not made", refMissed) }),
    );

    const reasonItems = (items, reasons, key = "reason") =>
      reasons.map((r) => ({ label: r ?? "No reason given", value: items.filter((x) => x[key] === r).length }));
    const tests = DashboardData.TESTS.map(([id, label]) => ({ id, label, n: sugg.filter((t) => t.id === id).length, a: accepted.filter((t) => t.id === id).length })).filter((t) => t.n);
    const dismissReasons = DashboardData.DISMISS_REASONS;
    const recTitles = [...new Set(overrides.map((o) => o.title))].sort((a, b) => overrides.filter((o) => o.title === b).length - overrides.filter((o) => o.title === a).length);
    const missedReasons = [...DashboardData.MISSED_REASONS];

    document.getElementById("value-charts").replaceChildren(
      C.bars({
        title: "Suggested tests: outcome",
        subtitle: `Accepted ${C.fmt.count(accepted.length)} + dismissed ${C.fmt.count(dismissed.length)} = ${C.fmt.count(sugg.length)} suggested`,
        name: "Tests", tableHead: "Outcome",
        items: [{ label: "Accepted", value: accepted.length }, { label: "Dismissed", value: dismissed.length, color: "var(--viz-2)" }],
        onSelect: (i) => K.openList(i ? "Appointments with dismissed tests" : "Appointments with accepted tests", rowsWith((s) => s.testsSuggested.some((t) => t.accepted === !i))),
      }),
      C.bars({
        title: "Why suggested tests were dismissed",
        subtitle: "Reason given by the practitioner · select a bar to list the appointments",
        name: "Tests dismissed", tableHead: "Reason",
        items: reasonItems(dismissed, dismissReasons),
        onSelect: (i) => K.openList(`Tests dismissed: ${dismissReasons[i]}`, rowsWith((s) => s.testsSuggested.some((t) => !t.accepted && t.reason === dismissReasons[i]))),
      }),
      C.bars({
        title: "Acceptance by test",
        subtitle: "Share of suggestions accepted, per test",
        name: "Accepted", tableHead: "Test", format: C.fmt.pct, max: 100,
        items: tests.map((t) => ({ label: t.label, value: pct(t.a, t.n) })),
      }),
      C.lines({
        title: "Suggested and accepted tests",
        subtitle: `Per ${K.bucketLabel(range).toLowerCase()}`,
        labels: B.map((b) => b.label), fullLabels: B.map((b) => b.full), tableHead: K.bucketLabel(range),
        series: [
          { name: "Suggested", color: "var(--viz-1)", values: B.map((b) => sum(inBucket(b).map((s) => s.testsSuggested.length))) },
          { name: "Accepted", color: "var(--viz-2)", values: B.map((b) => sum(inBucket(b).map((s) => s.testsSuggested.filter((t) => t.accepted).length))) },
        ],
      }),
      C.bars({
        title: "Recommendations: outcome",
        subtitle: `Confirmed unchanged ${C.fmt.count(recTotal - overrides.length)} + overridden ${C.fmt.count(overrides.length)} = ${C.fmt.count(recTotal)}`,
        name: "Recommendations", tableHead: "Outcome",
        items: [{ label: "Confirmed unchanged", value: recTotal - overrides.length }, { label: "Overridden", value: overrides.length, color: "var(--viz-2)" }],
      }),
      C.bars({
        title: "Why recommendations were overridden",
        subtitle: "Reason given by the practitioner · select a bar to list the appointments",
        name: "Overrides", tableHead: "Reason",
        items: reasonItems(overrides, DashboardData.OVERRIDE_REASONS),
        onSelect: (i) => K.openList(`Overridden: ${DashboardData.OVERRIDE_REASONS[i]}`, rowsWith((s) => s.recs.overridden.some((o) => o.reason === DashboardData.OVERRIDE_REASONS[i]))),
      }),
      C.bars({
        title: "Overrides by recommendation",
        subtitle: "Which system recommendation was changed",
        name: "Overrides", tableHead: "Recommendation",
        items: recTitles.map((t) => ({ label: t, value: overrides.filter((o) => o.title === t).length })),
        onSelect: (i) => K.openList(`Overridden: ${recTitles[i]}`, rowsWith((s) => s.recs.overridden.some((o) => o.title === recTitles[i]))),
      }),
      C.columns({
        title: "Alerts raised by level",
        subtitle: `${C.fmt.count(alertTotal)} alerts on signed appointments · select a column to list them`,
        labels: levels.map(([, l]) => l), tableHead: "Level", name: "Alerts", labelAll: true,
        values: levels.map(([l]) => alertCount(l)), colors: [RAMP3[2], RAMP3[1], RAMP3[0]],
        onSelect: (i) => K.openList(`Appointments with ${levels[i][1].toLowerCase()} alerts`, rowsWith((s) => s.alerts[levels[i][0]] > 0)),
      }),
      C.bars({
        title: "Referrals: suggested, made and missed",
        subtitle: `Made ${C.fmt.count(refMade.length)} + missed ${C.fmt.count(refMissed.length)} = ${C.fmt.count(refSugg.length)} suggested`,
        name: "Referrals", tableHead: "Referrals",
        items: [
          { label: "Suggested", value: refSugg.length },
          { label: "Made", value: refMade.length },
          { label: "Missed", value: refMissed.length, color: "var(--viz-2)" },
        ],
        onSelect: (i) => K.openList(["Suggested referrals", "Suggested referrals that were made", "Suggested referrals that were not made"][i], [refSugg, refMade, refMissed][i]),
      }),
      C.bars({
        title: "Why suggested referrals were not made",
        subtitle: "Reason given by the practitioner, where one was given",
        name: "Referrals missed", tableHead: "Reason",
        items: missedReasons.map((r) => ({ label: r ?? "No reason given", value: refMissed.filter((s) => s.referralSuggested.reason === r).length })),
        onSelect: (i) => K.openList(`Referral not made: ${missedReasons[i] ?? "no reason given"}`, refMissed.filter((s) => s.referralSuggested.reason === missedReasons[i])),
      }),
      C.bars({
        title: "Missed referrals by destination",
        subtitle: "Where the system suggested sending the patient",
        name: "Referrals missed", tableHead: "Destination",
        items: Object.entries(K.DEST).map(([k, label]) => ({ label, value: refMissed.filter((s) => s.referralSuggested.destination === k).length })).filter((x) => x.value),
      }),
    );
  }

  K.init({ render, figures: () => figures, exportName: "system-value" });
})();
