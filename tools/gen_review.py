# Generates review.html (Part 2, practitioner). Run: python tools/gen_review.py
# Static markup; data-driven parts are
# empty containers filled by scripts/review.js.
from formkit import *  # noqa: F401,F403
from formkit import SUB_ICONS, ROOT, SCHEMA, record
import json

FLASK = '<path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" /><path d="M8.5 2h7" /><path d="M7 16h10" />'
PILL = '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" />'
SCAN = '<path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />'
SEND = '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" />'
PEN = '<path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />'
CAL = '<rect width="18" height="18" x="3" y="4" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" />'
PRINT = '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" /><rect x="6" y="14" width="12" height="8" rx="1" />'
REFRESH = '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" />'

SUB_ICONS.update({
    "Nurse findings": SUB_ICONS["Encounter"],
    "Neuropathy & circulation": SUB_ICONS["Vital signs"],
    "Risk category": SUB_ICONS["Indices"],
    "Escalation": SUB_ICONS["Red flags"],
    "Ulcers": SUB_ICONS["Ulcer locations"],
    "Suggested tests": SUB_ICONS["Conditions"],
    "Haematology & chemistry": FLASK,
    "Microbiology": FLASK,
    "Bedside findings": SUB_ICONS["Pulses"],
    "Assessment": SUB_ICONS["Equipment"],
    "Infection status": SUB_ICONS["Skin temperature"],
    "Antibiotics": PILL,
    "Monitoring": SUB_ICONS["Amputation history"],
    "Standard wound care": SUB_ICONS["Ulcer history"],
    "Adjunctive therapies": SUB_ICONS["Neuropathic symptoms"],
    "Laboratory": FLASK,
    "Imaging": SCAN,
    "Referrals": SEND,
    "Confirmed conclusions": SUB_ICONS["Conditions"],
    "Impression": PEN,
    "System suggestion": SUB_ICONS["Indices"],
    "Decision": SEND,
    "Education": SUB_ICONS["Conditions"],
    "Footwear & offloading": SUB_ICONS["Footwear"],
    "Follow-up": CAL,
    "Instructions": SUB_ICONS["Patient details"],
    "Draft note": PEN,
    "Signature": PEN,
    "Medications": PILL,
    "Allergies": SUB_ICONS["Red flags"],
    "Tests": FLASK,
    "MOH segment": SUB_ICONS["Indices"],
    "Charcot foot": SUB_ICONS["Red flags"],
    "Serious infection": SUB_ICONS["Red flags"],
    "Where the patient goes now": SEND,
    "Teams to involve": SUB_ICONS["Patient details"],
})


def svg(paths):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>')


def textarea(label, name, rows=3, required=False, optional=False, error=None, hint=None):
    record({'name': name, 'label': label, 'type': 'textarea', 'required': required})
    fid = 'f-' + name.replace('.', '-')
    req = f' data-required="value" data-error="{esc(error or "Enter a value.")}"' if required else ''
    opt = ' <span class="label__optional">(optional)</span>' if optional else ''
    parts = [f'<div class="q"{req}>', f'  <label class="label" for="{fid}">{esc(label)}{opt}</label>']
    if hint:
        parts.append(f'  <p class="field-hint">{esc(hint)}</p>')
    parts.append(f'  <textarea class="input textarea" id="{fid}" name="{name}" rows="{rows}"></textarea>')
    if required:
        parts.append(ind(error_p(), 2))
    parts.append('</div>')
    return '\n'.join(parts)


def text_input(label, name, required=False, optional=False, error=None, hint=None):
    record({'name': name, 'label': label, 'type': 'text', 'required': required})
    fid = 'f-' + name.replace('.', '-')
    req = f' data-required="value" data-error="{esc(error or "Enter a value.")}"' if required else ''
    opt = ' <span class="label__optional">(optional)</span>' if optional else ''
    parts = [f'<div class="q"{req}>', f'  <label class="label" for="{fid}">{esc(label)}{opt}</label>',
             f'  <input class="input" id="{fid}" name="{name}" autocomplete="off" />']
    if hint:
        parts.append(f'  <p class="field-hint">{esc(hint)}</p>')
    if required:
        parts.append(ind(error_p(), 2))
    parts.append('</div>')
    return '\n'.join(parts)


