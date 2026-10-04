// Shared auth helpers for N-DFIP pages. Load before page scripts:
//   <script src="./scripts/auth.js"></script>
// Prototype only: demo credentials live client-side.

const Auth = (() => {
  const SESSION_KEY = "ndfip.session";
  const LOGIN_PAGE = "./ndfip-login-preview.html";
  const HOME_PAGE = "./home.html";

  const ROLES = {
    admin: { label: "Administrator" },
    nurse: { label: "Screening Nurse" },
    practitioner: { label: "Practitioner" },
  };

  const USERS = [
    { employeeId: "100001", password: "Admin@123", name: "System Administrator", role: "admin" },
    // Fictional demo staff
    { employeeId: "100002", password: "Nurse@123", name: "Amal Saeed Al-Harthi", role: "nurse" },
    { employeeId: "100003", password: "Doctor@123", name: "Yousef Khalid Al-Rashidi", role: "practitioner" },
  ];

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

  function findUser(employeeId) {
    const user = USERS.find((u) => u.employeeId === employeeId);
    return user ? publicUser(user) : null;
  }

  function setSession(employeeId, remember = false) {
    const [local, session] = stores();
    try {
      local?.removeItem(SESSION_KEY);
      session?.removeItem(SESSION_KEY);
      (remember ? local : session)?.setItem(SESSION_KEY, employeeId);
    } catch {}
  }

  // Per-session working state (e.g. the selected patient) that must not
  // carry over to the next user who signs in on this tab.
  const SESSION_STATE_KEYS = ["ndfip.df.patient"];

  function clearSession() {
    for (const store of stores()) {
      try {
        store.removeItem(SESSION_KEY);
        SESSION_STATE_KEYS.forEach((key) => store.removeItem(key));
      } catch {}
    }
  }

  // Returns the signed-in user, or null when the credentials don't match.
  function signIn(employeeId, password, remember) {
    const user = USERS.find((u) => u.employeeId === employeeId.trim());
    if (!user || user.password !== password) return null;
    setSession(user.employeeId, remember);
    return publicUser(user);
  }

  return {
    LOGIN_PAGE,
    HOME_PAGE,
    USERS: USERS.map((u) => ({ ...publicUser(u), password: u.password })),
    getSessionId,
    findUser,
    signIn,
    clearSession,
  };
})();
