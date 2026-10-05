// Settings › Files (#files): which file types can be attached to a patient file and the
// maximum size (UAT-21, EC-14). Stored in "ndfip.fileRules". Needs admin.system to change.
// Demo note: files are kept in browser storage, which holds only a few MB in total.
(() => {
  const host = document.getElementById("files");
  if (!host || Access.denied) return;
  const KEY = "ndfip.fileRules";
  const TYPES = [
    { mime: "application/pdf", label: "PDF", hint: "Lab reports, letters" },
    { mime: "image/jpeg", label: "JPEG", hint: "Photos" },
    { mime: "image/png", label: "PNG", hint: "Screenshots, scans" },
    { mime: "image/webp", label: "WEBP", hint: "Photos (smaller files)" },
    { mime: "image/heic", label: "HEIC", hint: "iPhone photos; most browsers can't show them" },
  ];
  const DEFAULTS = { types: ["application/pdf", "image/jpeg", "image/png"], maxMB: 2 };
  const MAX_LIMIT = 10;
  const canEdit = () => Access.can("admin.system");

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ERR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>';
  const read = () => ({ ...DEFAULTS, rev: 0, ...(Db.read(KEY, {}) ?? {}) });

  function errorLine(id) {
    const p = el("p", "field-error");
    p.id = id;
    p.hidden = true;
    p.innerHTML = ERR_SVG;
    p.append(el("span"));
    return p;
  }
  function setError(p, message) {
    p.hidden = !message;
    p.querySelector("span").textContent = message ?? "";
  }

  function render() {
    const rules = read();
    host.replaceChildren();
    const head = el("div", "page-header");
    const t = el("div");
    t.append(el("h2", "section-title", "Files"), el("p", "field-hint", "File types that can be attached to a patient file, and the largest file allowed. Demo: files are kept in this browser's storage, which holds only a few MB in total, so keep the limit low."));
    head.append(t);
    host.append(head);

    const form = el("form", "settings-card records-settings");
    form.noValidate = true;
    const fs = el("fieldset", "q");
    fs.append(el("legend", "label", "Allowed file types"));
    const list = el("div", "records-settings__types");
    for (const type of TYPES) {
      const lab = el("label", "checkbox-row");
      const box = el("input", "checkbox");
      box.type = "checkbox";
      box.name = "types";
      box.value = type.mime;
      box.checked = rules.types.includes(type.mime);
      const text = el("span");
      text.append(el("strong", "", type.label), el("span", "field-hint", ` ${type.hint}`));
      lab.append(box, text);
      list.append(lab);
    }
    const typesErr = errorLine("files-types-error");
    fs.append(list, typesErr);

    const sizeField = el("div", "field");
    const sizeLabel = el("label", "label", "Maximum file size");
    sizeLabel.htmlFor = "files-max";
    const unit = el("div", "input-unit");
    const size = el("input", "input");
    size.type = "number";
    size.id = "files-max";
    size.min = "0.1";
    size.max = String(MAX_LIMIT);
    size.step = "0.1";
    size.inputMode = "decimal";
    size.value = rules.maxMB;
    size.setAttribute("aria-describedby", "files-max-error");
    unit.append(size, el("span", "input-unit__suffix", "MB"));
    const sizeErr = errorLine("files-max-error");
    sizeField.append(sizeLabel, unit, sizeErr);

    const status = el("p", "field-hint");
    status.setAttribute("aria-live", "polite");
    if (rules.savedBy) status.textContent = `Last saved by ${rules.savedBy}, ${new Date(rules.savedAt).toLocaleString("en-GB")}.`;
    const saveErr = el("div");
    const actions = el("div", "records-settings__actions");
    const save = el("button", "btn btn-primary", "Save");
    save.type = "submit";
    actions.append(save);
    form.append(fs, sizeField, saveErr, actions, status);
    host.append(form);

    if (!canEdit()) {
      form.querySelectorAll("input, button").forEach((x) => (x.disabled = true));
      status.textContent = "View only: your role can't change file settings.";
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!canEdit() || save.disabled) return;
      const types = [...form.querySelectorAll('input[name="types"]:checked')].map((b) => b.value);
      const max = Number(size.value);
      let bad = false;
      setError(typesErr, types.length ? null : "Choose at least one file type.");
      if (!types.length) bad = true;
      // EC-08: impossible values are rejected
      const sizeMsg = size.value === "" ? "Enter the maximum size." : !Number.isFinite(max) || max < 0.1 ? "The size must be at least 0.1 MB." : max > MAX_LIMIT ? `The size can't be more than ${MAX_LIMIT} MB.` : null;
      setError(sizeErr, sizeMsg);
      size.toggleAttribute("aria-invalid", !!sizeMsg);
      if (sizeMsg) bad = true;
      if (bad) return;
      saveErr.replaceChildren();
      save.disabled = true;
      try {
        const current = Db.read(KEY, {}) ?? {};
        // EC-11: someone else saved since this view was opened
        if ((current.rev ?? 0) !== rules.rev) throw new Error(`${current.savedBy ?? "Someone else"} changed these settings since you opened them. Reload to see their version; your change was not saved.`);
        const u = Access.currentUser();
        const next = { types, maxMB: Math.round(max * 10) / 10, rev: rules.rev + 1, savedBy: u?.name ?? "unknown", savedAt: new Date().toISOString() };
        Db.write(KEY, next, { where: "file settings" });
        Audit.log("setup.change", { field: "File rules", old: `${rules.types.join(", ")}; ${rules.maxMB} MB`, new: `${types.join(", ")}; ${next.maxMB} MB`, action: "File upload rules changed" });
        render();
        host.querySelector("p[aria-live]").textContent = "Saved. New uploads follow these rules.";
      } catch (ex) {
        save.disabled = false;
        const p = el("p", "field-error");
        p.innerHTML = ERR_SVG;
        p.append(el("span", "", ex.message || "The settings couldn't be saved. Nothing was changed."));
        saveErr.append(p);
      }
    });
  }

  render();
  document.addEventListener("settings:view", (e) => e.detail === "files" && render());
})();
