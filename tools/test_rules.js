// Handbook section 10 test cases for scripts/clinical-rules.js.
// Run: node tools/test_rules.js
const R = require("../scripts/clinical-rules.js");

const base = () => ({
  "c.method": "monofilament",
  "c.left.hallux": "absent", "c.left.mth1": "absent", "c.left.mth5": "detected",
  "c.right.hallux": "detected", "c.right.mth1": "detected", "c.right.mth5": "detected",
  "c.left.vibration": "reduced", "c.right.vibration": "present",
  "e.right.abi": "0.98", "e.left.abi": "0.82",
  "d.left.dp": "weak", "d.left.pt": "present", "d.right.dp": "present", "d.right.pt": "present",
  "f.left.deformity": ["claw-toes"], "f.right.deformity": ["none"],
  "a.temp": "36.8", "a.hr": "80", "a.rr": "16",
  "i.left.ulcer": "no", "i.right.ulcer": "no",
  "j.count": "1",
});
const baseUlcer = (extra = {}) => ({
  n: 1, side: "left", zone: "mth1", aspect: "plantar",
  w: { signs: ["erythema", "warmth"], erythemaCm: 1.0, ptb: "no", exposed: ["none"], abscess: "no", osteomyelitis: "no", gangrene: "none", length: 1.8, width: 1.2, depth: 0.3, ...extra },
});
const normal = () => ({
  "c.method": "monofilament",
  ...Object.fromEntries(["left", "right"].flatMap((s) => [[`c.${s}.hallux`, "detected"], [`c.${s}.mth1`, "detected"], [`c.${s}.mth5`, "detected"], [`c.${s}.vibration`, "present"], [`d.${s}.dp`, "present"], [`d.${s}.pt`, "present"], [`f.${s}.deformity`, ["none"]], [`i.${s}.ulcer`, "no"]])),
  "a.temp": "36.8", "a.hr": "80", "a.rr": "16", "j.count": "0",
});

const run = (answers, ulcers = []) => R.evaluate({ v: (k) => answers[k], patient: null, labs: {}, ulcers });
const u0 = (m) => m.ulcers[0];
const wifiText = (m) => `W${u0(m).wifiSys.W} I${u0(m).wifiSys.I} fI${u0(m).wifiSys.fI}, stage ${u0(m).wifiSys.value}`;
const hasAlert = (m, re, level) => m.alerts.some((a) => re.test(a.title) && (!level || a.level === level));
const testIds = (m) => m.tests.map((t) => t.value);

let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(actual)}${ok ? "" : `  (expected ${JSON.stringify(expected)})`}`);
}

// 1 Base case
let m = run(base(), [baseUlcer()]);
check("1 LOPS left / right", [m.feet[0].lops, m.feet[1].lops], [true, false]);
check("1 PAD left / right", [m.feet[0].pad, m.feet[1].pad], [true, false]);
check("1 IWGDF", m.risk.value, 2);
check("1 Segment", m.segment.name, "Active foot disease");
check("1 Infection", R.INFECTION[u0(m).infectionSys.value], "Mild");
check("1 Wagner", u0(m).wagnerSys.value, 1);
check("1 SINBAD", u0(m).sinbadSys.value, 3);
check("1 WIfI", wifiText(m), "W1 I0 fI1, stage 1");
check("1 Referral", [m.referral.destination, m.referral.urgency, m.referral.timing], ["tertiary", "urgent", "today"]);

// 2 No abnormal finding, no ulcer
m = run(normal());
check("2 IWGDF", m.risk.value, 0);
check("2 Segment", m.segment.name, "Low risk");
check("2 Referral", m.referral.needed, "no");

// 3 One monofilament site absent, nothing else
m = run({ ...normal(), "c.right.mth5": "absent" });
check("3 IWGDF", m.risk.value, 1);
check("3 Segment", m.segment.name, "Moderate risk");
check("3 Referral", [m.referral.destination, m.referral.urgency, m.referral.timing], ["secondary", "routine", "3weeks"]);

// 4 LOPS plus a previous ulcer, no active ulcer
m = run({ ...normal(), "c.right.mth5": "absent", "i.right.ulcer": "yes" });
check("4 IWGDF", m.risk.value, 3);
check("4 Segment", m.segment.name, "High risk");
check("4 Referral", [m.referral.destination, m.referral.urgency, m.referral.timing], ["secondary", "soon", "week"]);
check("4 Alert healed ulcer", hasAlert(m, /Healed ulcer/), true);

// 5 Base case plus probe-to-bone positive and abscess
m = run(base(), [baseUlcer({ ptb: "yes", abscess: "yes" })]);
check("5 Infection", R.INFECTION[u0(m).infectionSys.value], "Moderate");
check("5 Wagner", u0(m).wagnerSys.value, 3);
check("5 SINBAD", u0(m).sinbadSys.value, 4);
check("5 WIfI", wifiText(m), "W2 I0 fI2, stage 3");
check("5 Segment", m.segment.name, "Acute foot attack");
check("5 Disposition", m.disposition.value, "emergency");
check("5 Alert deep infection (critical)", hasAlert(m, /deep infection/i, "critical"), true);
check("5 Alert osteomyelitis likely", hasAlert(m, /Osteomyelitis likely/), true);

// 6 Base case plus temperature 38.6 and heart rate 104
m = run({ ...base(), "a.temp": "38.6", "a.hr": "104" }, [baseUlcer()]);
check("6 SIRS", m.sirs.positive, true);
check("6 Infection", R.INFECTION[u0(m).infectionSys.value], "Severe");
check("6 WIfI", wifiText(m), "W1 I0 fI3, stage 3");
check("6 Segment", m.segment.name, "Acute foot attack");
check("6 Alert possible sepsis", hasAlert(m, /Possible sepsis/), true);
check("6 Blood cultures and lactate", ["blood-culture", "lactate"].every((t) => testIds(m).includes(t)), true);

// 7 ABI 1.45 on one foot, no toe measurement, pulses present
m = run({ ...normal(), "e.right.abi": "1.45" });
check("7 PAD right", m.feet[1].pad, false);
check("7 Calcification message", m.feet[1].padSys.reasons.some((r) => /calcification/.test(r)), true);
check("7 Alert ABI not reliable", hasAlert(m, /ABI not reliable/), true);

// 8 No ulcer, skin temperature 30.4 right and 33.0 left
m = run({ ...normal(), "h.right.temp": "30.4", "h.left.temp": "33.0", "h.right.flags": ["none"], "h.left.flags": ["none"] });
check("8 charcotFlag", m.charcot.flag, true);
check("8 Segment", m.segment.name, "Active foot disease");
check("8 Weight-bearing X-ray", testIds(m).includes("wb-xray"), true);
check("8 Alert suspected Charcot (critical)", hasAlert(m, /Charcot/, "critical"), true);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll handbook test cases pass (cases 9 and 10 are workflow rules, checked in the browser).");
process.exit(failed ? 1 : 0);
