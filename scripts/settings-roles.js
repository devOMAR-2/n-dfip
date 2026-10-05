// Settings › Roles & permissions: roles and the permission matrix.
// Live pages read these roles (access.js). Staff role assignment lives in Settings › Staff
// (settings-staff.js, stored through Staff.set). Saves are audit-logged (UAT-05).
// Needs db, auth, staff, access, audit.

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
        { id: "patients.merge", label: "Merge duplicate patient files", desc: "Two files with the same national ID. Logged; nothing is deleted.", requires: ["patients.view"] },
        { id: "privacy.emergency", label: "Emergency access to hidden records", desc: "Open a hidden record by giving a reason. Logged and flagged for review.", requires: ["patients.view"] },
      ],
    },
    {
      id: "screening", title: "Screening", perms: [
        { id: "screening.perform", label: "Perform screening", desc: "Fill in Part 1 in the screening room and send it for review.", requires: ["patients.view"] },
        { id: "screening.editOwn", label: "Edit own screening until review starts", desc: "Locked once a practitioner opens the case.", requires: ["screening.perform"] },
        { id: "screening.pull", label: "Complete the nurse part for files not yet sent", desc: "Open a file at stage 1 or 2 and fill in or edit the screening. Recorded in the audit log.", requires: ["patients.view"] },
      ],
    },
    {
      id: "review", title: "Practitioner review", perms: [
        { id: "review.queue", label: "Open review queue", desc: "See screenings awaiting review and open them, including the nurse findings.", requires: ["patients.view"] },
        { id: "review.correct", label: "Correct nurse findings", desc: "Changes are timestamped; the original value stays visible.", requires: ["review.queue"] },
        { id: "review.decide", label: "Make clinical decisions", desc: "Confirm or override recommendations: risk category, classifications and escalation flags.", requires: ["review.queue"] },
        { id: "medication.prescribe", label: "Prescribe medication", desc: "Edit the medication section of the encounter.", requires: ["review.queue"] },
        { id: "review.orders", label: "Place orders", desc: "Laboratory, imaging and referral orders.", requires: ["review.queue"] },
        { id: "review.referral", label: "Make referral decisions", desc: "Destination, urgency and timing.", requires: ["review.queue"] },
        { id: "review.signoff", label: "Sign off reviews", desc: "Final sign-off locks the review and the clinical note.", requires: ["review.decide"] },
        { id: "review.reopen", label: "Reopen signed encounters", desc: "Reopen with a reason. The signed version stays in the history.", requires: ["patients.view"] },
        { id: "tests.approve", label: "Approve tests", desc: "Approve or reject tests that need approval; record insurance decisions." },
        { id: "referrals.track", label: "Track referrals", desc: "See referrals and update their status (received, attended, closed)." },
        { id: "lock.release", label: "Release editing locks", desc: "Free a file another user holds, with a reason. Logged." },
      ],
    },
    {
      id: "documents", title: "Notes & records", perms: [
        { id: "notes.print", label: "Print notes and patient instructions", desc: "", requires: ["patients.view"] },
        { id: "audit.view", label: "View audit log", desc: "Who did what, and when, within the user's assigned units." },
        { id: "staff.view", label: "View staff profiles", desc: "Profiles and the staff dashboard." },
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
        { id: "admin.users", label: "Manage staff accounts", desc: "Add staff, assign roles, password resets, deactivate accounts." },
        { id: "admin.org", label: "Manage organisation structure", desc: "Regions, facilities, departments, clinics and staff assignments." },
        { id: "admin.privacy", label: "Manage data visibility", desc: "Hidden, masked or visible per role (PDPL)." },
        { id: "clinic.setup", label: "Clinic setup", desc: "Page layout, tabs, sections, question placement, tests and approval rules." },
        { id: "admin.system", label: "System settings", desc: "File rules and test tools (simulated errors, session length)." },
      ],
    },
  ];
  const PERMS = GROUPS.flatMap((g) => g.perms);
  const PERM = Object.fromEntries(PERMS.map((p) => [p.id, p]));
  const dependentsOf = (id) => PERMS.filter((p) => p.requires?.includes(id)).map((p) => p.id);

  // Defaults: nurses screen and don't review; practitioners review and don't screen;
  // administrators manage the platform but don't make clinical decisions (N-DFIP dossier).
  // Defaults are shared with the live pages (access.js)
  const DEFAULT_ROLES = Access.DEFAULT_ROLES;

  // Guardrail: someone must always be able to manage roles
  const LOCKED = { admin: ["admin.roles"] };
  const isLocked = (roleId, permId) => LOCKED[roleId]?.includes(permId) ?? false;

  function defaults() {
    return { roles: clone(DEFAULT_ROLES) };
  }

  // Saved roles, plus any built-in role added since they were saved (same as access.js)
  function load() {
    const saved = Db.read(KEY, null);
    if (!saved?.roles?.length) return defaults();
    return { roles: [...saved.roles, ...clone(DEFAULT_ROLES).filter((d) => !saved.roles.some((r) => r.id === d.id))] };
  }

  let saved = load();
  let state = clone(saved);
  let selected = state.roles[0].id;
  let tab = "roles";

  const me = Access.currentUser();
  const isAdmin = Access.can("admin.roles");

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
  // Members come from the live staff directory (Settings › Staff)
  const membersOf = (id) => Staff.list().filter((s) => s.role === id && s.status !== "disabled");

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
    // Keep permissions this catalogue doesn't list yet, so a toggle never drops them
    role.perms = [...PERMS.map((p) => p.id).filter((id) => set.has(id)), ...[...set].filter((id) => !PERM[id])];
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
    const memberLine = el("p", "field-hint", members.length ? `Members: ${members.map((m) => m.name).join(", ")}` : "No members yet. Assign staff in Settings › Staff.");

    head.append(nameWrap, descWrap, memberLine);
    // EC-09: a role is never deleted; a deactivated role grants nothing and can't be assigned
    if (!role.system && isAdmin) {
      const off = role.status === "deactivated";
      const del = el("button", "btn btn-outline btn-sm", off ? "Reactivate role" : "Deactivate role");
      del.type = "button";
      del.addEventListener("click", () => {
        if (!off && members.length) {
          toast(`Move ${plural(members.length, "member")} to another role first (Settings › Staff)`);
          return;
        }
        role.status = off ? "active" : "deactivated";
        render();
        updateStatus();
      });
      head.append(del);
      if (off) head.append(el("p", "field-hint", "Deactivated: grants no permissions. Kept so past records still show the role."));
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
  // Staff accounts and their roles are managed in Settings › Staff (#staff)

  function renderStaff() {
    const box = el("div", "roles-staff-pointer");
    const counts = state.roles.map((r) => `${r.name || "Untitled role"}: ${membersOf(r.id).length}`).join(" · ");
    box.append(el("p", "", "Who has which role is set per person in Settings › Staff, together with password resets and disabling accounts."));
    box.append(el("p", "field-hint", counts));
    const a = el("a", "btn btn-outline btn-sm", "Open Staff");
    a.href = "#staff";
    box.append(a);
    $("#staff-table").replaceChildren(box);
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
    try {
      Db.write(KEY, { roles: state.roles }, { where: "roles and permissions" });
    } catch (e) {
      updateStatus(e?.message ?? "The changes couldn't be saved. Try again.");
      return;
    }
    // UAT-05: one audit entry per role that changed, with the permissions added and removed
    const label = (id) => PERM[id]?.label ?? id;
    for (const role of state.roles) {
      const before = saved.roles.find((r) => r.id === role.id);
      if (!before) {
        Audit.log("permission.change", { clinicId: "", facilityId: "", record: `Role ${role.name}`, action: `Role created: ${role.name}`, new: role.perms.map(label).join(", ") });
        continue;
      }
      const added = role.perms.filter((x) => !before.perms.includes(x));
      const removed = before.perms.filter((x) => !role.perms.includes(x));
      if (added.length || removed.length) {
        Audit.log("permission.change", {
          clinicId: "", facilityId: "", record: `Role ${role.name}`, action: `Permissions changed for ${role.name}`, field: "Permissions",
          old: removed.length ? `Removed: ${removed.map(label).join(", ")}` : null,
          new: added.length ? `Granted: ${added.map(label).join(", ")}` : null,
        });
      }
      if ((before.status ?? "active") !== (role.status ?? "active")) {
        Audit.log("permission.change", { clinicId: "", facilityId: "", record: `Role ${role.name}`, action: `Role ${role.status === "deactivated" ? "deactivated" : "reactivated"}: ${role.name}` });
      }
      if (before.name !== role.name || before.description !== role.description) {
        Audit.log("permission.change", { clinicId: "", facilityId: "", record: `Role ${role.name}`, action: `Role details changed: ${role.name}`, field: "Name", old: before.name, new: role.name });
      }
    }
    saved = clone(state);
    updateStatus();
    toast("Roles and permissions saved. They apply on each user's next action.");
  });

  showTab("roles");
  updateStatus();
})();