YN = [('yes', 'Yes'), ('no', 'No')]

# ---------- 1 Screening findings ----------
begin("findings")
s1 = sub("Nurse findings", '''<p class="field-hint">Nurse entries from Part 1. Correcting a value keeps the original visible, with who changed it and when.</p>
<div class="findings" data-findings></div>''')

# ---------- 2 Recommendations ----------
begin("recommendations")
s2 = '\n\n'.join([
    sub("Neuropathy & circulation", '<p class="field-hint">Draft rules: confirm or override each foot. The risk category is calculated from your decisions.</p>\n<div class="rec-grid" data-recs="foot"></div>'),
    sub("Risk category", '<div class="rec-grid" data-recs="risk"></div>'),
    sub("MOH segment", '<p class="field-hint">Recomputed from the findings on every change. It drives the suggested referral; it is never typed by hand.</p>\n<div class="segment-card" data-segment></div>'),
])

# ---------- 3 Wound evaluation ----------
begin("wound")
ONSET = [('lt1w', '< 1 week'), ('1-4w', '1–4 weeks'), ('1-3m', '1–3 months'), ('gt3m', '> 3 months')]
WTYPE = [('neuropathic', 'Neuropathic'), ('ischaemic', 'Ischaemic'), ('neuroischaemic', 'Neuro-ischaemic'),
         ('pressure', 'Pressure'), ('trauma', 'Trauma'), ('surgical', 'Surgical'), ('other', 'Other')]


def wound_card(n):
    p = f'r.w.{n}'
    return f'''<fieldset class="ulcer-card wound-card" data-wound="{n}" hidden>
  <legend class="foot-card__title">Ulcer {n} · <span data-wound-location></span></legend>
{ind(q_choice("Onset / duration", f"{p}.onset", ONSET, error="Choose the onset."), 2)}
{ind(q_choice("Type / cause", f"{p}.type", WTYPE, error="Choose the ulcer type."), 2)}
{ind(q_choice("Progression", f"{p}.progression", [("improving", "Improving"), ("static", "Static"), ("worsening", "Worsening")], required=False), 2)}
  <div class="q-row">
{ind(q_number("Length", f"{p}.length", "cm", min_=0.1, max_=40, step="0.1", error="Enter the length (0.1–40 cm)."), 4)}
{ind(q_number("Width", f"{p}.width", "cm", min_=0.1, max_=40, step="0.1", error="Enter the width (0.1–40 cm)."), 4)}
{ind(q_number("Depth", f"{p}.depth", "cm", min_=0, max_=10, step="0.1", error="Enter the depth (0–10 cm)."), 4)}
  </div>
  <div class="q-row">
{ind(q_number("Previous area", f"{p}.prevArea", "cm²", required=False, min_=0, max_=1600, step="0.1", hint="From the last visit, to track healing."), 4)}
{ind(q_number("Weeks of standard care", f"{p}.weeksCare", "weeks", required=False, min_=0, max_=520, step="1"), 4)}
  </div>
{ind(q_choice("Tissue bed", f"{p}.tissue", [("granulation", "Granulation"), ("slough", "Slough"), ("necrosis", "Necrosis / eschar"), ("epithelialising", "Epithelialising")], kind="checkbox", error="Choose the tissue types present."), 2)}
  <div class="q-row q-row--4">
{ind(q_number("Granulation", f"{p}.share.granulation", "%", required=False, min_=0, max_=100, step="5"), 4)}
{ind(q_number("Slough", f"{p}.share.slough", "%", required=False, min_=0, max_=100, step="5"), 4)}
{ind(q_number("Necrosis", f"{p}.share.necrosis", "%", required=False, min_=0, max_=100, step="5"), 4)}
{ind(q_number("Epithelialising", f"{p}.share.epithelialising", "%", required=False, min_=0, max_=100, step="5"), 4)}
  </div>
{ind(q_choice("Exudate volume", f"{p}.exudate", [("none", "None"), ("low", "Low"), ("moderate", "Moderate"), ("high", "High")], required=False), 2)}
{ind(q_choice("Exudate type", f"{p}.exudateType", [("serous", "Serous"), ("sanguineous", "Sanguineous"), ("purulent", "Purulent")], required=False), 2)}
{ind(q_choice("Exudate viscosity", f"{p}.viscosity", [("thin", "Thin"), ("thick", "Thick")], required=False), 2)}
{ind(q_choice("Odour", f"{p}.odour", [("yes", "Yes"), ("no", "No")], required=False), 2)}
  <div class="q">
    <label class="label" for="f-r-w-{n}-pain">Pain score <output class="range-value" for="f-r-w-{n}-pain" data-range-output>0</output><span class="range-max">/ 10</span></label>
    <input class="range" id="f-r-w-{n}-pain" name="{p}.pain" type="range" min="0" max="10" step="1" value="0" />
  </div>
{ind(q_choice("Local infection signs", f"{p}.signs", [("swelling", "Swelling / induration"), ("erythema", "Erythema"), ("tenderness", "Tenderness"), ("warmth", "Warmth"), ("purulent", "Purulent discharge"), ("none", "None")], kind="checkbox", exclusive="none", error="Choose the signs, or “None”."), 2)}
{ind(q_number("Erythema extent from wound edge", f"{p}.erythema", "cm", required=False, min_=0, max_=50, step="0.5"), 2)}
{ind(q_choice("Probe-to-bone", f"{p}.ptb", [("yes", "Positive"), ("no", "Negative")], error="Record the probe-to-bone result."), 2)}
{ind(q_choice("Exposed structure", f"{p}.exposed", [("tendon", "Tendon"), ("joint", "Joint"), ("bone", "Bone"), ("none", "None")], kind="checkbox", exclusive="none", error="Choose exposed structures, or “None”."), 2)}
  <!-- assumed: gangrene is not in the spec but Wagner and WIfI need it -->
{ind(q_choice("Abscess", f"{p}.abscess", [("yes", "Yes"), ("no", "No")], error="Record whether there is an abscess.", hint="MOH: Wagner 3, moderate infection and acute foot attack all include abscess."), 2)}
{ind(q_choice("Gangrene", f"{p}.gangrene", [("none", "None"), ("digits", "Limited to digits"), ("forefoot", "Forefoot or midfoot"), ("whole", "Whole foot")], error="Record gangrene."), 2)}
{ind(q_choice("Osteomyelitis", f"{p}.osteomyelitis", [("no", "Not suspected"), ("suspected", "Suspected"), ("confirmed", "Confirmed")], error="Record osteomyelitis status."), 2)}
  <div class="wound-hints" data-wound-hints="{n}"></div>
  <div class="rec-grid" data-recs="wound-{n}"></div>
</fieldset>'''


