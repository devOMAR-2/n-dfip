// Shared UI for encounters: queues (UAT-06/07/08), stage tracker and holder labels
// (UAT-07/09), supervisor lock release (UAT-09). Needs auth.js, access.js, org.js,
// privacy.js, privacy-ui.js and screening-store.js.
// Queues only list clinics in the user's scope (UAT-01); names follow the role's data
// visibility (UAT-02). Each queue has loading, empty and error states (UAT-19).

const EncounterUI = (() => {
  const S = ScreeningStore;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const time = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  function waited(iso) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    return `${h} h ${mins % 60} min`;
  }

  // "Under review by Dr. X since 10:42" / "Being screened by Y since 09:50"
  function holderText(record) {
    if (!S.lockActive(record)) return null;
    const verb = record.status === "in-review" ? "Under review by" : "Being screened by";
    return `${verb} ${record.holder.name} since ${time(record.holder.since)}`;
  }

  function stageBadge(record) {
    const st = S.stageOf(record);
    const b = el("span", `badge stage-badge stage-badge--${st.n}`, `${st.n} · ${st.label}`);
    return b;
  }

  // ---------- Stage tracker (top of the file) ----------

  function tracker(record) {
    const wrap = el("section", "stage-tracker");
    wrap.setAttribute("aria-label", "Encounter stage");
    const list = el("ol", "stage-tracker__steps");
    const current = S.stageOf(record).n;
    for (const st of S.STAGES) {
      const li = el("li", `stage-tracker__step${st.n < current ? " is-done" : st.n === current ? " is-current" : ""}`);
      if (st.n === current) li.setAttribute("aria-current", "step");
      li.append(el("span", "stage-tracker__num", st.n < current ? "✓" : String(st.n)), el("span", "stage-tracker__label", st.label));
      list.append(li);
    }
    wrap.append(list);
    const who = holderText(record);
    const meta = [
      who ?? (record.status === "reviewed" ? `Signed by ${record.review?.signedBy ?? "practitioner"}` : "Nobody has the file open"),
      record.submittedAt ? `Sent ${time(record.submittedAt)} by ${record.submittedBy}` : record.arrivedAt ? `Arrived ${time(record.arrivedAt)}` : null,
    ].filter(Boolean);
    wrap.append(el("p", "stage-tracker__meta", meta.join(" · ")));
    return wrap;
  }

  // ---------- Queues ----------

  // More than one clinic in scope: each row says which clinic it's booked in
  const multiClinic = () => typeof Org !== "undefined" && Org.clinicsInScope().length > 1;
  const patientName = (r) => (typeof Privacy !== "undefined" ? Privacy.name(r.patientName, r.fileNumber) : r.patientName);

  function row(record, { meta, action }) {
    const item = el("li", "worklist__item" + (record.urgent ? " worklist__item--urgent" : ""));
    const text = el("div", "worklist__text");
    const fullMeta = multiClinic() ? `${meta} · ${Org.clinicLabel(Org.clinicOfRecord(record))}` : meta;
    text.append(el("span", "worklist__name", patientName(record)), el("span", "worklist__meta", fullMeta));
    const badges = el("div", "worklist__badges");
    badges.append(stageBadge(record));
    if (record.urgent) badges.append(el("span", "badge badge-danger", "Critical alert"));
    for (const flag of (record.flags ?? []).filter((f) => f.level !== "urgent")) badges.append(el("span", "badge badge-muted", flag.text.split(":")[0]));
    const holder = holderText(record);
    if (holder) {
      const lock = el("span", "worklist__holder", holder);
      lock.prepend(lockIcon());
      text.append(lock);
    }
    const actions = el("div", "worklist__actions");
    // Supervisor (or anyone with "lock.release") frees a file someone else holds
    if (heldByOther(record) && Access.can("lock.release")) actions.append(releaseButton(record));
    if (action) {
      const a = el("a", `btn btn-sm ${action.primary === false ? "btn-outline" : "btn-primary"}`, action.label);
      a.href = action.href;
      actions.append(a);
    }
    item.append(text, badges, actions);
    return item;
  }

  function releaseButton(record) {
    const b = el("button", "btn btn-sm btn-outline", "Release lock");
    b.type = "button";
    b.setAttribute("aria-label", `Release lock on ${patientName(record)}`);
    b.addEventListener("click", async () => {
      const reason = await PrivacyUI.askReason({
        title: "Release editing lock",
        description: `${record.holder.name} has had this file open since ${time(record.holder.since)}. Releasing the lock lets someone else edit it; their unsaved changes stay in their draft. The release is recorded in the audit log.`,
        label: "Reason",
        confirm: "Release lock",
      });
      if (!reason) return;
      // Re-check: the holder may have left, or the permission may have been removed
      const latest = S.getById(record.id);
      if (!Access.can("lock.release")) return renderQueues();
      if (latest && S.lockActive(latest)) S.forceRelease(record.id, reason);
      renderQueues();
    });
    return b;
  }

  function lockIcon() {
    const span = el("span", "worklist__lock");
    span.setAttribute("aria-hidden", "true");
    span.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>';
    return span;
  }

  const me = () => Access.currentUser();
  const heldByOther = (r) => S.lockActive(r) && r.holder.id !== me()?.id;
  const canOpenScreening = () => Access.canAny(["screening.perform", "screening.pull"]);
  const canOpenReview = () => Access.can("review.queue");

  const QUEUES = {
    // Nurse: patients who arrived and are waiting for (or in) screening
    screening: {
      perms: ["screening.perform"],
      title: "Awaiting screening",
      empty: "No patients waiting for screening.",
      items: () => S.screeningQueue(),
      row: (r) =>
        row(r, {
          meta: `${r.fileNumber} · arrived ${time(r.arrivedAt)} · waiting ${waited(r.arrivedAt)}`,
          action: heldByOther(r)
            ? { label: "View", href: `./screening.html?id=${encodeURIComponent(r.id)}`, primary: false }
            : { label: r.status === "screening" ? "Continue screening" : "Start screening", href: `./screening.html?id=${encodeURIComponent(r.id)}` },
        }),
    },
    // Practitioner: sent screenings, most urgent first
    review: {
      perms: ["review.queue"],
      title: "Awaiting practitioner review",
      empty: "No screenings waiting for review.",
      items: () => S.reviewQueue(),
      row: (r) =>
        row(r, {
          meta: `${r.fileNumber} · screening sent ${time(r.submittedAt)} · waiting ${waited(r.submittedAt)}`,
          action: heldByOther(r)
            ? { label: "View", href: `./review.html?id=${encodeURIComponent(r.id)}`, primary: false }
            : { label: r.status === "in-review" ? "Continue review" : "Review", href: `./review.html?id=${encodeURIComponent(r.id)}` },
        }),
    },
    // Practitioner: files still at stage 1 or 2, which they can pull and complete
    "pre-review": {
      perms: ["screening.pull"],
      title: "Not yet sent by the nurse",
      empty: "No files waiting at the screening stages.",
      hint: "You can open one of these and complete the nurse's part yourself. It's recorded in the audit log.",
      items: () => S.screeningQueue(),
      row: (r) =>
        row(r, {
          meta: `${r.fileNumber} · arrived ${time(r.arrivedAt)} · waiting ${waited(r.arrivedAt)}`,
          action: heldByOther(r)
            ? { label: "View", href: `./screening.html?id=${encodeURIComponent(r.id)}`, primary: false }
            : { label: "Complete screening", href: `./screening.html?id=${encodeURIComponent(r.id)}`, primary: false },
        }),
    },
    // Supervisors: every open file in scope, with who holds it, so a stuck lock can be freed
    supervision: {
      show: () => Access.can("lock.release") && !Access.canAny(["screening.perform", "review.queue"]),
      title: "Open files",
      empty: "No open files in your facilities.",
      hint: "Files not yet signed. You can release a lock someone has left open; the release is recorded in the audit log.",
      items: () => S.pending().sort((a, b) => (a.arrivedAt ?? "").localeCompare(b.arrivedAt ?? "")),
      row: (r) => {
        const n = S.stageOf(r).n;
        const href = n <= 2 ? (canOpenScreening() ? `./screening.html?id=${encodeURIComponent(r.id)}` : null) : canOpenReview() ? `./review.html?id=${encodeURIComponent(r.id)}` : null;
        return row(r, {
          meta: `${r.fileNumber} · arrived ${time(r.arrivedAt)} · waiting ${waited(r.submittedAt ?? r.arrivedAt)}`,
          action: href ? { label: "View", href, primary: false } : null,
        });
      },
    },
  };

  function stateBox(cls, text, retry) {
    const box = el("div", `queue-state queue-state--${cls}`);
    box.setAttribute("role", cls === "error" ? "alert" : "status");
    box.append(el("p", "", text));
    if (retry) {
      const b = el("button", "btn btn-sm btn-outline", "Try again");
      b.type = "button";
      b.addEventListener("click", retry);
      box.append(b);
    }
    return box;
  }

  const allowed = (q) => (q.show ? q.show() : Access.canAny(q.perms));

  // Loading placeholder while the queues are fetched (UAT-19)
  function renderLoading(root = document) {
    for (const host of root.querySelectorAll("[data-queue]")) {
      const q = QUEUES[host.dataset.queue];
      if (!q || !allowed(q)) continue;
      host.hidden = false;
      host.setAttribute("aria-busy", "true");
      const h = el("h2", "section-title", q.title);
      const skel = el("ul", "worklist worklist--loading");
      skel.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 2; i++) skel.append(el("li", "worklist__item skeleton-row"));
      host.replaceChildren(h, stateBox("loading", "Loading…"), skel);
    }
  }

  // Render every queue placeholder on the page the user is allowed to see:
  // <section data-queue="screening|review|pre-review"></section>
  // A host with data-queue-scope="working" only lists the clinic chosen on the clinic page.
  function renderQueues(root = document) {
    for (const host of root.querySelectorAll("[data-queue]")) {
      const q = QUEUES[host.dataset.queue];
      if (!q || !allowed(q)) {
        host.hidden = true;
        continue;
      }
      host.hidden = false;
      host.removeAttribute("aria-busy");
      const id = `queue-${host.dataset.queue}`;
      const h = el("h2", "section-title", q.title);
      h.id = id;
      host.setAttribute("aria-labelledby", id);
      let items;
      try {
        items = q.items();
        if (host.dataset.queueScope === "working" && typeof Org !== "undefined") {
          const clinicId = Org.workingClinic();
          items = items.filter((r) => Org.clinicOfRecord(r) === clinicId);
        }
      } catch (e) {
        if (typeof Db !== "undefined") Db.logError(`queue ${host.dataset.queue}`, e);
        host.replaceChildren(h, stateBox("error", "Couldn't load the queue. Try again.", () => renderQueues(root)));
        continue;
      }
      h.textContent = `${q.title} (${items.length})`;
      host.replaceChildren(h);
      if (q.hint) host.append(el("p", "field-hint", q.hint));
      if (!items.length) {
        host.append(el("p", "empty-line", q.empty));
        continue;
      }
      const list = el("ul", "worklist");
      items.forEach((r) => list.append(q.row(r)));
      host.append(list);
    }
  }

  return { tracker, renderQueues, renderLoading, holderText, stageBadge, time, waited };
})();
