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
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  // An ID missing from the user list still renders (fallback name) rather
  // than bouncing, so it can't loop with the sign-in page.
  const id = Auth.getSessionId();
  const user = id && (Auth.findUser(id) || { name: id, roleLabel: "Unknown role" });
  if (user) {
    document.getElementById("user-initials").textContent = initials(user.name);
    button.setAttribute("aria-label", `Open user menu for ${user.name}`);
    button.title = `${user.name} (${user.roleLabel})`;
  }

  function openMenu() {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    items()[0].focus();
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
    const list = items();
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

  menu.addEventListener("click", (event) => {
    const item = event.target.closest('[role="menuitem"]');
    if (!item) return;
    closeMenu();
    if (item.dataset.action === "logout") {
      Auth.clearSession();
      window.location.href = Auth.LOGIN_PAGE;
    }
    if (item.dataset.action === "settings") window.location.href = "./settings.html";
    // Account page doesn't exist yet
  });
})();
