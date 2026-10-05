// Demo staff directory (fictional people, fictional e-mail domain).
// IDs 1000xx are the sign-in demo accounts in auth.js.
// `assigned` are organisation node ids (org.js): a user sees everything below them (UAT-01).
// Changes made in Settings (status, role, assignments) are stored on top of this list in
// "ndfip.staff" and read at call time, so they apply at once (EC-07).

const StaffDirectory = [
  {
    id: "100001", name: "System Administrator", role: "admin", title: "Administrator",
    email: "admin@alnoor-health.example", phone: "0110000001", assigned: ["org-1"],
    joined: "2021-01-10", experience: "Platform administration.", status: "active",
  },
  {
    id: "100002", name: "Amal Saeed Al-Harthi", role: "nurse", title: "Screening Nurse",
    email: "amal.alharthi@alnoor-health.example", phone: "0550000002", assigned: ["cl-df-nrc"],
    joined: "2022-03-01", experience: "8 years in diabetes education and foot screening. IWGDF foot screening certificate.", status: "active",
  },
  {
    id: "200011", name: "Huda Ali Al-Qarni", role: "nurse", title: "Screening Nurse",
    email: "huda.alqarni@alnoor-health.example", phone: "0550000011", assigned: ["cl-df-nrc"],
    joined: "2023-06-15", experience: "5 years in outpatient nursing.", status: "active",
  },
  {
    id: "200012", name: "Salma Nasser Al-Dossary", role: "nurse", title: "Wound Care Nurse",
    email: "", phone: "0550000012", assigned: ["cl-df-krh"],
    joined: "2020-09-20", experience: "10 years in wound care.", status: "active",
  },
  {
    id: "100003", name: "Yousef Khalid Al-Rashidi", role: "practitioner", title: "Practitioner",
    email: "yousef.alrashidi@alnoor-health.example", phone: "0550000003", assigned: ["cl-df-nrc"],
    joined: "2019-02-11", experience: "12 years in family medicine, 6 in diabetic foot care.", specialty: "Family medicine", status: "active",
  },
  {
    id: "100005", name: "Rana Saad Al-Otaibi", role: "practitioner", title: "Endocrinologist",
    email: "rana.alotaibi@alnoor-health.example", phone: "0550000005", assigned: ["cl-df-jcc"],
    joined: "2018-05-02", experience: "15 years in endocrinology.", specialty: "Endocrinology", status: "active",
  },
  {
    id: "200021", name: "Omar Fahad Al-Sulami", role: "practitioner", title: "Podiatrist",
    email: "omar.alsulami@alnoor-health.example", phone: "0550000021", assigned: ["cl-df-krh"],
    joined: "2021-11-07", experience: "9 years in podiatry.", specialty: "Podiatry", status: "active",
  },
  {
    id: "100006", name: "Dr. Fahad Nasser Al-Qahtani", role: "senior", title: "Senior Doctor, Diabetic Foot",
    email: "fahad.alqahtani@alnoor-health.example", phone: "0550000006", assigned: ["cl-df-nrc", "cl-df-krh"],
    joined: "2015-08-30", experience: "20 years in vascular and diabetic foot surgery. Clinic lead.", specialty: "Vascular surgery", status: "active",
  },
  {
    id: "100004", name: "Mona Abdullah Al-Shehri", role: "supervisor", title: "Facility Supervisor",
    email: "mona.alshehri@alnoor-health.example", phone: "0550000004", assigned: ["fac-nrc"],
    joined: "2017-04-18", experience: "Nursing supervisor, North Riyadh Medical Complex.", status: "active",
  },
  {
    id: "100007", name: "Khalid Ibrahim Al-Mutlaq", role: "director", title: "Regional Director, Riyadh",
    email: "khalid.almutlaq@alnoor-health.example", phone: "0550000007", assigned: ["reg-ruh"],
    joined: "2016-01-05", experience: "Healthcare operations.", status: "active",
  },
];

// Live view: the directory with Settings changes applied
const Staff = (() => {
  const KEY = "ndfip.staff";
  const overrides = () => (typeof Db !== "undefined" ? Db.read(KEY, {}) : {}) ?? {};
  const list = () => {
    const o = overrides();
    const base = StaffDirectory.map((s) => ({ ...s, ...(o[s.id] ?? {}) }));
    const added = Object.values(o).filter((s) => s.added && !StaffDirectory.some((b) => b.id === s.id));
    return [...base, ...added];
  };
  const get = (id) => list().find((s) => s.id === id) ?? null;
  // Changes one staff member (status, role, assigned, email...). Throws Db.SaveError.
  function set(id, changes) {
    Db.update(KEY, {}, (o) => {
      o[id] = { ...(o[id] ?? {}), ...changes };
    });
  }
  return { list, get, set, active: () => list().filter((s) => s.status !== "disabled") };
})();
