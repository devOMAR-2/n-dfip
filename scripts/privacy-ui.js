// Patient data visibility on the page (UAT-02). Loaded in every page head, after privacy.js.
//
//   PrivacyUI.emergencyButton(patient, onGranted)
//       Button "Emergency access". Opens a dialog that asks for a reason (required), then
//       calls Privacy.emergency (logged and flagged for review) and onGranted(). Returns
//       null when the user has no "privacy.emergency" permission.
//   PrivacyUI.hiddenValue(text, patient, onGranted)
//       Element for a value the role can't see: "Hidden" (or text) plus the emergency button.
//   PrivacyUI.askReason({ title, description, label, confirm })
//       Generic reason dialog. Resolves to the trimmed reason, or null when cancelled.
//
// `patient` is a patient object ({ fileNumber, ... }) or a file number string.

const PrivacyUI = (() => {
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // Styles are in shared.css; kept as a no-op for callers
  function ensureStyles() {}

  const ERROR_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span>';

  let seq = 0;

  function askReason({ title, description = "", label = "Reason", confirm = "Continue" }) {
    ensureStyles();
    return new Promise((resolve) => {
      const n = ++seq;
      const dialog = el("dialog", "modal reason-dialog");
      dialog.setAttribute("aria-labelledby", `reason-title-${n}`);
      const form = el("form", "modal__inner");
      form.noValidate = true;
      const head = el("div", "modal__header");
      const titles = el("div");
      const h = el("h2", "modal__title", title);
      h.id = `reason-title-${n}`;
      titles.append(h);
      if (description) titles.append(el("p", "modal__description", description));
      head.append(titles);

      const field = el("div", "field");
      const lab = el("label", "label", label);
      lab.htmlFor = `reason-input-${n}`;
      const input = el("textarea", "input textarea");
      input.id = `reason-input-${n}`;
      input.rows = 3;
      input.required = true;
      const err = el("p", "field-error");
      err.id = `reason-error-${n}`;
      err.hidden = true;
      err.innerHTML = ERROR_ICON;
      field.append(lab, input, err);

      const actions = el("div", "modal__actions");
      const cancel = el("button", "btn btn-outline", "Cancel");
      cancel.type = "button";
      const ok = el("button", "btn btn-primary", confirm);
      ok.type = "submit";
      actions.append(cancel, ok);
      form.append(head, field, actions);
      dialog.append(form);
      document.body.append(dialog);

      let result = null;
      const showError = (msg) => {
        err.querySelector("span").textContent = msg;
        err.hidden = !msg;
        if (msg) {
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", err.id);
        } else {
          input.removeAttribute("aria-invalid");
          input.removeAttribute("aria-describedby");
        }
      };
      input.addEventListener("input", () => showError(""));
      cancel.addEventListener("click", () => dialog.close());
      dialog.addEventListener("click", (e) => e.target === dialog && dialog.close());
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const reason = input.value.trim();
        if (!reason) {
          showError(`Enter the ${label.toLowerCase()}.`);
          input.focus();
          return;
        }
        result = reason;
        dialog.close();
      });
      dialog.addEventListener("close", () => {
        dialog.remove();
        resolve(result);
      });
      dialog.showModal();
      input.focus();
    });
  }

  const canEmergency = () => typeof Access !== "undefined" && Access.can("privacy.emergency");

  function emergencyButton(patient, onGranted) {
    if (!canEmergency()) return null;
    const btn = el("button", "btn btn-outline btn-xs emergency-btn");
    btn.type = "button";
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>';
    btn.append("Emergency access");
    btn.addEventListener("click", async () => {
      const reason = await askReason({
        title: "Emergency access",
        description: "This record is hidden for your role. Opening it is recorded in the audit log with your reason and flagged for review.",
        label: "Reason",
        confirm: "Open record",
      });
      if (!reason) return;
      Privacy.emergency(patient, reason);
      onGranted?.();
    });
    return btn;
  }

  function hiddenValue(text, patient, onGranted) {
    ensureStyles();
    const wrap = el("span", "hidden-value");
    wrap.append(el("span", "hidden-value__text", text || "Hidden"));
    const btn = emergencyButton(patient, onGranted);
    if (btn) wrap.append(btn);
    return wrap;
  }

  return { emergencyButton, hiddenValue, askReason, ensureStyles };
})();