S3_CHARCOT = sub("Charcot foot", '\n'.join([
    '<p class="field-hint" data-charcot-reason></p>',
    q_choice("Eichenholtz stage", "r.charcot.stage", [("0", "0"), ("I", "I"), ("II", "II"), ("III", "III")], required=False),
    q_choice("X-ray result", "r.charcot.xray", [("not-done", "Not done yet"), ("normal", "Normal"), ("abnormal", "Abnormal")], required=False),
]), reveal="charcot")
s3 = sub("Ulcers", f'''<p class="field-hint" data-no-wounds hidden>No ulcers recorded by the nurse. Nothing to evaluate.</p>
<div class="wound-list">
{ind(wound_card(1), 2)}
{ind(wound_card(2), 2)}
{ind(wound_card(3), 2)}
</div>''')

s3 = s3 + '\n\n' + S3_CHARCOT

# ---------- 4 Labs ----------
begin("labs")
LAB_ROWS = [('wbc', 'WBC', '×10⁹/L', '4.5–11'),
            ('hb', 'Haemoglobin', 'g/dL', 'male 13.8–17.2, female 12.1–15.1 (MOH Table 7)'),
            ('platelets', 'Platelets', '×10⁹/L', '150–400 (DF102; MOH Table 7 gives 450 as the upper limit)'),
            ('fbg', 'Fasting glucose', 'mg/dL', '70–100'), ('hba1c', 'HbA1c', '%', 'target < 7'),
            ('urea', 'Urea', 'mg/dL', None),
            ('creatinine', 'Creatinine', 'mg/dL', 'male 0.74–1.35, female 0.59–1.04 (MOH Table 7)'),
            ('egfr', 'eGFR', 'mL/min/1.73 m²', None),
            ('crp', 'CRP', 'mg/L', '< 10'),
            ('esr', 'ESR', 'mm/hr', '< 20'), ('procalcitonin', 'Procalcitonin', 'ng/mL', '< 0.1'),
            ('lactate', 'Lactate', 'mmol/L', '< 2'), ('albumin', 'Albumin', 'g/L', '35–50')]


