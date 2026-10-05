// Session checks on every signed-in page. Load in <head> after auth.js, staff.js, access.js.
//
// EC-04  Inactivity: after SESSION minutes without activity (default 30; testers can set
//        "sessionMinutes" in Settings › System) the user is signed out. A warning appears
//        2 minutes before ("Stay signed in"). After signing in again they come back to the
//        same page; drafts ("ndfip.draft.*") are kept.
// EC-07  On load, on focus and every 30 s: a disabled account, or a session from before a
//        password reset, is signed out straight away with a message on the sign-in page.
// Activity is shared across tabs ("ndfip.lastActive"), so working in one tab keeps the
// others alive. FRONT-END ONLY: the server expires sessions and refuses stale tokens.

(() => {
  const PUBLIC = ["ndfip-login-preview.html", "reset-password.html", "mailbox.html", "index.html", ""];
  const page = location.pathname.split("/").pop();
  if (PUBLIC.includes(page)) return;

  const LAST_KEY = "ndfip.lastActive";
  const minutes = () => {
    const m = Number(typeof Db !== "undefined" ? Db.read("ndfip.sim", {})?.sessionMinutes : 0);
    return m > 0 ? m : 30;
  };
  const limitMs = () => minutes() * 60000;
  const warnMs = () => Math.min(2 * 60000, limitMs() / 2);

  const lastActive = () => {
    try {
      return Number(localStorage.getItem(LAST_KEY)) || Date.now();
    } catch {
      return Date.now();
    }
  };
  const markActive = () => {
    try {
      localStorage.setItem(LAST_KEY, String(Date.now()));
    } catch {}
  };

  let leaving = false;
  function leave(reason) {
    if (leaving) return;
    leaving = true;
    const here = page + location.search + location.hash;
    Auth.signOut(reason);
    const next = reason === "expired" && Auth.safeNext(here) ? `&next=${encodeURIComponent(here)}` : "";
    location.replace(`${Auth.LOGIN_PAGE}?reason=${reason}${next}`);
  }

  // Returns false when the session was ended
  function check() {
    const id = Auth.getSessionId();
    if (!id || leaving) return true;
    const staff = typeof Staff !== "undefined" ? Staff.get(id) : null;
    if (staff?.status === "disabled") return leave("disabled"), false;
    if (Auth.getSessionVersion() !== Auth.currentVersion(id)) return leave("reset"), false;
    if (Date.now() - lastActive() >= limitMs()) return leave("expired"), false;
    return true;
  }

  if (!Auth.getSessionId()) return; // the page's own guard sends this visitor to sign-in
  if (!check()) return;
  markActive();

  // ---------- Activity ----------
  let lastMark = Date.now();
  let dialog = null;
  const onActivity = () => {
    if (dialog?.open) return; // only "Stay signed in" extends while the warning shows
    if (Date.now() - lastMark < 10000) return;
    lastMark = Date.now();
    markActive();
  };
  ["pointerdown", "keydown", "input", "scroll", "touchstart"].forEach((type) =>
    window.addEventListener(type, onActivity, { passive: true, capture: true }),
  );
  window.addEventListener("focus", () => {
    if (check()) tick();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === LAST_KEY && dialog?.open && Date.now() - lastActive() < limitMs() - warnMs()) dialog.close("extend");
    if (e.key === "ndfip.session" && !e.newValue && !leaving) location.replace(Auth.LOGIN_PAGE);
  });

  // ---------- Warning dialog ----------
  function buildDialog() {
    dialog = document.createElement("dialog");
    dialog.className = "modal session-warning";
    dialog.setAttribute("aria-labelledby", "session-warning-title");
    dialog.setAttribute("aria-describedby", "session-warning-text");
    dialog.innerHTML = `<div class="modal__inner">
  <div class="modal__header">
    <div>
      <h2 class="modal__title" id="session-warning-title">You'll be signed out soon</h2>
      <p class="modal__description" id="session-warning-text">For security, you'll be signed out in <strong data-countdown>2:00</strong> because there has been no activity. Your draft is kept: sign in again to continue where you stopped.</p>
    </div>
  </div>
  <div class="modal__actions">
    <button type="button" class="btn btn-outline" data-signout>Sign out now</button>
    <button type="button" class="btn btn-primary" data-stay>Stay signed in</button>
  </div>
</div>`;
    dialog.querySelector("[data-stay]").addEventListener("click", () => {
      markActive();
      dialog.close("extend");
    });
    dialog.querySelector("[data-signout]").addEventListener("click", () => leave("signout"));
    // Escape counts as "stay": the user is clearly here
    dialog.addEventListener("cancel", () => markActive());
    document.body.append(dialog);
  }

  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  function tick() {
    if (leaving || !check()) return;
    const left = lastActive() + limitMs() - Date.now();
    if (left <= warnMs()) {
      if (!dialog && document.body) buildDialog();
      if (dialog && !dialog.open) dialog.showModal();
      if (dialog) dialog.querySelector("[data-countdown]").textContent = fmt(left);
    } else if (dialog?.open) dialog.close("extend");
  }

  // Every second while the warning shows; otherwise every 5 s is enough
  let ticks = 0;
  setInterval(() => {
    ticks++;
    if (dialog?.open || ticks % 5 === 0) tick();
  }, 1000);
  // EC-07 checks every 30 s even while idle (account disabled, password reset elsewhere)
  setInterval(check, 30000);
})();
