// Referral tracking page (UAT-12): referrals followed sent -> received -> attended -> closed,
// with destination, urgency, due date and history; and suggested referrals that were not
// made, with the reason. Scoped to the user's clinics; names follow Data visibility.

(() => {
  if (Access.denied) return;
  const { $, $$, el, fmtDate, fmtDateTime, plural } = Records;
  const listHost = $("#referral-list");
  const declinedHost = $("#declined-list");
  const fStatus = $("#filter-status");
  const fDest = $("#filter-destination");
  const fOverdue = $("#filter-overdue");
  const canTrack = () => Access.can("referrals.track");

  Object.entries(Referrals.DESTINATION).forEach(([v, l]) => fDest.append(new Option(l, v)));

  // ---------- Tabs ----------
  const tabs = [$("#tab-made"), $("#tab-declined")];
  function select(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(`#${t.getAttribute("aria-controls")}`).hidden = !on;
    });
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
  if (location.hash === "#declined") select(tabs[1]);

  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 3000);
  }

  const patientOf = (x) => (typeof Patients !== "undefined" ? Patients.byFileNumber(x.fileNumber) : null) ?? { fileNumber: x.fileNumber, name: x.patientName };

  function filtered() {
    return Referrals.all().filter((r) => {
      if (fStatus.value === "open" && !["sent", "received"].includes(r.status)) return false;
      if (fStatus.value && fStatus.value !== "open" && r.status !== fStatus.value) return false;
      if (fDest.value && r.destination !== fDest.value) return false;
      if (fOverdue.checked && !Referrals.isOverdue(r)) return false;
      return true;
    });
  }

  const STATUS_BADGE = { sent: "badge-status-progress", received: "badge-status-progress", attended: "badge-status-complete", closed: "badge-status-complete", cancelled: "badge-muted" };
  const NEXT_LABEL = { received: "Mark received", attended: "Mark attended", closed: "Close", cancelled: "Cancel referral" };

  function referralItem(ref) {
    const p = patientOf(ref);
    const li = el("li", "records-ref");
    const head = el("div", "records-ref__head");
    const who = el("div", "records-ref__who");
    const name = el("a", "records-row__name", Privacy.name(p.name, p));
    name.href = `./patient.html?file=${encodeURIComponent(ref.fileNumber)}`;
    who.append(name, el("span", "records-row__meta", `${ref.fileNumber} · ${Org.clinicLabel(ref.clinicId)}`));
    const badges = el("div", "worklist__badges");
    badges.append(el("span", `badge ${STATUS_BADGE[ref.status]}`, Referrals.STATUS_LABEL[ref.status]));
    if (Referrals.isOverdue(ref)) badges.append(el("span", "badge badge-danger", "Overdue"));
    if (ref.suggested) badges.append(el("span", "badge badge-secondary", "Suggested by the system"));
    head.append(who, badges);
    li.append(head);

    const dlist = el("dl", "detail-grid detail-grid--plain records-ref__grid");
    const add = (t, v) => {
      const d = el("div");
      d.append(el("dt", "", t), el("dd", "", v));
      dlist.append(d);
    };
    add("Destination", Referrals.DESTINATION[ref.destination] ?? ref.destination);
    add("Urgency", Referrals.URGENCY[ref.urgency] ?? ref.urgency ?? "—");
    add("Timing", Referrals.TIMING[ref.timing] ?? ref.timing ?? "—");
    add("Due", fmtDate(ref.dueDate));
    add("Referred", `${fmtDate(ref.createdAt)} by ${ref.createdBy}`);
    li.append(dlist);
    if (ref.reason && Privacy.medicalVisible(p)) li.append(el("p", "field-hint", `Reason: ${ref.reason}`));

    const hist = el("details", "records-ref__history");
    hist.append(el("summary", "", `History (${plural(ref.history.length, "step")})`));
    const ol = el("ol", "records-ref__steps");
    for (const h of ref.history) {
      const s = el("li");
      s.append(el("strong", "", Referrals.STATUS_LABEL[h.status]), ` · ${fmtDateTime(h.at)} · ${h.by}`);
      if (h.note) s.append(el("span", "records-ref__note", h.note));
      ol.append(s);
    }
    hist.append(ol);
    li.append(hist);

    const next = Referrals.NEXT[ref.status] ?? [];
    if (canTrack() && next.length) {
      const actions = el("div", "records-ref__actions");
      const err = el("div");
      for (const status of next) {
        const b = el("button", `btn btn-sm ${status === "cancelled" ? "btn-ghost" : "btn-outline"}`, NEXT_LABEL[status]);
        b.type = "button";
        b.addEventListener("click", async () => {
          if (b.disabled) return;
          const note = await Records.askText({
            title: `${NEXT_LABEL[status]}?`,
            description: `${Referrals.DESTINATION[ref.destination]} referral for ${Privacy.name(p.name, p)}.`,
            label: "Note",
            confirm: NEXT_LABEL[status],
            required: status === "cancelled",
          });
          if (note === null) return;
          $$("button", actions).forEach((x) => (x.disabled = true)); // EC-02
          err.replaceChildren();
          try {
            Referrals.setStatus(ref.id, status, note);
            toast(`Referral marked ${Referrals.STATUS_LABEL[status].toLowerCase()}.`);
            render();
          } catch (ex) {
            $$("button", actions).forEach((x) => (x.disabled = false));
            err.append(Records.inlineError(ex.message || "The change couldn't be saved. Nothing was changed."));
          }
        });
        actions.append(b);
      }
      li.append(actions, err);
    }
    return li;
  }

  function declinedItem(d) {
    const p = patientOf(d);
    const li = el("li", "records-ref");
    const head = el("div", "records-ref__head");
    const who = el("div", "records-ref__who");
    const name = el("a", "records-row__name", Privacy.name(p.name, p));
    name.href = `./appointment.html?id=${encodeURIComponent(d.recordId)}`;
    who.append(name, el("span", "records-row__meta", `${d.fileNumber} · ${Org.clinicLabel(d.clinicId)}`));
    const badges = el("div", "worklist__badges");
    badges.append(el("span", "badge badge-status-attention", "Not made"));
    if (d.suggestion.tier) badges.append(el("span", "badge badge-secondary", d.suggestion.tier));
    head.append(who, badges);
    const sug = [Referrals.DESTINATION[d.suggestion.destination], Referrals.URGENCY[d.suggestion.urgency], Referrals.TIMING[d.suggestion.timing]].filter(Boolean).join(" · ");
    li.append(head, el("p", "", `Suggested: ${sug || "referral"}`), el("p", "field-hint", `Decided ${fmtDateTime(d.at)} by ${d.by}. Reason: ${d.reason || "none given"}`));
    return li;
  }

  function render() {
    const made = filtered();
    const declined = Referrals.declined();
    $("#count-made").textContent = Referrals.all().length;
    $("#count-declined").textContent = declined.length;
    if (!made.length) listHost.replaceChildren(Records.stateBox("empty", Referrals.all().length ? "No referrals match the filters" : "No referrals yet", Referrals.all().length ? "Change the filters to see more." : "Referrals made at sign-off appear here."));
    else {
      const ul = el("ul", "records-list records-list--cards");
      made.forEach((r) => ul.append(referralItem(r)));
      listHost.replaceChildren(el("p", "result-count", plural(made.length, "referral")), ul);
    }
    if (!declined.length) declinedHost.replaceChildren(Records.stateBox("empty", "Nothing here", "Suggested referrals that a practitioner decides not to make appear here, with the reason."));
    else {
      const ul = el("ul", "records-list records-list--cards");
      declined.forEach((d) => ul.append(declinedItem(d)));
      declinedHost.replaceChildren(ul);
    }
  }

  [fStatus, fDest, fOverdue].forEach((f) => f.addEventListener("change", render));

  // CSV export of the open tab. Names follow Data visibility; no national ID.
  $("#export-referrals").addEventListener("click", () => {
    const declinedTab = tabs[1].getAttribute("aria-selected") === "true";
    const date = new Date().toISOString().slice(0, 10);
    if (declinedTab) {
      const rows = [["File number", "Patient", "Clinic", "Suggested destination", "Urgency", "Timing", "Tier", "Decided at", "Decided by", "Reason"]];
      for (const d of Referrals.declined()) {
        const p = patientOf(d);
        rows.push([d.fileNumber, Privacy.name(p.name, p), Org.clinicLabel(d.clinicId), Referrals.DESTINATION[d.suggestion.destination] ?? "", Referrals.URGENCY[d.suggestion.urgency] ?? "", Referrals.TIMING[d.suggestion.timing] ?? "", d.suggestion.tier ?? "", d.at, d.by, d.reason]);
      }
      Records.downloadCsv(`referrals-not-made-${date}.csv`, rows);
    } else {
      const rows = [["File number", "Patient", "Clinic", "Destination", "Urgency", "Timing", "Due", "Status", "Overdue", "Referred at", "Referred by", "Suggested by the system"]];
      for (const r of filtered()) {
        const p = patientOf(r);
        rows.push([r.fileNumber, Privacy.name(p.name, p), Org.clinicLabel(r.clinicId), Referrals.DESTINATION[r.destination] ?? "", Referrals.URGENCY[r.urgency] ?? "", Referrals.TIMING[r.timing] ?? "", r.dueDate.slice(0, 10), Referrals.STATUS_LABEL[r.status], Referrals.isOverdue(r) ? "yes" : "no", r.createdAt, r.createdBy, r.suggested ? "yes" : "no"]);
      }
      Records.downloadCsv(`referrals-${date}.csv`, rows);
    }
    Audit.log("export", { action: declinedTab ? "Referrals not made exported (CSV)" : "Referral list exported (CSV)" });
    toast("Export downloaded.");
  });

  try {
    render();
  } catch (err) {
    Db.logError("referrals page", err);
    listHost.replaceChildren(Records.stateBox("error", "Referrals couldn't be loaded", "Nothing was changed. Reload the page; if it keeps failing, contact support."));
  }
  window.addEventListener("storage", (e) => e.key === "ndfip.referrals" && render());
})();
