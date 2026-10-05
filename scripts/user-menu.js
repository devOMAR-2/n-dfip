// Header user menu (avatar + dropdown) shared by signed-in pages.
// Load after auth.js, at the end of <body>:
//   <script src="./scripts/user-menu.js"></script>

(() => {
  const button = document.getElementById("user-menu-button");
  const menu = document.getElementById("user-menu");
  if (!button || !menu) return;

  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];

  function initials(name) {
    return name
      .replace(/^Dr\.\s+/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  // An ID missing from the user list still renders (fallback name) rather
  // than bouncing, so it can't loop with the sign-in page.
  const id = Auth.getSessionId();
  const live = id && typeof Access !== "undefined" ? Access.currentUser() : null;
  const user = id && (live || Auth.findUser(id) || { name: id, roleLabel: "Unknown role" });
  if (user) {
    document.getElementById("user-initials").textContent = initials(user.name);
    button.setAttribute("aria-label", `Open user menu for ${user.name}`);
    button.title = `${user.name} (${user.roleLabel})`;
  }

  function openMenu() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items().find((i) => !i.hidden)?.focus();
  }

  function closeMenu({ focusButton = false } = {}) {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  }

  button.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !event.target.closest(".user-menu")) closeMenu();
  });

  menu.addEventListener("keydown", (event) => {
    const list = items().filter((i) => !i.hidden);
    const index = list.indexOf(document.activeElement);
    if (event.key === "ArrowDown") list[(index + 1) % list.length].focus();
    else if (event.key === "ArrowUp") list[(index - 1 + list.length) % list.length].focus();
    else if (event.key === "Home") list[0].focus();
    else if (event.key === "End") list[list.length - 1].focus();
    else if (event.key === "Tab") closeMenu();
    else return;
    if (event.key !== "Tab") event.preventDefault();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) closeMenu({ focusButton: true });
  });

  // ---------- Account panel ----------
  let account = null;
  function openAccount() {
    const u = Access.currentUser();
    const staff = typeof Staff !== "undefined" ? Staff.get(u.id) : null;
    if (!account) {
      account = document.createElement("dialog");
      account.className = "modal";
      account.setAttribute("aria-labelledby", "account-title");
      document.body.append(account);
    }
    account.innerHTML = `<div class="modal__inner">
  <div class="modal__header">
    <div>
      <h2 class="modal__title" id="account-title"></h2>
      <p class="modal__description" data-role></p>
    </div>
    <form method="dialog"><button type="submit" class="btn btn-icon" aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></button></form>
  </div>
  <dl class="account-details"></dl>
  <p class="field-hint" data-reset-note role="status"></p>
  <div class="modal__actions">
    <button type="button" class="btn btn-outline" data-reset>E-mail me a password reset link</button>
  </div>
</div>`;
    account.querySelector("#account-title").textContent = u.name;
    account.querySelector("[data-role]").textContent = `${u.roleLabel} · Employee ID ${u.id}`;
    const dl = account.querySelector(".account-details");
    const units = (staff?.assigned ?? []).map((n) => (typeof Org !== "undefined" ? (Org.get(n)?.level === "clinic" ? Org.clinicLabel(n) : Org.get(n)?.name) : n) ?? n);
    for (const [k, v] of [["Job title", staff?.title], ["Works in", units.join(", ")], ["E-mail", staff?.email || "None on file"], ["Phone", staff?.phone]]) {
      if (!v) continue;
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    const note = account.querySelector("[data-reset-note]");
    account.querySelector("[data-reset]").addEventListener("click", (e) => {
      let r;
      try {
        r = Auth.requestReset(u.id, null);
      } catch (err) {
        r = { ok: false, message: err?.message };
      }
      note.textContent = r.ok
        ? `A reset link was e-mailed to ${staff.email}. It works once and expires in ${Auth.RESET_MINUTES} minutes.`
        : r.reason === "no-email"
          ? "There's no e-mail address on your staff record. Ask your administrator to add one."
          : r.message ?? "The link couldn't be sent. Try again.";
      e.target.disabled = !!r.ok;
    });
    account.showModal();
  }

  menu.addEventListener("click", (event) => {
    const item = event.target.closest('[role="menuitem"]');
    if (!item) return;
    closeMenu();
    if (item.dataset.action === "logout") {
      Auth.signOut("signout");
      window.location.href = Auth.LOGIN_PAGE;
    }
    if (item.dataset.action === "settings") window.location.href = "./settings.html";
    if (item.dataset.action === "account" && typeof Access !== "undefined") openAccount();
  });
})();