def lab_field(key, label, unit, ref):
    fid = f'f-r-lab-{key}'
    hint = f'Reference {ref}' if ref else 'No reference range in the source documents'
    return f'''<div class="q lab-field" data-lab="{key}">
  <label class="label" for="{fid}">{esc(label)} <span class="badge lab-flag" data-lab-flag hidden></span></label>
  <div class="input-unit">
    <input class="input" id="{fid}" name="r.lab.{key}" type="number" inputmode="decimal" step="any" min="0" />
    <span class="input-unit__suffix">{esc(unit)}</span>
  </div>
  <p class="field-hint">{esc(hint)}</p>
</div>'''


s4 = '\n\n'.join([
    sub("Suggested tests", '<p class="field-hint" data-suggested-empty>Suggestions appear when the nurse recorded an ulcer.</p>\n<div class="suggest-list" data-suggested></div>'),
    sub("Haematology & chemistry", '<p class="field-hint">Reference ranges from the Diabetic Foot 102 deck and MOH Table 7; sex-specific ranges use the patient record. WBC feeds the SIRS count.</p>\n<div class="lab-grid">\n' + ind('\n'.join(lab_field(*r) for r in LAB_ROWS), 2) + '\n</div>'),
    sub("Microbiology", '\n'.join([
        text_input("Wound culture result", "r.lab.culture", optional=True),
        text_input("Bone / blood culture result", "r.lab.deepCulture", optional=True),
    ])),
])

# ---------- 5 PAD ----------
begin("pad")
s5 = '\n\n'.join([
    sub("Bedside findings", '<div class="pad-summary" data-pad-summary></div>'),
    sub("Assessment", '\n'.join([
        q_choice("PAD conclusion", "r.pad.conclusion", [("no-pad", "No PAD"), ("pad", "PAD"), ("clti", "Chronic limb-threatening ischaemia")], error="Record the PAD conclusion."),
        '<div class="callout callout-danger" data-alert="severe-ischaemia" hidden>\n  ' + WARN_SVG + '\n  <div><strong>Severe ischaemia</strong><p data-severe-text></p></div>\n</div>',
        textarea("Vascular notes", "r.pad.notes", rows=2, optional=True),
    ])),
])

# ---------- 6 Infection ----------
begin("infection")
s6 = '\n\n'.join([
    sub("Infection status", '<div class="infection-summary" data-infection-summary></div>\n<div class="callout callout-warning" data-allergies hidden>\n  ' + WARN_SVG + '\n  <div><strong>Allergies</strong><p data-allergy-text></p></div>\n</div>'),
    sub("Serious infection", q_choice("Indicators of serious infection", "r.inf.serious", [
        ("spreading", "Rapidly spreading cellulitis or lymphangitis"), ("crepitus", "Crepitus"), ("bullae", "Bullae"),
        ("discoloration", "Skin discoloration"), ("necrosis", "Necrosis or gangrene"), ("ecchymoses", "Ecchymoses or petechiae"),
        ("new-pain", "New localised pain"), ("systemic", "Fever, chills, hypotension or confusion"), ("ischaemia", "Severe foot ischaemia"),
        ("iv", "Needs IV antibiotics"), ("surgery", "Needs urgent surgery"), ("deteriorating", "Deteriorating despite therapy"), ("none", "None"),
    ], kind="checkbox", exclusive="none", required=False)),
    sub("Antibiotics", '\n'.join([
        '<p class="field-hint" data-antibiotic-hint></p>',
        q_choice("Antibiotic plan", "r.inf.antibiotics", [("none", "No antibiotics"), ("oral", "Oral empiric"), ("iv", "IV / parenteral")], error="Choose the antibiotic plan."),
        '<div class="reveal" data-reveal="antibiotic-detail" hidden>',
        ind(text_input("Agent and dose", "r.inf.agent", required=True, error="Enter the agent and dose."), 2),
        ind(q_number("Planned duration", "r.inf.days", "days", required=False, min_=1, max_=90, step="1"), 2),
        '</div>',
    ])),
    sub("Monitoring", '\n'.join([
        q_choice("Culture taken before antibiotics?", "r.inf.culture", [("yes", "Yes"), ("no", "No"), ("na", "Not applicable")], required=False),
        q_choice("Follow-up", "r.inf.reassess", [("24-48h", "Reassess in 24–48 h")], kind="checkbox", required=False),
        q_choice("Hospital admission needed?", "r.inf.admit", YN, required=False),
    ])),
])

