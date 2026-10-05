// Approvals page: tests waiting for the signed-in user (named approver, role level, or
// escalated to them after the time limit), the insurance queue, and recent decisions
// (UAT-17, EC-13). Needs tests.js.

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ERROR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>';
  const fmt = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function age(iso) {
    const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 48) return `${h} h ${min % 60} min`;
    return `${Math.floor(h / 24)} days`;
  }
  const RULE = {
    none: () => "No approval needed",
    role: (a) => `Needs a ${a.role === "senior" ? "senior doctor" : "practitioner or higher"}`,
    person: (a) => `Needs ${TestOrders.staffName(a.people[0])}`,
    people: (a) => `Needs all of: ${a.people.map(TestOrders.staffName).join(", ")}`,
  };
  const patient = (o) => {
    const name = typeof Privacy !== "undefined" ? Privacy.name(o.patientName, o.fileNumber) : o.patientName;
    return `${name} · ${o.fileNumber}`;
  };

  function errorLine() {
    const p = el("p", "field-error");
    p.hidden = true;
    p.innerHTML = ERROR_ICON + "<span></span>";
    return p;
  }
  const showError = (p, msg) => {
    p.hidden = !msg;
    p.querySelector("span").textContent = msg ?? "";
  };

  function emptyState(title, text) {
    const box = el("div", "empty-state");
    box.innerHTML = '<div class="empty-state__icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></div>';
    box.append(el("h2", "empty-state__title", title), el("p", "empty-state__text", text));
    return box;
  }

  // Approve / reject (clinical) or approved / rejected (insurance) controls for one item
  function decisionControls(item, err, { approve, reject, approveLabel, rejectLabel, reasonLabel }) {
    const actions = el("div", "approval-item__actions");
    const ok = el("button", "btn btn-primary btn-sm", approveLabel);
    ok.type = "button";
    const no = el("button", "btn btn-outline btn-sm", rejectLabel);
    no.type = "button";
    const busy = async (button, fn) => {
      if (button.disabled) return;
      actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
      showError(err, null);
      try {
        fn();
        document.dispatchEvent(new CustomEvent("orders:changed"));
        render();
      } catch (e) {
        showError(err, e.message || "Something went wrong. Nothing was saved. Try again.");
        actions.querySelectorAll("button").forEach((b) => (b.disabled = false));
      }
    };
    ok.addEventListener("click", () => busy(ok, approve));
    no.addEventListener("click", () => {
      const form = el("div", "approval-item__reject");
      const id = `why-${Math.random().toString(36).slice(2, 8)}`;
      const label = el("label", "label", reasonLabel);
      label.htmlFor = id;
      const input = el("input", "input");
      input.id = id;
      const row = el("div", "approval-item__actions");
      const confirm = el("button", "btn btn-primary btn-sm", rejectLabel);
      confirm.type = "button";
      const cancel = el("button", "btn btn-ghost btn-sm", "Cancel");
      cancel.type = "button";
      cancel.addEventListener("click", render);
      confirm.addEventListener("click", () => {
        if (!input.value.trim()) {
          input.setAttribute("aria-invalid", "true");
          showError(err, "Give a reason.");
          input.focus();
          return;
        }
        busy(confirm, () => reject(input.value));
      });
      row.append(confirm, cancel);
      form.append(label, input, row);
      item.insertBefore(form, err);
      actions.hidden = true;
      input.focus();
    });
    actions.append(ok, no);
    return actions;
  }

  function orderItem(o, kind) {
    const a = o.approval;
    const escalated = kind === "pending" && a.escalatedAt;
    const li = el("li", `approval-item${escalated ? " approval-item--escalated" : ""}`);
    const text = el("div", "approval-item__text");
    text.append(el("span", "approval-item__name", o.label), el("span", "approval-item__meta", patient(o)));
    const clinic = typeof Org !== "undefined" ? Org.clinicLabel(o.clinicId) : o.clinicId;
    text.append(el("span", "approval-item__meta", `Ordered by ${o.orderedBy} on ${fmt(o.orderedAt)} · ${clinic}`));
    if (kind === "pending") {
      text.append(el("span", "approval-item__meta", `${RULE[a.mode](a)} · waiting ${age(o.orderedAt)}`));
      if (escalated) text.append(el("span", "test-orders__escalated", `Escalated on ${fmt(a.escalatedAt)}: waited longer than ${a.escalateAfterHours} h`));
      const approved = a.decisions.filter((d) => d.decision === "approved");
      if (approved.length) text.append(el("span", "approval-item__meta", `Already approved by ${approved.map((d) => d.by).join(", ")}`));
    } else if (kind === "insurance") {
      text.append(el("span", "approval-item__meta", `Waiting for insurance ${age(o.orderedAt)} · ${TestOrders.stateText(o)}`));
    } else {
      text.append(el("span", "approval-item__meta", TestOrders.stateText(o)));
    }
    li.append(text);
    const err = errorLine();
    if (kind === "pending") {
      li.append(decisionControls(li, err, {
        approve: () => TestOrders.approve(o.id),
        reject: (why) => TestOrders.reject(o.id, why),
        approveLabel: "Approve", rejectLabel: "Reject", reasonLabel: `Why reject ${o.label}?`,
      }));
    } else if (kind === "insurance") {
      li.append(decisionControls(li, err, {
        approve: () => TestOrders.setInsurance(o.id, "approved"),
        reject: (why) => TestOrders.setInsurance(o.id, "rejected", why),
        approveLabel: "Insurance approved", rejectLabel: "Insurance rejected", reasonLabel: "Insurer's reason",
      }));
    } else {
      const state = TestOrders.overall(o);
      li.append(el("span", `badge ${{ waiting: "badge-status-attention", approved: "badge-status-complete", rejected: "badge-danger" }[state]}`, { waiting: "Waiting", approved: "Approved", rejected: "Rejected" }[state]));
    }
    li.append(err);
    return li;
  }

  function list(orders, kind) {
    const ul = el("ul", "approvals-list");
    orders.forEach((o) => ul.append(orderItem(o, kind)));
    return ul;
  }

  let tab = "pending";
  const TABS = ["pending", "insurance", "recent"];

  function render() {
    const me = Access.currentUser();
    const pending = TestOrders.pendingFor(me?.id).sort((x, y) => (y.approval.escalatedAt ? 1 : 0) - (x.approval.escalatedAt ? 1 : 0) || x.orderedAt.localeCompare(y.orderedAt));
    const insurance = TestOrders.insuranceQueue().sort((x, y) => x.orderedAt.localeCompare(y.orderedAt));
    const recent = TestOrders.all()
      .filter((o) => o.approval.decisions.some((d) => d.byId === me?.id) || o.insurance.byId === me?.id || o.orderedById === me?.id)
      .sort((x, y) => (y.approval.decisions.at(-1)?.at ?? y.orderedAt).localeCompare(x.approval.decisions.at(-1)?.at ?? x.orderedAt))
      .slice(0, 30);

    $('[data-count="pending"]').textContent = pending.length;
    $('[data-count="insurance"]').textContent = insurance.length;
    $("#tab-insurance").hidden = !TestOrders.canRecordInsurance();

    $("#panel-pending").replaceChildren(
      pending.length
        ? list(pending, "pending")
        : emptyState("Nothing waiting for you", "Tests that need your approval appear here, with how long they have waited. Approvals escalated to you after the time limit appear here too."),
    );
    $("#panel-insurance").replaceChildren(
      !TestOrders.canRecordInsurance()
        ? emptyState("Insurance decisions", "Your role doesn't record insurance decisions.")
        : insurance.length
          ? list(insurance, "insurance")
          : emptyState("No insurance approvals waiting", "Ordered tests that need insurance approval appear here until the insurer's decision is recorded."),
    );
    const note = el("p", "field-hint", "Who records insurance decisions: staff with the \"Approve tests\" or system administration permission.");
    if (TestOrders.canRecordInsurance() && insurance.length) $("#panel-insurance").prepend(note);
    $("#panel-recent").replaceChildren(
      recent.length ? list(recent, "recent") : emptyState("No decisions yet", "Tests you ordered or decided on appear here."),
    );
  }

  function showTab(name, focus = false) {
    tab = name;
    for (const t of TABS) {
      const b = $(`#tab-${t}`);
      b.setAttribute("aria-selected", String(t === name));
      b.tabIndex = t === name ? 0 : -1;
      $(`#panel-${t}`).hidden = t !== name;
    }
    if (focus) $(`#tab-${name}`).focus();
  }
  TABS.forEach((t) => $(`#tab-${t}`).addEventListener("click", () => showTab(t)));
  $(".tabs").addEventListener("keydown", (event) => {
    const shown = TABS.filter((t) => !$(`#tab-${t}`).hidden);
    const i = shown.indexOf(tab);
    const next = event.key === "ArrowRight" ? (i + 1) % shown.length : event.key === "ArrowLeft" ? (i + shown.length - 1) % shown.length : null;
    if (next === null) return;
    event.preventDefault();
    showTab(shown[next], true);
  });

  // Loading, then content or an error state (UAT-19)
  (async () => {
    try {
      if (typeof Db !== "undefined") await Db.delay(150);
      TestOrders.overdue();
      render();
    } catch (e) {
      if (typeof Db !== "undefined") Db.logError("approvals page", e);
      const box = emptyState("Approvals couldn't be loaded", "Reload the page. If it happens again, tell the support team.");
      $("#panel-pending").replaceChildren(box);
    }
  })();

  window.addEventListener("storage", (e) => {
    if (!e.key || e.key === "ndfip.orders" || e.key === "ndfip.tests") render();
  });
})();
