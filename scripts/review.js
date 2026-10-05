// Practitioner review (Part 2): findings with corrections, system suggestions with
// confirm / override, wound evaluation, labs, plan, generated note and sign-off.
// Needs auth.js, patients.js, screening-schema.js, screening-store.js, clinical-rules.js.

(() => {
  if (Access.denied) return;
  const R = ClinicalRules;
  const form = document.getElementById("review-form");

  // ---------- Load ----------

  const id = new URLSearchParams(location.search).get("id");
  const record = id && ScreeningStore.getById(id);

  // Page states (UAT-19): a file that doesn't exist or isn't in the user's clinics says so
  function stateBox(title, text, link = ["./home.html", "Back to home"]) {
    const box = document.createElement("section");
    box.className = "empty-state";
    box.innerHTML = '<h2 class="empty-state__title"></h2><p class="empty-state__text"></p><a class="btn btn-primary"></a>';
    box.querySelector("h2").textContent = title;
    box.querySelector("p").textContent = text;
    box.querySelector("a").href = link[0];
    box.querySelector("a").textContent = link[1];
    const main = document.querySelector("main");
    main.replaceChildren(main.querySelector(".breadcrumb"), box);
  }
  if (!record) {
    stateBox("File not found", "This encounter doesn't exist, or it was removed from this device.");
    return;
  }
  if (!Org.inScope(record)) {
    stateBox("Not one of your clinics", `This file belongs to ${Org.clinicLabel(record.clinicId)}. Your assignment doesn't include it.`);
    return;
  }
  const patient = Patients.byFileNumber(record.fileNumber) || { name: record.patientName, riskHistory: {}, allergies: [] };
  const user = Access.currentUser();
  const fmtClock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  // A file still at stage 1 or 2 can't be reviewed yet (EC-06)
  if (record.status === "waiting-screening" || record.status === "screening") {
    const main = document.querySelector("main");
    const box = document.createElement("section");
    box.className = "empty-state";
    const h = document.createElement("h2");
    h.className = "empty-state__title";
    h.textContent = "The screening hasn't been sent yet";
    const p = document.createElement("p");
    p.className = "empty-state__text";
    p.textContent = `${record.patientName} is at stage ${ScreeningStore.stageOf(record).n}: ${ScreeningStore.stageOf(record).label}.`;
    box.append(h, p);
    if (Access.can("screening.pull")) {
      const a = document.createElement("a");
      a.className = "btn btn-primary";
      a.href = `./screening.html?id=${encodeURIComponent(record.id)}`;
      a.textContent = "Complete screening";
      box.append(a);
    }
    main.replaceChildren(main.querySelector(".breadcrumb"), box);
    return;
  }

  record.review ||= { answers: {}, decisions: {}, corrections: [], noteEdited: false, instructionsEdited: false };
  const review = record.review;

  // Only the lock holder edits; everyone else sees the file read-only (F-02, UAT-09)
  let viewOnly = null;
  let holding = false;
  if (record.status === "awaiting-review" || record.status === "in-review") {
    const lock = ScreeningStore.acquire(record.id, user);
    if (!lock.ok) {
      viewOnly = `Under review by ${lock.holder.name} since ${fmtClock(lock.holder.since)}. You can read the file, but only they can change it until they leave or the lock times out.`;
    } else {
      holding = true;
      Object.assign(record, { holder: lock.record.holder });
      if (record.status === "awaiting-review") {
        // Starting the review ends the nurse's ability to edit Part 1
        record.status = "in-review";
        review.openedBy = user.name;
        review.openedAt = new Date().toISOString();
        record.openedAt = review.openedAt;
        record.openedBy = user.name;
        try {
          ScreeningStore.save(record);
          ScreeningStore.audit("Review started", record);
        } catch (e) {
          viewOnly = e.message;
          holding = false;
        }
      }
    }
  }
  let locked = record.status === "reviewed" || !!viewOnly;

  // Permissions are read at each action as well, so a change in Settings applies at once (EC-07)
  const can = {
    get correct() { return Access.can("review.correct"); },
    get decide() { return Access.can("review.decide"); },
    get orders() { return Access.can("review.orders"); },
    get referral() { return Access.can("review.referral"); },
    get sign() { return Access.can("review.signoff"); },
    get prescribe() { return Access.can("medication.prescribe"); },
    get reopen() { return Access.can("review.reopen"); },
  };

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
    set("name", Privacy.name(patient.name, record.fileNumber));
    set("fileNumber", record.fileNumber);
    set("nationalId", Privacy.nationalId(patient.nationalId, record.fileNumber));
    set("age", patient.dob && Privacy.ageVisible(record.fileNumber) ? plural(Patients.ageOn(patient.dob), "year") : "Hidden");
    set("sex", patient.sex ?? "—");
    set("diabetes", patient.diabetesType ? `${patient.diabetesType} · ${plural(patient.diabetesDurationYears, "year")}` : "—");
    set("hba1c", patient.lastHbA1c ? `${patient.lastHbA1c.value}% · ${fmtDate(patient.lastHbA1c.date)}` : "Not recorded");
    set("careLevel", Patients.CARE_LEVEL[patient.careLevel] ?? "—");
    set("allergies", patient.allergies?.length ? `Allergies: ${patient.allergies.join(", ")}` : "No known allergies");
    // UAT-16: allergies next to the medication box
    const box = $("[data-med-allergies]");
    if (box) {
      box.replaceChildren(el("strong", "", patient.allergies?.length ? "Recorded allergies: " : "Recorded allergies: none"), patient.allergies?.length ? patient.allergies.join(", ") : "");
      box.classList.toggle("allergy-box--alert", !!patient.allergies?.length);
    }
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
    if (!locked && can.correct && SCHEMA[name]?.type !== "file") {
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
        Audit.forRecord("value.edit", record, `Nurse finding corrected: ${name}`, { field: name, old: [].concat(current ?? "—").join(", "), new: [].concat(to ?? "—").join(", "), reason: reason.value.trim() });
        // Handbook section 9: any change to Part 1 sends the recommendation back to pending
        if (review.decisions.risk || review.decisions.interval) {
          delete review.decisions.risk;
          delete review.decisions.interval;
          Audit.forRecord("recommendation", record, "Risk category back to pending after a Part 1 correction");
        }
        commitActions();
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
    const share = (k) => rnum(`${p}.share.${k}`);
    return {
      n,
      signs: rv(`${p}.signs`) ?? [],
      erythemaCm: rnum(`${p}.erythema`),
      ptb: rv(`${p}.ptb`),
      exposed: rv(`${p}.exposed`) ?? [],
      osteomyelitis: rv(`${p}.osteomyelitis`) ?? "no",
      abscess: rv(`${p}.abscess`),
      gangrene: rv(`${p}.gangrene`),
      length: rnum(`${p}.length`),
      width: rnum(`${p}.width`),
      depth: rnum(`${p}.depth`),
      onset: rv(`${p}.onset`),
      type: rv(`${p}.type`),
      progression: rv(`${p}.progression`),
      prevArea: rnum(`${p}.prevArea`),
      weeksCare: rnum(`${p}.weeksCare`),
      tissue: rv(`${p}.tissue`) ?? [],
      shares: { granulation: share("granulation"), slough: share("slough"), necrosis: share("necrosis"), epithelialising: share("epithelialising") },
      exudateVolume: rv(`${p}.exudate`),
      exudateType: rv(`${p}.exudateType`),
      odour: rv(`${p}.odour`),
      pain: $(`[name="${p}.pain"]`)?.dataset.touched || review.answers?.[`${p}.pain`] !== undefined ? rnum(`${p}.pain`) : null,
      debridement: rv("r.std.debridement"),
      offloading: rv("r.std.offloading"),
    };
  }

  const INFECTION_OPTS = [0, 1, 2, 3].map((g) => [g, R.INFECTION[g]]);

  // Handbook sections 5 to 8, through ClinicalRules.evaluate (pure). The practitioner's
  // decisions (per-foot LOPS / PAD / deformity, per-ulcer labels) feed back in.
  function compute() {
    const labs = Object.fromEntries(Object.keys(R.LABS).map((k) => [k, rnum(`r.lab.${k}`)]));
    const recs = [];
    for (const side of R.SIDES) {
      const L = R.SIDE_LABEL[side];
      recs.push({ id: `lops.${side}`, group: "foot", title: `LOPS · ${L} foot`, sys: R.lops(nv, side), options: YES_NO, fmt: fmtYesNo });
      recs.push({ id: `pad.${side}`, group: "foot", title: `PAD · ${L} foot`, sys: R.pad(nv, side), options: YES_NO, fmt: fmtYesNo });
      recs.push({ id: `deformity.${side}`, group: "foot", title: `Deformity · ${L} foot`, sys: R.deformity(nv, side), options: YES_NO, fmt: fmtYesNo });
    }
    const dec = (id) => decidedValue(recs.find((r) => r.id === id));
    const decided = Object.fromEntries(["lops", "pad", "deformity"].map((k) => [k, Object.fromEntries(R.SIDES.map((sd) => [sd, dec(`${k}.${sd}`)]))]));

    // IWGDF category waits for the per-foot decisions (UAT F-12), then is confirmed or overridden
    const footVal = (kind) => {
      const vals = R.SIDES.map((sd) => decided[kind][sd]);
      if (vals.includes("yes")) return true;
      return vals.every((v) => v === "no") ? false : null;
    };
    const hist = R.history(nv, patient);
    const riskSys = R.iwgdfRisk({ lops: footVal("lops"), pad: footVal("pad") === null ? null : footVal("pad") || hist.padHx, deformity: !!footVal("deformity") || hist.prevCharcot, history: hist });
    const riskRec = {
      id: "risk", group: "risk", title: "IWGDF risk category", sys: riskSys,
      options: [0, 1, 2, 3].map((r) => [r, Patients.RISK[r].label]),
      fmt: (v) => (v === null || v === undefined ? "Waiting for decisions" : Patients.RISK[v].label),
    };
    recs.push(riskRec);
    const risk = decidedValue(riskRec);
    const intervalSys = risk === null
      ? { value: null, reasons: ["Decide the risk category first"], source: "IWGDF (handbook §5 step 5)" }
      : { value: R.RISK_INTERVAL[risk], reasons: [`IWGDF ${risk}`], source: "IWGDF (handbook §5 step 5)" };
    recs.push({ id: "interval", group: "risk", title: "Screening interval", sys: intervalSys, options: Object.values(R.RISK_INTERVAL).map((v) => [v, v]), fmt: (v) => v ?? "—" });

    const ulcerIn = (withDecisions) => {
      const out = [];
      for (let n = 1; n <= ulcerCount(); n++) {
        const decidedLabel = (k) => (withDecisions ? (recs.find((r) => r.id === `wound.${n}.${k}`) ? dec(`wound.${n}.${k}`) : null) : null);
        out.push({
          n, side: nv(`j.${n}.foot`), zone: nv(`j.${n}.zone`), zoneLabel: (formatValue(`j.${n}.zone`, nv(`j.${n}.zone`)) ?? "").toLowerCase(), aspect: nv(`j.${n}.aspect`),
          w: woundInput(n), decided: { infection: decidedLabel("infection"), wifi: decidedLabel("wifi") },
        });
      }
      return out;
    };
    const prac = { antibioticAgent: rv("r.inf.agent"), antibiotics: rv("r.inf.antibiotics"), serious: rv("r.inf.serious") ?? [], xray: rv("r.charcot.xray") };
    const catalog = typeof TestCatalog !== "undefined" ? TestCatalog.active() : null;
    const input = { v: nv, patient, labs, decided, prac, catalog, decidedRisk: risk };

    // First pass: system labels for the wound cards; second pass with the decisions
    const first = R.evaluate({ ...input, ulcers: ulcerIn(false) });
    for (const u of first.ulcers) {
      const n = u.n;
      recs.push({
        id: `wound.${n}.infection`, group: `wound-${n}`, title: "Infection severity (IWGDF/IDSA)", sys: { ...u.infectionSys, value: u.infectionSys.value },
        options: INFECTION_OPTS, fmt: (v) => (v === null || v === undefined ? "—" : R.INFECTION[v] + (v >= 2 && u.osteoConfirmed ? " (O)" : "")),
      });
      recs.push({ id: `wound.${n}.wagner`, group: `wound-${n}`, title: "Wagner grade", sys: u.wagnerSys, options: [1, 2, 3, 4, 5].map((g) => [g, `Grade ${g}`]), fmt: (v) => (v ? `Grade ${v}` : "—") });
      recs.push({ id: `wound.${n}.sinbad`, group: `wound-${n}`, title: "SINBAD score", sys: u.sinbadSys, options: [0, 1, 2, 3, 4, 5, 6].map((x) => [x, `${x} / 6`]), fmt: (v) => (v === null || v === undefined ? "—" : `${v} / 6`) });
      const comp = u.wifiSys.W ? ` (W${u.wifiSys.W} I${u.wifiSys.I ?? "?"}${u.wifiSys.estimated ? " est." : ""} fI${u.wifiSys.fI ?? "?"})` : "";
      recs.push({ id: `wound.${n}.wifi`, group: `wound-${n}`, title: "WIfI clinical stage", sys: u.wifiSys, options: [1, 2, 3, 4].map((x) => [x, `Stage ${x}`]), fmt: (v) => (v ? `Stage ${v}${comp}` : "—") });
    }
    const ev = R.evaluate({ ...input, ulcers: ulcerIn(true) });
    return { ...ev, recs, risk, riskSys, hist, sirs: ev.sirs, severe: Object.fromEntries(ev.feet.map((f) => [f.side, f.critical])) };
  }

  // ---------- Recommendation cards ----------

  function renderRecs(model) {
    $$("[data-recs]").forEach((host) => host.replaceChildren());
    for (const rec of model.recs) {
      const host = $(`[data-recs="${rec.group}"]`);
      if (host) host.append(recCard(rec));
    }

    // "Confirm all" for the six per-foot cards; Override stays on each card (F-12)
    const footHost = $('[data-recs="foot"]');
    let bar = $("#confirm-all-bar");
    if (!bar) {
      bar = el("div", "confirm-all");
      bar.id = "confirm-all-bar";
      footHost.before(bar);
    }
    const confirmable = model.recs.filter((r) => r.group === "foot" && !decision(r.id, r.sys.value).decided && r.sys.value !== null && r.sys.value !== undefined);
    bar.replaceChildren();
    if (!locked && can.decide && confirmable.length) {
      const b = el("button", "btn btn-primary btn-sm", `Confirm all (${confirmable.length})`);
      b.type = "button";
      b.addEventListener("click", () => {
        if (!Access.can("review.decide")) return;
        const at = new Date().toISOString();
        for (const rec of confirmable) review.decisions[rec.id] = { action: "confirm", value: rec.sys.value, sysValue: rec.sys.value, reason: "", by: user.name, at };
        ScreeningStore.audit("Recommendations confirmed", record, confirmable.map((r) => r.title).join(", "), "recommendation");
        commitActions();
        update();
        $('[data-recs="risk"] .rec-card button')?.focus();
      });
      bar.append(b, el("span", "field-hint", "Cards with no system value need Set value."));
    }
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

    if (locked || !can.decide) return card;

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
    if (!Access.can("review.decide")) return;
    Audit.forRecord("recommendation", record, `${action === "confirm" ? "Recommendation confirmed" : "Recommendation overridden"}: ${rec.title}`, {
      field: rec.id, old: rec.fmt(rec.sys.value), new: rec.fmt(value), reason: reason || null,
    });
    review.decisions[rec.id] = { action, value, sysValue: rec.sys.value, reason, by: user.name, at: new Date().toISOString() };
    commitActions();
    update();
  }

  // ---------- Alerts ----------

  const ALERT_CLASS = { critical: "urgent", warning: "attention", info: "info" };
  function renderAlerts(model) {
    const items = model.alerts.map((a) => ({ ...a }));
    // Lab values outside the reference range are notes (handbook section 7)
    for (const [key, ref] of Object.entries(R.LABS)) {
      const v = rnum(`r.lab.${key}`);
      const flag = R.labFlag(key, v, patient?.sex);
      if (flag) items.push({ level: "info", label: R.LEVEL.info, title: `${ref.label} ${flag.toLowerCase()}`, reason: `${v} ${ref.unit}.`, action: "" });
    }
    if (nv("a.confirmed") === "needs-update") items.push({ level: "info", label: R.LEVEL.info, title: "Patient record needs updating", reason: "Flagged by the nurse.", action: "Update the record." });
    const list = $("#review-alerts");
    list.replaceChildren(
      ...items.map((a) => {
        const li = el("li", `flag flag--${ALERT_CLASS[a.level]} alert-item`);
        const head = el("div", "alert-item__head");
        head.append(el("span", `badge alert-level alert-level--${a.level}`, a.label), el("strong", "", a.title));
        li.append(head);
        if (a.reason) li.append(el("p", "alert-item__reason", a.reason));
        if (a.action) li.append(el("p", "alert-item__action", `Action: ${a.action}`));
        return li;
      }),
    );
    $("#review-alerts-empty").hidden = items.length > 0;
  }

  // MOH segment card (recomputed on every change; never typed)
  function renderSegment(model) {
    const host = $("[data-segment]");
    if (!host) return;
    const seg = model.segment;
    host.replaceChildren();
    const head = el("div", "segment-card__head");
    head.append(el("span", `badge segment-badge segment-badge--${seg.value}`, `${seg.value} · ${seg.name}`), el("span", "segment-card__action", seg.action));
    host.append(head, el("p", "field-hint", `${seg.reasons.join("; ")}. Source: ${seg.source}.`));
    const undecided = model.recs.filter((r) => r.group === "foot" && !decision(r.id, r.sys.value).decided).length;
    if (undecided) host.append(el("p", "field-hint", `Uses the system's LOPS, PAD and deformity values until you confirm them (${undecided} pending).`));
  }

  function renderDisposition(model) {
    const d = $("[data-disposition]");
    if (d) {
      d.replaceChildren(el("strong", "", model.disposition.label));
      d.dataset.level = model.disposition.value;
    }
    const t = $("[data-teams]");
    if (t) t.replaceChildren(...(model.teams.length ? model.teams.map((x) => {
      const li = el("li");
      li.append(el("strong", "", x.team), ` · ${x.why}`);
      return li;
    }) : [el("li", "field-hint", "No additional teams suggested.")]));
  }

  // Per ulcer: suggested type, offloading, dressing, healing trend (handbook section 6)
  function renderWoundHints(model) {
    for (const u of model.ulcers) {
      const host = $(`[data-wound-hints="${u.n}"]`);
      if (!host) continue;
      const rows = [];
      if (u.suggestedType) rows.push(["Suggested type", u.suggestedType.replace("neuroischaemic", "neuro-ischaemic")]);
      rows.push(["Offloading", u.offloading]);
      if (u.dressing) rows.push(["Dressing", u.dressing]);
      if (u.area !== null) rows.push(["Area", `${u.area} cm²${u.change !== null ? ` (${u.change > 0 ? "+" : ""}${u.change}% since last visit)` : ""}${u.nonHealing ? " · not healing" : ""}`]);
      if (u.infection === 0 && u.infectionSys.value === 0) rows.push(["Antibiotics", "Not indicated for an uninfected ulcer"]);
      const dl = el("dl", "detail-grid detail-grid--plain wound-hints__list");
      for (const [k, v] of rows) {
        const d = el("div");
        d.append(el("dt", "", k), el("dd", "", v));
        dl.append(d);
      }
      host.replaceChildren(el("p", "wound-hints__title", "System suggestions"), dl);
    }
    // Charcot block: shown when the Charcot flag is on
    const charcotBlock = $('[data-reveal="charcot"]');
    if (charcotBlock) {
      charcotBlock.hidden = !model.charcot.flag;
      $("[data-charcot-reason]").textContent = model.charcot.flag ? `Charcot flag: ${model.charcot.reasons.join("; ")}.` : "";
    }
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
    const orders = typeof TestOrders !== "undefined" ? TestOrders.forRecord(record.id) : [];
    host.replaceChildren();
    for (const test of model.tests) {
      const row = el("div", "suggest-item");
      const text = el("div", "suggest-item__text");
      text.append(el("span", "suggest-item__name", test.label), el("span", "suggest-item__why", test.why));
      row.append(text);
      const order = orders.find((o) => o.testId === test.value);
      row.append(order ? el("span", "badge badge-status-progress", TestOrders.stateText(order)) : el("span", "badge badge-muted", "Not ordered"));
      host.append(row);
    }
    if (model.tests.length && !locked && can.orders) {
      const go = el("button", "btn btn-outline btn-sm", "Order or dismiss in Orders");
      go.type = "button";
      go.addEventListener("click", () => {
        const target = $("[data-test-orders]");
        layoutUI.reveal(target);
        target.scrollIntoView({ block: "start" });
      });
      host.append(go);
    }
  }

  function renderLabFlags() {
    $$("[data-lab]").forEach((field) => {
      const key = field.dataset.lab;
      const flag = R.labFlag(key, rnum(`r.lab.${key}`), patient?.sex);
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
    $("[data-severe-text]").textContent = severeText.length ? `Critical perfusion. ${severeText.join("; ")}. Urgent vascular referral.` : "";
    for (const f of model.feet) if (f.calcification) host.append(el("p", "field-hint", `${R.SIDE_LABEL[f.side]} foot: possible arterial calcification, use TBI or toe pressure. An ABI above 1.30 is unreliable, not good.`));
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
      add(`Ulcer ${u.n}`, u.infectionSys.value === null && u.infection === 0 ? "Pending: record the local signs" : R.INFECTION[u.infection] + (u.infection >= 2 && u.osteoConfirmed ? " (O)" : ""));
    }
    if (!model.ulcers.length) add("Ulcers", "None recorded");
    host.append(dl);

    const allergies = patient.allergies ?? [];
    $("[data-allergies]").hidden = !allergies.length;
    $("[data-allergy-text]").textContent = allergies.join(", ");

    const worst = model.maxSev;
    $("[data-antibiotic-hint]").textContent =
      worst >= 2 ? "Moderate or severe infection: parenteral antibiotics, specialist review; admission criteria apply."
        : worst === 1 ? "Mild infection: oral empiric antibiotics can be considered; take a culture and reassess in 24–48 h."
          : model.ulcers.length ? "Uninfected ulcer: antibiotics are not indicated."
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
    add("MOH segment", `${model.segment.value} · ${model.segment.name}`);
    add("Disposition", model.disposition.label);
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
    destination: { er: "Emergency department", secondary: "Secondary Care", private: "Private Center", vascular: "Vascular", "wound-care": "Wound Care", tertiary: "Tertiary" },
    urgency: { routine: "Routine", soon: "Soon", urgent: "Urgent", emergency: "Emergency" },
    timing: { today: "today", "24h": "within 24 h", week: "within 1 week", "3weeks": "within 3 weeks", scheduled: "scheduled" },
    followup: { "48h": "48 hours", "1w": "1 week", "2w": "2 weeks", "1m": "1 month", "1-2m": "1–2 months", "1-3m": "1–3 months", "3-6m": "3–6 months", "6-12m": "6–12 months", "12m": "12 months" },
  };

  function renderReferralSuggestion(model) {
    const text = $("[data-ref-suggestion-text]");
    const apply = $("[data-apply-referral]");
    const s = model.referral;
    if (!s) {
      text.textContent = "Confirm LOPS, PAD and deformity for both feet to get a suggestion.";
      apply.hidden = true;
      return;
    }
    text.replaceChildren(
      el("strong", "", s.needed === "yes" ? `${s.tier}. Refer: ${OPTION_TEXT.destination[s.destination]} · ${OPTION_TEXT.urgency[s.urgency]} · ${OPTION_TEXT.timing[s.timing]}` : `${s.tier}. No referral needed`),
      el("p", "", `${s.reasons.join("; ")} (${s.source})`),
    );
    apply.hidden = locked || !can.referral;
  }

  function renderFollowUp(model) {
    const hint = $("[data-followup-suggestion]");
    hint.replaceChildren();
    if (!model.followUp) {
      hint.textContent = "A follow-up suggestion appears once the segment and risk category are known.";
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
    push(model.charcot.flag ? `Suspected Charcot foot: ${model.charcot.reasons.join("; ")}.${rv("r.charcot.stage") ? ` Eichenholtz stage ${rv("r.charcot.stage")}.` : ""}` : "No Charcot flag.");
    if (nv("h.left.temp") && nv("h.right.temp")) push(`Skin temperature L ${nv("h.left.temp")} °C, R ${nv("h.right.temp")} °C (difference ${Math.abs(nv("h.left.temp") - nv("h.right.temp")).toFixed(1)} °C).`);
    if (model.hist.items.length) push(`History: ${model.hist.items.join("; ")}.`);
    if (nv("a.sbp") || nv("a.glucose")) push(`BP ${nv("a.sbp") ?? "—"} mmHg systolic, capillary glucose ${nv("a.glucose") ?? "—"} mg/dL. Appearance: ${listOf("a.appearance").toLowerCase()}.`);
    for (const u of model.ulcers) {
      const p = `r.w.${u.n}`;
      const size = [rv(`${p}.length`), rv(`${p}.width`), rv(`${p}.depth`)];
      push(`Ulcer ${u.n}, ${ulcerLocation(u.n).toLowerCase()}: ${formatPrac(`${p}.type`).toLowerCase()}, onset ${formatPrac(`${p}.onset`)}, ${size.every(Boolean) ? size.join(" × ") + " cm" : "size not recorded"}, tissue ${formatPrac(`${p}.tissue`).toLowerCase()}, pain ${rv(`${p}.pain`)}/10, probe-to-bone ${formatPrac(`${p}.ptb`).toLowerCase()}.`);
    }
    if (review.corrections.length) {
      push(`Corrections to nurse findings: ${review.corrections.map((c) => `${SCHEMA[c.field]?.label ?? c.field}${/\.(left|right)\./.test(c.field) ? ` (${c.field.split(".")[1]})` : ""} ${formatValue(c.field, c.from)} → ${formatValue(c.field, c.to)}`).join("; ")}.`);
    }
    const labs = Object.entries(R.LABS).filter(([k]) => rv(`r.lab.${k}`)).map(([k, ref]) => `${ref.label} ${rv(`r.lab.${k}`)}${R.labFlag(k, rnum(`r.lab.${k}`), patient?.sex) ? ` (${R.labFlag(k, rnum(`r.lab.${k}`), patient?.sex).toLowerCase()})` : ""}`);
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
    push(`MOH segment: ${model.segment.value} · ${model.segment.name}. ${model.segment.action}`);
    const crit = model.alerts.filter((a) => a.level === "critical");
    if (crit.length) push(`Critical alerts: ${crit.map((a) => a.title).join("; ")}.`);
    push(`Disposition: ${model.disposition.label}.`);
    if (model.teams.length) push(`Teams: ${model.teams.map((t) => t.team).join(", ")}.`);
    if (rv("r.int.skin")) push(`Deformity / skin diagnosis: ${rv("r.int.skin")}.`);
    if (rv("r.int.impression")) push(`Impression: ${rv("r.int.impression")}`);
    push();
    push("PLAN");
    const orders = [];
    const tests = ordersPanel?.summary() ?? [];
    if (tests.length) orders.push(`Tests: ${tests.join("; ")}`);
    if (rv("r.orders.labsOther")) orders.push(`Other tests: ${rv("r.orders.labsOther")}`);
    if ((rv("r.orders.referrals") ?? []).length) orders.push(`Referral orders: ${formatPrac("r.orders.referrals")}`);
    orders.forEach((o) => push(`- ${o}`));
    if (rv("r.med.text")) {
      push("- Medications:");
      rv("r.med.text").split(/\n+/).filter((l) => l.trim()).forEach((l) => push(`  - ${l.trim()}`));
    }
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
        er: "the Emergency Department", tertiary: "the Diabetic Foot Center of Excellence", secondary: "the Diabetic Foot Secondary Care Unit",
        vascular: "the vascular team", "wound-care": "the wound care clinic", private: "a private center",
      }[rv("r.ref.destination")] ?? "a specialist service";
      lines.push(
        rv("r.ref.destination") === "er"
          ? "Go to the Emergency Department today. Do not wait for an appointment."
          : rv("r.ref.urgency") === "emergency"
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

  const STATUS_TEXT = {
    "waiting-screening": ["Waiting for screening", "badge-muted"],
    screening: ["Screening", "badge-status-progress"],
    "awaiting-review": ["Awaiting review", "badge-status-progress"],
    "in-review": ["In review", "badge-status-progress"],
    reviewed: ["Signed", "badge-status-complete"],
  };

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
    $("#review-progress").textContent = viewOnly
      ? "Read only: another practitioner holds this file"
      : locked
      ? `Signed by ${review.signedBy}`
      : !can.sign
      ? "Your role can't sign off reviews"
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
      if (!field.name || !field.name.startsWith("r.") || isHidden(field)) continue;
      // A slider nobody moved has no value yet
      if (field.type === "range" && !field.dataset.touched && !(field.name in (record.review?.answers ?? {}))) continue;
      if (field.type === "checkbox") {
        if (field.checked) (answers[field.name] ||= []).push(field.value);
      } else if (field.type === "radio") {
        if (field.checked) answers[field.name] = field.value;
      } else if (field.value !== "") answers[field.name] = field.value;
    }
    return answers;
  }

  // Typed values stay in the form (and the draft) until Save or Sign
  function persist() {}

  const showError = (message) => {
    let box = $("#review-notice");
    if (!box) {
      box = el("div", "callout callout-destructive");
      box.id = "review-notice";
      box.setAttribute("role", "alert");
      (trackerEl ?? $(".page-header")).after(box);
    }
    box.className = "callout callout-destructive";
    box.textContent = message;
    box.hidden = false;
  };
  const showInfo = (message) => {
    let box = $("#review-notice");
    if (!box) {
      box = el("div", "callout callout-success");
      box.id = "review-notice";
      box.setAttribute("role", "status");
      (trackerEl ?? $(".page-header")).after(box);
    }
    box.className = "callout callout-success";
    box.textContent = message;
    box.hidden = false;
  };

  // Decisions and corrections: written straight away on top of the stored copy (EC-01: refused
  // if someone else changed the file since it was opened; EC-15: refused if the save fails)
  function commitActions() {
    if (!holding) return false;
    const stored = ScreeningStore.getById(record.id);
    const next = { ...stored, rev: record.rev, review: { ...(stored.review ?? {}), decisions: review.decisions, corrections: review.corrections } };
    try {
      ScreeningStore.save(next);
      record.rev = next.rev;
      return true;
    } catch (e) {
      showError(e.message);
      return false;
    }
  }

  const fmtVal = (v) => (v === undefined || v === null || v === "" ? "—" : [].concat(v).join(", "));

  // Everything typed on the page, as saved in the record
  function fullAnswers() {
    const answers = collectReviewAnswers();
    if (!review.noteEdited) delete answers["r.note"];
    if (!review.instructionsEdited) delete answers["r.instructions"];
    return answers;
  }

  let busy = false;
  // Save button / "Save and leave". Logs every changed value with old and new (UAT-05).
  async function saveRecord({ extra = {}, releaseLock = false, quiet = false } = {}) {
    if (!holding || busy) return false;
    busy = true;
    const btn = $("#save-review");
    if (btn) btn.disabled = true;
    try {
      await Db.delay(150);
      const stored = ScreeningStore.getById(record.id);
      const before = stored.review?.answers ?? {};
      const answers = fullAnswers();
      const foreign = layoutUI.collect();
      const next = {
        ...stored,
        ...extra.record,
        rev: record.rev,
        answers: { ...stored.answers, ...foreign.answers },
        custom: { ...(stored.custom ?? {}), ...foreign.custom },
        review: { ...(stored.review ?? {}), ...review, answers, ...extra.review },
      };
      ScreeningStore.save(next, { releaseLock });
      record.rev = next.rev;
      Object.assign(record, next);
      for (const n of new Set([...Object.keys(before), ...Object.keys(answers)])) {
        if (n === "r.note" || n === "r.instructions" || n.startsWith("r.sign.")) continue;
        if (JSON.stringify(before[n] ?? null) === JSON.stringify(answers[n] ?? null)) continue;
        const type = n === "r.med.text" ? "medication" : "value.edit";
        Audit.forRecord(type, record, type === "medication" ? "Medication entered" : `Value recorded: ${n}`, { field: n, old: fmtVal(before[n]), new: fmtVal(answers[n]) });
      }
      draft.afterSave();
      if (!quiet) showInfo(`Saved at ${fmtClock(new Date().toISOString())}.`);
      return true;
    } catch (e) {
      showError(e.message);
      return false;
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
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
    renderSegment(model);
    renderDisposition(model);
    renderWoundHints(model);
    $$('[data-reveal="antibiotic-detail"]').forEach((n) => (n.hidden = !["oral", "iv"].includes(rv("r.inf.antibiotics"))));
    $$('[data-reveal="referral"]').forEach((n) => (n.hidden = rv("r.ref.needed") !== "yes"));
    const declineQ = $("[data-decline-reason]");
    if (declineQ) declineQ.hidden = !rv("r.ref.needed") || followedSuggestion();
    ordersPanel?.update({ suggested: model.tests, readOnly: locked || !can.orders, canOrder: can.orders });
    if (!review.noteEdited && !locked) setField("r.note", buildNote(model));
    if (!review.instructionsEdited && !locked) setField("r.instructions", buildInstructions(model));
    $("[data-note-edited]").hidden = !review.noteEdited;
    $("[data-instructions-edited]").hidden = !review.instructionsEdited;
    form.querySelectorAll(".q--invalid").forEach((q) => (isHidden(q) || isAnswered(q)) && q.dataset.required && setInvalid(q, false));
    updateSectionStatus(model);
    if (layoutReady) layoutUI.refresh();
  }
  let layoutReady = false;

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
    if (input.type === "range") input.dataset.touched = "true";
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

  function printDocument(title, body) {
    if (!Access.can("notes.print")) {
      showError("Your role can't print or export notes.");
      return;
    }
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) {
      showError("The print window was blocked. Allow pop-ups for this site and try again.");
      return;
    }
    const d = win.document;
    d.title = `${title} · ${record.fileNumber}`;
    const style = d.createElement("style");
    style.textContent = `body{font:14px/1.55 "Space Grotesk",system-ui,sans-serif;color:#1c1917;margin:32px;}
      h1{font-size:20px;margin:0 0 4px;color:#5c1a2c} .brand{color:#913246;font-weight:700;letter-spacing:.02em}
      dl{display:grid;grid-template-columns:repeat(3,auto);gap:4px 24px;margin:16px 0;padding:12px 0;border-block:1px solid #e7e5e4}
      dt{font-size:11px;color:#78716c;text-transform:uppercase} dd{margin:0}
      pre{white-space:pre-wrap;font:inherit} footer{margin-top:24px;font-size:11px;color:#78716c}
      @media print{body{margin:16mm}}`;
    d.head.append(style);
    const add = (tag, text, cls) => {
      const n = d.createElement(tag);
      if (cls) n.className = cls;
      n.textContent = text;
      d.body.append(n);
      return n;
    };
    add("div", "N-DFIP · National Diabetic Foot Intelligence Platform", "brand");
    add("h1", title);
    const dl = d.createElement("dl");
    const meta = [
      ["Patient", Privacy.name(patient.name, record.fileNumber)],
      ["File no.", record.fileNumber],
      ["National ID", Privacy.nationalId(patient.nationalId, record.fileNumber)],
      ["Date of birth", Privacy.dob(patient.dob, record.fileNumber)],
      ["Clinic", Org.clinicLabel(record.clinicId)],
      ["Visit", fmtDateTime(review.signedAt ?? record.submittedAt ?? new Date().toISOString())],
    ];
    for (const [k, v] of meta) {
      const dt = d.createElement("dt");
      dt.textContent = k;
      const dd = d.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    d.body.append(dl);
    for (const [heading, text] of body) {
      if (heading) add("h2", heading).style.cssText = "font-size:15px;margin:18px 0 6px";
      add("pre", text);
    }
    add("footer", `Printed by ${user.name} (${user.roleLabel}) on ${fmtDateTime(new Date().toISOString())}. ${review.signedAt ? `Signed by ${review.signedBy}.` : "Not signed yet: draft."}`);
    Audit.forRecord("export", record, `Printed / exported: ${title}`);
    win.focus();
    win.print();
  }

  $("[data-print-instructions]").addEventListener("click", () => printDocument("Patient instructions", [[null, rv("r.instructions") ?? ""]]));
  $("[data-print-summary]").addEventListener("click", () => {
    if (!Privacy.medicalVisible(record.fileNumber)) {
      showError("The medical record is hidden for your role, so the visit summary can't be printed.");
      return;
    }
    printDocument("Visit summary", [
      ["Clinical note", rv("r.note") ?? ""],
      ...(rv("r.med.text") ? [["Medications", rv("r.med.text")]] : []),
    ]);
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
    if (locked || !can.sign || busy) return;
    update();
    const invalid = requiredQs().filter((q) => !isAnswered(q));
    // Impossible values block sign-off too (EC-08)
    for (const f of $$("input[type=number]", form)) {
      if (f.disabled || isHidden(f) || f.checkValidity()) continue;
      const q = f.closest(".q");
      if (!q || invalid.includes(q)) continue;
      setInvalid(q, true, `${f.min !== "" && f.max !== "" ? `Enter a value between ${f.min} and ${f.max}.` : "Enter a valid number."}`);
      invalid.push(q);
    }
    $$("[data-required]", form).forEach((q) => !q.classList.contains("q--range") && setInvalid(q, invalid.includes(q)));
    const signQ = $('[name="r.sign.name"]').closest(".q");
    if (rv("r.sign.name") && !signatureOk()) {
      setInvalid(signQ, true, `Signature must match your name: ${user.name}.`);
      invalid.push(signQ);
    }
    const pending = pendingRecs(model);
    updateSectionStatus(model);

    if (pending.length) {
      const first = $(`[data-rec="${CSS.escape(pending[0].id)}"]`);
      layoutUI.reveal(first);
      first.closest(".form-section").open = true;
      first.scrollIntoView({ block: "center" });
      first.classList.add("rec-card--flash");
      setTimeout(() => first.classList.remove("rec-card--flash"), 1600);
      $("button", first)?.focus();
      return;
    }
    if (invalid.length) {
      invalid.forEach((q) => (q.closest(".form-section").open = true));
      layoutUI.reveal(invalid[0]);
      syncToggle();
      $("input, select, textarea", invalid[0]).focus();
      invalid[0].scrollIntoView({ block: "center" });
      return;
    }
    $("#confirm-sign-text").textContent = `${Privacy.name(patient.name, record.fileNumber)} (${record.fileNumber}). After signing, the review is locked and the note is final.`;
    renderChecklist();
    ack.checked = false;
    ackError.hidden = true;
    signConfirm.disabled = true;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
  });

  // Handbook section 9: open items shown before signing. They don't block; required sections do.
  function openItems() {
    const items = [];
    for (const u of model.ulcers) {
      const p = `r.w.${u.n}`;
      if (!rv(`${p}.length`) || !rv(`${p}.width`)) items.push(`Ulcer ${u.n}: no size`);
      if (!u.zone) items.push(`Ulcer ${u.n}: no location`);
      if (!(nv(`j.${u.n}.photo`) ?? []).length) items.push(`Ulcer ${u.n}: no photo`);
      if (u.aspect === "plantar" && !u.offloadingChosen) items.push(`Ulcer ${u.n}: plantar ulcer without offloading`);
    }
    if (model.maxSev >= 1 && !rv("r.inf.agent")) items.push("Infected ulcer without an antibiotic recorded");
    if (typeof TestOrders !== "undefined") {
      const orders = TestOrders.forRecord(record.id);
      const decidedIds = new Set((Db.read("ndfip.suggestions", []) ?? []).filter((x) => x.recordId === record.id).map((x) => x.testId));
      const pending = model.tests.filter((t) => !orders.some((o) => o.testId === t.value) && !decidedIds.has(t.value));
      if (pending.length) items.push(`${plural(pending.length, "suggested test")} still pending: ${pending.map((t) => t.label).join(", ")}`);
    }
    if (!(rv("r.plan.education") ?? []).length) items.push("No education recorded");
    const crit = model.alerts.filter((a) => a.level === "critical");
    if (crit.length) items.push(`Critical alerts present: ${crit.map((a) => a.title).join("; ")}`);
    return items;
  }

  function renderChecklist() {
    let box = $("#sign-checklist");
    if (!box) {
      box = el("div", "sign-checklist");
      box.id = "sign-checklist";
      $("#confirm-sign .sign-ack").before(box);
    }
    const items = openItems();
    box.replaceChildren();
    if (!items.length) {
      box.append(el("p", "field-hint", "No open items."));
      return;
    }
    box.append(el("p", "sign-checklist__title", "Open items (you can still sign)"));
    const ul = el("ul", "sign-checklist__list");
    items.forEach((t) => ul.append(el("li", "", t)));
    box.append(ul);
  }

  // UAT-18: the notice must be acknowledged; the Sign button stays off until it is
  const ack = $("#ack-notice");
  const ackError = $("#ack-error");
  const signConfirm = $('#confirm-sign button[value="sign"]');
  ack.addEventListener("change", () => {
    signConfirm.disabled = !ack.checked;
    ackError.hidden = ack.checked;
  });

  confirmDialog.addEventListener("close", async () => {
    if (confirmDialog.returnValue !== "sign") return;
    if (!ack.checked) {
      ackError.hidden = false;
      confirmDialog.showModal();
      return;
    }
    const latest = ScreeningStore.getById(record.id);
    if (!Access.can("review.signoff") || latest?.status !== "in-review" || (ScreeningStore.lockActive(latest) && latest.holder.id !== user.id)) {
      const why = !Access.can("review.signoff") ? "your role can no longer sign off" : latest?.status === "reviewed" ? `it was already signed by ${latest.review?.signedBy}` : "the file changed or someone else holds it";
      showError(`Can't sign: ${why}. Nothing was saved.`);
      Audit.forRecord("signoff", record, `Sign-off refused: ${why}`);
      return;
    }
    const at = new Date().toISOString();
    const notice = $("[data-sign-notice]")?.textContent ?? "";
    const ok = await saveRecord({
      releaseLock: true,
      quiet: true,
      extra: {
        record: { status: "reviewed", signedAt: at },
        review: {
          signedBy: user.name, signedById: user.id, signedAt: at, finalNote: rv("r.note"), instructionsText: rv("r.instructions"), medications: rv("r.med.text") ?? "", ack: { at, by: user.name, text: notice },
          // Handbook section 10: snapshot of the computed results, the alerts shown and the versions used
          computed: {
            ruleset: model.ruleset, layoutVersion: record.layoutVersion ?? 1, at,
            risk: { system: model.riskSys.value, final: model.risk }, segment: { value: model.segment.value, name: model.segment.name },
            ulcers: model.ulcers.map((u) => ({ n: u.n, infection: u.infection, wagner: u.wagnerSys.value, sinbad: u.sinbadSys.value, wifi: u.wifiStage })),
            alerts: model.alerts.map((a) => ({ level: a.level, title: a.title })), disposition: model.disposition.value, teams: model.teams.map((t) => t.team),
            openItems: openItems(),
          },
        },
      },
    });
    if (!ok) return;
    Object.assign(review, record.review);
    holding = false;
    Audit.forRecord("signoff", record, "Sign-off notice acknowledged", { new: notice });
    ScreeningStore.audit("Encounter signed", record, "", "signoff");
    recordReferral();
    draft.clear();
    draft.leave();
    lock();
    renderTracker();
    window.scrollTo({ top: 0 });
  });

  // UAT-12: the referral made, or the suggestion not followed (with the reason)
  function recordReferral() {
    if (typeof Referrals === "undefined") return;
    const s = model.referral;
    try {
      if (rv("r.ref.needed") === "yes") {
        Referrals.create({ record, destination: rv("r.ref.destination"), urgency: rv("r.ref.urgency"), timing: rv("r.ref.timing"), reason: rv("r.ref.reason") ?? "", suggested: !!s && s.needed === "yes" && s.destination === rv("r.ref.destination") });
      }
      if (s?.needed === "yes" && !followedSuggestion()) {
        Referrals.decline({ record, suggestion: { tier: s.tier, destination: s.destination, urgency: s.urgency, timing: s.timing }, reason: rv("r.ref.declineReason") ?? "" });
      }
    } catch (e) {
      showError(`Signed, but the referral couldn't be recorded: ${e.message}`);
    }
  }
  const followedSuggestion = () => {
    const s = model?.referral;
    if (!s || s.needed !== "yes") return true;
    return rv("r.ref.needed") === "yes" && rv("r.ref.destination") === s.destination && rv("r.ref.timing") === s.timing;
  };

  function reopenButton() {
    if (!can.reopen || $("#reopen-review")) return;
    const b = el("button", "btn btn-outline btn-sm", "Reopen with a reason");
    b.type = "button";
    b.id = "reopen-review";
    b.addEventListener("click", async () => {
      const reason = await askReason("Reopen this signed encounter?", "The signed version stays in the history. Give the reason for the correction.", "Reopen");
      if (!reason) return;
      const stored = ScreeningStore.getById(record.id);
      if (stored.status !== "reviewed" || !Access.can("review.reopen")) {
        showError("Can't reopen: the file isn't signed any more, or your role can't reopen signed encounters.");
        return;
      }
      const next = {
        ...stored,
        status: "in-review",
        history: [...(stored.history ?? []), { at: new Date().toISOString(), by: user.name, reason, signedBy: stored.review?.signedBy, signedAt: stored.review?.signedAt, review: JSON.parse(JSON.stringify(stored.review)) }],
        review: { ...stored.review, signedBy: null, signedAt: null, ack: null, reopenedBy: user.name, reopenedAt: new Date().toISOString() },
      };
      try {
        ScreeningStore.save(next);
      } catch (e) {
        showError(e.message);
        return;
      }
      Audit.forRecord("signoff", next, "Signed encounter reopened", { reason });
      location.reload();
    });
    $("#review-signed > div").append(b);
  }

  // Small dialog that asks for a reason (required)
  function askReason(title, text, confirm) {
    let dlg = $("#reason-dialog");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "modal";
      dlg.id = "reason-dialog";
      dlg.innerHTML = '<form class="modal__inner" method="dialog"><div><h2 class="modal__title"></h2><p class="modal__description"></p></div><div class="q"><label class="label" for="reason-text">Reason</label><textarea class="input textarea" id="reason-text" rows="3"></textarea><p class="field-error" hidden><span>Enter a reason.</span></p></div><div class="modal__actions"><button type="submit" class="btn btn-outline" value="cancel">Cancel</button><button type="submit" class="btn btn-primary" value="ok"></button></div></form>';
      document.body.append(dlg);
      dlg.querySelector('button[value="ok"]').addEventListener("click", (e) => {
        if (!dlg.querySelector("textarea").value.trim()) {
          e.preventDefault();
          dlg.querySelector(".field-error").hidden = false;
          dlg.querySelector("textarea").focus();
        }
      });
    }
    dlg.querySelector(".modal__title").textContent = title;
    dlg.querySelector(".modal__description").textContent = text;
    dlg.querySelector('button[value="ok"]').textContent = confirm;
    dlg.querySelector("textarea").value = "";
    dlg.querySelector(".field-error").hidden = true;
    dlg.returnValue = "";
    dlg.showModal();
    return new Promise((resolve) => dlg.addEventListener("close", () => resolve(dlg.returnValue === "ok" ? dlg.querySelector("textarea").value.trim() : null), { once: true }));
  }

  function lock() {
    locked = true;
    ordersPanel?.update({ readOnly: true });
    $$("input, select, textarea, button", form).forEach((f) => {
      if (!f.closest(".form-section__summary") && f.id !== "toggle-sections") f.disabled = true;
    });
    $("#sign-button").hidden = true;
    $("#review-signed").hidden = false;
    $("#review-signed-text").textContent = `Signed by ${review.signedBy} on ${fmtDateTime(review.signedAt)}. Status: reviewed.${record.history?.length ? ` Reopened ${record.history.length}× before; earlier signed versions are kept in the history.` : ""}`;
    reopenButton();
    // Printing stays available after sign-off
    $("[data-print-instructions]").disabled = false;
    $("[data-print-summary]").disabled = false;
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

  // Page layout from clinic setup (UAT-13/14/15). Old encounters keep their version (EC-10).
  const layoutUI = LayoutUI.apply({ page: "review", form, record, readOnly: locked, isAnswered: (q) => isAnswered(q), extraPending: (sec) => sec.querySelectorAll('.rec-card[data-state="pending"], .rec-card[data-state="stale"]').length });
  layoutUI.fill(record);
  layoutReady = true;

  // Tests with approval and insurance status (UAT-17)
  let ordersPanel = null;
  if (typeof TestOrdersUI !== "undefined") {
    ordersPanel = TestOrdersUI.mount($("[data-test-orders]"), record, { readOnly: locked || !can.orders, suggested: [], canOrder: can.orders });
  }

  // Referral suggestion not followed: say why (UAT-12, UAT-24)
  (() => {
    const decision = $('[name="r.ref.needed"]')?.closest(".subsection");
    if (!decision) return;
    decision.insertAdjacentHTML("beforeend", LayoutUI.questionHtml({ type: "textarea", required: true }, "r.ref.declineReason", "Why not the suggested referral?"));
    const q = decision.lastElementChild;
    q.dataset.declineReason = "";
    q.hidden = true;
    q.querySelector(".label").insertAdjacentHTML("beforeend", ' <span class="label__optional">(shown in the referral report)</span>');
  })();

  update({ findings: true });
  syncToggle();

  // Typed values are a draft until saved (UAT-10)
  const draft = Drafts.attach({
    key: `review.${record.id}`,
    form,
    collect: () => ({ ...fullAnswers(), ...layoutUI.collect().answers, ...layoutUI.collect().custom }),
    saved: () => {
      const st = ScreeningStore.getById(record.id) ?? record;
      const a = { ...(st.review?.answers ?? {}) };
      if (!review.noteEdited) delete a["r.note"];
      if (!review.instructionsEdited) delete a["r.instructions"];
      const foreignSaved = Object.fromEntries(layoutUI.foreignNames.map((n) => [n, st.answers?.[n] ?? st.custom?.[n] ?? st.review?.answers?.[n]]).filter(([, v]) => v !== undefined));
      return { ...a, ...foreignSaved };
    },
    apply: (values) => {
      for (const f of form.elements) {
        if (!f.name?.startsWith("r.") || f.name === "r.note" || f.name === "r.instructions" || f.disabled) continue;
        if (f.type === "checkbox" || f.type === "radio") f.checked = false;
        else f.value = "";
      }
      for (const [n, v] of Object.entries(values)) setField(n, v);
      layoutUI.fill({ answers: values, custom: values, review: { answers: values } });
      update();
    },
    enabled: () => holding && !locked,
    save: () => saveRecord(),
    onDiscard: () => ({ patient: record.fileNumber, record: record.id, clinicId: record.clinicId }),
  });

  // Stage tracker under the page header (UAT-07)
  const header = $(".page-header");
  let trackerEl = null;
  const renderTracker = () => {
    const next = EncounterUI.tracker(ScreeningStore.getById(record.id) ?? record);
    trackerEl ? trackerEl.replaceWith(next) : header.after(next);
    trackerEl = next;
  };
  renderTracker();

  // An old copy of the page brought back with Back shows the current state (EC-05)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  });

  if (record.status === "reviewed") {
    if (review.finalNote) setField("r.note", review.finalNote);
    lock();
    renderTracker();
  } else if (viewOnly) {
    const box = el("div", "callout callout-warning", viewOnly);
    box.setAttribute("role", "status");
    trackerEl.after(box);
    // A supervisor can free the file (UAT-09)
    const latest = ScreeningStore.getById(record.id);
    if (Access.can("lock.release") && latest?.holder && latest.holder.id !== user.id) {
      const b = el("button", "btn btn-outline btn-sm", "Release lock");
      b.type = "button";
      b.addEventListener("click", async () => {
        const reason = await askReason(`Release ${latest.holder.name}'s lock?`, "They will lose the ability to save until they reopen the file. Give a reason.", "Release lock");
        if (reason && ScreeningStore.forceRelease(record.id, reason)) location.reload();
      });
      box.append(" ", b);
    }
    $$("input, select, textarea, button", form).forEach((f) => {
      if (!f.closest(".form-section__summary")) f.disabled = true;
    });
    $("#sign-button").hidden = true;
  } else {
    // Sections the role can't act on are read-only
    const lockNames = (prefix, allowed) => !allowed && $$(`[name^="${prefix}"]`, form).forEach((f) => (f.disabled = true));
    lockNames("r.orders.", can.orders);
    lockNames("r.ref.", can.referral);
    lockNames("r.sign.", can.sign);
    lockNames("r.med.", can.prescribe);
    if (!can.prescribe) $('[name="r.med.text"]')?.closest(".q")?.insertAdjacentHTML("beforeend", '<p class="field-hint">Your role can\'t prescribe medication.</p>');
    if (!can.sign) $("#sign-button").disabled = true;

    // Save / Discard next to Sign
    const actions = $(".form-actions", form);
    const line = el("span", "draft-line");
    const discardBtn = el("button", "btn btn-ghost", "Discard changes");
    discardBtn.type = "button";
    discardBtn.addEventListener("click", () => draft.discard());
    const saveBtn = el("button", "btn btn-outline", "Save");
    saveBtn.type = "button";
    saveBtn.id = "save-review";
    saveBtn.addEventListener("click", () => saveRecord());
    const buttons = el("div", "form-actions__buttons");
    buttons.append(discardBtn, saveBtn, $("#sign-button"));
    actions.append(buttons);
    $("#review-progress").after(line);
    draft.onChange(({ dirty, sections }) => {
      discardBtn.hidden = !dirty;
      line.textContent = dirty ? `Unsaved changes: ${sections.join(", ")}` : "All changes saved";
      line.classList.toggle("is-dirty", dirty);
    });
    const at = draft.restore();
    if (at) showInfo(`Your unsaved changes from ${fmtClock(at)} were restored. Save to keep them, or discard them.`);
    setInterval(() => holding && ScreeningStore.heartbeat(record.id, user), 60000);
    window.addEventListener("pagehide", () => holding && ScreeningStore.release(record.id, user));
  }
})();