# ---------- Medications (UAT-16) ----------
begin("medications")
s_med = sub("Medications", '\n'.join([
    '<div class="allergy-box" data-med-allergies></div>',
    textarea("Medication, dose and instructions", "r.med.text", rows=5, optional=True,
             hint="Free text, one medication per line. Appears in the clinical note and the patient file."),
]))

# ---------- 7 Adjunctive ----------
begin("adjunct")
s7 = '\n\n'.join([
    sub("Standard wound care", '\n'.join([
        q_choice("Debridement", "r.std.debridement", [("none", "None"), ("sharp", "Sharp"), ("enzymatic", "Enzymatic"), ("autolytic", "Autolytic"), ("mechanical", "Mechanical")], required=False),
        q_choice("Offloading", "r.std.offloading", [("none", "None"), ("tcc", "Total contact cast"), ("walker", "Removable walker"), ("felt", "Felt padding"), ("custom", "Custom shoes / insoles")], required=False),
        text_input("Dressing", "r.std.dressing", optional=True),
    ])),
    sub("Adjunctive therapies", '\n'.join([
        '<p class="field-hint" data-adjunct-hint>Consider only after 4–6 weeks without progress despite optimal standard care (DF102).</p>',
        q_choice("Therapies", "r.adj", [("npwt", "NPWT"), ("hbot", "HBOT"), ("topical-o2", "Topical oxygen"), ("growth-factors", "Growth factors / placental products"), ("prp", "PRP"), ("none", "None")], kind="checkbox", required=False, exclusive="none"),
        '<div class="callout callout-warning" data-adjunct-warning hidden>\n  ' + WARN_SVG + '\n  <div data-adjunct-warning-text></div>\n</div>',
    ])),
])

# ---------- 8 Orders ----------
begin("orders")
LAB_ORDERS = [("cbc", "CBC"), ("esr", "ESR"), ("crp", "CRP"), ("fbg", "Fasting blood glucose"), ("hba1c", "HbA1c"),
              ("creatinine", "Renal function (urea, creatinine, eGFR)"), ("wound-culture", "Wound culture (C&S)"), ("procalcitonin", "Procalcitonin"),
              ("bone-culture", "Bone culture"), ("blood-culture", "Blood cultures"), ("lactate", "Lactate"), ("albumin", "Albumin")]
s8 = '\n\n'.join([
    sub("Tests", '\n'.join([
        '<p class="field-hint">Laboratory and imaging. Some tests need approval or insurance approval before they go ahead; their status shows here.</p>',
        '<div class="test-orders" data-test-orders></div>',
        text_input("Other tests (free text)", "r.orders.labsOther", optional=True),
    ])),
    sub("Referrals", q_choice("Referral orders", "r.orders.referrals", [("podiatry", "Podiatry / wound care"), ("vascular", "Vascular"), ("id-surgical", "Infectious disease / surgical"), ("orthotic", "Footwear / orthotic")], kind="checkbox", required=False)),
])

# ---------- 9 Interpretation ----------
begin("interpretation")
s9 = '\n\n'.join([
    sub("Confirmed conclusions", '<dl class="detail-grid detail-grid--plain" data-interp-summary></dl>'),
    sub("Impression", '\n'.join([
        text_input("Deformity / skin diagnosis", "r.int.skin", optional=True),
        textarea("Clinical impression", "r.int.impression", rows=3, required=True, error="Write your clinical impression."),
    ])),
])

