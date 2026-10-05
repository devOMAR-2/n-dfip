// Role-based access for every signed-in page. Load in <head> right after auth.js:
//   <script src="./scripts/access.js"></script>
//   <script>Access.guardPage(["review.queue"], "the practitioner review")</script>
//
// Permissions come from Settings › Roles & permissions (localStorage "ndfip.roles"),
// falling back to the defaults below. Checks read storage at call time, so a change in
// Settings applies on the user's next action (EC-07).
// FRONT-END ONLY: hiding and disabling is not security. The back end must repeat every
// check and refuse forbidden requests (UAT edge-case rule).

const Access = (() => {
  const ROLES_KEY = "ndfip.roles";

  // Defaults: nurses screen; practitioners review and may complete the nurse part (UAT-07);
  // administrators manage the platform but make no clinical decisions (N-DFIP dossier).
  const PRACTITIONER = [
    "patients.view", "patients.search", "screening.pull", "review.queue", "review.correct", "review.decide",
    "medication.prescribe", "review.orders", "review.referral", "review.signoff", "notes.print", "reports.clinic",
    "referrals.track", "privacy.emergency", "staff.view",
  ];
  const DEFAULT_ROLES = [
    {
      id: "admin", name: "Administrator", system: true,
      description: "Manages the organisation, clinics, staff and settings. Makes no clinical decisions.",
      perms: ["patients.view", "patients.search", "patients.edit", "patients.merge", "audit.view", "reports.clinic", "admin.clinics", "admin.roles", "admin.users", "admin.org", "admin.privacy", "admin.system", "clinic.setup", "lock.release", "staff.view"],
    },
    {
      id: "director", name: "Director", system: true,
      description: "Oversees a region or the whole organisation: reports, referrals and the audit log in scope.",
      perms: ["patients.view", "patients.search", "audit.view", "reports.clinic", "reports.national", "referrals.track", "staff.view"],
    },
    {
      id: "supervisor", name: "Supervisor", system: true,
      description: "Supervises one or more facilities: queues, editing locks, approvals escalated to them, and the facility audit log.",
      perms: ["patients.view", "patients.search", "audit.view", "reports.clinic", "lock.release", "referrals.track", "staff.view"],
    },
    {
      id: "nurse", name: "Screening Nurse", system: true,
      description: "Prepares the encounter: records the Part 1 screening before the practitioner sees the patient.",
      perms: ["patients.view", "patients.search", "screening.perform", "screening.editOwn", "staff.view"],
    },
    {
      id: "practitioner", name: "Practitioner", system: true,
      description: "Reviews screenings, decides the plan, prescribes, orders, refers and signs off.",
      perms: [...PRACTITIONER],
    },
    {
      id: "senior", name: "Senior Doctor", system: true,
      description: "Clinic lead: everything a practitioner does, plus clinic setup, test approvals and reopening signed encounters.",
      perms: [...PRACTITIONER, "review.reopen", "tests.approve", "clinic.setup", "lock.release", "audit.view"],
    },
  ];

  function saved() {
    try {
      return JSON.parse(localStorage.getItem(ROLES_KEY) || "null");
    } catch {
      return null;
    }
  }

  // Saved roles, plus any built-in role added since they were saved
  function roles() {
    const list = saved()?.roles ?? DEFAULT_ROLES;
    return [...list, ...DEFAULT_ROLES.filter((d) => !list.some((r) => r.id === d.id))];
  }

  function currentUser() {
    const id = Auth.getSessionId();
    if (!id) return null;
    const base = Auth.findUser(id) || { employeeId: id, name: id, role: null, roleLabel: "" };
    // Role and status come from the staff directory with Settings changes applied (staff.js)
    const staff = typeof Staff !== "undefined" ? Staff.get(id) : null;
    const roleId = staff?.role ?? base.role;
    const role = roles().find((r) => r.id === roleId);
    return { ...base, id, name: staff?.name ?? base.name, role: roleId, roleLabel: role?.name ?? base.roleLabel, active: (staff?.status ?? "active") !== "disabled" };
  }

  function permsOf(roleId) {
    const role = roles().find((r) => r.id === roleId);
    if (role?.status === "deactivated") return new Set();
    return new Set(role?.perms ?? []);
  }

  const can = (perm) => {
    const u = currentUser();
    return !!u && u.active && permsOf(u.role).has(perm);
  };
  const canAny = (perms) => perms.some(can);

  // ---------- Page guard ----------

  let denied = false;

  function guardPage(perms, what) {
    if (!Auth.getSessionId()) return true; // the page's own guard sends this visitor to sign-in
    if (canAny(perms)) return true;
    denied = true;
    document.addEventListener("DOMContentLoaded", () => {
      const main = document.querySelector("main");
      if (!main) return;
      const u = currentUser();
      main.replaceChildren();
      main.className = "page-content";
      const box = document.createElement("section");
      box.className = "empty-state";
      box.innerHTML =
        '<div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div>';
      const h = document.createElement("h1");
      h.className = "empty-state__title";
      h.textContent = "You don't have access to this page";
      const p = document.createElement("p");
      p.className = "empty-state__text";
      p.textContent = `Your role (${u?.roleLabel || "unknown"}) can't open ${what}. Ask an administrator if you need it.`;
      const a = document.createElement("a");
      a.className = "btn btn-primary";
      a.href = "./home.html";
      a.textContent = "Back to home";
      box.append(h, p, a);
      main.append(box);
    });
    return false;
  }

  // ---------- Navigation: hide what the role can't use ----------

  const SETTINGS_PERMS = ["admin.clinics", "admin.roles", "admin.users", "admin.org", "admin.privacy", "admin.system", "clinic.setup", "tests.approve"];
  const NAV_RULES = [
    { selector: 'a[href="./patients.html"]', perms: ["patients.view"] },
    { selector: 'a[href="./referrals.html"]', perms: ["referrals.track", "review.referral"] },
    { selector: 'a[href="./dashboard.html"]', perms: ["reports.clinic", "reports.national"] },
    { selector: 'a[href="./audit.html"]', perms: ["audit.view"] },
    { selector: 'a[href="./settings.html"]', perms: SETTINGS_PERMS },
    { selector: '[data-action="settings"]', perms: SETTINGS_PERMS },
  ];

  function applyNav() {
    for (const rule of NAV_RULES) {
      if (canAny(rule.perms)) continue;
      document.querySelectorAll(`.app-nav ${rule.selector}, .menu ${rule.selector}`).forEach((el) => (el.hidden = true));
    }
  }
  document.addEventListener("DOMContentLoaded", applyNav);

  return {
    DEFAULT_ROLES,
    SETTINGS_PERMS,
    roles,
    permsOf,
    currentUser,
    can,
    canAny,
    guardPage,
    get denied() {
      return denied;
    },
  };
})();
