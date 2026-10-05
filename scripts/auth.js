// Shared auth helpers for N-DFIP pages. Load after db.js, before page scripts:
//   <script src="./scripts/auth.js"></script>
// Prototype only: demo credentials live client-side.
//
// Password reset (UAT-04): an administrator, or the employee from "Forgot password",
// requests a reset. A one-time link is "e-mailed" to the employee's registered address
// (demo outbox: mailbox.html). The link works once and expires after RESET_MINUTES.
// The administrator never sees or sets the password. A reset bumps the employee's session
// version, which signs out their other sessions (session.js).
// FRONT-END ONLY: a real server stores salted password hashes, sends real e-mail, and
// checks tokens and session versions on every request.

const Auth = (() => {
  const SESSION_KEY = "ndfip.session";
  const SESSION_VER_KEY = "ndfip.session.ver";
  const LOGIN_PAGE = "./ndfip-login-preview.html";
  const HOME_PAGE = "./home.html";
  const PASSWORDS_KEY = "ndfip.passwords";
  const VERSIONS_KEY = "ndfip.sessionVersions";
  const RESETS_KEY = "ndfip.resets";
  const MAILBOX_KEY = "ndfip.mailbox";
  const RESET_MINUTES = 30;

  const ROLES = {
    admin: { label: "Administrator" },
    nurse: { label: "Screening Nurse" },
    practitioner: { label: "Practitioner" },
    senior: { label: "Senior Doctor" },
    supervisor: { label: "Supervisor" },
    director: { label: "Director" },
  };

  const USERS = [
    { employeeId: "100001", password: "Admin@123", name: "System Administrator", role: "admin" },
    // Fictional demo staff
    { employeeId: "100002", password: "Nurse@123", name: "Amal Saeed Al-Harthi", role: "nurse" },
    { employeeId: "100003", password: "Doctor@123", name: "Yousef Khalid Al-Rashidi", role: "practitioner" },
    { employeeId: "100004", password: "Super@123", name: "Mona Abdullah Al-Shehri", role: "supervisor" },
    { employeeId: "100005", password: "Doctor@123", name: "Rana Saad Al-Otaibi", role: "practitioner" },
    { employeeId: "100006", password: "Senior@123", name: "Dr. Fahad Nasser Al-Qahtani", role: "senior" },
    { employeeId: "100007", password: "Director@123", name: "Khalid Ibrahim Al-Mutlaq", role: "director" },
  ];

  const read = (key, fallback) => (typeof Db !== "undefined" ? Db.read(key, fallback) : fallback) ?? fallback;
  const staffOf = (id) => (typeof Staff !== "undefined" ? Staff.get(id) : null);

  function stores() {
    try {
      return [window.localStorage, window.sessionStorage];
    } catch {
      return [];
    }
  }

  function publicUser({ employeeId, name, role }) {
    return { employeeId, name, role, roleLabel: ROLES[role]?.label ?? role };
  }

  function getSessionId() {
    for (const store of stores()) {
      try {
        const id = store.getItem(SESSION_KEY);
        if (id) return id;
      } catch {}
    }
    return null;
  }

  // Version captured when this session signed in (compared by session.js)
  function getSessionVersion() {
    for (const store of stores()) {
      try {
        if (store.getItem(SESSION_KEY)) return Number(store.getItem(SESSION_VER_KEY) || 0);
      } catch {}
    }
    return 0;
  }

  const currentVersion = (id) => Number(read(VERSIONS_KEY, {})[id] || 0);

  // Demo accounts, plus staff added in Settings (they sign in after setting a password)
  function account(employeeId) {
    const demo = USERS.find((u) => u.employeeId === employeeId);
    if (demo) return demo;
    const s = staffOf(employeeId);
    return s ? { employeeId: s.id, password: null, name: s.name, role: s.role } : null;
  }

  function findUser(employeeId) {
    const user = employeeId ? account(employeeId) : null;
    return user ? publicUser(user) : null;
  }

  function setSession(employeeId, remember = false) {
    const [local, session] = stores();
    try {
      for (const store of [local, session]) {
        store?.removeItem(SESSION_KEY);
        store?.removeItem(SESSION_VER_KEY);
      }
      const target = remember ? local : session;
      target?.setItem(SESSION_KEY, employeeId);
      target?.setItem(SESSION_VER_KEY, String(currentVersion(employeeId)));
      local?.setItem("ndfip.lastActive", String(Date.now()));
    } catch {}
  }

  // Per-session working state (e.g. the selected patient) that must not
  // carry over to the next user who signs in on this tab. Drafts ("ndfip.draft.*") stay.
  const SESSION_STATE_KEYS = ["ndfip.df.patient", "ndfip.emergency", "ndfip.clinic"];

  function clearSession() {
    for (const store of stores()) {
      try {
        store.removeItem(SESSION_KEY);
        store.removeItem(SESSION_VER_KEY);
        SESSION_STATE_KEYS.forEach((key) => store.removeItem(key));
      } catch {}
    }
  }

  // ---------- Passwords ----------
  // Demo hash (cyrb53, salted with the employee ID). A real server uses a slow, salted hash.
  function hash(text, salt) {
    const str = `${salt}:${text}`;
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function passwordMatches(user, password) {
    const override = read(PASSWORDS_KEY, {})[user.employeeId];
    if (override) return override === hash(password, user.employeeId);
    return user.password !== null && user.password === password;
  }

  // Rules shown on the reset page; each returns true when met
  const PASSWORD_RULES = [
    { id: "length", text: "At least 10 characters", test: (p) => p.length >= 10 },
    { id: "upper", text: "An upper-case letter", test: (p) => /[A-Z]/.test(p) },
    { id: "lower", text: "A lower-case letter", test: (p) => /[a-z]/.test(p) },
    { id: "digit", text: "A number", test: (p) => /\d/.test(p) },
    { id: "symbol", text: "A symbol, such as ! @ # or $", test: (p) => /[^A-Za-z0-9]/.test(p) },
  ];

  // ---------- Audit helpers ----------
  // Where an account event belongs: clinic-level staff log under their clinic, facility
  // staff under the facility; organisation- or region-level users log with no unit.
  function unitsOf(employeeId) {
    if (typeof Org === "undefined") return { clinicId: "", facilityId: "" };
    const nodes = (staffOf(employeeId)?.assigned ?? []).map((id) => Org.get(id)).filter(Boolean);
    const clinic = nodes.find((n) => n.level === "clinic");
    if (clinic) return { clinicId: clinic.id, facilityId: Org.facilityOf(clinic.id)?.id ?? "" };
    const facility = nodes.find((n) => n.level === "facility");
    if (facility) return { clinicId: "", facilityId: facility.id };
    return { clinicId: "", facilityId: "" };
  }

  function log(type, employeeId, detail = {}) {
    if (typeof Audit === "undefined") return;
    const user = findUser(employeeId);
    Audit.log(type, {
      by: user?.name ?? employeeId ?? "unknown",
      byId: user ? employeeId : null,
      role: user?.roleLabel ?? "",
      ...unitsOf(employeeId),
      ...detail,
    });
  }

  // ---------- Sign in ----------

  // { ok, user } or { ok: false, reason: "credentials" | "disabled" }
  function attempt(employeeId, password, remember) {
    const id = String(employeeId ?? "").trim();
    const user = account(id);
    if (!user || !passwordMatches(user, password)) {
      log("auth.failed", id, { by: id || "(blank)", byId: null, role: "", action: "Failed sign-in (wrong employee ID or password)" });
      return { ok: false, reason: "credentials" };
    }
    if (staffOf(id)?.status === "disabled") {
      log("auth.failed", id, { action: "Failed sign-in (account disabled)" });
      return { ok: false, reason: "disabled" };
    }
    setSession(user.employeeId, remember);
    log("auth.signin", id, { action: "Signed in" });
    return { ok: true, user: publicUser(user) };
  }

  // Returns the signed-in user, or null when the credentials don't match.
  function signIn(employeeId, password, remember) {
    const result = attempt(employeeId, password, remember);
    return result.ok ? result.user : null;
  }

  // reason: "signout" (user chose it), "expired", "disabled", "reset"
  function signOut(reason = "signout") {
    const id = getSessionId();
    if (id) {
      const actions = {
        signout: ["auth.signout", "Signed out"],
        expired: ["auth.expired", "Signed out: session expired after inactivity"],
        disabled: ["auth.signout", "Signed out: account disabled"],
        reset: ["auth.signout", "Signed out: password changed"],
      };
      const [type, action] = actions[reason] ?? actions.signout;
      log(type, id, { action });
    }
    clearSession();
  }

  // ---------- Password reset ----------

  function mail(message) {
    const all = read(MAILBOX_KEY, []);
    all.push({ id: `m-${Date.now().toString(36)}`, at: new Date().toISOString(), ...message });
    Db.write(MAILBOX_KEY, all, { where: "mailbox" });
  }

  function token() {
    const bytes = new Uint8Array(18);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Starts a reset for employeeId. requestedBy: { id, name, role } of the admin, or null
  // when the employee asked from the sign-in page.
  // Returns { ok } or { ok: false, reason: "unknown" | "no-email" | "disabled" }.
  // Throws Db.SaveError when it can't be saved.
  function requestReset(employeeId, requestedBy = null) {
    const id = String(employeeId ?? "").trim();
    const user = account(id);
    const self = !requestedBy;
    const asker = requestedBy ?? { id: user ? id : null, name: user?.name ?? (id || "(blank)"), role: user ? ROLES[user.role]?.label ?? user.role : "" };
    const audit = (action, extra = {}) =>
      typeof Audit !== "undefined" &&
      Audit.log("password.reset", {
        by: asker.name, byId: asker.id, role: asker.role, ...unitsOf(id),
        action, record: user ? `Employee ${id}` : null, ...extra,
      });
    if (!user) {
      audit(`Password reset requested for unknown employee ID "${id}"`);
      return { ok: false, reason: "unknown" };
    }
    const staff = staffOf(id);
    if (staff?.status === "disabled") {
      audit(`Password reset refused for ${user.name}: account disabled`);
      return { ok: false, reason: "disabled" };
    }
    const email = staff?.email?.trim();
    if (!email) {
      audit(`Password reset not sent to ${user.name}: no e-mail address on file`);
      return { ok: false, reason: "no-email" };
    }
    const t = token();
    const now = Date.now();
    const resets = read(RESETS_KEY, []).filter((r) => !(r.userId === id && !r.usedAt)); // older open links stop working
    resets.push({ token: t, userId: id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + RESET_MINUTES * 60000).toISOString(), usedAt: null, requestedBy: asker.name, self });
    Db.write(RESETS_KEY, resets, { where: "password reset" });
    const link = `reset-password.html?token=${t}`;
    mail({
      to: email,
      toName: user.name,
      subject: "Reset your N-DFIP password",
      body: [
        `Dear ${user.name},`,
        self
          ? "We received a request to reset the password for your N-DFIP account."
          : `${asker.name} (${asker.role}) started a password reset for your N-DFIP account.`,
        `Use the link below to choose a new password. It works once and expires in ${RESET_MINUTES} minutes.`,
        "If you didn't expect this, ignore this e-mail and tell your administrator.",
      ],
      link,
    });
    audit(self ? `Password reset requested by ${user.name} (Forgot password); link e-mailed to ${email}` : `Password reset for ${user.name} started by ${asker.name}; link e-mailed to ${email}`);
    return { ok: true };
  }

  // { ok, userId, name } or { ok: false, reason: "unknown" | "used" | "expired" }
  function checkResetToken(t) {
    const r = read(RESETS_KEY, []).find((x) => x.token === t);
    if (!t || !r) return { ok: false, reason: "unknown" };
    if (r.usedAt) return { ok: false, reason: "used" };
    if (Date.now() > new Date(r.expiresAt).getTime()) return { ok: false, reason: "expired" };
    return { ok: true, userId: r.userId, name: findUser(r.userId)?.name ?? r.userId, expiresAt: r.expiresAt };
  }

  // Sets the new password, spends the token and signs out the employee's other sessions.
  // Returns { ok } or { ok: false, reason: "unknown" | "used" | "expired" | "weak" | "same" }.
  function completeReset(t, newPassword) {
    const check = checkResetToken(t);
    if (!check.ok) return check;
    if (!PASSWORD_RULES.every((rule) => rule.test(newPassword))) return { ok: false, reason: "weak" };
    const user = account(check.userId);
    if (passwordMatches(user, newPassword)) return { ok: false, reason: "same" };
    const passwords = read(PASSWORDS_KEY, {});
    passwords[check.userId] = hash(newPassword, check.userId);
    const resets = read(RESETS_KEY, []).map((r) => (r.token === t ? { ...r, usedAt: new Date().toISOString() } : r));
    const versions = read(VERSIONS_KEY, {});
    versions[check.userId] = currentVersion(check.userId) + 1;
    // Spend the token first: if a later write fails, the link can't be replayed
    Db.write(RESETS_KEY, resets, { where: "password reset" });
    Db.write(PASSWORDS_KEY, passwords, { where: "password reset" });
    Db.write(VERSIONS_KEY, versions, { where: "password reset" });
    log("password.reset", check.userId, { action: `Password changed by ${user.name} with a reset link; other sessions signed out`, record: `Employee ${check.userId}` });
    return { ok: true };
  }

  // Same-origin page inside the app, e.g. "review.html?id=x" (used for ?next=)
  function safeNext(next) {
    return typeof next === "string" && /^\.?\/?[\w-]+\.html(\?[^#\s]*)?(#\S*)?$/.test(next) && !next.includes("//") ? next : null;
  }

  return {
    LOGIN_PAGE,
    HOME_PAGE,
    RESET_MINUTES,
    PASSWORD_RULES,
    ROLES,
    USERS: USERS.map((u) => ({ ...publicUser(u), password: u.password })),
    getSessionId,
    getSessionVersion,
    currentVersion,
    findUser,
    attempt,
    signIn,
    signOut,
    clearSession,
    requestReset,
    checkResetToken,
    completeReset,
    safeNext,
    unitsOf,
    mailbox: () => read(MAILBOX_KEY, []),
  };
})();