# ---------- 10 Referral ----------
begin("referral")
s10 = '\n\n'.join([
    sub("Where the patient goes now", '<div class="suggestion" data-disposition></div>'),
    sub("Teams to involve", '<ul class="team-list" data-teams></ul>'),
    sub("System suggestion", f'''<div class="suggestion" data-ref-suggestion>
  <div data-ref-suggestion-text></div>
  <button type="button" class="btn btn-outline" data-apply-referral>Apply suggestion</button>
</div>'''),
    sub("Decision", '\n'.join([
        q_choice("Referral needed?", "r.ref.needed", YN, error="Choose whether a referral is needed."),
        '<div class="reveal" data-reveal="referral" hidden>',
        ind(q_choice("Destination", "r.ref.destination", [("er", "Emergency department"), ("tertiary", "Tertiary"), ("secondary", "Secondary Care"), ("vascular", "Vascular"), ("wound-care", "Wound Care"), ("private", "Private Center")], error="Choose the destination."), 2),
        ind(q_choice("Urgency", "r.ref.urgency", [("routine", "Routine"), ("soon", "Soon"), ("urgent", "Urgent"), ("emergency", "Emergency")], error="Choose the urgency."), 2),
        ind(q_choice("Timing", "r.ref.timing", [("today", "Today"), ("24h", "≤ 24 h"), ("week", "≤ 1 week"), ("3weeks", "≤ 3 weeks"), ("scheduled", "Scheduled")], error="Choose the timing."), 2),
        ind(text_input("Reason for referral", "r.ref.reason", optional=True), 2),
        '</div>',
    ])),
])

# ---------- 11 Plan ----------
begin("plan")
s11 = '\n\n'.join([
    sub("Education", q_choice("Advice given", "r.plan.education", [("foot-care", "Foot-care education"), ("self-check", "Daily self-check"), ("footwear", "Footwear advice"), ("glycaemic", "Glycaemic control reviewed")], kind="checkbox", error="Record the advice given.")),
    sub("Footwear & offloading", text_input("Footwear / offloading plan", "r.plan.offloading", optional=True)),
    sub("Follow-up", '\n'.join([
        '<p class="field-hint" data-followup-suggestion></p>',
        q_choice("Follow-up interval", "r.plan.followup", [("48h", "48 hours"), ("1w", "1 week"), ("2w", "2 weeks"), ("1m", "1 month"), ("1-2m", "1–2 months"), ("1-3m", "1–3 months"), ("3-6m", "3–6 months"), ("6-12m", "6–12 months"), ("12m", "12 months")], error="Choose the follow-up interval."),
        q_choice("Patient / carer", "r.plan.safetynet", [("understood", "Understands the plan and safety-net advice given")], kind="checkbox", error="Confirm the safety-net advice."),
    ])),
])

# ---------- 12 Instructions ----------
begin("instructions")
s12 = sub("Instructions", f'''<div class="note-toolbar">
  <span class="badge badge-muted" data-instructions-edited hidden>Edited</span>
  <button type="button" class="btn btn-outline" data-regenerate="instructions">{svg(REFRESH)}Regenerate</button>
  <button type="button" class="btn btn-outline" data-print-instructions>{svg(PRINT)}Print / PDF</button>
</div>
<div class="q">
  <label class="label" for="f-r-instructions">Patient instructions</label>
  <textarea class="input textarea textarea--doc" id="f-r-instructions" name="r.instructions" rows="12"></textarea>
</div>''')

# ---------- 13 Note ----------
begin("note")
s13 = sub("Draft note", f'''<div class="note-toolbar">
  <span class="badge badge-muted" data-note-edited hidden>Edited</span>
  <button type="button" class="btn btn-outline" data-regenerate="note">{svg(REFRESH)}Regenerate</button>
  <button type="button" class="btn btn-outline" data-print-summary>{svg(PRINT)}Print / PDF</button>
</div>
<p class="field-hint">Built from the findings, decisions and plan. Regenerating replaces your edits.</p>
<div class="q">
  <label class="label" for="f-r-note">Clinical note</label>
  <textarea class="input textarea textarea--doc" id="f-r-note" name="r.note" rows="18"></textarea>
</div>''')

