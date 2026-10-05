// Settings: one view per hash (#clinics, #roles, #organisation, ...). Each view and its
// nav link carry data-perms (space-separated, any one is enough). Views the user can't use
// are hidden; the first allowed view opens when the hash names nothing allowed.
(() => {
  const nav = document.querySelector(".settings-nav");
  if (!nav || Access.denied) return;
  const allowed = (node) => Access.canAny((node.dataset.perms || "").split(/\s+/).filter(Boolean));
  const views = [...document.querySelectorAll(".settings-main[id]")];
  const links = [...nav.querySelectorAll("a[href^='#']")];

  links.forEach((a) => (a.hidden = !allowed(a)));

  function route() {
    const want = location.hash.slice(1);
    const open = views.find((v) => v.id === want && allowed(v)) ?? views.find(allowed);
    views.forEach((v) => (v.hidden = v !== open));
    links.forEach((a) => {
      if (open && a.getAttribute("href") === `#${open.id}`) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (open) document.dispatchEvent(new CustomEvent("settings:view", { detail: open.id }));
  }

  window.addEventListener("hashchange", route);
  route();
})();
