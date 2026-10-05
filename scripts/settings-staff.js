// Settings › Staff (#staff): staff accounts, roles, password resets, disable / enable.
// UAT-04  "Send password reset" e-mails a one-time link to the employee's own address;
//         the administrator never sees or sets the password.
// EC-07   Disabling signs the person out on their next check (session.js).
// EC-09   Nothing is deleted: a person is disabled, their past records keep their name, and
//         files they still hold are listed for reassignment.
// Every change is written to the audit log. Needs auth, staff, access, org, audit.

(() => {
  const host = document.getElementById("staff");
  if (!host || Access.denied) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const ERROR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>';
  const canEdit = Access.can("admin.users");
  const me = Access.currentUser();
  const asker = () => ({ id: me.id, name: me.name, role: me.roleLabel });

  const roleName = (id) => Access.roles().find((r) => r.id === id)?.name ?? id;
  const unitLabel = (id) => {
    const n = Org.get(id);
    if (!n) return id;
    if (n.level === "clinic") return Org.clinicLabel(id);
    return `${n.name} (${Org.LEVELS.find((l) => l.id === n.level)?.label.toLowerCase() ?? n.level})`;
  };
  // Account events log under the person's own unit, so their supervisor sees them
  const unitsOf = (person) => {
    const nodes = (person.assigned ?? []).map(Org.get).filter(Boolean);
    const clinic = nodes.find((n) => n.level === "clinic");
    if (clinic) return { clinicId: clinic.id, facilityId: Org.facilityOf(clinic.id)?.id ?? "" };
    const facility = nodes.find((n) => n.level === "facility");
    return { clinicId: "", facilityId: facility?.id ?? "" };
  };
  const log = (type, person, action, extra = {}) => Audit.log(type, { ...unitsOf(person), record: `Employee ${person.id}`, action, ...extra });

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3200);
  }

  // Files a person still holds or has open (EC-09). ScreeningStore isn't loaded here.
  function openFilesOf(person) {
    const all = Db.read("ndfip.screenings", []) ?? [];
    return all.filter(
      (r) =>
        r.status !== "reviewed" &&
        (r.holder?.id === person.id ||
          (r.status === "in-review" && r.openedBy === person.name) ||
          (r.status === "screening" && r.startedBy === person.name)),
    );
  }

  const activeAdmins = () => Staff.list().filter((s) => s.role === "admin" && s.status !== "disabled");
  const isLastAdmin = (p) => p.role === "admin" && p.status !== "disabled" && activeAdmins().length <= 1;

  // ---------- Layout ----------

  host.innerHTML = `
    <div class="page-header page-header--split">
      <div>
        <h2 class="section-title">Staff</h2>
        <p class="field-hint">Accounts, roles and password resets. Nobody is ever deleted: disable an account instead, so past records keep the person's name. Assign people to units in <a href="#organisation">Organisation</a>.</p>
      </div>
      <button type="button" class="btn btn-primary" id="staff-add" ${canEdit ? "" : "hidden"}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>Add staff member</button>
    </div>
    <div class="staff-toolbar">
      <label class="sr-only" for="staff-search">Search staff</label>
      <input class="input" id="staff-search" type="search" placeholder="Search by name, employee ID or e-mail" autocomplete="off" />
      <label class="checkbox-row"><input class="checkbox" type="checkbox" id="staff-show-disabled" checked /><span class="label label--normal">Show disabled accounts</span></label>
    </div>
    <p class="field-error staff-alert" id="staff-alert" role="alert" hidden>${ERROR_ICON}<span></span></p>
    <div class="settings-card"><div class="table-wrap" id="staff-list"></div></div>
    <section class="settings-card staff-reassign" id="staff-reassign" aria-labelledby="staff-reassign-title" hidden>
      <h3 class="settings-card__title" id="staff-reassign-title">Open files held by disabled staff</h3>
      <p class="field-hint">Flagged for reassignment (EC-09). A supervisor or another practitioner can take over each file; the original holder's name stays in its history.</p>
      <ul class="staff-reassign__list" id="staff-reassign-list"></ul>
    </section>
  `;

  const alertBox = $("#staff-alert", host);
  function showAlert(message) {
    alertBox.hidden = !message;
    $("span", alertBox).textContent = message ?? "";
  }

  // ---------- Table ----------

  function render() {
    const q = $("#staff-search", host).value.trim().toLowerCase();
    const showDisabled = $("#staff-show-disabled", host).checked;
    const people = Staff.list()
      .filter((p) => showDisabled || p.status !== "disabled")
      .filter((p) => !q || [p.name, p.id, p.email].some((v) => String(v ?? "").toLowerCase().includes(q)))
      .sort((a, b) => (a.status === "disabled") - (b.status === "disabled") || a.name.localeCompare(b.name));

    const list = $("#staff-list", host);
    if (!people.length) {
      list.replaceChildren(el("p", "empty-line", q ? "No staff match this search." : "No staff yet."));
    } else {
      const table = el("table", "data-table staff-table staff-accounts");
      table.append(el("caption", "sr-only", "Staff accounts"));
      const thead = el("thead");
      const hr = el("tr");
      ["Name", "Role", "Assigned to", "E-mail", "Status", "Actions"].forEach((h) => {
        const th = el("th", "", h);
        th.scope = "col";
        hr.append(th);
      });
      thead.append(hr);
      const tbody = el("tbody");
      people.forEach((p) => tbody.append(row(p)));
      table.append(thead, tbody);
      list.replaceChildren(table);
    }
    renderReassign();
  }

  function row(p) {
    const disabled = p.status === "disabled";
    const tr = el("tr");
    tr.dataset.staff = p.id;
    if (disabled) tr.classList.add("staff-table__inactive");

    const nameCell = el("th");
    nameCell.scope = "row";
    const initials = p.name.replace(/^Dr\.\s+/, "").split(" ").filter((_, i, a) => i === 0 || i === a.length - 1).map((w) => w[0]).join("");
    const who = el("span", "staff-table__name");
    const text = el("span", "staff-accounts__who");
    text.append(el("span", "staff-accounts__name", p.name), el("span", "staff-accounts__meta", `${p.title || "No title"} · ID ${p.id}`));
    who.append(el("span", "staff-option__avatar", initials), text);
    nameCell.append(who);

    const roleCell = el("td");
    roleCell.dataset.label = "Role";
    const select = el("select", "input select");
    select.setAttribute("aria-label", `Role for ${p.name}`);
    Access.roles().filter((r) => r.status !== "deactivated" || r.id === p.role).forEach((r) => select.append(new Option(r.name || "Untitled role", r.id, false, r.id === p.role)));
    select.disabled = !canEdit || disabled || isLastAdmin(p) || p.id === me.id;
    select.addEventListener("change", () => changeRole(p, select));
    roleCell.append(select);
    if (isLastAdmin(p)) roleCell.append(el("p", "field-hint", "Last administrator"));
    else if (p.id === me.id) roleCell.append(el("p", "field-hint", "Your own account"));

    const unitCell = el("td");
    unitCell.dataset.label = "Assigned to";
    const units = p.assigned ?? [];
    if (units.length) {
      const ul = el("ul", "staff-accounts__units");
      units.forEach((id) => ul.append(el("li", "", unitLabel(id))));
      unitCell.append(ul);
    } else unitCell.append(el("span", "badge badge-status-attention", "Not assigned"));

    const mailCell = el("td");
    mailCell.dataset.label = "E-mail";
    if (p.email) mailCell.append(el("span", "staff-accounts__email", p.email));
    else mailCell.append(el("span", "badge badge-status-attention", "No e-mail on file"));

    const statusCell = el("td");
    statusCell.dataset.label = "Status";
    statusCell.append(el("span", `badge ${disabled ? "badge-muted" : "badge-status-complete"}`, disabled ? "Disabled" : "Active"));

    const actions = el("td", "staff-accounts__actions");
    actions.dataset.label = "Actions";
    const note = el("p", "staff-accounts__note");
    note.setAttribute("role", "status");
    note.hidden = true;
    if (canEdit) {
      const reset = el("button", "btn btn-outline btn-xs", "Send password reset");
      reset.type = "button";
      reset.disabled = disabled;
      reset.setAttribute("aria-label", `Send password reset to ${p.name}`);
      reset.addEventListener("click", () => sendReset(p, reset, note));
      const edit = el("button", "btn btn-ghost btn-xs", "Edit");
      edit.type = "button";
      edit.setAttribute("aria-label", `Edit ${p.name}`);
      edit.addEventListener("click", () => openEditor(p));
      const toggle = el("button", `btn btn-xs ${disabled ? "btn-outline" : "btn-ghost staff-accounts__disable"}`, disabled ? "Enable" : "Disable");
      toggle.type = "button";
      toggle.setAttribute("aria-label", `${disabled ? "Enable" : "Disable"} ${p.name}`);
      toggle.disabled = !disabled && (isLastAdmin(p) || p.id === me.id);
      toggle.addEventListener("click", () => (disabled ? enable(p) : confirmDisable(p)));
      const btns = el("div", "staff-accounts__buttons");
      btns.append(reset, edit, toggle);
      actions.append(btns);
    } else actions.append(el("span", "field-hint", "View only"));
    actions.append(note);

    tr.append(nameCell, roleCell, unitCell, mailCell, statusCell, actions);
    return tr;
  }

  function save(id, changes) {
    try {
      Staff.set(id, changes);
      showAlert(null);
      return true;
    } catch (e) {
      showAlert(e?.message ?? "The change couldn't be saved. Try again.");
      return false;
    }
  }

  function changeRole(p, select) {
    const from = p.role;
    const to = select.value;
    if (!save(p.id, { role: to })) {
      select.value = from;
      return;
    }
    log("permission.change", p, `Role for ${p.name} changed`, { field: "Role", old: roleName(from), new: roleName(to) });
    toast(`${p.name} is now ${roleName(to)}. It applies on their next action.`);
    render();
  }

  // ---------- Password reset (UAT-04) ----------

  function sendReset(p, button, note) {
    button.disabled = true;
    let result;
    try {
      result = Auth.requestReset(p.id, asker());
    } catch (e) {
      result = { ok: false, reason: "error", message: e?.message };
    }
    button.disabled = false;
    note.hidden = false;
    note.className = `staff-accounts__note ${result.ok ? "is-ok" : "is-error"}`;
    note.textContent = result.ok
      ? `Reset link e-mailed to ${p.email}. It works once and expires in ${Auth.RESET_MINUTES} minutes.`
      : result.reason === "no-email"
        ? `No e-mail address on file for ${p.name}, so no link was sent. Add an e-mail address first (Edit).`
        : result.reason === "disabled"
          ? "This account is disabled. Enable it before sending a reset."
          : result.message ?? "The reset couldn't be sent. Try again.";
  }

  // ---------- Disable / enable (EC-07, EC-09) ----------

  const dialog = el("dialog", "modal");
  dialog.setAttribute("aria-labelledby", "staff-dialog-title");
  document.body.append(dialog);

  function confirmDisable(p) {
    const files = openFilesOf(p);
    dialog.innerHTML = `<div class="modal__inner">
      <div class="modal__header"><div>
        <h2 class="modal__title" id="staff-dialog-title"></h2>
        <p class="modal__description">They're signed out on their next action and can't sign in again until enabled. Their name stays on every record they made.</p>
      </div></div>
      <div data-files></div>
      <div class="field">
        <label class="label" for="disable-reason">Reason</label>
        <input class="input" id="disable-reason" placeholder="e.g. Left the organisation" />
        <p class="field-error" id="disable-reason-error" hidden>${ERROR_ICON}<span></span></p>
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn-outline" data-cancel>Cancel</button>
        <button type="button" class="btn btn-destructive" data-confirm>Disable account</button>
      </div>
    </div>`;
    $("#staff-dialog-title", dialog).textContent = `Disable ${p.name}?`;
    const filesHost = $("[data-files]", dialog);
    if (files.length) {
      const box = el("div", "callout callout-warning");
      box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>';
      const body = el("div");
      body.append(el("strong", "", `${plural(files.length, "open file")} to reassign`));
      const ul = el("ul", "staff-reassign__list");
      files.forEach((r) => ul.append(el("li", "", `${r.fileNumber} · ${Privacy.name(r.patientName, r.fileNumber)} · ${Org.clinicLabel(r.clinicId)}`)));
      body.append(ul, el("p", "", "They'll be listed under Open files held by disabled staff until someone takes them over."));
      box.append(body);
      filesHost.append(box);
    } else filesHost.append(el("p", "field-hint", "They hold no open files."));
    const reason = $("#disable-reason", dialog);
    const err = $("#disable-reason-error", dialog);
    reason.addEventListener("input", () => (err.hidden = true));
    $("[data-cancel]", dialog).addEventListener("click", () => dialog.close());
    $("[data-confirm]", dialog).addEventListener("click", () => {
      if (!reason.value.trim()) {
        err.hidden = false;
        $("span", err).textContent = "Give a reason. It's kept in the audit log.";
        reason.setAttribute("aria-invalid", "true");
        reason.focus();
        return;
      }
      if (!save(p.id, { status: "disabled", disabledAt: new Date().toISOString(), disabledBy: me.name })) {
        dialog.close();
        return;
      }
      log("user.status", p, `Account disabled: ${p.name}${files.length ? ` (${plural(files.length, "open file")} flagged for reassignment)` : ""}`, { field: "Status", old: "Active", new: "Disabled", reason: reason.value.trim() });
      dialog.close();
      toast(`${p.name} disabled`);
      render();
    });
    dialog.showModal();
    reason.focus();
  }

  function enable(p) {
    if (!save(p.id, { status: "active", disabledAt: null, disabledBy: null })) return;
    log("user.status", p, `Account enabled: ${p.name}`, { field: "Status", old: "Disabled", new: "Active" });
    toast(`${p.name} enabled`);
    render();
  }

  function renderReassign() {
    const panel = $("#staff-reassign", host);
    const list = $("#staff-reassign-list", host);
    const items = Staff.list()
      .filter((p) => p.status === "disabled")
      .flatMap((p) => openFilesOf(p).map((r) => ({ p, r })));
    panel.hidden = !items.length;
    list.replaceChildren(
      ...items.map(({ p, r }) => {
        const li = el("li");
        li.append(
          el("strong", "", r.fileNumber),
          ` · ${Privacy.name(r.patientName, r.fileNumber)} · ${Org.clinicLabel(r.clinicId)} · held by ${p.name} (disabled)`,
        );
        return li;
      }),
    );
  }

  // ---------- Add / edit ----------

  function openEditor(p = null) {
    const adding = !p;
    const nodes = Org.nodes().filter((n) => n.status !== "closed");
    dialog.innerHTML = `<div class="modal__inner">
      <div class="modal__header"><div>
        <h2 class="modal__title" id="staff-dialog-title"></h2>
        <p class="modal__description">${adding ? "The new person sets their own password from the reset e-mail sent after you add them." : "Role and units can also be changed from the table and in Organisation."}</p>
      </div></div>
      <form class="form staff-editor" novalidate>
        <div class="field" data-f="name"><label class="label" for="se-name">Full name</label><input class="input" id="se-name" autocomplete="off" /><p class="field-error" hidden>${ERROR_ICON}<span></span></p></div>
        <div class="field" data-f="id"><label class="label" for="se-id">Employee ID</label><input class="input" id="se-id" inputmode="numeric" autocomplete="off" /><p class="field-error" hidden>${ERROR_ICON}<span></span></p></div>
        <div class="field" data-f="title"><label class="label" for="se-title">Job title</label><input class="input" id="se-title" placeholder="e.g. Screening Nurse" autocomplete="off" /><p class="field-error" hidden>${ERROR_ICON}<span></span></p></div>
        <div class="field" data-f="role"><label class="label" for="se-role">Role</label><select class="input select" id="se-role"></select></div>
        <div class="field" data-f="email"><label class="label" for="se-email">Work e-mail <span class="label__optional">(needed for password resets)</span></label><input class="input" id="se-email" type="email" autocomplete="off" /><p class="field-error" hidden>${ERROR_ICON}<span></span></p></div>
        <div class="field" data-f="unit"><label class="label" for="se-unit">Assigned to</label><select class="input select" id="se-unit"><option value="">Choose a unit</option></select><p class="field-error" hidden>${ERROR_ICON}<span></span></p></div>
        <p class="field-error" data-form-error role="alert" hidden>${ERROR_ICON}<span></span></p>
        <div class="modal__actions">
          <button type="button" class="btn btn-outline" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary">${adding ? "Add and send password e-mail" : "Save changes"}</button>
        </div>
      </form>
    </div>`;
    $("#staff-dialog-title", dialog).textContent = adding ? "Add staff member" : `Edit ${p.name}`;
    const v = (id) => $(`#se-${id}`, dialog);
    Access.roles().filter((r) => r.status !== "deactivated").forEach((r) => v("role").append(new Option(r.name, r.id, false, r.id === (p?.role ?? "nurse"))));
    nodes.forEach((n) => v("unit").append(new Option(unitLabel(n.id), n.id, false, n.id === p?.assigned?.[0])));
    if (p) {
      v("name").value = p.name;
      v("id").value = p.id;
      v("id").disabled = true;
      v("title").value = p.title ?? "";
      v("email").value = p.email ?? "";
      v("role").disabled = isLastAdmin(p) || p.id === me.id;
      if ((p.assigned ?? []).length > 1) {
        v("unit").disabled = true;
        $('[data-f="unit"]', dialog).append(el("p", "field-hint", "Several units assigned: change them in Organisation."));
      }
    } else {
      let n = 300001;
      while (Staff.get(String(n)) || Auth.findUser(String(n))) n++;
      v("id").value = String(n);
    }
    const setErr = (f, message) => {
      const wrap = $(`[data-f="${f}"]`, dialog);
      const err = $(".field-error", wrap);
      err.hidden = !message;
      $("span", err).textContent = message ?? "";
      const input = $("input, select", wrap);
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    };
    ["name", "id", "title", "email", "unit"].forEach((f) => v(f).addEventListener("input", () => setErr(f, null)));
    v("unit").addEventListener("change", () => setErr("unit", null));
    $("[data-cancel]", dialog).addEventListener("click", () => dialog.close());

    $("form", dialog).addEventListener("submit", (event) => {
      event.preventDefault();
      const data = { name: v("name").value.trim(), id: v("id").value.trim(), title: v("title").value.trim(), role: v("role").value, email: v("email").value.trim(), unit: v("unit").value };
      const problems = [];
      if (!data.name) problems.push(["name", "Enter the full name."]);
      if (adding) {
        if (!/^\d{6}$/.test(data.id)) problems.push(["id", "Employee IDs are 6 digits."]);
        else if (Staff.get(data.id) || Auth.findUser(data.id)) problems.push(["id", "This employee ID is already in use."]);
      }
      if (!data.title) problems.push(["title", "Enter the job title."]);
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) problems.push(["email", "Enter a valid e-mail address, like name@example.com."]);
      else if (data.email && Staff.list().some((s) => s.id !== data.id && s.email?.toLowerCase() === data.email.toLowerCase())) problems.push(["email", "Another staff member already uses this e-mail address."]);
      if (!data.unit && !v("unit").disabled) problems.push(["unit", "Choose where this person works."]);
      problems.forEach(([f, m]) => setErr(f, m));
      if (problems.length) return v(problems[0][0]).focus();

      const formErr = $("[data-form-error]", dialog);
      const changes = adding
        ? { added: true, id: data.id, name: data.name, title: data.title, role: data.role, email: data.email, phone: "", assigned: [data.unit], joined: new Date().toISOString().slice(0, 10), experience: "", status: "active" }
        : { name: data.name, title: data.title, email: data.email, ...(v("role").disabled ? {} : { role: data.role }), ...(v("unit").disabled ? {} : { assigned: [data.unit] }) };
      try {
        Staff.set(data.id, changes);
      } catch (e) {
        formErr.hidden = false;
        $("span", formErr).textContent = e?.message ?? "The change couldn't be saved. Try again.";
        return;
      }
      const person = Staff.get(data.id);
      if (adding) {
        log("user.created", person, `Staff member added: ${person.name} (${roleName(person.role)}) at ${unitLabel(data.unit)}`);
        let sent = null;
        if (person.email) {
          try {
            sent = Auth.requestReset(person.id, asker());
          } catch {}
        }
        toast(sent?.ok ? `${person.name} added. A link to set their password was e-mailed to ${person.email}.` : `${person.name} added. No e-mail on file, so no password link was sent.`);
      } else {
        const diffs = [["Name", p.name, person.name], ["Job title", p.title, person.title], ["E-mail", p.email, person.email], ["Role", roleName(p.role), roleName(person.role)], ["Assigned to", (p.assigned ?? []).map(unitLabel).join(", "), (person.assigned ?? []).map(unitLabel).join(", ")]].filter(([, a, b]) => (a ?? "") !== (b ?? ""));
        for (const [field, old, now] of diffs) {
          const type = field === "Role" ? "permission.change" : field === "Assigned to" ? "assignment.change" : "user.updated";
          log(type, person, `Staff details changed for ${person.name}`, { field, old: old || "(empty)", new: now || "(empty)" });
        }
        toast(diffs.length ? `${person.name} updated` : "No changes");
      }
      dialog.close();
      render();
    });
    dialog.showModal();
    v(adding ? "name" : "title").focus();
  }

  // ---------- Wiring ----------

  $("#staff-search", host).addEventListener("input", render);
  $("#staff-show-disabled", host).addEventListener("change", render);
  $("#staff-add", host).addEventListener("click", () => openEditor());
  window.addEventListener("storage", (e) => ["ndfip.staff", "ndfip.screenings", "ndfip.org"].includes(e.key) && render());
  document.addEventListener("settings:view", (e) => e.detail === "staff" && render());
  render();
})();
