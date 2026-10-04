// Settings › Roles & permissions: roles, permission matrix and staff role assignment.
// Demo UI only: saved to localStorage, not enforced on live pages.
// Needs auth.js and staff.js.

(() => {
  const KEY = "ndfip.roles";
  const form = document.getElementById("roles");
  if (!form) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------- Permission catalogue ----------
  // requires: turning this on also turns these on; turning those off turns this off.

  const GROUPS = [
    {
      id: "patients", title: "Patients", perms: [
        { id: "patients.view", label: "View patient records", desc: "Open the patient summary and history." },
        { id: "patients.search", label: "Search patients", desc: "By file number, national ID or phone.", requires: ["patients.view"] },
        { id: "patients.edit", label: "Edit patient details", desc: "Demographics and contact details (registration).", requires: ["patients.view"] },
      ],
    },
    {
      id: "screening", title: "Screening", perms: [
        { id: "screening.perform", label: "Perform screening", desc: "Fill in Part 1 in the screening room and send it for review.", requires: ["patients.view"] },
        { id: "screening.editOwn", label: "Edit own screening until review starts", desc: "Locked once a practitioner opens the case.", requires: ["screening.perform"] },
      ],
    },
    {
      id: "review", title: "Practitioner review", perms: [
        { id: "review.queue", label: "Open review queue", desc: "See screenings awaiting review and open them, including the nurse findings.", requires: ["patients.view"] },
        { id: "review.correct", label: "Correct nurse findings", desc: "Changes are timestamped; the original value stays visible.", requires: ["review.queue"] },
        { id: "review.decide", label: "Confirm or override recommendations", desc: "Risk category, classifications and escalation flags.", requires: ["review.queue"] },
        { id: "review.orders", label: "Place orders", desc: "Laboratory, imaging and referral orders.", requires: ["review.queue"] },
        { id: "review.referral", label: "Make referral decisions", desc: "Destination, urgency and timing.", requires: ["review.queue"] },
        { id: "review.signoff", label: "Sign off reviews", desc: "Final sign-off locks the review and the clinical note.", requires: ["review.decide"] },
        { id: "review.reopen", label: "Reopen signed reviews", desc: "Unlock a signed review for amendment.", requires: ["review.signoff"] },
      ],
    },
    {
      id: "documents", title: "Notes & records", perms: [
        { id: "notes.print", label: "Print notes and patient instructions", desc: "", requires: ["patients.view"] },
        { id: "audit.view", label: "View audit trail", desc: "Who changed what, and when." },
      ],
    },
    {
      id: "reports", title: "Dashboards & reports", perms: [
        { id: "reports.clinic", label: "View clinic dashboard", desc: "Workload, waiting times, follow-up completion." },
        { id: "reports.national", label: "View national aggregates", desc: "Approved aggregate indicators only, no patient-level data." },
      ],
    },
    {
      id: "admin", title: "Administration", perms: [
        { id: "admin.clinics", label: "Manage clinics and steps", desc: "Clinic details, team, step order and questions." },
        { id: "admin.roles", label: "Manage roles and permissions", desc: "This page." },
        { id: "admin.users", label: "Manage staff accounts", desc: "Add staff, assign roles, deactivate accounts." },
      ],
    },
  ];
  const PERMS = GROUPS.flatMap((g) => g.perms);
  const PERM = Object.fromEntries(PERMS.map((p) => [p.id, p]));
  const dependentsOf = (id) => PERMS.filter((p) => p.requires?.includes(id)).map((p) => p.id);

  // Defaults: nurses screen and don't review; practitioners review and don't screen;
  // administrators manage the platform but don't make clinical decisions (N-DFIP dossier).
  const DEFAULT_ROLES = [
    {
      id: "admin", name: "Administrator", system: true,
      description: "Manages clinics, staff and settings. Does not edit clinical decisions.",
      perms: ["patients.view", "patients.search", "patients.edit", "audit.view", "reports.clinic", "admin.clinics", "admin.roles", "admin.users"],
    },
    {
      id: "nurse", name: "Screening Nurse", system: true,
      description: "Prepares the encounter: records the Part 1 screening before the practitioner sees the patient.",
      perms: ["patients.view", "patients.search", "screening.perform", "screening.editOwn"],
    },
    {
      id: "practitioner", name: "Practitioner", system: true,
      description: "Reviews screenings, decides the plan, orders and referrals, and signs off.",
      perms: ["patients.view", "patients.search", "review.queue", "review.correct", "review.decide", "review.orders", "review.referral", "review.signoff", "notes.print", "reports.clinic"],
    },
  ];

  // Guardrail: someone must always be able to manage roles
  const LOCKED = { admin: ["admin.roles"] };
  const isLocked = (roleId, permId) => LOCKED[roleId]?.includes(permId) ?? false;

  function defaults() {
    return {
      roles: clone(DEFAULT_ROLES),
      staff: StaffDirectory.map((s) => ({ id: s.id, name: s.name, title: s.title, role: s.role, active: true })),
    };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved?.roles?.length) return saved;
    } catch {}
    return defaults();
  }

  let saved = load();
  let state = clone(saved);
  let selected = state.roles[0].id;
  let tab = "roles";

  const me = Auth.findUser(Auth.getSessionId());
  const isAdmin = me?.role === "admin";

  const dirty = () => JSON.stringify(state) !== JSON.stringify(saved);
  function updateStatus(message) {
    $("#roles-status").textContent = message ?? (!isAdmin ? "View only" : dirty() ? "Unsaved changes" : "All changes saved");
  }

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  const roleById = (id) => state.roles.find((r) => r.id === id);
  const membersOf = (id) => state.staff.filter((s) => s.role === id);

  // Turn a permission on/off, keeping prerequisites consistent
  function setPerm(role, permId, on) {
    const set = new Set(role.perms);
    const changed = [];
    const enable = (id) => {
      if (set.has(id)) return;
      set.add(id);
      changed.push(id);
      (PERM[id].requires ?? []).forEach(enable);
    };
    const disable = (id) => {
      if (!set.has(id) || isLocked(role.id, id)) return;
      set.delete(id);
      changed.push(id);
      dependentsOf(id).forEach(disable);
    };
    on ? enable(permId) : disable(permId);
    role.perms = PERMS.map((p) => p.id).filter((id) => set.has(id));
    return changed.filter((id) => id !== permId);
  }

  // ---------- Tabs ----------

  const TABS = ["roles", "matrix", "staff"];
  function showTab(name, focus = false) {
    tab = name;
    for (const t of TABS) {
      const button = $(`#tab-${t}`);
      button.setAttribute("aria-selected", String(t === name));
      button.tabIndex = t === name ? 0 : -1;
      $(`#panel-${t}`).hidden = t !== name;
    }
    if (focus) $(`#tab-${name}`).focus();
    render();
  }
  TABS.forEach((t) => $(`#tab-${t}`).addEventListener("click", () => showTab(t)));
  $(".tabs", form).addEventListener("keydown", (event) => {
    const i = TABS.indexOf(tab);
    const next = event.key === "ArrowRight" ? (i + 1) % TABS.length : event.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : null;
    if (next === null) return;
    event.preventDefault();
    showTab(TABS[next], true);
  });

  // ---------- Roles tab ----------

  function renderRoleList() {
    const host = $("#role-list");
    host.replaceChildren(
      ...state.roles.map((role) => {
        const b = el("button", "role-item");
        b.type = "button";
        b.setAttribute("aria-pressed", String(role.id === selected));
        const top = el("span", "role-item__top");
        top.append(el("span", "role-item__name", role.name || "Untitled role"));
        if (role.system) top.append(el("span", "badge badge-muted", "System"));
        b.append(top, el("span", "role-item__meta", `${plural(membersOf(role.id).length, "member")} · ${plural(role.perms.length, "permission")}`));
        b.addEventListener("click", () => {
          selected = role.id;
          render();
        });
        return b;
      }),
    );
  }

  function renderRoleEditor() {
    const role = roleById(selected);
    const host = $("#role-editor");
    host.replaceChildren();
    if (!role) return;

    const head = el("div", "settings-card");
    const nameWrap = el("div", "q");
    const nameLabel = el("label", "label", "Role name");
    nameLabel.htmlFor = "role-name";
    const name = el("input", "input");
    name.id = "role-name";
    name.value = role.name;
    name.disabled = role.system;
    const nameErr = el("p", "field-error");
    nameErr.hidden = true;
    nameErr.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';
    name.addEventListener("input", () => {
      role.name = name.value;
      if (name.value.trim()) {
        nameErr.hidden = true;
        nameWrap.classList.remove("q--invalid");
        name.removeAttribute("aria-invalid");
      }
      renderRoleList();
      updateStatus();
    });
    nameWrap.append(nameLabel, name);
    if (role.system) nameWrap.append(el("p", "field-hint", "System roles can't be renamed or deleted."));
    nameWrap.append(nameErr);
    nameWrap.dataset.check = "role-name";

    const descWrap = el("div", "q");
    const descLabel = el("label", "label", "Description");
    descLabel.htmlFor = "role-desc";
    const desc = el("textarea", "input textarea");
    desc.id = "role-desc";
    desc.rows = 2;
    desc.value = role.description;
    desc.addEventListener("input", () => {
      role.description = desc.value;
      updateStatus();
    });
    descWrap.append(descLabel, desc);

    const members = membersOf(role.id);
    const memberLine = el("p", "field-hint", members.length ? `Members: ${members.map((m) => m.name).join(", ")}` : "No members yet. Assign staff in the Staff tab.");

    head.append(nameWrap, descWrap, memberLine);
    if (!role.system && isAdmin) {
      const del = el("button", "btn btn-outline btn-sm", "Delete role");
      del.type = "button";
      del.addEventListener("click", () => {
        if (members.length) {
          toast(`Move ${plural(members.length, "member")} to another role first`);
          return;
        }
        state.roles = state.roles.filter((r) => r.id !== role.id);
        selected = state.roles[0].id;
        render();
        updateStatus();
      });
      head.append(del);
    }
    host.append(head);

    for (const group of GROUPS) {
      const card = el("fieldset", "settings-card perm-group");
      const legend = el("legend", "perm-group__title");
      const on = group.perms.filter((p) => role.perms.includes(p.id)).length;
      legend.append(el("span", "", group.title), el("span", "badge badge-muted", `${on} of ${group.perms.length}`));
      card.append(legend);
      for (const perm of group.perms) {
        const row = el("label", "perm-row");
        const box = el("input", "switch");
        box.type = "checkbox";
        box.setAttribute("role", "switch");
        box.checked = role.perms.includes(perm.id);
        box.disabled = isLocked(role.id, perm.id);
        const text = el("span", "perm-row__text");
        text.append(el("span", "perm-row__label", perm.label));
        if (perm.desc) text.append(el("span", "perm-row__desc", perm.desc));
        if (perm.requires?.length) text.append(el("span", "perm-row__requires", `Requires: ${perm.requires.map((r) => PERM[r].label.toLowerCase()).join(", ")}`));
        if (isLocked(role.id, perm.id)) text.append(el("span", "perm-row__requires", "Always on, so someone can manage roles."));
        box.addEventListener("change", () => {
          const also = setPerm(role, perm.id, box.checked);
          render();
          updateStatus();
          if (also.length) toast(`${box.checked ? "Also turned on" : "Also turned off"}: ${also.map((id) => PERM[id].label.toLowerCase()).join(", ")}`);
          $(`#role-editor input[data-perm="${perm.id}"]`)?.focus();
        });
        box.dataset.perm = perm.id;
        row.append(text, box);
        card.append(row);
      }
      host.append(card);
    }
  }

  // ---------- Matrix tab ----------

  function renderMatrix() {
    const table = el("table", "data-table matrix-table");
    const thead = el("thead");
    const hr = el("tr");
    hr.append(el("th", "", "Permission"));
    state.roles.forEach((r) => hr.append(el("th", "", r.name || "Untitled role")));
    thead.append(hr);
    const tbody = el("tbody");
    for (const group of GROUPS) {
      const gr = el("tr", "matrix-table__group");
      const gth = el("th");
      gth.append(el("span", "matrix-table__group-label", group.title));
      gth.colSpan = state.roles.length + 1;
      gr.append(gth);
      tbody.append(gr);
      for (const perm of group.perms) {
        const tr = el("tr");
        tr.append(el("th", "", perm.label));
        for (const role of state.roles) {
          const td = el("td");
          const box = el("input", "checkbox");
          box.type = "checkbox";
          box.checked = role.perms.includes(perm.id);
          box.disabled = isLocked(role.id, perm.id);
          box.setAttribute("aria-label", `${role.name}: ${perm.label}`);
          box.addEventListener("change", () => {
            const also = setPerm(role, perm.id, box.checked);
            render();
            updateStatus();
            if (also.length) toast(`${role.name}: ${box.checked ? "also turned on" : "also turned off"} ${also.map((id) => PERM[id].label.toLowerCase()).join(", ")}`);
            $(`#matrix input[aria-label="${CSS.escape(`${role.name}: ${perm.label}`)}"]`)?.focus();
          });
          td.append(box);
          tr.append(td);
        }
        tbody.append(tr);
      }
    }
    table.append(thead, tbody);
    $("#matrix").replaceChildren(table);
  }

  // ---------- Staff tab ----------

  function renderStaff() {
    const table = el("table", "data-table staff-table");
    const thead = el("thead");
    const hr = el("tr");
    ["Name", "Employee ID", "Title", "Role", "Active"].forEach((h) => hr.append(el("th", "", h)));
    thead.append(hr);
    const tbody = el("tbody");
    const adminCount = state.staff.filter((s) => s.role === "admin" && s.active).length;
    for (const person of state.staff) {
      const tr = el("tr");
      const nameCell = el("th");
      nameCell.scope = "row";
      const initials = person.name.split(" ").filter((_, i, a) => i === 0 || i === a.length - 1).map((p) => p[0]).join("");
      const who = el("span", "staff-table__name");
      who.append(el("span", "staff-option__avatar", initials), el("span", "", person.name));
      nameCell.append(who);
      tr.append(nameCell, el("td", "", person.id), el("td", "", person.title));

      const roleCell = el("td");
      const select = el("select", "input select");
      select.setAttribute("aria-label", `Role for ${person.name}`);
      state.roles.forEach((r) => select.append(new Option(r.name || "Untitled role", r.id, false, r.id === person.role)));
      // Keep at least one active administrator
      const lastAdmin = person.role === "admin" && person.active && adminCount === 1;
      select.disabled = lastAdmin;
      select.addEventListener("change", () => {
        person.role = select.value;
        render();
        updateStatus();
        $(`#staff-table select[aria-label="Role for ${person.name}"]`)?.focus();
      });
      roleCell.append(select);
      if (lastAdmin) roleCell.append(el("p", "field-hint", "Last administrator"));
      tr.append(roleCell);

      const activeCell = el("td");
      const sw = el("input", "switch");
      sw.type = "checkbox";
      sw.setAttribute("role", "switch");
      sw.setAttribute("aria-label", `${person.name} active`);
      sw.checked = person.active;
      sw.disabled = lastAdmin;
      sw.addEventListener("change", () => {
        person.active = sw.checked;
        render();
        updateStatus();
      });
      activeCell.append(sw);
      tr.append(activeCell);
      if (!person.active) tr.classList.add("staff-table__inactive");
      tbody.append(tr);
    }
    table.append(thead, tbody);
    $("#staff-table").replaceChildren(table);
  }

  // ---------- Render / save ----------

  function render() {
    if (tab === "roles") {
      renderRoleList();
      renderRoleEditor();
    } else if (tab === "matrix") renderMatrix();
    else renderStaff();
    // View only: browse roles, but every control is read-only
    if (!isAdmin) $$("#roles-fieldset input, #roles-fieldset select, #roles-fieldset textarea").forEach((f) => (f.disabled = true));
  }

  $("#new-role").addEventListener("click", () => {
    const id = `role-${Math.random().toString(36).slice(2, 7)}`;
    state.roles.push({ id, name: "", description: "", system: false, perms: ["patients.view"] });
    selected = id;
    showTab("roles");
    updateStatus();
    $("#role-name").focus();
  });

  $("#discard-roles").addEventListener("click", () => {
    state = clone(saved);
    if (!roleById(selected)) selected = state.roles[0].id;
    render();
    updateStatus();
    toast("Changes discarded");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!isAdmin) return;
    const unnamed = state.roles.find((r) => !r.name.trim());
    if (unnamed) {
      selected = unnamed.id;
      showTab("roles");
      const wrap = $('[data-check="role-name"]');
      wrap.classList.add("q--invalid");
      const err = $(".field-error", wrap);
      err.hidden = false;
      $("span", err).textContent = "Enter the role name.";
      $("#role-name").setAttribute("aria-invalid", "true");
      $("#role-name").focus();
      updateStatus("Fix the highlighted field before saving");
      return;
    }
    saved = clone(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {}
    updateStatus();
    toast("Roles and permissions saved");
  });

  showTab("roles");
  updateStatus();
})();