# ---------- 14 Sign-off ----------
begin("signoff")
SIGN_NOTICE = "The suggestions and proposed tests in this system are generated from rules set by the clinic's senior doctor for general cases. They are decision support only. The signing practitioner remains fully responsible for all clinical decisions."
s14 = sub("Signature", '\n'.join([
    f'<div class="callout callout-info sign-notice"><div><strong>Before you sign</strong><p data-sign-notice>{esc(SIGN_NOTICE)}</p></div></div>',
    '''<dl class="detail-grid detail-grid--plain">
  <div><dt>Assessor</dt><dd data-assessor></dd></div>
  <div><dt>Role</dt><dd data-assessor-role></dd></div>
  <div><dt>Date / time</dt><dd data-sign-time></dd></div>
</dl>''',
    q_choice("Clinical note", "r.sign.reviewed", [("yes", "I have reviewed the clinical note")], kind="checkbox", error="Confirm you reviewed the note."),
    text_input("Signature", "r.sign.name", required=True, error="Type your full name to sign.", hint="Type your full name exactly as shown above."),
]))

SECTIONS_KEYED = [
    ('findings', 'Screening Findings', s1), ('recommendations', 'System Recommendations', s2), ('wound', 'Wound Evaluation', s3),
    ('labs', 'Lab Results', s4), ('pad', 'Peripheral Arterial Disease', s5), ('infection', 'Infection Management', s6),
    ('medications', 'Medications', s_med), ('adjunct', 'Adjunctive Therapies', s7), ('orders', 'Orders', s8),
    ('interpretation', 'Clinical Interpretation', s9), ('referral', 'Referral Decision', s10), ('plan', 'Plan', s11),
    ('instructions', 'Patient Instructions', s12), ('note', 'Clinical Note', s13), ('signoff', 'Sign-off', s14),
]
# Numbered in order; data-key is the stable id used by the page layout settings (UAT-13/14)
sections_html = '\n\n'.join(
    section(str(i), t, b, open_=(i <= 2)).replace(f'data-section="{i}"', f'data-section="{i}" data-key="{k}"', 1)
    for i, (k, t, b) in enumerate(SECTIONS_KEYED, 1))

# ---------- Page ----------
src = open(ROOT + 'diabetic-foot.html', encoding='utf-8').read()
head_and_header = src[:src.index('    <main class="page-content')]
assert '<title>Diabetic Foot · N-DFIP</title>' in head_and_header
head_and_header = head_and_header.replace('<title>Diabetic Foot · N-DFIP</title>', '<title>Practitioner Review · N-DFIP</title>')
clinic_guard = 'Access.guardPage(["patients.view"], "the clinic page");'
assert head_and_header.count(clinic_guard) == 1
head_and_header = head_and_header.replace(clinic_guard, 'Access.guardPage(["review.queue"], "the practitioner review");')
guard_old = '      if (!Auth.getSessionId()) window.location.replace(Auth.LOGIN_PAGE);\n'
assert head_and_header.count(guard_old) == 1
head_and_header = head_and_header.replace(guard_old, guard_old + '''      // Needs a screening id: review.html?id=…
      else if (!new URLSearchParams(location.search).get("id")) window.location.replace("./diabetic-foot.html");
''')

