// Settings › Organisation (#organisation, UAT-01).
// Structure: organisation > region or city > facility > department (optional) > clinic,
// stored as a tree (each unit points to its parent). Units are never deleted, only closed,
// so past records keep their names (EC-09). Two admins can't overwrite each other: a save
// based on an older revision is refused (EC-11).
// Staff assignments save at once (Staff.set) and apply on the user's next action (EC-07).
// Needs db.js, staff.js, access.js, org.js, audit.js, privacy-ui.js.

(() => {
  const host = document.getElementById("organisation");
  if (!host || Access.denied) return;
  PrivacyUI.ensureStyles();

  const $ = (sel, root = host) => root.querySelector(sel);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ERROR_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';

  const canEdit = () => Access.can("admin.org");
  const LEVEL_LABEL = Object.fromEntries(Org.LEVELS.map((l) => [l.id, l.label]));
  const PARENTS = { region: ["organisation"], facility: ["region"], department: ["facility"], clinic: ["facility", "department"] };
  const CHILDREN = { organisation: ["region"], region: ["facility"], facility: ["department", "clinic"], department: ["clinic"], clinic: [] };

  function definitions() {
    const saved = Db.read("ndfip.clinics", null);
    const list = Array.isArray(saved) ? saved.map((c) => ({ id: c.id, name: c.name })) : [];
    if (!list.some((d) => d.id === "diabetic-foot")) list.unshift({ id: "diabetic-foot", name: "Diabetic Foot" });
    return list;
  }

  // ---------- State ----------

  let draft, types, baseRev, selectedId, dirty, notice;

  function load() {
    draft = clone(Org.nodes());
    types = clone(Org.facilityTypes());
    baseRev = Org.meta().rev;
    selectedId = selectedId && draft.some((n) => n.id === selectedId) ? selectedId : draft.find((n) => !n.parent)?.id;
    dirty = false;
    notice = null;
  }

  const node = (id) => draft.find((n) => n.id === id);
  const kids = (id) => draft.filter((n) => n.parent === id);
  function pathOf(id) {
    const out = [];
    for (let n = node(id); n; n = node(n.parent)) out.unshift(n.name || "(unnamed)");
    return out.join(" › ");
  }
  function isUnder(id, ancestorId) {
    for (let n = node(id); n; n = node(n.parent)) if (n.id === ancestorId) return true;
    return false;
  }

  function markDirty() {
    dirty = true;
    notice = null;
    render();
  }

  // ---------- Layout ----------

  host.innerHTML = "";
  const header = el("div", "page-header page-header--split");
  const titles = el("div");
  titles.append(
    el("h2", "section-title", "Organisation"),
    el("p", "field-hint", "Where every clinic sits, and who can see what. A person sees everything below the units they're assigned to: queues, patients, dashboards and logs."),
  );
  header.append(titles);

  const levels = el("details", "settings-card org-levels");
  levels.append(el("summary", "org-levels__summary", "How the five levels work"));
  const levelTable = el("table", "data-table");
  levelTable.innerHTML = "<thead><tr><th>Level</th><th>What it is</th><th>Example</th></tr></thead>";
  const levelBody = el("tbody");
  [
    ["1. Organisation", "The owning group or company.", "A healthcare group"],
    ["2. Region or city", "A geographic grouping of facilities.", "Riyadh"],
    ["3. Facility", "One licensed site, often called a branch. Each facility has a type (hospital, medical complex, clinic, primary healthcare centre); the list of types is configurable below.", "North Riyadh Medical Complex"],
    ["4. Department", "Optional. Used mainly in hospitals to group clinics by specialty.", "Endocrinology"],
    ["5. Clinic", "The service a patient is booked into. Questions, tests and rules attach here. The same clinic definition can run in many facilities.", "Diabetic Foot Clinic"],
  ].forEach((cells) => {
    const tr = el("tr");
    cells.forEach((c, i) => tr.append(el(i ? "td" : "th", "", c)));
    levelBody.append(tr);
  });
  levelTable.append(levelBody);
  const levelWrap = el("div", "table-wrap");
  levelWrap.append(levelTable);
  levels.append(levelWrap, el("p", "field-hint", "A medical complex is a type of facility, not a separate level. Follows the HL7 FHIR model (Organization, Location, HealthcareService) and the facility types in the Saudi Private Health Institutions Law."));

  const structureCard = el("section", "settings-card");
  structureCard.setAttribute("aria-labelledby", "org-structure-title");
  const typesCard = el("section", "settings-card");
  typesCard.setAttribute("aria-labelledby", "org-types-title");
  const actions = el("div", "form-actions org-actions");
  const assignCard = el("section", "settings-card");
  assignCard.setAttribute("aria-labelledby", "org-assign-title");
  host.append(header, levels, structureCard, typesCard, actions, assignCard);

  // ---------- Structure ----------

  function renderTree() {
    const wrap = el("div", "org-tree-wrap");
    const tree = el("ul", "org-tree");
    tree.setAttribute("role", "tree");
    tree.setAttribute("aria-label", "Organisation structure");
    const branch = (parentId, list) => {
      for (const n of draft.filter((x) => x.parent === parentId)) {
        const li = el("li", "org-tree__item");
        li.setAttribute("role", "treeitem");
        const b = el("button", "org-node" + (n.status === "closed" ? " org-node--closed" : ""));
        b.type = "button";
        b.setAttribute("aria-pressed", String(n.id === selectedId));
        b.append(el("span", `badge org-level org-level--${n.level}`, LEVEL_LABEL[n.level]), el("span", "org-node__name", n.name || "(unnamed)"));
        if (n.type) b.append(el("span", "org-node__meta", n.type));
        if (n.status === "closed") b.append(el("span", "badge badge-muted", "Closed"));
        b.addEventListener("click", () => {
          selectedId = n.id;
          render();
          $(".org-editor input")?.focus();
        });
        li.append(b);
        if (kids(n.id).length) {
          const sub = el("ul", "org-tree");
          sub.setAttribute("role", "group");
          branch(n.id, sub);
          li.append(sub);
        }
        list.append(li);
      }
    };
    branch(null, tree);
    wrap.append(tree);
    return wrap;
  }

  function field(label, control, hint) {
    const f = el("div", "field");
    const id = `org-f-${label.replace(/\W+/g, "-").toLowerCase()}`;
    control.id = id;
    const l = el("label", "label", label);
    l.htmlFor = id;
    f.append(l, control);
    if (hint) f.append(el("p", "field-hint", hint));
    return f;
  }

  function openFilesUnder(id) {
    const clinicIds = new Set([id, ...draft.filter((n) => isUnder(n.id, id)).map((n) => n.id)]);
    return (Db.read("ndfip.screenings", []) ?? []).filter((r) => r.status !== "reviewed" && clinicIds.has(r.clinicId ?? "cl-df-nrc")).length;
  }

  function renderEditor() {
    const n = node(selectedId);
    const box = el("div", "org-editor");
    if (!n) {
      box.append(el("p", "empty-line", "Choose a unit to see its details."));
      return box;
    }
    const ro = !canEdit();
    box.append(el("p", "eyebrow", LEVEL_LABEL[n.level]));

    // Name
    const name = el("input", "input");
    name.value = n.name;
    name.disabled = ro;
    name.addEventListener("input", () => {
      n.name = name.value;
      dirty = true;
      notice = null;
      renderStatus();
      const label = host.querySelector(".org-node[aria-pressed='true'] .org-node__name");
      if (label) label.textContent = n.name || "(unnamed)";
      nameErr.hidden = !!n.name.trim();
    });
    const nameField = field("Name", name);
    const nameErr = el("p", "field-error");
    nameErr.innerHTML = ERROR_ICON;
    nameErr.querySelector("span").textContent = "Enter the name.";
    nameErr.hidden = !!n.name.trim();
    nameField.append(nameErr);
    box.append(nameField);

    if (n.level === "facility") {
      const type = el("select", "input select");
      type.disabled = ro;
      type.append(new Option("Choose…", ""));
      [...new Set([...types, ...(n.type ? [n.type] : [])])].forEach((t) => type.append(new Option(t, t, false, t === n.type)));
      type.addEventListener("change", () => {
        n.type = type.value;
        markDirty();
      });
      box.append(field("Facility type", type));
    }

    if (n.level === "clinic") {
      const def = el("select", "input select");
      def.disabled = ro;
      definitions().forEach((d) => def.append(new Option(d.name, d.id, false, d.id === n.definition)));
      def.addEventListener("change", () => {
        n.definition = def.value;
        markDirty();
      });
      box.append(field("Clinic definition", def, "Questions, tests and rules come from the definition. The same definition can run in many facilities."));
    }

    if (n.parent) {
      const parent = el("select", "input select");
      parent.disabled = ro;
      draft
        .filter((p) => PARENTS[n.level]?.includes(p.level) && p.id !== n.id && !isUnder(p.id, n.id))
        .forEach((p) => parent.append(new Option(pathOf(p.id), p.id, false, p.id === n.parent)));
      parent.addEventListener("change", () => {
        n.parent = parent.value;
        markDirty();
      });
      box.append(field("Belongs to", parent, `A ${LEVEL_LABEL[n.level].toLowerCase()} can sit under: ${PARENTS[n.level].map((l) => LEVEL_LABEL[l].toLowerCase()).join(" or ")}.`));
    }

    if (!ro) {
      const tools = el("div", "org-editor__tools");
      for (const level of CHILDREN[n.level]) {
        const add = el("button", "btn btn-outline btn-sm", `Add ${LEVEL_LABEL[level].toLowerCase()}`);
        add.type = "button";
        add.addEventListener("click", () => {
          const id = `${level.slice(0, 3)}-${Date.now().toString(36)}`;
          const child = { id, parent: n.id, level, name: "" };
          if (level === "clinic") Object.assign(child, { definition: "diabetic-foot", name: "Diabetic Foot Clinic" });
          if (level === "facility") child.type = "";
          draft.push(child);
          selectedId = id;
          markDirty();
          $(".org-editor input")?.focus();
        });
        tools.append(add);
      }
      if (n.parent) {
        const closed = n.status === "closed";
        const toggle = el("button", "btn btn-outline btn-sm", closed ? "Reopen" : `Close ${LEVEL_LABEL[n.level].toLowerCase()}`);
        toggle.type = "button";
        toggle.addEventListener("click", () => {
          if (closed) delete n.status;
          else n.status = "closed";
          markDirty();
        });
        tools.append(toggle);
      }
      box.append(tools);
    }

    if (n.status === "closed") {
      const open = openFilesUnder(n.id);
      box.append(
        el(
          "p",
          "field-hint",
          `Closed: nothing new can be booked here, and past records still show its name.${open ? ` ${plural(open, "open file is", "open files are")} still booked here and need reassigning.` : ""}`,
        ),
      );
    } else {
      box.append(el("p", "field-hint", "Units are never deleted. Close one instead, so past records keep showing it."));
    }
    return box;
  }

  function renderStructure() {
    structureCard.replaceChildren();
    const head = el("div", "settings-card__head");
    const h = el("h3", "settings-card__title", "Structure");
    h.id = "org-structure-title";
    head.append(h);
    const grid = el("div", "org-layout");
    grid.append(renderTree(), renderEditor());
    structureCard.append(head, grid);
  }

  // ---------- Facility types ----------

  function renderTypes() {
    typesCard.replaceChildren();
    const h = el("h3", "settings-card__title", "Facility types");
    h.id = "org-types-title";
    typesCard.append(h, el("p", "field-hint", "The list a facility's type is chosen from. A type in use can't be removed."));
    const list = el("ul", "org-types");
    for (const t of types) {
      const li = el("li", "org-type");
      li.append(el("span", "", t));
      const used = draft.some((n) => n.type === t);
      if (canEdit()) {
        const rm = el("button", "btn btn-ghost btn-xs", "Remove");
        rm.type = "button";
        rm.disabled = used;
        rm.title = used ? "In use by a facility" : "";
        rm.setAttribute("aria-label", `Remove ${t}`);
        rm.addEventListener("click", () => {
          types = types.filter((x) => x !== t);
          markDirty();
        });
        li.append(rm);
      }
      list.append(li);
    }
    typesCard.append(list);
    if (canEdit()) {
      const row = el("div", "search-row org-types__add");
      const input = el("input", "input");
      input.placeholder = "New type, e.g. Day surgery centre";
      input.setAttribute("aria-label", "New facility type");
      const add = el("button", "btn btn-outline", "Add type");
      add.type = "button";
      const err = el("p", "field-error");
      err.innerHTML = ERROR_ICON;
      err.hidden = true;
      add.addEventListener("click", () => {
        const v = input.value.trim();
        const msg = !v ? "Enter the type name." : types.some((t) => t.toLowerCase() === v.toLowerCase()) ? "That type is already in the list." : "";
        if (msg) {
          err.querySelector("span").textContent = msg;
          err.hidden = false;
          input.setAttribute("aria-invalid", "true");
          input.focus();
          return;
        }
        types.push(v);
        markDirty();
      });
      input.addEventListener("input", () => {
        err.hidden = true;
        input.removeAttribute("aria-invalid");
      });
      row.append(input, add);
      typesCard.append(row, err);
    }
  }

  // ---------- Save / discard ----------

  function renderStatus() {
    const status = $(".form-actions__progress", actions);
    if (!status) return;
    status.textContent = !canEdit() ? "View only" : dirty ? "Unsaved changes" : "All changes saved";
    actions.querySelectorAll(".form-actions__buttons button").forEach((b) => (b.disabled = !dirty));
  }

  function renderActions() {
    actions.replaceChildren();
    if (notice) {
      const c = el("div", `callout ${notice.ok ? "callout-success" : "callout-danger"} org-notice`);
      c.setAttribute("role", notice.ok ? "status" : "alert");
      c.append(el("p", "", notice.text));
      if (notice.reload) {
        const r = el("button", "btn btn-sm btn-outline", "Reload");
        r.type = "button";
        r.addEventListener("click", () => {
          load();
          render();
        });
        c.append(r);
      }
      actions.append(c);
    }
    actions.append(el("p", "form-actions__progress"));
    if (canEdit()) {
      const buttons = el("div", "form-actions__buttons");
      const discard = el("button", "btn btn-outline", "Discard changes");
      discard.type = "button";
      discard.disabled = !dirty;
      discard.addEventListener("click", () => {
        load();
        render();
      });
      const save = el("button", "btn btn-primary", "Save structure");
      save.type = "button";
      save.disabled = !dirty;
      save.addEventListener("click", saveStructure);
      buttons.append(discard, save);
      actions.append(buttons);
    }
    renderStatus();
  }

  function describeChanges(before, after) {
    const out = [];
    const old = Object.fromEntries(before.map((n) => [n.id, n]));
    for (const n of after) {
      const o = old[n.id];
      if (!o) {
        out.push(`Added ${LEVEL_LABEL[n.level].toLowerCase()} "${n.name}"`);
        continue;
      }
      if (o.name !== n.name) out.push(`Renamed "${o.name}" to "${n.name}"`);
      if (o.parent !== n.parent) out.push(`Moved "${n.name}"`);
      if ((o.type ?? "") !== (n.type ?? "")) out.push(`"${n.name}" type: ${n.type || "none"}`);
      if ((o.definition ?? "") !== (n.definition ?? "")) out.push(`"${n.name}" definition: ${n.definition}`);
      if ((o.status ?? "") !== (n.status ?? "")) out.push(`${n.status === "closed" ? "Closed" : "Reopened"} "${n.name}"`);
    }
    return out;
  }

  function saveStructure() {
    if (!Access.can("admin.org")) {
      notice = { ok: false, text: "Your permission to change the organisation was removed. Nothing was saved." };
      return render();
    }
    const unnamed = draft.find((n) => !n.name.trim());
    if (unnamed) {
      selectedId = unnamed.id;
      notice = { ok: false, text: "Every unit needs a name. The first one without a name is selected." };
      render();
      $(".org-editor input")?.focus();
      return;
    }
    const facilityNoType = draft.find((n) => n.level === "facility" && !n.type);
    if (facilityNoType) {
      selectedId = facilityNoType.id;
      notice = { ok: false, text: `Choose a facility type for "${facilityNoType.name}".` };
      return render();
    }
    const before = Org.nodes();
    const changes = describeChanges(before, draft);
    const typesBefore = Org.facilityTypes();
    try {
      draft.forEach((n) => (n.name = n.name.trim()));
      Org.save(clone(draft), { rev: baseRev, facilityTypes: clone(types) });
    } catch (e) {
      const conflict = e instanceof Org.ConflictError;
      notice = { ok: false, text: e.message, reload: conflict };
      return render();
    }
    if (JSON.stringify(typesBefore) !== JSON.stringify(types)) changes.push(`Facility types: ${types.join(", ")}`);
    Audit.log("setup.change", { action: "Organisation structure changed", old: null, new: changes.join("; ") || "No visible change" });
    load();
    notice = { ok: true, text: "Structure saved. It applies on everyone's next action." };
    render();
  }

  // ---------- Assignments ----------

  function scopeSummary(staffId) {
    const clinics = Org.clinicsInScope(staffId);
    const facilities = Org.facilitiesInScope(staffId);
    if (!clinics.length) return "Sees no clinics";
    return `Sees ${plural(clinics.length, "clinic")} in ${plural(facilities.length, "facility", "facilities")}`;
  }

  function assignmentLabel(id) {
    const n = Org.get(id);
    if (!n) return `${id} (removed)`;
    const path = Org.path(id).map((p) => p.name);
    return `${LEVEL_LABEL[n.level]}: ${path.slice(-2).join(" › ")}${n.status === "closed" ? " (closed)" : ""}`;
  }

  function setAssigned(person, next, what) {
    if (!Access.can("admin.org")) {
      assignError = "Your permission to change assignments was removed. Nothing was saved.";
      return renderAssignments();
    }
    const before = person.assigned ?? [];
    try {
      Staff.set(person.id, { assigned: next });
    } catch (e) {
      assignError = e.message;
      return renderAssignments();
    }
    assignError = null;
    Audit.log("assignment.change", {
      action: `${what} for ${person.name}`,
      old: before.map(assignmentLabel).join("; ") || "none",
      new: next.map(assignmentLabel).join("; ") || "none",
    });
    renderAssignments();
  }

  let assignError = null;

  function renderAssignments() {
    assignCard.replaceChildren();
    const h = el("h3", "settings-card__title", "Staff assignments");
    h.id = "org-assign-title";
    assignCard.append(
      h,
      el("p", "field-hint", "Assign a person to the whole organisation, a region, one or more facilities, or specific clinics. They see everything below. Changes apply at once, on their next action."),
    );
    if (assignError) {
      const c = el("div", "callout callout-danger");
      c.setAttribute("role", "alert");
      c.append(el("p", "", assignError));
      assignCard.append(c);
    }
    const table = el("table", "data-table org-assign");
    table.innerHTML = '<thead><tr><th scope="col">Staff</th><th scope="col">Assigned to</th><th scope="col">Can see</th></tr></thead>';
    const body = el("tbody");
    const roles = Object.fromEntries(Access.roles().map((r) => [r.id, r.name]));
    const options = Org.nodes().filter(Org.active);
    for (const person of Staff.list()) {
      const tr = el("tr");
      if (person.status === "disabled") tr.classList.add("org-assign__disabled");
      const who = el("th", "org-assign__who");
      who.scope = "row";
      who.append(el("span", "org-assign__name", person.name), el("span", "org-assign__role", `${roles[person.role] ?? person.role}${person.status === "disabled" ? " · disabled" : ""}`));

      const cell = el("td");
      const chips = el("ul", "org-chips");
      for (const id of person.assigned ?? []) {
        const li = el("li", "org-chip");
        li.append(el("span", "", assignmentLabel(id)));
        if (canEdit()) {
          const rm = el("button", "btn btn-ghost btn-xs org-chip__remove", "×");
          rm.type = "button";
          rm.setAttribute("aria-label", `Remove ${person.name} from ${Org.get(id)?.name ?? id}`);
          rm.addEventListener("click", () => setAssigned(person, person.assigned.filter((x) => x !== id), "Assignment removed"));
          li.append(rm);
        }
        chips.append(li);
      }
      if (!(person.assigned ?? []).length) chips.append(el("li", "org-chip org-chip--empty", "Not assigned"));
      cell.append(chips);
      if (canEdit()) {
        const row = el("div", "org-assign__add");
        const select = el("select", "input select");
        select.setAttribute("aria-label", `Add assignment for ${person.name}`);
        select.append(new Option("Add assignment…", ""));
        options
          .filter((n) => !(person.assigned ?? []).includes(n.id))
          .forEach((n) => select.append(new Option(`${"  ".repeat(Org.path(n.id).length - 1)}${LEVEL_LABEL[n.level]}: ${n.name}`, n.id)));
        select.addEventListener("change", () => {
          if (!select.value) return;
          setAssigned(person, [...(person.assigned ?? []), select.value], "Assignment added");
        });
        row.append(select);
        cell.append(row);
      }
      const sees = el("td", "org-assign__sees", scopeSummary(person.id));
      tr.append(who, cell, sees);
      body.append(tr);
    }
    table.append(body);
    const wrap = el("div", "table-wrap");
    wrap.append(table);
    assignCard.append(wrap);
  }

  // ---------- Render ----------

  function render() {
    renderStructure();
    renderTypes();
    renderActions();
    renderAssignments();
  }

  load();
  render();

  // Another tab saved the structure or an assignment
  window.addEventListener("storage", (e) => {
    if (e.key === "ndfip.staff") renderAssignments();
    if (e.key === "ndfip.org" && !dirty) {
      load();
      render();
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault();
  });
})();
