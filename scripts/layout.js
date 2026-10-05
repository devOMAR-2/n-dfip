// Page layout per clinic, managed in Settings and applied to the live pages
// (UAT-13 tabs, UAT-14 section control, UAT-15 question placement, F-13 builder → live pages).
// Load after db.js / access.js, and after screening-schema.js (+ review-schema.js in Settings).
//
// Stored in Db "ndfip.layout.diabetic-foot":
//   { rev, current, versions: [{ n, at, by, note, config }] }
// config = {
//   pages: {
//     screening: { tabs: [{ id, title, sections: [key] }], sections: { key: { enabled, required, locked: [roleId] } } },
//     review:    { ...same },
//   },
//   questions: { key: { page, section, enabled } },   // overrides for built-in questions
//   custom: [{ id, key, label, help, type, options, required, unit, page, section, view, sites }],
// }
// Question keys collapse the foot side and ulcer number: "c.left.hallux" -> "c.*.hallux",
// "j.2.zone" -> "j.#.zone". Per-ulcer questions ("#") can't be moved.
// Every encounter records the version it started with (record.layoutVersion), so a change
// in Settings never alters an open or finished encounter (UAT-14, EC-10).

const Layout = (() => {
  const KEY = "ndfip.layout.diabetic-foot";

  const SECTIONS = {
    screening: [
      ["A", "Patient & Encounter"], ["B", "Risk History"], ["C", "Neurological Findings"], ["D", "Vascular Bedside Signs"],
      ["E", "Perfusion Measurements"], ["F", "Deformity, Skin"], ["G", "Nail & Footwear"], ["H", "Charcot Red-flag Screen"],
      ["I", "Previous Ulcer / Amputation History"], ["J", "Wounds"],
    ],
    review: [
      ["findings", "Screening Findings"], ["recommendations", "System Recommendations"], ["wound", "Wound Evaluation"],
      ["labs", "Lab Results"], ["pad", "Peripheral Arterial Disease"], ["infection", "Infection Management"],
      ["medications", "Medications"], ["adjunct", "Adjunctive Therapies"], ["orders", "Orders"],
      ["interpretation", "Clinical Interpretation"], ["referral", "Referral Decision"], ["plan", "Plan"],
      ["instructions", "Patient Instructions"], ["note", "Clinical Note"], ["signoff", "Sign-off"],
    ],
  };
  const PAGE_LABEL = { screening: "Nurse screening", review: "Practitioner review" };
  const OPTIONAL_BY_DEFAULT = new Set(["B", "E", "F"]);
  // Sections whose content is built by the page itself (no questions to move in or out)
  const FIXED = new Set(["recommendations", "signoff", "note", "instructions", "findings"]);

  const sec = (page, key) => ({
    enabled: true,
    required: page === "screening" ? !OPTIONAL_BY_DEFAULT.has(key) : true,
    // UAT-14 example: the medication section is locked for the nurse
    locked: key === "medications" ? ["nurse"] : [],
  });

  const DEFAULT = {
    pages: {
      screening: {
        tabs: [
          { id: "t-intake", title: "Patient & history", sections: ["A", "B"] },
          { id: "t-neuro", title: "Nerves & circulation", sections: ["C", "D", "E"] },
          { id: "t-foot", title: "Foot examination", sections: ["F", "G", "H", "I"] },
          { id: "t-wounds", title: "Wounds", sections: ["J"] },
        ],
        sections: Object.fromEntries(SECTIONS.screening.map(([k]) => [k, sec("screening", k)])),
      },
      review: {
        tabs: [
          { id: "t-overview", title: "Patient overview", sections: ["findings", "labs"] },
          { id: "t-recs", title: "System recommendations", sections: ["recommendations"] },
          { id: "t-assess", title: "Assessment", sections: ["wound", "pad", "infection", "adjunct"] },
          { id: "t-orders", title: "Orders and referral", sections: ["medications", "orders", "referral"] },
          { id: "t-plan", title: "Plan and sign-off", sections: ["interpretation", "plan", "instructions", "note", "signoff"] },
        ],
        sections: Object.fromEntries(SECTIONS.review.map(([k]) => [k, sec("review", k)])),
      },
    },
    questions: {},
    custom: [],
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const SEED_AT = "2026-09-01T08:00:00.000Z";

  function state() {
    const s = Db.read(KEY, null);
    if (s?.versions?.length) return s;
    return { rev: 0, current: 1, versions: [{ n: 1, at: SEED_AT, by: "System", note: "Initial layout", config: clone(DEFAULT) }] };
  }

  // Fill gaps so a config saved by an older build still works
  function normalise(config) {
    const c = clone(config ?? DEFAULT);
    c.pages ??= {};
    for (const page of ["screening", "review"]) {
      const p = (c.pages[page] ??= clone(DEFAULT.pages[page]));
      p.tabs ??= clone(DEFAULT.pages[page].tabs);
      p.sections ??= {};
      for (const [k] of SECTIONS[page]) p.sections[k] = { ...sec(page, k), ...(p.sections[k] ?? {}) };
      // A section added to the page since this layout was saved goes in the last tab
      const placed = new Set(p.tabs.flatMap((t) => t.sections));
      const missing = SECTIONS[page].map(([k]) => k).filter((k) => !placed.has(k));
      if (missing.length && p.tabs.length) p.tabs[p.tabs.length - 1].sections.push(...missing);
    }
    c.questions ??= {};
    c.custom ??= [];
    return c;
  }

  const versions = () => state().versions;
  const version = (n) => normalise(versions().find((v) => v.n === n)?.config ?? versions()[0].config);
  const currentN = () => state().current;
  const current = () => version(currentN());
  const forRecord = (record) => {
    const n = record?.layoutVersion ?? 1;
    return { n, config: version(n) };
  };

  class ConflictError extends Error {}

  // Publish a new version. expectedRev guards against two admins saving at once (EC-11).
  function publish(config, note, expectedRev) {
    const s = state();
    if (expectedRev !== undefined && expectedRev !== s.rev) {
      const last = s.versions.find((v) => v.n === s.current);
      throw new ConflictError(`The layout was changed by ${last?.by ?? "someone else"} at ${new Date(last?.at).toLocaleTimeString()} after you opened it. Nothing was saved. Reload to see their version.`);
    }
    const u = Access.currentUser();
    const n = Math.max(...s.versions.map((v) => v.n)) + 1;
    const next = { rev: s.rev + 1, current: n, versions: [...s.versions, { n, at: new Date().toISOString(), by: u?.name ?? "unknown", note, config: normalise(config) }] };
    Db.write(KEY, next, { where: "layout" });
    if (typeof Audit !== "undefined") Audit.log("setup.change", { action: `Page layout version ${n} published${note ? `: ${note}` : ""}`, new: `v${n}` });
    return n;
  }

  // ---------- Questions ----------

  const keyOf = (name) => name.replace(/^([a-z])\.(left|right)\./, "$1.*.").replace(/^j\.\d\./, "j.#.").replace(/^r\.w\.\d\./, "r.w.#.");
  const pageOfKey = (key) => (key.startsWith("r.") ? "review" : "screening");
  // Handbook section 9: questions that feed the risk calculation are locked on (always shown,
  // on the nurse page): vitals, both pulses, tuning fork, monofilament map, Charcot red flags and
  // temperatures, previous ulcer, ulcer count and location.
  const LOCKED = new Set(["a.temp", "a.hr", "a.rr", "a.sbp", "a.glucose", "d.*.dp", "d.*.pt", "c.*.vibration", "c.*.hallux", "c.*.mth1", "c.*.mth5", "h.*.flags", "h.*.temp", "i.*.ulcer", "j.count"]);
  const locked = (key) => LOCKED.has(key) || key.startsWith("j.");
  const movable = (key) => !key.includes("#") && !locked(key);
  const namesFor = (key) => (key.includes(".*.") ? ["left", "right"].map((s) => key.replace("*", s)) : [key]);

  // Built-in questions of a page (collapsed keys), with their schema entry and home section
  function catalogue(page) {
    const schema = page === "screening" ? (typeof ScreeningSchema !== "undefined" ? ScreeningSchema : null) : (typeof ReviewSchema !== "undefined" ? ReviewSchema : null);
    const out = [];
    const seen = new Set();
    for (const f of schema?.fields ?? []) {
      const key = keyOf(f.name);
      if (seen.has(key) || key.startsWith("_")) continue;
      seen.add(key);
      out.push({ key, label: f.label, sub: f.sub ?? "", section: f.section, field: f, movable: movable(key), locked: locked(key) });
    }
    return out;
  }

  function fieldOf(key) {
    const page = pageOfKey(key);
    return catalogue(page).find((q) => q.key === key) ?? null;
  }

  // Where a built-in question shows under this config: { page, section, enabled }
  function placement(config, key) {
    const home = fieldOf(key);
    const o = locked(key) ? {} : config.questions?.[key] ?? {};
    return { page: o.page ?? pageOfKey(key), section: o.section ?? home?.section ?? null, enabled: o.enabled !== false };
  }

  return {
    KEY, SECTIONS, PAGE_LABEL, FIXED, DEFAULT,
    state, versions, version, current, currentN, forRecord, publish, normalise, ConflictError,
    keyOf, pageOfKey, movable, locked, LOCKED, namesFor, catalogue, fieldOf, placement,
  };
})();

// ---------- Live pages ----------
// const ui = LayoutUI.apply({ page: "screening" | "review", form, record, isAnswered, onChange })
//   ui.collect()        -> { answers, review, custom } from moved / added questions
//   ui.fill(record)     put stored values back into them
//   ui.reveal(node)     switch to the tab that contains node (before focusing it)
//   ui.refresh()        recount pending items per tab
//   ui.firstPending()   the first unanswered required question (any tab), or null
const LayoutUI = (() => {
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const ERR = '<p class="field-error" hidden><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg><span></span></p>';

  const sectionKey = (s) => s.dataset.key ?? s.dataset.section;

  // Markup for one question, like the generated form (tools/formkit.py)
  function questionHtml(q, name, label) {
    const req = q.required;
    const id = `f-${name.replace(/[^\w]/g, "-")}`;
    const help = q.help ? `<p class="field-hint">${esc(q.help)}</p>` : "";
    const chips = (kind, options) => `<div class="chips">${options.map(([v, l]) => `<label class="chip"><input type="${kind}" name="${esc(name)}" value="${esc(v)}" /><span>${esc(l)}</span></label>`).join("")}</div>`;
    const opts = (q.options ?? []).filter(Boolean).map((o) => (Array.isArray(o) ? o : [o, o]));
    switch (q.type) {
      case "radio":
      case "single":
      case "yesno":
      case "checkbox":
      case "multiple": {
        const kind = q.type === "checkbox" || q.type === "multiple" ? "checkbox" : "radio";
        const list = q.type === "yesno" ? [["yes", "Yes"], ["no", "No"]] : opts;
        const r = req ? ` data-required="${kind === "radio" ? "radio" : "any"}" data-error="Choose an option."` : "";
        return `<fieldset class="q"${r}><legend class="label">${esc(label)}</legend>${help}${chips(kind, list)}${req ? ERR : ""}</fieldset>`;
      }
      case "select": {
        const r = req ? ' data-required="value" data-error="Choose an option."' : "";
        return `<div class="q"${r}><label class="label" for="${id}">${esc(label)}</label>${help}<select class="input select" id="${id}" name="${esc(name)}"><option value="">Choose…</option>${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>${req ? ERR : ""}</div>`;
      }
      case "footmap":
        return footmapHtml(q, name, label, help);
      default: {
        const r = req ? ' data-required="value" data-error="Enter a value."' : "";
        let input;
        if (q.type === "longtext" || q.type === "textarea") input = `<textarea class="input textarea" id="${id}" name="${esc(name)}" rows="3"></textarea>`;
        else if (q.type === "number") {
          const lim = `${q.min != null ? ` min="${q.min}"` : ""}${q.max != null ? ` max="${q.max}"` : ""}`;
          input = `<div class="input-unit"><input class="input" type="number" inputmode="decimal" step="any"${lim} id="${id}" name="${esc(name)}" />${q.unit ? `<span class="input-unit__suffix">${esc(q.unit)}</span>` : ""}</div>`;
        } else if (q.type === "scale" || q.type === "range") input = `<input class="range" type="range" min="0" max="10" id="${id}" name="${esc(name)}" />`;
        else if (q.type === "date") input = `<input class="input" type="date" id="${id}" name="${esc(name)}" />`;
        else if (q.type === "photo" || q.type === "file") input = `<input class="file-input" type="file" accept="image/*" id="${id}" name="${esc(name)}" />`;
        else input = `<input class="input" id="${id}" name="${esc(name)}" autocomplete="off" />`;
        return `<div class="q"${r}><label class="label" for="${id}">${esc(label)}${req ? "" : ' <span class="label__optional">(optional)</span>'}</label>${help}${input}${req ? ERR : ""}</div>`;
      }
    }
  }

  // Custom foot map: tap sites on the real diagram; value = ["right:hallux", ...] in a hidden
  // checkbox group so the page's own required check works
  function footmapHtml(q, name, label, help) {
    const D = ScreeningSchema.footDiagram;
    const sites = q.sites?.length ? q.sites : Object.keys(D.labels);
    const views = q.view === "both" ? ["plantar", "dorsal"] : [q.view ?? "plantar"];
    const shape = (zone, tag, attrs, side) => {
      if (!sites.includes(zone)) return `<${tag} class="foot-landmark" ${attrs}><title>${esc(D.labels[zone])}</title></${tag}>`;
      return `<${tag} class="foot-zone" data-zone="${zone}" data-pick="${side}:${zone}" tabindex="0" role="button" aria-label="${side === "left" ? "Left" : "Right"} ${esc(D.labels[zone])}" ${attrs}><title>${esc(D.labels[zone])}</title></${tag}>`;
    };
    const svg = (side, view) => {
      const flip = view === "plantar" ? side === "right" : side === "left";
      const parts = [`<path class="foot-outline" d="${D.outline}" />`];
      for (const [z, cx, cy, rx, ry] of D.toes) parts.push(shape(z, "ellipse", `cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"`, side));
      for (const [z, cx, cy, r] of D.mths) parts.push(shape(z, "circle", `cx="${cx}" cy="${cy}" r="${r}"`, side));
      const [mx, my, mrx, mry] = D.midfoot;
      parts.push(shape("midfoot", "ellipse", `cx="${mx}" cy="${my}" rx="${mrx}" ry="${mry}"`, side));
      if (view === "plantar") {
        const [hx, hy, hrx, hry] = D.heel;
        parts.push(shape("heel", "ellipse", `cx="${hx}" cy="${hy}" rx="${hrx}" ry="${hry}"`, side));
      }
      return `<svg class="foot-map__svg" viewBox="0 0 100 220"><g${flip ? ' transform="translate(100 0) scale(-1 1)"' : ""}>${parts.join("")}</g></svg>`;
    };
    const order = (view) => (view === "plantar" ? [["right", "Right foot"], ["left", "Left foot"]] : [["left", "Left foot"], ["right", "Right foot"]]);
    const viewHtml = views.map((v) => `<div class="ulcer-map__view"><p class="ulcer-map__view-title">${v === "plantar" ? "Sole view" : "Top view"}</p><div class="ulcer-map__feet">${order(v).map(([s, l]) => `<figure class="ulcer-map__foot">${svg(s, v)}<figcaption>${l}</figcaption></figure>`).join("")}</div></div>`).join("");
    const boxes = ["left", "right"].flatMap((s) => sites.map((z) => `<input type="checkbox" name="${esc(name)}" value="${s}:${z}" hidden />`)).join("");
    const r = q.required ? ' data-required="any" data-error="Tap at least one site."' : "";
    return `<fieldset class="q custom-footmap"${r}><legend class="label">${esc(label)}</legend>${help}<div class="ulcer-map__views">${viewHtml}</div><p class="field-hint" data-picked></p>${boxes}${q.required ? ERR : ""}</fieldset>`;
  }

  function wireFootmap(wrap, readOnly) {
    const boxes = $$("input[type=checkbox]", wrap);
    const sync = () => {
      const picked = boxes.filter((b) => b.checked).map((b) => b.value);
      $$("[data-pick]", wrap).forEach((z) => z.classList.toggle("is-selected", picked.includes(z.dataset.pick)));
      const D = ScreeningSchema.footDiagram;
      wrap.querySelector("[data-picked]").textContent = picked.length
        ? `Selected: ${picked.map((p) => { const [s, z] = p.split(":"); return `${s === "left" ? "Left" : "Right"} ${D.labels[z].toLowerCase()}`; }).join(", ")}`
        : "Nothing selected yet.";
    };
    const toggle = (pick) => {
      if (readOnly || wrap.closest("[data-locked]") || boxes[0]?.disabled) return;
      const box = boxes.find((b) => b.value === pick);
      if (!box) return;
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change", { bubbles: true }));
      sync();
    };
    $$("[data-pick]", wrap).forEach((z) => {
      z.addEventListener("click", () => toggle(z.dataset.pick));
      z.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle(z.dataset.pick);
        }
      });
    });
    wrap._sync = sync;
    sync();
  }

  function apply({ page, form, record, isAnswered, readOnly = false, onChange = () => {}, extraPending = () => 0 }) {
    const { config } = Layout.forRecord(record);
    const pageCfg = config.pages[page];
    const role = Access.currentUser()?.role;
    const sections = $$(".form-section", form);
    const byKey = Object.fromEntries(sections.map((s) => [sectionKey(s), s]));
    const foreign = []; // { input name, store: "answers" | "review" | "custom", key }

    const disableInside = (root) => $$("input, select, textarea, button", root).forEach((f) => {
      if (!f.closest(".form-section__summary")) f.disabled = true;
    });
    const dropRequired = (root) => $$("[data-required]", root).forEach((q) => {
      q.dataset.requiredOff = q.dataset.required;
      q.removeAttribute("data-required");
    });

    // ---- Sections: on / off, required / optional, locked per role (UAT-14) ----
    for (const s of sections) {
      const key = sectionKey(s);
      const cfg = pageCfg.sections[key];
      if (!cfg) continue;
      if (!cfg.enabled) {
        s.hidden = true;
        disableInside(s);
        dropRequired(s);
        continue;
      }
      if (cfg.required) s.removeAttribute("data-optional");
      else {
        s.setAttribute("data-optional", "");
        dropRequired(s);
      }
      if (cfg.locked?.includes(role)) {
        s.dataset.locked = "";
        disableInside(s);
        dropRequired(s);
        const summary = s.querySelector(".form-section__summary");
        if (summary && !summary.querySelector(".lock-badge")) summary.querySelector("[data-status]")?.before(el("span", "badge badge-muted lock-badge", "Locked for your role"));
      }
    }

    // ---- Built-in questions: switched off or moved away (UAT-15) ----
    for (const q of Layout.catalogue(page)) {
      const pl = Layout.placement(config, q.key);
      const away = !pl.enabled || pl.page !== page;
      const moveSection = !away && pl.section && pl.section !== q.section && byKey[pl.section];
      if (!away && !moveSection) continue;
      for (const name of Layout.namesFor(q.key)) {
        const inputs = $$(`[name="${CSS.escape(name)}"]`, form);
        const wraps = [...new Set(inputs.map((i) => i.closest(".q")).filter(Boolean))];
        for (const w of wraps) {
          if (away) {
            w.hidden = true;
            w.dataset.layoutHidden = "";
            $$("input, select, textarea", w).forEach((f) => (f.disabled = true));
            if (w.dataset.required) {
              w.dataset.requiredOff = w.dataset.required;
              w.removeAttribute("data-required");
            }
          } else {
            movedBlock(byKey[pl.section], "Moved here in clinic setup").append(w);
          }
        }
      }
    }

    // ---- Questions that come in from the other page ----
    const other = page === "screening" ? "review" : "screening";
    for (const q of Layout.catalogue(other)) {
      const pl = Layout.placement(config, q.key);
      if (!pl.enabled || pl.page !== page || !q.movable) continue;
      const target = byKey[pl.section] && !Layout.FIXED.has(pl.section) ? byKey[pl.section] : firstEditable();
      if (!target) continue;
      const block = movedBlock(target, other === "screening" ? "From the nurse form" : "From the practitioner review");
      for (const name of Layout.namesFor(q.key)) {
        const label = q.key.includes(".*.") ? `${q.label} (${name.includes(".left.") ? "left" : "right"} foot)` : q.label;
        block.insertAdjacentHTML("beforeend", questionHtml({ ...q.field, required: q.field.required }, name, label));
        foreign.push({ name, store: other === "screening" ? "answers" : "review" });
      }
    }

    // ---- Questions added in the clinic builder (F-13) ----
    for (const q of config.custom.filter((c) => c.page === page && c.enabled !== false)) {
      const target = byKey[q.section] && !Layout.FIXED.has(q.section) ? byKey[q.section] : firstEditable();
      if (!target) continue;
      const block = movedBlock(target, "Clinic questions");
      const names = q.perFoot && q.type !== "footmap" ? ["left", "right"].map((s) => `${q.key}.${s}`) : [q.key];
      for (const name of names) {
        const label = names.length > 1 ? `${q.label} (${name.endsWith(".left") ? "left" : "right"} foot)` : q.label;
        block.insertAdjacentHTML("beforeend", questionHtml(q, name, label));
        foreign.push({ name, store: "custom" });
        const wrap = block.lastElementChild;
        if (q.type === "footmap") wireFootmap(wrap, readOnly);
      }
    }

    function firstEditable() {
      return sections.find((s) => !s.hidden && !Layout.FIXED.has(sectionKey(s)) && s.dataset.locked === undefined) ?? null;
    }

    function movedBlock(section, title) {
      let block = [...section.querySelectorAll(".layout-block")].find((b) => b.dataset.title === title);
      if (block) return block;
      const wrap = el("section", "subsection layout-block-wrap");
      wrap.append(el("h3", "subsection__title", title));
      block = el("div", "layout-block");
      block.dataset.title = title;
      wrap.append(block);
      section.querySelector(".form-section__body")?.append(wrap);
      if (section.dataset.locked !== undefined || readOnly) disableInside(wrap);
      return block;
    }

    // ---- Tabs (UAT-13) ----
    const visible = sections.filter((s) => !s.hidden);
    const tabs = pageCfg.tabs
      .map((t) => ({ ...t, els: t.sections.map((k) => byKey[k]).filter((s) => s && !s.hidden) }))
      .filter((t) => t.els.length);
    const orphan = visible.filter((s) => !tabs.some((t) => t.els.includes(s)));
    if (orphan.length && tabs.length) tabs[tabs.length - 1].els.push(...orphan);

    const bar = el("div", "page-tabs");
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Sections");
    const storeKey = `ndfip.tab.${page}.${record?.id}`;
    let active = 0;
    try {
      const saved = sessionStorage.getItem(storeKey);
      const i = tabs.findIndex((t) => t.id === saved);
      if (i >= 0) active = i;
    } catch {}

    const buttons = tabs.map((t, i) => {
      const b = el("button", "page-tab");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.id = `tab-${t.id}`;
      b.append(el("span", "page-tab__title", t.title), el("span", "page-tab__status"));
      b.addEventListener("click", () => select(i, true));
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        select(next, true);
        buttons[next].focus();
      });
      bar.append(b);
      return b;
    });
    if (tabs.length > 1) form.before(bar);

    function select(i, focusTop = false) {
      active = i;
      tabs.forEach((t, j) => {
        t.els.forEach((s) => s.classList.toggle("is-tab-hidden", tabs.length > 1 && j !== i));
        buttons[j].setAttribute("aria-selected", String(j === i));
        buttons[j].tabIndex = j === i ? 0 : -1;
      });
      try {
        sessionStorage.setItem(storeKey, tabs[i].id);
      } catch {}
      if (focusTop && tabs.length > 1) {
        tabs[i].els[0].open = true;
        bar.scrollIntoView({ block: "nearest" });
      }
    }

    const answered = (q) => (isAnswered ? isAnswered(q) : true);
    const requiredIn = (s) => $$("[data-required]", s).filter((q) => !q.closest("[hidden]"));

    function refresh() {
      tabs.forEach((t, i) => {
        const pending = t.els.reduce((n, s) => n + requiredIn(s).filter((q) => !answered(q)).length + extraPending(s), 0);
        const st = buttons[i].querySelector(".page-tab__status");
        st.textContent = pending ? `${pending} pending` : "Complete";
        st.className = `page-tab__status ${pending ? "is-pending" : "is-done"}`;
        buttons[i].setAttribute("aria-label", `${t.title}, ${pending ? `${pending} pending` : "complete"}`);
      });
    }

    function reveal(node) {
      const i = tabs.findIndex((t) => t.els.some((s) => s.contains(node)));
      if (i >= 0 && i !== active) select(i);
      const s = node.closest?.(".form-section");
      if (s) s.open = true;
    }

    function firstPending() {
      for (const t of tabs) for (const s of t.els) for (const q of requiredIn(s)) if (!answered(q)) return q;
      return null;
    }

    select(active);
    refresh();
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    form.addEventListener("change", (e) => {
      if (foreign.some((f) => f.name === e.target.name)) onChange();
    });
    if (readOnly) foreign.forEach((f) => $$(`[name="${CSS.escape(f.name)}"]`, form).forEach((i) => (i.disabled = true)));

    // ---- Values of moved / added questions ----
    function valueOf(name) {
      const inputs = $$(`[name="${CSS.escape(name)}"]`, form);
      if (!inputs.length) return undefined;
      const t = inputs[0].type;
      if (t === "checkbox") return inputs.filter((i) => i.checked).map((i) => i.value);
      if (t === "radio") return inputs.find((i) => i.checked)?.value ?? null;
      if (t === "file") return inputs[0].files?.[0]?.name ?? inputs[0].dataset.saved ?? null;
      return inputs[0].value === "" ? null : inputs[0].value;
    }

    function collect() {
      const out = { answers: {}, review: {}, custom: {} };
      for (const f of foreign) out[f.store][f.name] = valueOf(f.name);
      return out;
    }

    function fill(rec) {
      for (const f of foreign) {
        const src = f.store === "answers" ? rec.answers : f.store === "review" ? rec.review?.answers : rec.custom;
        const v = src?.[f.name];
        if (v === undefined || v === null) continue;
        const inputs = $$(`[name="${CSS.escape(f.name)}"]`, form);
        for (const i of inputs) {
          if (i.type === "checkbox") i.checked = [].concat(v).includes(i.value);
          else if (i.type === "radio") i.checked = i.value === v;
          else if (i.type === "file") i.dataset.saved = v;
          else i.value = v;
        }
        inputs[0]?.closest(".custom-footmap")?._sync?.();
      }
      refresh();
    }

    return { tabs, collect, fill, reveal, refresh, firstPending, foreignNames: foreign.map((f) => f.name), select };
  }

  return { apply, questionHtml };
})();
