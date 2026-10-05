// Test ordering panel for an encounter (UAT-17, UAT-24). Needs tests.js.
//
//   const panel = TestOrdersUI.mount(host, record, { readOnly, suggested, canOrder });
//   panel.refresh();   panel.summary() -> ["CBC (approved)", ...] for the clinical note
//
// Shows the suggested tests (Order / Dismiss with a reason), a picker for any other active
// test, and every order with its clinical approval and insurance state. Buttons are
// disabled while an action runs, and an order for the same test returns the existing one,
// so a double click makes one order (EC-02).

const TestOrdersUI = (() => {
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const ERROR_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>';
  const BADGE = { waiting: "badge-status-attention", approved: "badge-status-complete", rejected: "badge-danger" };
  const BADGE_TEXT = { waiting: "Waiting", approved: "Approved", rejected: "Rejected" };
  let seq = 0;

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

  // Runs an action with its button disabled; errors go to the panel's error line
  async function run(button, errLine, fn) {
    if (button.disabled) return;
    button.disabled = true;
    showError(errLine, null);
    try {
      await fn();
    } catch (e) {
      showError(errLine, e.message || "Something went wrong. Nothing was saved. Try again.");
      if (!(e instanceof TestOrders.RefusedError) && typeof Db !== "undefined" && !(e instanceof Db.SaveError)) Db.logError("test orders", e);
    } finally {
      button.disabled = false;
    }
  }

  function mount(host, record, opts = {}) {
    const id = `tou-${++seq}`;
    let options = { readOnly: false, suggested: [], canOrder: undefined, ...opts };
    const canOrder = () => !options.readOnly && (options.canOrder ?? Access.can("review.orders"));
    host.classList.add("test-orders");

    function suggestedBlock() {
      const wrap = el("div", "test-orders__block");
      wrap.append(el("h4", "test-orders__title", "Suggested tests"));
      if (!options.suggested.length) {
        wrap.append(el("p", "field-hint", "No tests suggested for this encounter."));
        return wrap;
      }
      const ul = el("ul", "test-orders__list");
      for (const s of options.suggested) {
        const li = el("li", "test-orders__item");
        const text = el("div", "test-orders__text");
        text.append(el("span", "test-orders__name", s.label), el("span", "test-orders__meta", s.why ?? ""));
        li.append(text);
        const order = TestOrders.forRecord(record.id).find((o) => o.testId === s.value && o.approval.status !== "rejected");
        const decision = TestOrders.suggestionFor(record.id, s.value);
        const err = errorLine();
        if (order) {
          li.append(el("span", "badge badge-status-complete", "Ordered"));
        } else if (decision?.decision === "dismissed") {
          li.append(el("span", "badge badge-muted", `Dismissed: ${decision.reason}`));
        } else if (canOrder()) {
          const actions = el("div", "test-orders__actions");
          const orderBtn = el("button", "btn btn-primary btn-sm", "Order");
          orderBtn.type = "button";
          orderBtn.setAttribute("aria-label", `Order ${s.label}`);
          orderBtn.addEventListener("click", () => run(orderBtn, err, () => (TestOrders.acceptSuggestion(record, s.value), render())));
          const dismissBtn = el("button", "btn btn-outline btn-sm", "Dismiss");
          dismissBtn.type = "button";
          dismissBtn.setAttribute("aria-label", `Dismiss ${s.label}`);
          dismissBtn.addEventListener("click", () => {
            const form = el("div", "test-orders__dismiss");
            const inputId = `${id}-why-${s.value}`;
            const label = el("label", "label", `Why not order ${s.label}?`);
            label.htmlFor = inputId;
            const input = el("input", "input");
            input.id = inputId;
            input.placeholder = "e.g. Done last week, result on file";
            const save = el("button", "btn btn-primary btn-sm", "Dismiss suggestion");
            save.type = "button";
            const cancel = el("button", "btn btn-ghost btn-sm", "Cancel");
            cancel.type = "button";
            cancel.addEventListener("click", render);
            save.addEventListener("click", () =>
              run(save, err, () => {
                if (!input.value.trim()) {
                  input.setAttribute("aria-invalid", "true");
                  throw new TestOrders.RefusedError("Give a reason for dismissing the suggestion.");
                }
                TestOrders.dismissSuggestion(record, s.value, input.value);
                render();
              }),
            );
            const row = el("div", "test-orders__actions");
            row.append(save, cancel);
            form.append(label, input, row);
            actions.replaceWith(form);
            input.focus();
          });
          actions.append(orderBtn, dismissBtn);
          li.append(actions);
        }
        li.append(err);
        ul.append(li);
      }
      wrap.append(ul);
      return wrap;
    }

    function pickerBlock() {
      const wrap = el("div", "test-orders__block");
      const pickId = `${id}-pick`;
      const label = el("label", "label", "Order another test");
      label.htmlFor = pickId;
      const row = el("div", "test-orders__picker");
      const select = el("select", "input select");
      select.id = pickId;
      select.append(new Option("Choose a test…", ""));
      const ordered = new Set(TestOrders.forRecord(record.id).filter((o) => o.approval.status !== "rejected").map((o) => o.testId));
      for (const [g, gl] of TestCatalog.GROUPS) {
        const og = document.createElement("optgroup");
        og.label = gl;
        TestCatalog.active().filter((x) => x.group === g && !ordered.has(x.id)).forEach((x) => {
          const needs = [x.approval.mode !== "none" && "needs approval", x.insurance && "needs insurance"].filter(Boolean).join(", ");
          og.append(new Option(needs ? `${x.label} (${needs})` : x.label, x.id));
        });
        if (og.children.length) select.append(og);
      }
      const btn = el("button", "btn btn-outline", "Order");
      btn.type = "button";
      const err = errorLine();
      btn.addEventListener("click", () =>
        run(btn, err, () => {
          if (!select.value) {
            select.setAttribute("aria-invalid", "true");
            throw new TestOrders.RefusedError("Choose a test to order.");
          }
          TestOrders.order(record, select.value);
          render();
        }),
      );
      select.addEventListener("change", () => select.removeAttribute("aria-invalid"));
      row.append(select, btn);
      wrap.append(label, row, err);
      return wrap;
    }

    function ordersBlock() {
      const wrap = el("div", "test-orders__block");
      wrap.append(el("h4", "test-orders__title", "Ordered tests"));
      const orders = TestOrders.forRecord(record.id);
      if (!orders.length) {
        wrap.append(el("p", "field-hint", "No tests ordered yet."));
        return wrap;
      }
      const ul = el("ul", "test-orders__list");
      for (const o of orders) {
        const li = el("li", "test-orders__item");
        const state = TestOrders.overall(o);
        const text = el("div", "test-orders__text");
        text.append(el("span", "test-orders__name", o.label), el("span", "test-orders__meta", TestOrders.stateText(o)));
        if (o.approval.escalatedAt && o.approval.status === "waiting") text.append(el("span", "test-orders__escalated", "Escalated: waiting past the time limit"));
        li.append(text, el("span", `badge ${BADGE[state]}`, BADGE_TEXT[state]));
        ul.append(li);
      }
      wrap.append(ul);
      return wrap;
    }

    function render() {
      const blocks = [suggestedBlock()];
      if (canOrder()) blocks.push(pickerBlock());
      blocks.push(ordersBlock());
      host.replaceChildren(...blocks);
    }

    const onStorage = (e) => {
      if (!e.key || e.key === "ndfip.orders" || e.key === "ndfip.suggestions" || e.key === "ndfip.tests") render();
    };
    window.addEventListener("storage", onStorage);
    render();

    return {
      refresh: render,
      update(next) {
        options = { ...options, ...next };
        render();
      },
      summary: () => TestOrders.forRecord(record.id).map((o) => `${o.label} (${{ waiting: "waiting for approval", approved: "approved", rejected: "rejected" }[TestOrders.overall(o)]})`),
      destroy() {
        window.removeEventListener("storage", onStorage);
        host.replaceChildren();
      },
    };
  }

  return { mount };
})();