page = head_and_header + f'''    <main class="page-content page-content--with-actions">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="./home.html">Home</a>
        <span aria-hidden="true">/</span>
        <a href="./diabetic-foot.html">Diabetic Foot</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Practitioner Review</span>
      </nav>

      <div class="page-header page-header--split">
        <h1 class="page-title">Practitioner Review</h1>
        <div class="page-header__actions">
          <span class="badge" id="review-status"></span>
          <button type="button" class="btn btn-outline" id="toggle-sections">Expand all</button>
        </div>
      </div>

      <div class="callout callout-success" id="review-signed" hidden>
        {svg('<path d="M20 6 9 17l-5-5" />')}
        <div><strong>Signed and locked</strong><p id="review-signed-text"></p></div>
      </div>

      <!-- Patient -->
      <section class="patient-summary" aria-labelledby="patient-name">
        <div class="patient-summary__header">
          <span class="patient-avatar" data-field="initials" aria-hidden="true"></span>
          <div class="patient-summary__identity">
            <h2 class="patient-summary__name" id="patient-name" data-field="name"></h2>
            <dl class="patient-meta">
              <div><dt>File no.</dt><dd data-field="fileNumber"></dd></div>
              <div><dt>National ID</dt><dd data-field="nationalId"></dd></div>
              <div><dt>Age</dt><dd data-field="age"></dd></div>
              <div><dt>Sex</dt><dd data-field="sex"></dd></div>
              <div><dt>Diabetes</dt><dd data-field="diabetes"></dd></div>
              <div><dt>Last HbA1c</dt><dd data-field="hba1c"></dd></div>
            </dl>
          </div>
        </div>
        <div class="patient-summary__badges">
          <span class="badge badge-secondary" data-field="careLevel"></span>
          <span class="badge badge-secondary" data-field="allergies"></span>
          <span class="badge badge-muted" data-field="screenedBy"></span>
        </div>
      </section>

      <!-- Clinical alerts: kept at the top so urgent concerns are seen first -->
      <section class="alerts-panel" aria-labelledby="alerts-title">
        <h2 class="alerts-panel__title" id="alerts-title">{svg(SUB_ICONS["Red flags"])}Clinical alerts</h2>
        <ul class="flag-list" id="review-alerts" aria-live="polite"></ul>
        <p class="field-hint" id="review-alerts-empty" hidden>No alerts.</p>
      </section>

      <form class="screening-form" id="review-form" novalidate>
{ind(sections_html, 8)}

        <div class="form-actions">
          <p class="form-actions__progress" id="review-progress" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary" id="sign-button">
            {svg(PEN)}
            Sign and complete
          </button>
        </div>
      </form>
    </main>

    <!-- Confirm sign-off -->
    <dialog class="modal" id="confirm-sign" aria-labelledby="confirm-sign-title">
      <form class="modal__inner" method="dialog">
        <div>
          <h2 class="modal__title" id="confirm-sign-title">Sign and complete this review?</h2>
          <p class="modal__description" id="confirm-sign-text"></p>
        </div>
        <div class="sign-ack">
          <p class="sign-ack__text">{esc(SIGN_NOTICE)}</p>
          <label class="check-row"><input type="checkbox" class="checkbox" id="ack-notice" /><span>I have read and acknowledge this notice</span></label>
          <p class="field-error" id="ack-error" hidden>{ERR_SVG}<span>Acknowledge the notice to sign.</span></p>
        </div>
        <div class="modal__actions">
          <button type="submit" class="btn btn-outline" value="cancel">Keep editing</button>
          <button type="submit" class="btn btn-primary" value="sign">Sign</button>
        </div>
      </form>
    </dialog>

    <script src="./scripts/user-menu.js"></script>
    <script src="./scripts/patients.js"></script>
    <script src="./scripts/screening-schema.js"></script>
    <script src="./scripts/screening-store.js"></script>
    <script src="./scripts/clinical-rules.js"></script>
    <script src="./scripts/review-schema.js"></script>
    <script src="./scripts/layout.js"></script>
    <script src="./scripts/drafts.js"></script>
    <script src="./scripts/test-orders-ui.js"></script>
    <script src="./scripts/encounters-ui.js"></script>
    <script src="./scripts/review.js"></script>
  </body>
</html>
'''
open(ROOT + 'review.html', 'w', encoding='utf-8', newline='').write(page)

review_fields = [f for f in SCHEMA if f['name'].startswith('r.') and not f['name'].startswith('r.sign.')]
review_js = ('// GENERATED by tools/gen_review.py. Do not edit by hand.' + chr(10)
             + '// Part 2 (practitioner) sections and fields, used by the page layout settings.' + chr(10)
             + 'const ReviewSchema = ' + json.dumps({'sections': {k: t for k, t, _ in SECTIONS_KEYED}, 'fields': review_fields}, ensure_ascii=False, indent=1) + ';' + chr(10))
open(ROOT + 'scripts/review-schema.js', 'w', encoding='utf-8', newline='').write(review_js)
print('review fields', len(review_fields))
print('ok', len(page))
