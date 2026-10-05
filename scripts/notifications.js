// Header notifications: test approvals waiting for the signed-in user, including ones
// escalated to them (UAT-17, EC-13). Adds a bell next to the user menu on signed-in pages.
// Does nothing on pages without tests.js or without a header.

(() => {
  if (typeof Auth === "undefined" || !Auth.getSessionId()) return;

  const BELL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></svg>';

  function count() {
    if (typeof TestOrders === "undefined") return null;
    try {
      TestOrders.overdue(); // escalate anything past its limit before counting
      return TestOrders.pendingFor().length + TestOrders.insuranceQueue().length;
    } catch {
      return null;
    }
  }

  function render(link) {
    const n = count();
    if (n === null) {
      link.hidden = true;
      return;
    }
    link.hidden = false;
    const text = n === 0 ? "No approvals waiting" : `${n} approval${n === 1 ? "" : "s"} waiting`;
    link.setAttribute("aria-label", text);
    link.title = text;
    const badge = link.querySelector(".notif-bell__count");
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.hidden = n === 0;
  }

  document.addEventListener("DOMContentLoaded", () => {
    const menu = document.querySelector(".app-header .user-menu");
    if (!menu || document.querySelector(".notif-bell")) return;
    const link = document.createElement("a");
    link.className = "notif-bell";
    link.href = "./approvals.html";
    if (location.pathname.endsWith("/approvals.html")) link.setAttribute("aria-current", "page");
    link.innerHTML = BELL + '<span class="notif-bell__count" aria-hidden="true" hidden></span>';
    menu.before(link);
    render(link);
    window.addEventListener("storage", (e) => {
      if (!e.key || e.key === "ndfip.orders" || e.key === "ndfip.tests" || e.key === "ndfip.staff") render(link);
    });
    document.addEventListener("orders:changed", () => render(link));
    setInterval(() => render(link), 60000);
  });
})();
