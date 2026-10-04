// Practitioner review (Part 2): findings with corrections, system suggestions with
// confirm / override, wound evaluation, labs, plan, generated note and sign-off.
// Needs auth.js, patients.js, screening-schema.js, screening-store.js, clinical-rules.js.

(() => {
  const R = ClinicalRules;
  const form = document.getElementById("review-form");

  // ---------- Load ----------

  const id = new URLSearchParams(location.search).get("id");
  const record = id && ScreeningStore.getById(id);
  if (!record) {
    window.location.replace("./diabetic-foot.html");
    return;
  }
  const patient = Patients.byFileNumber(record.fileNumber) || { name: record.patientName, riskHistory: {}, allergies: [] };
  const user = Auth.findUser(Auth.getSessionId()) || { name: Auth.getSessionId() || "Unknown", roleLabel: "" };

  record.review ||= { answers: {}, decisions: {}, corrections: [], noteEdited: false, instructionsEdited: false };
  const review = record.review;
  if (record.status === "awaiting-review") {
    // Opening the case ends the nurse's ability to edit Part 1
    record.status = "in-review";
    review.openedBy = user.name;
    review.openedAt = new Date().toISOString();
    ScreeningStore.save(record);
  }
  let locked = record.status === "reviewed";

  // ---------- Helpers ----------

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const plural = (n, word, many = word + "s") => `${n} ${n === 1 ? word : many}`;
  const fmtDateTime = (iso) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const fmtDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const isHidden = (node) => !!node.closest("[hidden]");

  const SCHEMA = Object.fromEntries(ScreeningSchema.fields.map((f) => [f.name, f]));
  const optionLabel = (field, value) => field?.options?.find(([v]) => v === value)?.[1] ?? value;

  // Nurse value with practitioner corrections applied (latest wins)
  function nv(name) {
    const corrections = review.corrections.filter((c) => c.field === name);
    return corrections.length ? corrections[corrections.length - 1].to : record.answers[name];
  }

  function formatValue(name, value) {
    const field = SCHEMA[name];
    if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "—";
    if (Array.isArray(value)) return value.map((v) => optionLabel(field, v)).join(", ");
    if (field?.type === "number" || field?.type === "range") return `${value}${field.unit ? " " + field.unit : ""}`;
    return optionLabel(field, value);
  }

  // Practitioner answers (form fields named r.*)
  const inputs = (name) => $$(`[name="${CSS.escape(name)}"]`, form);
  const rv = (name) => {
    const fields = inputs(name);
    if (!fields.length) return undefined;
    if (fields[0].type === "checkbox") return fields.filter((f) => f.checked).map((f) => f.value);
    if (fields[0].type === "radio") return fields.find((f) => f.checked)?.value;
    return fields[0].value;
  };
  const rnum = (name) => {
    const v = rv(name);
    return v === undefined || v === "" ? null : Number(v);
  };

  function setField(name, value) {
    const fields = inputs(name);
    if (!fields.length) return;
    if (fields[0].type === "checkbox") fields.forEach((f) => (f.checked = [].concat(value ?? []).includes(f.value)));
    else if (fields[0].type === "radio") fields.forEach((f) => (f.checked = f.value === value));
    else fields[0].value = value ?? "";
  }

  function setAndNotify(name, value) {
    setField(name, value);
    inputs(name)[0]?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const ZONE_OPTIONS = SCHEMA["j.1.zone"]?.options ?? [];
  function ulcerLocation(n) {
    const foot = nv(`j.${n}.foot`);
    const zone = nv(`j.${n}.zone`);
    const aspect = nv(`j.${n}.aspect`);
    if (!foot || !zone) return "location not recorded";
    const zoneLabel = (ZONE_OPTIONS.find(([v]) => v === zone)?.[1] ?? zone).toLowerCase();
    return `${aspect ? cap(aspect) + " aspect of " : ""}${foot} ${zoneLabel}`.replace(/^./, (c) => c.toUpperCase());
  }

  const ulcerCount = () => {
    const c = nv("j.count");
    return c === "3+" ? 3 : Number(c || 0);
  };

  // ---------- Patient header ----------

  function renderPatient() {
    const set = (k, v) => ($(`[data-field="${k}"]`).textContent = v);
    const initials = patient.name.split(/\s+/).filter((_, i, a) => i === 0 || i === a.length - 1).map((p) => p[0]).join("");
    set("initials", initials);
    set("name", patient.name);
    set("fileNumber", record.fileNumber);
    set("nationalId", patient.nationalId ?? "—");
    set("age", patient.dob ? plural(Patients.ageOn(patient.dob), "year") : "—");
    set("sex", patient.sex ?? "—");
    set("diabetes", patient.diabetesType ? `${patient.diabetesType} · ${plural(patient.diabetesDurationYears, "year")}` : "—");
    set("hba1c", patient.lastHbA1c ? `${patient.lastHbA1c.value}% · ${fmtDate(patient.lastHbA1c.date)}` : "Not recorded");
    set("careLevel", Patients.CARE_LEVEL[patient.careLevel] ?? "—");
    set("allergies", patient.allergies?.length ? `Allergies: ${patient.allergies.join(", ")}` : "No known allergies");
    set("screenedBy", `Screened by ${record.submittedBy} · ${fmtDateTime(record.submittedAt)}`);
  }

  // ---------- 1. Findings with corrections ----------

  const PENCIL =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" /></svg>';
  let editing = null; // field name being corrected

  function findingRows() {
    // Group fields by section → subsection → row key (left/right share a row; ulcers group by number)
    const sections = [];
    for (const field of ScreeningSchema.fields) {
      if (field.type === "file" && !record.answers[field.name]) continue;
      const parts = field.name.split(".");
      const side = parts[1] === "left" || parts[1] === "right" ? parts[1] : null;
      const ulcer = /^\d$/.test(parts[1]) ? Number(parts[1]) : null;
      const key = side ? `${parts[0]}.*.${parts.slice(2).join(".")}` : field.name;
      let section = sections.find((s) => s.letter === field.section);
      if (!section) sections.push((section = { letter: field.section, subs: [] }));
      const subTitle = ulcer ? `${field.sub} · Ulcer ${ulcer}` : field.sub;
      let sub = section.subs.find((s) => s.title === subTitle);
      if (!sub) section.subs.push((sub = { title: subTitle, rows: [] }));
      let row = sub.rows.find((r) => r.key === key);
      if (!row) sub.rows.push((row = { key, label: field.label, cells: [] }));
      row.cells.push({ name: field.name, side });
    }
    return sections;
  }

  function renderFindings() {
    const host = $("[data-findings]");
    host.replaceChildren();
    for (const section of findingRows()) {
      const block = el("section", "findings__section");
      block.append(el("h3", "findings__title", `${section.letter} · ${ScreeningSchema.sections[section.letter]}`));
      let any = false;
      for (const sub of section.subs) {
        const rows = sub.rows.filter((r) => r.cells.some((c) => hasValue(c.name)));
        if (!rows.length) continue;
        any = true;
        block.append(el("p", "findings__sub", sub.title));
        for (const row of rows) block.append(renderRow(row));
      }
      if (!any) block.append(el("p", "field-hint", "Nothing recorded."));
      host.append(block);
    }
  }

  const hasValue = (name) => {
    const v = nv(name);
    return !(v === undefined || v === "" || (Array.isArray(v) && !v.length)) || review.corrections.some((c) => c.field === name);
  };

  function renderRow(row) {
    const node = el("div", "finding-row");
    node.append(el("div", "finding-row__label", row.label));
    const cells = el("div", "finding-row__cells");
    for (const cell of row.cells) cells.append(renderCell(cell));
    node.append(cells);
    return node;
  }

  function renderCell({ name, side }) {
    const cell = el("div", "finding-cell");
    if (side) cell.append(el("span", "finding-cell__side", side === "left" ? "L" : "R"));
    if (editing === name) {
      cell.append(correctionEditor(name));
      return cell;
    }
    const body = el("div", "finding-cell__body");
    const corrections = review.corrections.filter((c) => c.field === name);
    const value = el("span", "finding-cell__value", formatValue(name, nv(name)));
    body.append(value);
    if (corrections.length) {
      const first = corrections[0];
      const last = corrections[corrections.length - 1];
      cell.classList.add("finding-cell--corrected");
      body.append(el("s", "finding-cell__original", formatValue(name, first.from)));
      body.append(el("span", "finding-cell__trail", `Corrected by ${last.by} · ${fmtDateTime(last.at)}${last.reason ? ` · ${last.reason}` : ""}`));
    }
    cell.append(body);
    if (!locked && SCHEMA[name]?.type !== "file") {
      const button = el("button", "btn btn-ghost btn-xs finding-cell__edit");
      button.type = "button";
      button.innerHTML = PENCIL + "Correct";
      button.setAttribute("aria-label", `Correct ${SCHEMA[name].label}${side ? `, ${side} foot` : ""}`);
      button.addEventListener("click", () => {
        editing = name;
        renderFindings();
        $(`[data-correct="${CSS.escape(name)}"] select, [data-correct="${CSS.escape(name)}"] input`)?.focus();
      });
      cell.append(button);
    }
    return cell;
  }

  function correctionEditor(name) {
    const field = SCHEMA[name];
    const current = nv(name);
    const box = el("div", "correct-editor");
    box.dataset.correct = name;
    let control;
    if (field.type === "checkbox") {
      control = el("div", "chips");
      for (const [value, label] of field.options) {
        const chip = el("label", "chip");
        const input = el("input");
        input.type = "checkbox";
        input.value = value;
        input.checked = [].concat(current ?? []).includes(value);
        chip.append(input, el("span", "", label));
        control.append(chip);
      }
    } else if (field.options) {
      control = el("select", "input select");
      control.append(new Option("Not recorded", ""));
      for (const [value, label] of field.options) control.append(new Option(label, value, false, value === current));
    } else {
      control = el("input", "input");
      if (field.type === "number" || field.type === "range") {
        control.type = "number";
        control.step = field.step ?? "any";
        if (field.min !== null && field.min !== undefined) control.min = field.min;
        if (field.max !== null && field.max !== undefined) control.max = field.max;
      }
      control.value = current ?? "";
    }
    control.setAttribute("aria-label", `New value for ${field.label}`);
    const reason = el("input", "input");
    reason.placeholder = "Reason (optional)";
    reason.setAttribute("aria-label", "Reason for correction");
    const actions = el("div", "correct-editor__actions");
    const save = el("button", "btn btn-primary btn-sm", "Save correction");
    save.type = "button";
    const cancel = el("button", "btn btn-outline btn-sm", "Cancel");
    cancel.type = "button";
    actions.append(save, cancel);
    box.append(control, reason, actions);

    cancel.addEventListener("click", () => {
      editing = null;
      renderFindings();
    });
    save.addEventListener("click", () => {
      let to;
      if (field.type === "checkbox") to = $$("input:checked", control).map((i) => i.value);
      else to = control.value;
      if (control.matches?.("input[type=number]") && to !== "" && !control.checkValidity()) {
        control.setAttribute("aria-invalid", "true");
        control.focus();
        return;
      }
      if (JSON.stringify(to) !== JSON.stringify(current ?? (field.type === "checkbox" ? [] : ""))) {
        review.corrections.push({ field: name, from: current ?? null, to, by: user.name, at: new Date().toISOString(), reason: reason.value.trim() });
        persist();
      }
      editing = null;
      update({ findings: true });
    });
    return box;
  }

  // ---------- Decisions (confirm / override) ----------

  function decision(recId, sysValue) {
    const d = review.decisions[recId];
    if (!d) return { decided: false };
    const stale = d.action === "confirm" && JSON.stringify(d.sysValue) !== JSON.stringify(sysValue);
    return { decided: !stale, stale, value: d.value, d };
  }

  // Decided value, or null while the practitioner hasn't decided
  const decidedValue = (rec) => {
    const dec = decision(rec.id, rec.sys.value);
    return dec.decided ? dec.value : null;
  };

  const YES_NO = [["yes", "Yes"], ["no", "No"]];
  const fmtYesNo = (v) => (v === "yes" ? "Yes" : v === "no" ? "No" : "Undetermined");

  // ---------- Build everything the rules need ----------

  function woundInput(n) {
    const p = `r.w.${n}`;
    return {
      n,
      signs: rv(`${p}.signs`) ?? [],
      erythemaCm: rnum(`${p}.erythema`),
      ptb: rv(`${p}.ptb`),
      exposed: rv(`${p}.exposed`) ?? [],
      osteomyelitis: rv(`${p}.osteomyelitis`) ?? "no",
      gangrene: rv(`${p}.gangrene`),
      length: rnum(`${p}.length`),
      width: rnum(`${p}.width`),
      onset: rv(`${p}.onset`),
    };
  }

  function compute() {
    const labs = { wbc: rnum("r.lab.wbc") };
    const sirs = R.sirs(nv, labs);
    const recs = [];

    // Neuropathy, PAD, deformity per foot
    for (const side of R.SIDES) {
      const L = R.SIDE_LABEL[side];
      recs.push({ id: `lops.${side}`, group: "foot", title: `LOPS · ${L} foot`, sys: R.lops(nv, side), options: YES_NO, fmt: fmtYesNo });
      recs.push({ id: `pad.${side}`, group: "foot", title: `PAD · ${L} foot`, sys: R.pad(nv, side), options: YES_NO, fmt: fmtYesNo });
      recs.push({ id: `deformity.${side}`, group: "foot", title: `Deformity · ${L} foot`, sys: R.deformity(nv, side), options: YES_NO, fmt: fmtYesNo });
    }
    const footVal = (kind) => {
      const vals = R.SIDES.map((s) => decidedValue(recs.find((r) => r.id === `${kind}.${s}`)));
      if (vals.includes("yes")) return true;
      return vals.every((v) => v === "no") ? false : null;
    };
    const lops = footVal("lops");
    const pad = footVal("pad");
    const deformity = footVal("deformity");
    const hist = R.history(nv, patient);

    const riskSys = R.iwgdfRisk({ lops, pad, deformity: !!deformity, history: hist });
    const riskRec = {
      id: "risk", group: "risk", title: "IWGDF risk category", sys: riskSys,
      options: [0, 1, 2, 3].map((r) => [r, Patients.RISK[r].label]),
      fmt: (v) => (v === null || v === undefined ? "Waiting for decisions" : Patients.RISK[v].label),
    };
    recs.push(riskRec);
    const risk = decidedValue(riskRec);
    const intervalSys = risk === null
      ? { value: null, reasons: ["Decide the risk category first"], source: "MoC Table 1" }
      : { value: R.RISK_INTERVAL[risk], reasons: [`IWGDF ${risk}`], source: "MoC Table 1" };
    recs.push({ id: "interval", group: "risk", title: "Screening interval", sys: intervalSys, options: Object.values(R.RISK_INTERVAL).map((v) => [v, v]), fmt: (v) => v ?? "—" });

    // Wounds
    const ulcers = [];
    for (let n = 1; n <= ulcerCount(); n++) {
      const w = woundInput(n);
      const side = nv(`j.${n}.foot`);
      const lopsSide = side ? decidedValue(recs.find((r) => r.id === `lops.${side}`)) : null;
      const ctx = {
        sirsCount: sirs.count,
        zone: nv(`j.${n}.zone`),
        lops: lopsSide === null ? null : lopsSide === "yes",
        pulsesPalpable: side ? [nv(`d.${side}.dp`), nv(`d.${side}.pt`)].includes("present") : false,
        ischaemiaGrade: side ? R.ischaemiaGrade(nv, side) : null,
      };
      const infSys = R.infectionGrade(w, ctx);
      const infRec = {
        id: `wound.${n}.infection`, group: `wound-${n}`, title: "IWGDF/IDSA infection grade", sys: infSys,
        options: [[1, "1 · Uninfected"], [2, "2 · Mild"], [3, "3 · Moderate"], [4, "4 · Severe"]],
        fmt: (v) => (v ? { 1: "1 · Uninfected", 2: "2 · Mild", 3: "3 · Moderate", 4: "4 · Severe" }[v] + (v >= 3 && w.osteomyelitis === "confirmed" ? " (O)" : "") : "—"),
      };
      const wagSys = R.wagner(w);
      const wagRec = { id: `wound.${n}.wagner`, group: `wound-${n}`, title: "Wagner grade", sys: wagSys, options: [1, 2, 3, 4, 5].map((g) => [g, `Grade ${g}`]), fmt: (v) => (v ? `Grade ${v}` : "—") };
      const infDecided = decidedValue(infRec);
      const sinSys = R.sinbad(w, ctx, { value: infDecided ?? infSys.value });
      const sinRec = { id: `wound.${n}.sinbad`, group: `wound-${n}`, title: "SINBAD score", sys: sinSys, options: [0, 1, 2, 3, 4, 5, 6].map((s) => [s, `${s} / 6`]), fmt: (v) => (v === null || v === undefined ? "—" : `${v} / 6`) };
      const wifiSys = R.wifi(w, ctx, { value: infDecided ?? infSys.value });
      const wifiRec = { id: `wound.${n}.wifi`, group: `wound-${n}`, title: "WIfI components", sys: wifiSys, options: "text", fmt: (v) => v ?? "—" };
      recs.push(infRec, wagRec, sinRec, wifiRec);
      ulcers.push({
        n, side, ptb: w.ptb, osteomyelitis: w.osteomyelitis, erythemaCm: w.erythemaCm, onset: w.onset,
        signCount: w.signs.filter((s) => s !== "none").length,
        infection: infDecided ?? infSys.value, wagner: decidedValue(wagRec) ?? wagSys.value,
      });
    }

    // Escalations (system flags the practitioner validates)
    const charcotSides = R.SIDES.filter((s) => [].concat(nv(`h.${s}.flags`) ?? []).some((f) => f !== "none"));
    const severe = Object.fromEntries(R.SIDES.map((s) => [s, R.severeIschaemia(nv, s)]));
    const severeAny = R.SIDES.some((s) => severe[s].length);
    const padDecided = R.SIDES.some((s) => decidedValue(recs.find((r) => r.id === `pad.${s}`)) === "yes");
    const stability = R.footStability({ ulcers, sirsCount: sirs.count, ischaemia: padDecided });
    const esc = [];
    if (charcotSides.length) esc.push({ id: "esc.charcot", title: "Suspected Charcot foot", reasons: charcotSides.map((s) => `${R.SIDE_LABEL[s]}: ${formatValue(`h.${s}.flags`, nv(`h.${s}.flags`))}`), source: "Form H" });
    if (sirs.count >= 2) esc.push({ id: "esc.sirs", title: "Possible systemic infection", reasons: sirs.items, source: sirs.source });
    if (severeAny) esc.push({ id: "esc.ischaemia", title: "Severe ischaemia: urgent vascular referral", reasons: R.SIDES.flatMap((s) => severe[s].map((t) => `${R.SIDE_LABEL[s]}: ${t}`)), source: "MoC PAD pathway" });
    if (stability.value === "unstable") esc.push({ id: "esc.unstable", title: "Unstable diabetic foot: consider admission", reasons: stability.reasons, source: stability.source });
    for (const e of esc) {
      recs.push({ id: e.id, group: "escalation", title: e.title, sys: { value: "yes", reasons: e.reasons, source: e.source }, options: [["yes", "Escalate"], ["no", "Not applicable"]], fmt: (v) => (v === "yes" ? "Escalate" : "Not applicable") });
    }
    const escalated = (eid) => {
      const rec = recs.find((r) => r.id === eid);
      return rec ? decidedValue(rec) !== "no" : false;
    };

    const referral = R.referral({
      stability: escalated("esc.unstable") ? stability.value : ulcers.length ? "stable" : null,
      sirsCount: escalated("esc.sirs") ? sirs.count : 0,
      charcot: escalated("esc.charcot"),
      severeIschaemia: escalated("esc.ischaemia"),
      ulcers,
      risk,
    });
    const followUp = R.followUp({ risk, ulcers: ulcers.length > 0, infected: ulcers.some((u) => u.infection >= 2) });
    const tests = R.suggestedTests({ ulcers, sirsCount: sirs.count });

    return { recs, sirs, lops, pad, deformity, risk, ulcers, stability, severe, charcotSides, referral, followUp, tests, hist };
  }

  // ---------- Recommendation cards ----------

  function renderRecs(model) {
    $$("[data-recs]").forEach((host) => host.replaceChildren());
    for (const rec of model.recs) {
      const host = $(`[data-recs="${rec.group}"]`);
      if (host) host.append(recCard(rec));
    }
    const escHost = $('[data-recs="escalation"]');
    if (!escHost.children.length) escHost.append(el("p", "field-hint", "No escalation flags."));
  }

  let overriding = null;

  function recCard(rec) {
    const dec = decision(rec.id, rec.sys.value);
    const card = el("div", "rec-card");
    card.dataset.rec = rec.id;
    card.dataset.state = dec.decided ? (dec.d.action === "confirm" ? "confirmed" : "overridden") : dec.stale ? "stale" : "pending";

    const head = el("div", "rec-card__head");
    head.append(el("span", "rec-card__title", rec.title));
    head.append(el("span", "badge rec-card__system", `System: ${rec.fmt(rec.sys.value)}`));
    card.append(head);

    const reasons = el("ul", "rec-card__reasons");
    for (const r of rec.sys.reasons ?? []) reasons.append(el("li", "", r));
    card.append(reasons);
    if (rec.sys.source) card.append(el("p", "rec-card__source", rec.sys.source));

    const status = el("div", "rec-card__status");
    if (dec.decided) {
      const d = dec.d;
      status.append(
        el("span", "rec-card__decision", d.action === "confirm" ? `Confirmed: ${rec.fmt(d.value)}` : `Overridden: ${rec.fmt(d.value)}`),
        el("span", "rec-card__who", `${d.by} · ${fmtDateTime(d.at)}${d.reason ? ` · ${d.reason}` : ""}`),
      );
    } else if (dec.stale) {
      status.append(el("span", "rec-card__decision rec-card__decision--stale", "System value changed since you confirmed. Review again."));
    }
    if (status.children.length) card.append(status);

    if (locked) return card;

    if (overriding === rec.id) {
      card.append(overrideEditor(rec));
      return card;
    }
    const actions = el("div", "rec-card__actions");
    if (!dec.decided && rec.sys.value !== null && rec.sys.value !== undefined) {
      const confirm = el("button", "btn btn-primary btn-sm", "Confirm");
      confirm.type = "button";
      confirm.addEventListener("click", () => decide(rec, "confirm", rec.sys.value, ""));
      actions.append(confirm);
    }
    const override = el("button", "btn btn-outline btn-sm", dec.decided ? "Change" : rec.sys.value === null || rec.sys.value === undefined ? "Set value" : "Override");
    override.type = "button";
    override.addEventListener("click", () => {
      overriding = rec.id;
      update();
      $(`[data-rec="${CSS.escape(rec.id)}"] .override-editor select, [data-rec="${CSS.escape(rec.id)}"] .override-editor input`)?.focus();
    });
    actions.append(override);
    card.append(actions);
    return card;
  }

  function overrideEditor(rec) {
    const box = el("div", "override-editor");
    let control;
    if (rec.options === "text") {
      control = el("input", "input");
      control.value = rec.sys.value ?? "";
    } else {
      control = el("select", "input select");
      for (const [value, label] of rec.options) control.append(new Option(label, String(value), false, String(value) === String(decision(rec.id, rec.sys.value).value ?? rec.sys.value)));
    }
    control.setAttribute("aria-label", `Value for ${rec.title}`);
    const reason = el("input", "input");
    reason.placeholder = rec.sys.value === null || rec.sys.value === undefined ? "Reason (optional)" : "Reason for override (required)";
    reason.setAttribute("aria-label", "Reason");
    const error = el("p", "field-error");
    error.hidden = true;
    const actions = el("div", "rec-card__actions");
    const save = el("button", "btn btn-primary btn-sm", "Save");
    save.type = "button";
    const cancel = el("button", "btn btn-outline btn-sm", "Cancel");
    cancel.type = "button";
    actions.append(save, cancel);
    box.append(control, reason, error, actions);

    cancel.addEventListener("click", () => {
      overriding = null;
      update();
    });
    save.addEventListener("click", () => {
      const raw = control.value;
      const value = rec.options === "text" ? raw.trim() : rec.options.find(([v]) => String(v) === raw)[0];
      const differs = JSON.stringify(value) !== JSON.stringify(rec.sys.value);
      if (differs && rec.sys.value !== null && rec.sys.value !== undefined && !reason.value.trim()) {
        error.textContent = "Give a reason for overriding the system value.";
        error.hidden = false;
        reason.focus();
        return;
      }
      overriding = null;
      decide(rec, differs ? "override" : "confirm", value, reason.value.trim());
    });
    return box;
  }

  function decide(rec, action, value, reason) {
    review.decisions[rec.id] = { action, value, sysValue: rec.sys.value, reason, by: user.name, at: new Date().toISOString() };
    persist();
    update();
  }

  // ---------- Alerts ----------

  function renderAlerts(model) {
    const alerts = [];
    const decidedEsc = (eid) => model.recs.find((r) => r.id === eid);
    const escState = (eid) => {
      const rec = decidedEsc(eid);
      if (!rec) return null;
      const dec = decision(rec.id, rec.sys.value);
      return dec.decided && dec.value === "no" ? "dismissed" : "active";
    };
    if (escState("esc.unstable") === "active") alerts.push(["urgent", `Unstable diabetic foot: ${model.stability.reasons.join("; ")}. Consider hospital admission (MOH criteria).`]);
    if (escState("esc.sirs") === "active") alerts.push(["urgent", `${model.sirs.count} SIRS signs (${model.sirs.items.join(", ")}): possible systemic infection.`]);
    if (escState("esc.charcot") === "active") alerts.push(["urgent", `Suspected Charcot foot (${model.charcotSides.join(", ")}): same-day referral to Center of Excellence.`]);
    if (escState("esc.ischaemia") === "active") alerts.push(["urgent", "Severe ischaemia: urgent vascular referral."]);
    for (const u of model.ulcers) {
      if (u.osteomyelitis === "confirmed" || u.osteomyelitis === "suspected") alerts.push(["attention", `Ulcer ${u.n}: osteomyelitis ${u.osteomyelitis}.`]);
    }
    if (model.ulcers.length) alerts.push(["attention", `${plural(model.ulcers.length, "ulcer")}: hands-on evaluation required.`]);
    for (const [key, ref] of Object.entries(R.LABS)) {
      const v = rnum(`r.lab.${key}`);
      const flag = R.labFlag(key, v);
      if (flag) alerts.push(["info", `${ref.label} ${v} ${ref.unit}: ${flag.toLowerCase()}.`]);
    }
    if (nv("a.confirmed") === "needs-update") alerts.push(["info", "Nurse flagged patient record details for update."]);

    const list = $("#review-alerts");
    list.replaceChildren(
      ...alerts.map(([level, text]) => {
        const li = el("li", `flag flag--${level}`, text);
        return li;
      }),
    );
    $("#review-alerts-empty").hidden = alerts.length > 0;
  }

  // ---------- Data-driven blocks ----------

  function renderWounds() {
    const count = ulcerCount();
    $("[data-no-wounds]").hidden = count > 0;
    $$("[data-wound]").forEach((card) => {
      const n = Number(card.dataset.wound);
      card.hidden = n > count;
      $("[data-wound-location]", card).textContent = ulcerLocation(n);
    });
  }

  function renderSuggestedTests(model) {
    const host = $("[data-suggested]");
    $("[data-suggested-empty]").hidden = model.tests.length > 0;
    const ordered = new Set(rv("r.orders.labs") ?? []);
    host.replaceChildren();
    for (const test of model.tests) {
      const row = el("div", "suggest-item");
      const text = el("div", "suggest-item__text");
      text.append(el("span", "suggest-item__name", test.label), el("span", "suggest-item__why", test.why));
      row.append(text);
      if (ordered.has(test.value)) {
        row.append(el("span", "badge badge-status-complete", "Ordered"));
      } else if (!locked) {
        const add = el("button", "btn btn-outline btn-sm", "Add to orders");
        add.type = "button";
        add.addEventListener("click", () => setAndNotify("r.orders.labs", [...ordered, test.value]));
        row.append(add);
      }
      host.append(row);
    }
    if (!locked && model.tests.some((t) => !ordered.has(t.value))) {
      const all = el("button", "btn btn-outline btn-sm", "Add all suggested");
      all.type = "button";
      all.addEventListener("click", () => setAndNotify("r.orders.labs", [...new Set([...ordered, ...model.tests.map((t) => t.value)])]));
      host.append(all);
    }
  }

  function renderLabFlags() {
    $$("[data-lab]").forEach((field) => {
      const key = field.dataset.lab;
      const flag = R.labFlag(key, rnum(`r.lab.${key}`));
      const badge = $("[data-lab-flag]", field);
      badge.hidden = !flag;
      badge.textContent = flag ?? "";
      badge.className = `badge lab-flag ${flag === "Low" ? "badge-risk-1" : "badge-risk-3"}`;
    });
  }

  function renderPad(model) {
    const rows = [
      ["Dorsalis pedis", "d.*.dp"], ["Posterior tibial", "d.*.pt"], ["Doppler waveform", "d.*.doppler"],
      ["Capillary refill", "d.*.crt"], ["ABI", "e.*.abi"], ["TBI", "e.*.tbi"], ["Ankle pressure", "e.*.ankle"],
      ["Toe pressure", "e.*.toe"], ["TcPO₂", "e.*.tcpo2"],
    ];
    const table = el("table", "data-table");
    const thead = el("thead");
    const hr = el("tr");
    ["", "Left", "Right"].forEach((h) => hr.append(el("th", "", h)));
    thead.append(hr);
    const tbody = el("tbody");
    for (const [label, key] of rows) {
      const values = R.SIDES.map((s) => nv(key.replace("*", s)));
      if (values.every((v) => v === undefined || v === "")) continue;
      const tr = el("tr");
      tr.append(el("th", "", label));
      R.SIDES.forEach((s) => tr.append(el("td", "", formatValue(key.replace("*", s), nv(key.replace("*", s))))));
      tbody.append(tr);
    }
    const tr = el("tr", "data-table__total");
    tr.append(el("th", "", "PAD (decided)"));
    R.SIDES.forEach((s) => {
      const rec = model.recs.find((r) => r.id === `pad.${s}`);
      const v = decidedValue(rec);
      tr.append(el("td", "", v ? fmtYesNo(v) : `Pending (system: ${fmtYesNo(rec.sys.value)})`));
    });
    tbody.append(tr);
    table.append(thead, tbody);
    const host = $("[data-pad-summary]");
    host.replaceChildren(table);
    const claud = nv("d.claudication");
    if (claud) host.append(el("p", "field-hint", `Intermittent claudication: ${formatValue("d.claudication", claud)}`));

    const severeText = R.SIDES.flatMap((s) => model.severe[s].map((t) => `${R.SIDE_LABEL[s]}: ${t}`));
    $('[data-alert="severe-ischaemia"]').hidden = !severeText.length;
    $("[data-severe-text]").textContent = severeText.length ? `${severeText.join("; ")}. Urgent vascular referral and arterial imaging (MoC).` : "";
  }

  function renderInfection(model) {
    const host = $("[data-infection-summary]");
    host.replaceChildren();
    const dl = el("dl", "detail-grid detail-grid--plain");
    const add = (k, v) => {
      const d = el("div");
      d.append(el("dt", "", k), el("dd", "", v));
      dl.append(d);
    };
    add("SIRS signs", model.sirs.count ? `${model.sirs.count}: ${model.sirs.items.join(", ")}` : "None");
    for (const u of model.ulcers) {
      add(`Ulcer ${u.n}`, u.infection ? `IWGDF ${{ 1: "1 · Uninfected", 2: "2 · Mild", 3: "3 · Moderate", 4: "4 · Severe" }[u.infection]}` : "Grade pending");
    }
    if (!model.ulcers.length) add("Ulcers", "None recorded");
    host.append(dl);

    const allergies = patient.allergies ?? [];
    $("[data-allergies]").hidden = !allergies.length;
    $("[data-allergy-text]").textContent = allergies.join(", ");

    const worst = Math.max(0, ...model.ulcers.map((u) => u.infection ?? 0));
    $("[data-antibiotic-hint]").textContent =
      worst >= 3 ? "Moderate / severe infection: broad-spectrum parenteral antibiotics, MDT and admission criteria apply (MOH-EC)."
        : worst === 2 ? "Mild infection: oral empiric antibiotics can be considered; take a culture and reassess in 24–48 h (MOH-EC)."
          : model.ulcers.length ? "Uninfected ulcer: do not prescribe antibiotics (DF102)."
            : "No ulcer recorded.";
  }

  function renderAdjuncts(model) {
    const longStanding = model.ulcers.some((u) => u.onset === "1-3m" || u.onset === "gt3m");
    $("[data-adjunct-hint]").textContent = model.ulcers.length
      ? longStanding
        ? "Ulcer present for over a month: consider adjuncts only if there is no progress after 4–6 weeks of optimal standard care (DF102)."
        : "Ulcer under a month old: optimise standard care first. Adjuncts are for no progress after 4–6 weeks (DF102)."
      : "No ulcer recorded. Adjunctive therapies are for non-healing ulcers.";
    const chosen = rv("r.adj") ?? [];
    const warnings = [];
    if (chosen.includes("npwt")) warnings.push("NPWT: for post-surgical or deep, exudative wounds. Not for untreated infection, necrotic wounds or exposed vessels.");
    if (chosen.includes("hbot")) warnings.push("HBOT: for ischaemic or neuro-ischaemic non-healing ulcers, after vascular optimisation.");
    if (chosen.some((c) => c !== "none") && model.ulcers.length && !longStanding) warnings.push("Ulcer is under a month old.");
    const box = $("[data-adjunct-warning]");
    box.hidden = !warnings.length;
    $("[data-adjunct-warning-text]").replaceChildren(...warnings.map((w) => el("p", "", w)));
  }

  function renderInterpretation(model) {
    const dl = $("[data-interp-summary]");
    dl.replaceChildren();
    const add = (k, v) => {
      const d = el("div");
      d.append(el("dt", "", k), el("dd", "", v));
      dl.append(d);
    };
    for (const kind of ["lops", "pad", "deformity"]) {
      const label = { lops: "LOPS", pad: "PAD", deformity: "Deformity" }[kind];
      add(label, R.SIDES.map((s) => `${R.SIDE_LABEL[s]}: ${fmtYesNo(decidedValue(model.recs.find((r) => r.id === `${kind}.${s}`)))}`).join(" · "));
    }
    add("Risk category", model.risk === null ? "Pending" : Patients.RISK[model.risk].label);
    const interval = decidedValue(model.recs.find((r) => r.id === "interval"));
    add("Screening interval", interval ?? "Pending");
    add("PAD conclusion", formatPrac("r.pad.conclusion"));
    for (const u of model.ulcers) {
      const recFor = (k) => model.recs.find((r) => r.id === `wound.${u.n}.${k}`);
      add(`Ulcer ${u.n}`, ["wagner", "infection", "sinbad", "wifi"].map((k) => recFor(k).fmt(decidedValue(recFor(k)) ?? recFor(k).sys.value)).join(" · "));
    }
  }

  const PRAC_LABELS = {};
  function formatPrac(name) {
    const value = rv(name);
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "—";
    if (!PRAC_LABELS[name]) {
      PRAC_LABELS[name] = Object.fromEntries(inputs(name).map((i) => [i.value, i.closest("label")?.textContent.trim() ?? i.value]));
    }
    return [].concat(value).map((v) => PRAC_LABELS[name][v] ?? v).join(", ");
  }

  const OPTION_TEXT = {
    destination: { secondary: "Secondary Care", private: "Private Center", vascular: "Vascular", "wound-care": "Wound Care", tertiary: "Tertiary" },
    urgency: { routine: "Routine", soon: "Soon", urgent: "Urgent", emergency: "Emergency" },
    timing: { today: "today", "24h": "within 24 h", week: "within 1 week", scheduled: "scheduled" },
    followup: { "48h": "48 hours", "1w": "1 week", "2w": "2 weeks", "1m": "1 month", "1-3m": "1–3 months", "3-6m": "3–6 months", "6-12m": "6–12 months", "12m": "12 months" },
  };

  function renderReferralSuggestion(model) {
    const text = $("[data-ref-suggestion-text]");
    const apply = $("[data-apply-referral]");
    const s = model.referral;
    if (!s) {
      text.textContent = "Decide the risk category and wound classifications to get a suggestion.";
      apply.hidden = true;
      return;
    }
    text.replaceChildren(
      el("strong", "", s.needed === "yes" ? `Refer: ${OPTION_TEXT.destination[s.destination]} · ${OPTION_TEXT.urgency[s.urgency]} · ${OPTION_TEXT.timing[s.timing]}` : "No referral needed"),
      el("p", "", `${s.reasons.join("; ")} (${s.source})`),
    );
    apply.hidden = locked;
  }

  function renderFollowUp(model) {
    const hint = $("[data-followup-suggestion]");
    hint.replaceChildren();
    if (!model.followUp) {
      hint.textContent = "A follow-up suggestion appears once the risk category is decided.";
      return;
    }
    hint.append(`Suggested: ${OPTION_TEXT.followup[model.followUp.value]} (${model.followUp.reasons.join("; ")}). `);
    if (!locked && rv("r.plan.followup") !== model.followUp.value) {
      const apply = el("button", "btn-link", "Apply");
      apply.type = "button";
      apply.addEventListener("click", () => setAndNotify("r.plan.followup", model.followUp.value));
      hint.append(apply);
    }
  }

  // ---------- Generated text ----------

  function buildNote(model) {
    const lines = [];
    const push = (s = "") => lines.push(s);
    const listOf = (name) => formatValue(name, nv(name));
    push(`DIABETIC FOOT REVIEW: ${patient.name} (${record.fileNumber})`);
    push(`Screened by ${record.submittedBy}, ${fmtDateTime(record.submittedAt)}. Reviewed by ${user.name}.`);
    push();
    push("SUBJECTIVE");
    push(`Reason: ${listOf("a.reason")}.${nv("a.complaint") ? ` Complaint: ${nv("a.complaint")}` : ""}`);
    const symptoms = [].concat(nv("c.symptoms") ?? []).filter((s) => s !== "none");
    push(symptoms.length ? `Neuropathic symptoms: ${listOf("c.symptoms")}, severity ${nv("c.severity") ?? "—"}/10${nv("c.night") === "yes" ? ", worse at night" : ""}.` : "No neuropathic symptoms.");
    if (nv("d.claudication")) push(`Intermittent claudication: ${listOf("d.claudication").toLowerCase()}.`);
    push();
    push("OBJECTIVE");
    push(`Vitals: T ${nv("a.temp") ?? "—"} °C, HR ${nv("a.hr") ?? "—"} bpm, RR ${nv("a.rr") ?? "—"} /min.`);
    const absentSites = [];
    for (const s of R.SIDES) {
      for (const [site, label] of [["hallux", "hallux"], ["mth1", "1st metatarsal head"], ["mth5", "5th metatarsal head"]]) {
        if (nv(`c.${s}.${site}`) === "absent") absentSites.push(`plantar ${label}, ${s}`);
      }
    }
    push(`Sensation (${listOf("c.method").toLowerCase()}): ${absentSites.length ? "absent at " + absentSites.join("; ") : "detected at all tested sites"}. Vibration L ${listOf("c.left.vibration").toLowerCase()}, R ${listOf("c.right.vibration").toLowerCase()}.`);
    push(`Pulses: DP L ${listOf("d.left.dp").toLowerCase()} / R ${listOf("d.right.dp").toLowerCase()}; PT L ${listOf("d.left.pt").toLowerCase()} / R ${listOf("d.right.pt").toLowerCase()}.`);
    const perf = ["abi", "tbi", "toe"].flatMap((k) => R.SIDES.filter((s) => nv(`e.${s}.${k}`)).map((s) => `${k.toUpperCase()} ${s[0].toUpperCase()} ${nv(`e.${s}.${k}`)}`));
    if (perf.length) push(`Perfusion: ${perf.join(", ")}.`);
    const deform = R.SIDES.map((s) => [].concat(nv(`f.${s}.deformity`) ?? []).filter((x) => x !== "none").length ? `${s}: ${listOf(`f.${s}.deformity`).toLowerCase()}` : null).filter(Boolean);
    if (deform.length) push(`Deformity: ${deform.join("; ")}.`);
    const skin = R.SIDES.map((s) => [].concat(nv(`f.${s}.skin`) ?? []).filter((x) => x !== "none").length ? `${s}: ${listOf(`f.${s}.skin`).toLowerCase()}` : null).filter(Boolean);
    if (skin.length) push(`Skin: ${skin.join("; ")}.`);
    if (nv("g.footwear")) push(`Footwear appropriate: ${listOf("g.footwear").toLowerCase()}${nv("g.footwear") === "no" ? ` (${listOf("g.concerns").toLowerCase()})` : ""}.`);
    push(model.charcotSides.length ? `Charcot red flags: ${model.charcotSides.map((s) => `${s} ${listOf(`h.${s}.flags`).toLowerCase()}`).join("; ")}.` : "No Charcot red flags.");
    if (nv("h.left.temp") && nv("h.right.temp")) push(`Skin temperature L ${nv("h.left.temp")} °C, R ${nv("h.right.temp")} °C (difference ${Math.abs(nv("h.left.temp") - nv("h.right.temp")).toFixed(1)} °C).`);
    if (model.hist.length) push(`History: ${model.hist.join("; ")}.`);
    for (const u of model.ulcers) {
      const p = `r.w.${u.n}`;
      const size = [rv(`${p}.length`), rv(`${p}.width`), rv(`${p}.depth`)];
      push(`Ulcer ${u.n}, ${ulcerLocation(u.n).toLowerCase()}: ${formatPrac(`${p}.type`).toLowerCase()}, onset ${formatPrac(`${p}.onset`)}, ${size.every(Boolean) ? size.join(" × ") + " cm" : "size not recorded"}, tissue ${formatPrac(`${p}.tissue`).toLowerCase()}, pain ${rv(`${p}.pain`)}/10, probe-to-bone ${formatPrac(`${p}.ptb`).toLowerCase()}.`);
    }
    if (review.corrections.length) {
      push(`Corrections to nurse findings: ${review.corrections.map((c) => `${SCHEMA[c.field]?.label ?? c.field}${/\.(left|right)\./.test(c.field) ? ` (${c.field.split(".")[1]})` : ""} ${formatValue(c.field, c.from)} → ${formatValue(c.field, c.to)}`).join("; ")}.`);
    }
    const labs = Object.entries(R.LABS).filter(([k]) => rv(`r.lab.${k}`)).map(([k, ref]) => `${ref.label} ${rv(`r.lab.${k}`)}${R.labFlag(k, rnum(`r.lab.${k}`)) ? ` (${R.labFlag(k, rnum(`r.lab.${k}`)).toLowerCase()})` : ""}`);
    if (labs.length) push(`Labs: ${labs.join(", ")}.`);
    push();
    push("ASSESSMENT");
    for (const kind of ["lops", "pad"]) {
      push(`${kind.toUpperCase()}: ${R.SIDES.map((s) => `${s} ${fmtYesNo(decidedValue(model.recs.find((r) => r.id === `${kind}.${s}`))).toLowerCase()}`).join(", ")}.`);
    }
    push(`IWGDF risk: ${model.risk === null ? "pending" : Patients.RISK[model.risk].label}.`);
    if (rv("r.pad.conclusion")) push(`PAD conclusion: ${formatPrac("r.pad.conclusion")}.`);
    for (const u of model.ulcers) {
      const recFor = (k) => model.recs.find((r) => r.id === `wound.${u.n}.${k}`);
      push(`Ulcer ${u.n}: Wagner ${recFor("wagner").fmt(decidedValue(recFor("wagner")) ?? recFor("wagner").sys.value)}, infection ${recFor("infection").fmt(decidedValue(recFor("infection")) ?? recFor("infection").sys.value)}, SINBAD ${recFor("sinbad").fmt(decidedValue(recFor("sinbad")) ?? recFor("sinbad").sys.value)}, ${recFor("wifi").fmt(decidedValue(recFor("wifi")) ?? recFor("wifi").sys.value)}.`);
    }
    for (const rec of model.recs.filter((r) => r.group === "escalation")) {
      const v = decidedValue(rec);
      push(`${rec.title}${v === "no" ? ": reviewed, not applicable" : ""}.`);
    }
    if (rv("r.int.skin")) push(`Deformity / skin diagnosis: ${rv("r.int.skin")}.`);
    if (rv("r.int.impression")) push(`Impression: ${rv("r.int.impression")}`);
    push();
    push("PLAN");
    const orders = [];
    if ((rv("r.orders.labs") ?? []).length) orders.push(`Labs: ${formatPrac("r.orders.labs")}`);
    if (rv("r.orders.labsOther")) orders.push(`Other tests: ${rv("r.orders.labsOther")}`);
    if ((rv("r.orders.imaging") ?? []).length) orders.push(`Imaging: ${formatPrac("r.orders.imaging")}`);
    if ((rv("r.orders.referrals") ?? []).length) orders.push(`Referral orders: ${formatPrac("r.orders.referrals")}`);
    orders.forEach((o) => push(`- ${o}`));
    if (rv("r.inf.antibiotics")) push(`- Antibiotics: ${formatPrac("r.inf.antibiotics")}${rv("r.inf.agent") ? `, ${rv("r.inf.agent")}` : ""}${rv("r.inf.days") ? ` for ${rv("r.inf.days")} days` : ""}.`);
    if ((rv("r.inf.reassess") ?? []).length) push("- Reassess infection in 24–48 h.");
    if (rv("r.inf.admit") === "yes") push("- Hospital admission arranged.");
    const care = [
      rv("r.std.debridement") && rv("r.std.debridement") !== "none" ? `${formatPrac("r.std.debridement")} debridement` : null,
      rv("r.std.offloading") && rv("r.std.offloading") !== "none" ? `offloading with ${formatPrac("r.std.offloading").toLowerCase()}` : null,
    ].filter(Boolean);
    if (care.length || rv("r.std.dressing")) push(`- Wound care: ${[...care, rv("r.std.dressing")].filter(Boolean).join(", ")}.`);
    if ((rv("r.adj") ?? []).filter((a) => a !== "none").length) push(`- Adjunctive: ${formatPrac("r.adj")}.`);
    if (rv("r.ref.needed") === "yes") {
      push(`- Referral: ${OPTION_TEXT.destination[rv("r.ref.destination")] ?? "—"}, ${(OPTION_TEXT.urgency[rv("r.ref.urgency")] ?? "—").toLowerCase()}, ${OPTION_TEXT.timing[rv("r.ref.timing")] ?? "—"}${rv("r.ref.reason") ? ` (${rv("r.ref.reason")})` : ""}.`);
    } else if (rv("r.ref.needed") === "no") push("- No referral needed.");
    if ((rv("r.plan.education") ?? []).length) push(`- Education: ${formatPrac("r.plan.education")}.`);
    if (rv("r.plan.offloading")) push(`- Footwear / offloading: ${rv("r.plan.offloading")}.`);
    if (rv("r.plan.followup")) push(`- Follow-up in ${OPTION_TEXT.followup[rv("r.plan.followup")]}.`);
    if ((rv("r.plan.safetynet") ?? []).length) push("- Patient understands the plan; safety-net advice given.");
    return lines.join("\n");
  }

  function buildInstructions(model) {
    const lines = [];
    lines.push(`Foot care instructions for ${patient.name}`);
    lines.push("");
    if (model.risk !== null) lines.push(`Your foot risk: ${Patients.RISK[model.risk].label.replace(/^IWGDF \d · /, "")}.`);
    if (rv("r.plan.followup")) lines.push(`Your next foot check: in ${OPTION_TEXT.followup[rv("r.plan.followup")]}.`);
    if (rv("r.ref.needed") === "yes") {
      const where = {
        tertiary: "the Diabetic Foot Center of Excellence", secondary: "the Diabetic Foot Secondary Care Unit",
        vascular: "the vascular team", "wound-care": "the wound care clinic", private: "a private center",
      }[rv("r.ref.destination")] ?? "a specialist service";
      lines.push(
        rv("r.ref.urgency") === "emergency"
          ? `Go to the Emergency Department today. You are being referred to ${where}.`
          : `You are being referred to ${where} (${OPTION_TEXT.timing[rv("r.ref.timing")] ?? "date to be confirmed"}).`,
      );
    }
    lines.push("");
    lines.push("Every day:");
    lines.push("- Check both feet, including between the toes. Use a mirror or ask someone to help.");
    lines.push("- Wash your feet and dry well between the toes. Moisturise dry skin, but not between the toes.");
    lines.push("- Wear seamless, light-coloured cotton socks and change them daily.");
    lines.push("- Do not walk barefoot, in socks only, or in thin slippers, indoors or outdoors.");
    lines.push("- Check inside your shoes before putting them on.");
    if (model.ulcers.length) {
      lines.push("");
      lines.push("Your wound:");
      lines.push("- Keep the dressing clean and dry and follow the dressing plan you were given.");
      if (rv("r.std.offloading") && rv("r.std.offloading") !== "none") lines.push(`- Use your offloading device (${formatPrac("r.std.offloading").toLowerCase()}) whenever you stand or walk.`);
      if (rv("r.inf.antibiotics") && rv("r.inf.antibiotics") !== "none") lines.push("- Take all of your antibiotics, even if the foot looks better.");
    }
    lines.push("");
    lines.push("Seek urgent care for new redness, swelling, fever, or a wound.");
    return lines.join("\n");
  }

  // ---------- Status, progress, validation ----------

  const STATUS_TEXT = { "awaiting-review": ["Awaiting review", "badge-status-progress"], "in-review": ["In review", "badge-status-progress"], reviewed: ["Reviewed", "badge-status-complete"] };

  function pendingRecs(model) {
    return model.recs.filter((r) => !decision(r.id, r.sys.value).decided);
  }

  const requiredQs = () => $$("[data-required]", form).filter((q) => !isHidden(q));

  function isAnswered(q) {
    const fields = $$("input, select, textarea", q).filter((f) => !isHidden(f));
    if (q.dataset.required === "radio" || q.dataset.required === "any") return fields.some((f) => f.checked);
    return fields.every((f) => f.value.trim() !== "" && f.checkValidity());
  }

  let errorSeq = 0;
  function setInvalid(q, invalid, message) {
    const error = $(":scope > .field-error", q);
    if (!error) return;
    if (!error.id) error.id = `review-error-${++errorSeq}`;
    error.hidden = !invalid;
    $("span", error).textContent = invalid ? message ?? q.dataset.error : "";
    q.classList.toggle("q--invalid", invalid);
    const target = q.matches("fieldset") ? q : $("input, select, textarea", q);
    if (invalid) {
      target.setAttribute("aria-invalid", "true");
      target.setAttribute("aria-describedby", error.id);
    } else {
      target.removeAttribute("aria-invalid");
      target.removeAttribute("aria-describedby");
    }
  }

  const signatureOk = () => (rv("r.sign.name") ?? "").trim().toLowerCase() === user.name.toLowerCase();

  function updateSectionStatus(model) {
    const pending = pendingRecs(model);
    for (const section of $$(".form-section", form)) {
      const badge = $("[data-status]", section);
      const n = section.dataset.section;
      let text;
      let cls;
      const recsHere = pending.filter((r) => $(`[data-rec="${CSS.escape(r.id)}"]`, section));
      const qs = requiredQs().filter((q) => section.contains(q));
      if ($(".q--invalid", section)) [text, cls] = ["Needs attention", "badge-status-attention"];
      else if (n === "1") [text, cls] = review.corrections.length ? [`${plural(new Set(review.corrections.map((c) => c.field)).size, "correction")}`, "badge-status-progress"] : ["Read-only", "badge-muted"];
      else if (recsHere.length) [text, cls] = [`${recsHere.length} to decide`, "badge-status-progress"];
      else if (qs.length) {
        const done = qs.filter(isAnswered).length;
        [text, cls] = done === qs.length ? ["Complete", "badge-status-complete"] : done ? ["In progress", "badge-status-progress"] : ["Not started", "badge-muted"];
      } else [text, cls] = n === "2" || n === "3" ? ["Complete", "badge-status-complete"] : ["Optional", "badge-muted"];
      badge.textContent = text;
      badge.className = `badge form-section__status ${cls}`;
    }
    const missing = requiredQs().filter((q) => !isAnswered(q)).length;
    $("#review-progress").textContent = locked
      ? `Signed by ${review.signedBy}`
      : pending.length || missing
        ? [pending.length ? plural(pending.length, "decision") + " pending" : null, missing ? plural(missing, "required field") + " missing" : null].filter(Boolean).join(" · ")
        : "Ready to sign";
    const [st, sc] = STATUS_TEXT[record.status];
    $("#review-status").textContent = st;
    $("#review-status").className = `badge ${sc}`;
  }

  // ---------- Persist / restore ----------

  function collectReviewAnswers() {
    const answers = {};
    for (const field of form.elements) {
      if (!field.name || !field.name.startsWith("r.")) continue;
      if (field.type === "checkbox") {
        if (field.checked) (answers[field.name] ||= []).push(field.value);
      } else if (field.type === "radio") {
        if (field.checked) answers[field.name] = field.value;
      } else if (field.value !== "") answers[field.name] = field.value;
    }
    return answers;
  }

  let saveTimer = null;
  function persist() {
    review.answers = collectReviewAnswers();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => ScreeningStore.save(record), 150);
  }

  function restore() {
    for (const [name, value] of Object.entries(review.answers)) setField(name, value);
    $$("[data-range-output]", form).forEach((out) => (out.textContent = document.getElementById(out.htmlFor.value).value));
  }

  // ---------- Update loop ----------

  let model;
  // Findings only depend on corrections, so they are redrawn by the correction
  // editor, not on every keystroke (redrawing would swallow in-flight clicks).
  function update({ findings = false } = {}) {
    model = compute();
    if (findings) renderFindings();
    renderRecs(model);
    renderAlerts(model);
    renderWounds();
    renderSuggestedTests(model);
    renderLabFlags();
    renderPad(model);
    renderInfection(model);
    renderAdjuncts(model);
    renderInterpretation(model);
    renderReferralSuggestion(model);
    renderFollowUp(model);
    $$('[data-reveal="antibiotic-detail"]').forEach((n) => (n.hidden = !["oral", "iv"].includes(rv("r.inf.antibiotics"))));
    $$('[data-reveal="referral"]').forEach((n) => (n.hidden = rv("r.ref.needed") !== "yes"));
    if (!review.noteEdited && !locked) setField("r.note", buildNote(model));
    if (!review.instructionsEdited && !locked) setField("r.instructions", buildInstructions(model));
    $("[data-note-edited]").hidden = !review.noteEdited;
    $("[data-instructions-edited]").hidden = !review.instructionsEdited;
    form.querySelectorAll(".q--invalid").forEach((q) => (isHidden(q) || isAnswered(q)) && q.dataset.required && setInvalid(q, false));
    updateSectionStatus(model);
  }

  // ---------- Events ----------

  form.addEventListener("change", (event) => {
    const input = event.target;
    // Exclusive "None" chips
    if (input.type === "checkbox" && input.checked && input.name) {
      const group = inputs(input.name);
      if (input.hasAttribute("data-exclusive")) group.forEach((i) => i !== input && (i.checked = false));
      else group.forEach((i) => i.hasAttribute("data-exclusive") && (i.checked = false));
    }
    if (!input.name?.startsWith("r.")) return;
    persist();
    // Typed fields already updated on input; a blur-time redraw would eat the next click
    if (["number", "text", "range"].includes(input.type) || input.tagName === "TEXTAREA") return;
    update();
  });

  form.addEventListener("input", (event) => {
    const input = event.target;
    if (input.name === "r.note") {
      review.noteEdited = true;
      $("[data-note-edited]").hidden = false;
      persist();
      return;
    }
    if (input.name === "r.instructions") {
      review.instructionsEdited = true;
      $("[data-instructions-edited]").hidden = false;
      persist();
      return;
    }
    if (input.type === "range") {
      const out = $(`[data-range-output][for="${input.id}"]`, form);
      if (out) out.textContent = input.value;
    }
    if (input.name?.startsWith("r.") && (input.type === "number" || input.type === "text" || input.tagName === "TEXTAREA" || input.type === "range")) {
      persist();
      clearTimeout(input._t);
      input._t = setTimeout(update, 250);
    }
  });

  $$("[data-regenerate]").forEach((button) =>
    button.addEventListener("click", () => {
      if (button.dataset.regenerate === "note") {
        review.noteEdited = false;
        setField("r.note", buildNote(model));
      } else {
        review.instructionsEdited = false;
        setField("r.instructions", buildInstructions(model));
      }
      persist();
      update();
    }),
  );

  $("[data-print-instructions]").addEventListener("click", () => {
    const text = rv("r.instructions");
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) return;
    win.document.title = `Foot care instructions · ${patient.name}`;
    const pre = win.document.createElement("pre");
    pre.style.cssText = "font: 15px/1.6 system-ui, sans-serif; white-space: pre-wrap; padding: 24px;";
    pre.textContent = text;
    win.document.body.append(pre);
    win.print();
  });

  $("[data-apply-referral]").addEventListener("click", () => {
    const s = model.referral;
    if (!s) return;
    setField("r.ref.needed", s.needed);
    if (s.needed === "yes") {
      setField("r.ref.destination", s.destination);
      setField("r.ref.urgency", s.urgency);
      setField("r.ref.timing", s.timing);
      if (!rv("r.ref.reason")) setField("r.ref.reason", s.reasons.join("; "));
    }
    persist();
    update();
  });

  // Expand / collapse all
  const toggleAll = $("#toggle-sections");
  const sections = $$(".form-section", form);
  const syncToggle = () => (toggleAll.textContent = sections.every((s) => s.open) ? "Collapse all" : "Expand all");
  toggleAll.addEventListener("click", () => {
    const open = !sections.every((s) => s.open);
    sections.forEach((s) => (s.open = open));
    syncToggle();
  });
  sections.forEach((s) => s.addEventListener("toggle", syncToggle));

  // ---------- Sign-off ----------

  const confirmDialog = $("#confirm-sign");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (locked) return;
    update();
    const invalid = requiredQs().filter((q) => !isAnswered(q));
    $$("[data-required]", form).forEach((q) => setInvalid(q, invalid.includes(q)));
    const signQ = $('[name="r.sign.name"]').closest(".q");
    if (rv("r.sign.name") && !signatureOk()) {
      setInvalid(signQ, true, `Signature must match your name: ${user.name}.`);
      invalid.push(signQ);
    }
    const pending = pendingRecs(model);
    updateSectionStatus(model);

    if (pending.length) {
      const first = $(`[data-rec="${CSS.escape(pending[0].id)}"]`);
      first.closest(".form-section").open = true;
      first.scrollIntoView({ block: "center" });
      first.classList.add("rec-card--flash");
      setTimeout(() => first.classList.remove("rec-card--flash"), 1600);
      $("button", first)?.focus();
      return;
    }
    if (invalid.length) {
      invalid.forEach((q) => (q.closest(".form-section").open = true));
      syncToggle();
      $("input, select, textarea", invalid[0]).focus();
      invalid[0].scrollIntoView({ block: "center" });
      return;
    }
    $("#confirm-sign-text").textContent = `${patient.name} (${record.fileNumber}). After signing, the review is locked and the note is final.`;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
  });

  confirmDialog.addEventListener("close", () => {
    if (confirmDialog.returnValue !== "sign") return;
    review.answers = collectReviewAnswers();
    review.signedBy = user.name;
    review.signedAt = new Date().toISOString();
    review.finalNote = rv("r.note");
    record.status = "reviewed";
    clearTimeout(saveTimer);
    ScreeningStore.save(record);
    lock();
    window.scrollTo({ top: 0 });
  });

  function lock() {
    locked = true;
    $$("input, select, textarea, button", form).forEach((f) => {
      if (!f.closest(".form-section__summary") && f.id !== "toggle-sections") f.disabled = true;
    });
    $("#sign-button").hidden = true;
    $("#review-signed").hidden = false;
    $("#review-signed-text").textContent = `Signed by ${review.signedBy} on ${fmtDateTime(review.signedAt)}. Status: reviewed.`;
    // Printing instructions stays available after sign-off
    $("[data-print-instructions]").disabled = false;
    update({ findings: true });
  }

  // ---------- Init ----------

  renderPatient();
  $("[data-assessor]").textContent = user.name;
  $("[data-assessor-role]").textContent = user.roleLabel || "—";
  const tick = () => ($("[data-sign-time]").textContent = review.signedAt ? fmtDateTime(review.signedAt) : fmtDateTime(new Date().toISOString()));
  tick();
  setInterval(tick, 30_000);
  restore();
  update({ findings: true });
  syncToggle();
  if (locked) {
    if (review.finalNote) setField("r.note", review.finalNote);
    lock();
  }
})();
