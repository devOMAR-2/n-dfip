// Settings › System (#system): test tools for UAT and the support error log.
// Simulated failures make every save fail (EC-15), slow mode shows loading states (UAT-19),
// and a short session length tests the expiry warning (EC-04). Demo only.
(() => {
  const host = document.getElementById("system");
  if (!host || Access.denied) return;
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const fmt = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function render() {
    const sim = Db.sim;
    host.replaceChildren();
    const head = el("div", "page-header");
    head.append(el("h2", "section-title", "System"), el("p", "field-hint", "Test tools for acceptance testing. They change how this browser behaves only."));
    host.append(head);

    const card = el("section", "settings-card");
    card.append(el("h3", "subsection__title", "Test tools"));
    const toggle = (key, label, hint) => {
      const row = el("label", "toggle toggle--block");
      const box = el("input", "checkbox");
      box.type = "checkbox";
      box.checked = !!sim[key];
      box.addEventListener("change", () => {
        Db.setSim({ [key]: box.checked });
        Audit.log("setup.change", { action: `Test tool "${label}" ${box.checked ? "on" : "off"}` });
        render();
      });
      const text = el("span");
      text.append(el("strong", "", label), el("span", "field-hint", hint));
      row.append(box, text);
      return row;
    };
    card.append(
      toggle("failSaves", "Simulate server errors", "Every save fails with a clear message and nothing is saved (EC-15). Turn off when done."),
      toggle("slow", "Slow responses", "Pages show their loading state for about a second (UAT-19)."),
    );
    const q = el("div", "q");
    const lab = el("label", "label", "Session length (minutes)");
    lab.htmlFor = "sim-session";
    const input = el("input", "input");
    input.id = "sim-session";
    input.type = "number";
    input.min = "2";
    input.max = "480";
    input.value = sim.sessionMinutes ?? 30;
    const err = el("p", "field-error");
    err.hidden = true;
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (!Number.isInteger(v) || v < 2 || v > 480) {
        err.textContent = "Enter whole minutes from 2 to 480.";
        err.hidden = false;
        return;
      }
      err.hidden = true;
      Db.setSim({ sessionMinutes: v });
    });
    q.append(lab, input, el("p", "field-hint", "Signed-in users are warned 2 minutes before the session ends (EC-04). Default 30."), err);
    card.append(q);
    host.append(card);

    const log = el("section", "settings-card");
    log.append(el("h3", "subsection__title", "Support error log"), el("p", "field-hint", "Failed saves and page errors, newest first (EC-15). The real system sends these to the support team."));
    const errors = Db.errors().slice().reverse().slice(0, 50);
    if (!errors.length) log.append(el("p", "empty-line", "No errors recorded."));
    else {
      const wrap = el("div", "table-wrap");
      const t = el("table", "data-table");
      t.innerHTML = '<thead><tr><th scope="col">When</th><th scope="col">Page</th><th scope="col">Where</th><th scope="col">Message</th><th scope="col">User</th></tr></thead>';
      const tb = el("tbody");
      for (const e of errors) {
        const tr = el("tr");
        [fmt(e.at), e.page ?? "", e.where ?? "", e.message ?? "", e.user ?? ""].forEach((v) => tr.append(el("td", "", v)));
        tb.append(tr);
      }
      t.append(tb);
      wrap.append(t);
      log.append(wrap);
    }
    host.append(log);
  }

  document.addEventListener("settings:view", (e) => e.detail === "system" && render());
  render();
})();
