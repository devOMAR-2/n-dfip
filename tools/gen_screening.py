# Generates screening.html (Part 1, nurse) and scripts/screening-schema.js.
# Run from anywhere: python tools/gen_screening.py
import json
from formkit import *  # noqa: F401,F403
from formkit import SCHEMA, ROOT, SUB_ICONS

# Handbook section 4 additions
SUB_ICONS.update({
    "General condition": SUB_ICONS["Patient details"],
    "Medications & allergies": '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" />',
    "Claudication & rest pain": SUB_ICONS["Claudication"],
})

src = open(ROOT + 'screening.html', encoding='utf-8').read()
head_and_header = src[:src.index('    <main class="page-content')]

SENS = [('detected', 'Detected'), ('absent', 'Absent'), ('not-assessed', 'Not assessed')]
YN = [('yes', 'Yes'), ('no', 'No')]

# ---------- A ----------
begin("A")
a_body = '\n\n'.join([
    sub("Patient details", f'''<dl class="detail-grid detail-grid--plain" data-prefill="patient">
  <div><dt>Patient</dt><dd data-p="name"></dd></div>
  <div><dt>File no.</dt><dd data-p="fileNumber"></dd></div>
  <div><dt>Date of birth</dt><dd data-p="dob"></dd></div>
  <div><dt>Sex</dt><dd data-p="sex"></dd></div>
  <div><dt>Diabetes</dt><dd data-p="diabetes"></dd></div>
  <div><dt>Last HbA1c</dt><dd data-p="hba1c"></dd></div>
</dl>
<p class="field-hint">Pulled from the patient record.</p>
{q_choice("Patient details confirmed?", "a.confirmed", [("yes", "Yes, details are correct"), ("needs-update", "Needs update")], error="Confirm the patient details.")}'''),
    sub("Vital signs", f'''<div class="q-row">
{ind(q_number("Temperature", "a.temp", "°C", min_=30, max_=45, step="0.1", error="Enter a temperature between 30 and 45 °C."), 2)}
{ind(q_number("Heart rate", "a.hr", "bpm", min_=20, max_=250, step="1", error="Enter a heart rate between 20 and 250 bpm."), 2)}
{ind(q_number("Respiratory rate", "a.rr", "/min", min_=4, max_=60, step="1", error="Enter a respiratory rate between 4 and 60 /min."), 2)}
{ind(q_number("Systolic blood pressure", "a.sbp", "mmHg", min_=50, max_=260, step="1", error="Enter a systolic pressure between 50 and 260 mmHg."), 2)}
{ind(q_number("Capillary glucose", "a.glucose", "mg/dL", required=False, min_=20, max_=600, step="1"), 2)}
</div>
<div class="callout callout-danger" data-alert="sirs" hidden>
  {WARN_SVG}
  <div><strong>2 or more SIRS signs</strong><p>Possible systemic infection (temperature &gt; 38 or &lt; 36 °C, HR &gt; 90, RR &gt; 20). The practitioner will be alerted when you send.</p></div>
</div>'''),
    sub("General condition", '\n'.join([
        q_choice("General appearance", "a.appearance", [("well", "Well"), ("unwell", "Unwell")], error="Record how the patient looks."),
        q_choice("Mobility", "a.mobility", [("independent", "Independent"), ("walking-aid", "Walking aid"), ("wheelchair", "Wheelchair")], error="Record the patient's mobility."),
        q_choice("Social support", "a.support", [("family-carer", "Family or carer"), ("lives-alone", "Lives alone")], required=False),
    ])),
    sub("Encounter", f'''{q_choice("Reason for screening", "a.reason", [("annual-review", "Annual review"), ("new-diagnosis", "New diagnosis"), ("foot-problem", "Foot problem")], error="Choose the reason for screening.")}
<div class="q">
  <label class="label" for="f-a-complaint">Current complaint <span class="label__optional">(optional)</span></label>
  <textarea class="input textarea" id="f-a-complaint" name="a.complaint" rows="2"></textarea>
</div>'''),
])

# ---------- B ----------
begin("B")
b_body = '\n\n'.join([
    sub("Conditions", f'''<p class="field-hint">Pre-filled from the record. Update anything that has changed.</p>
{q_choice("Risk history", "b.history", [
    ("ckd", "Chronic kidney disease"),
    ("dialysis", "Dialysis or end-stage renal disease"),
    ("previous-charcot", "Previous Charcot foot"),
    ("cardiovascular", "Cardiovascular disease"),
    ("hypertension", "Hypertension"),
    ("dyslipidaemia", "Dyslipidaemia"),
    ("retinopathy", "Retinopathy"),
    ("immunosuppression", "Immunosuppression"),
    ("pad", "PAD / revascularisation"),
    ("neuropathy", "Neuropathy diagnosed"),
    ("poor-vision", "Poor vision / self-care limitation"),
], kind="checkbox", required=False)}'''),
    sub("Smoking", q_choice("Smoking status", "b.smoking", [("never", "Never"), ("former", "Former"), ("current", "Current")], required=False)),
    sub("Medications & allergies", '\n'.join([
        q_choice("Current medications", "b.meds", [("insulin", "Insulin"), ("oral", "Oral agents"), ("antiplatelet", "Antiplatelet"), ("statin", "Statin"), ("anticoagulant", "Anticoagulant"), ("antibiotics", "Antibiotics now"), ("none", "None")], kind="checkbox", exclusive="none", error="Record the current medications, or None."),
        q_choice("Antibiotic allergy", "b.allergy", [("none", "None known"), ("beta-lactam", "Beta-lactam (penicillin, cephalosporin)"), ("other", "Other")], error="Record any antibiotic allergy."),
    ])),
])

# ---------- C ----------
SITES = [('hallux', 'Hallux (plantar)'), ('mth1', '1st metatarsal head'), ('mth5', '5th metatarsal head')]


def c_sensation(side, label):
    chips_html = '\n'.join(q_choice(site_label, f'c.{side}.{site}', SENS, error=f"Record {site_label.lower()}, {label.lower()}.")
                           for site, site_label in SITES)
    return f'''<div class="sens-layout">
{ind(sensation_map(side, label), 2)}
  <div class="sens-layout__fields">
{ind(chips_html, 4)}
  </div>
</div>'''


def c_vibration(side, label):
    return '\n'.join([
        q_choice("128 Hz tuning fork (dorsal hallux)", f'c.{side}.vibration',
                 [("present", "Present"), ("reduced", "Reduced"), ("absent", "Absent"), ("not-assessed", "Not assessed")],
                 error=f"Record the tuning fork result, {label.lower()}."),
        q_number("Vibration perception threshold", f'c.{side}.vpt', "V", required=False, min_=0, max_=60, step="0.5",
                 hint="Only if a VPT device is available."),
    ])


begin("C")
c_body = '\n\n'.join([
    sub("Test method", q_choice("Sensation test method", "c.method", [("monofilament", "10 g monofilament"), ("light-touch", "Light touch (no monofilament)")], error="Choose the test method.", hint="Light touch: fingertip on each toe tip for 1–2 s (MOH fallback when no monofilament or tuning fork).")),
    sub("Protective sensation", per_foot(c_sensation, SOLE_FEET) + '\n' + SENS_LEGEND),
    sub("Vibration", per_foot(c_vibration)),
    sub("Neuropathic symptoms", f'''{q_choice("Symptoms reported", "c.symptoms", [
    ("numbness", "Numbness"),
    ("burning", "Burning pain"),
    ("tingling", "Pins and needles / tingling"),
    ("electric", "Electric-shock pain"),
    ("allodynia", "Allodynia / hypersensitivity"),
    ("none", "No neuropathic symptoms"),
], kind="checkbox", exclusive="none", error="Choose the symptoms, or “No neuropathic symptoms”.")}
<div class="reveal" data-reveal="symptoms" hidden>
  <div class="q">
    <label class="label" for="f-c-severity">Symptom severity <output class="range-value" for="f-c-severity" data-range-output>5</output><span class="range-max">/ 10</span></label>
    <input class="range" id="f-c-severity" name="c.severity" type="range" min="0" max="10" step="1" value="5" />
  </div>
{ind(q_choice("Worse at night?", "c.night", YN, error="Answer whether symptoms are worse at night."), 2)}
</div>'''),
])

# ---------- D ----------
PULSE = [('present', 'Present'), ('weak', 'Weak'), ('absent', 'Absent'), ('not-assessed', 'Not assessed')]


def d_pulses(side, label):
    return '\n'.join([
        q_choice("Dorsalis pedis", f'd.{side}.dp', PULSE, error=f"Record the dorsalis pedis pulse, {label.lower()}."),
        q_choice("Posterior tibial", f'd.{side}.pt', PULSE, error=f"Record the posterior tibial pulse, {label.lower()}."),
    ])


def d_doppler(side, label):
    return '\n'.join([
        q_choice("Doppler waveform", f'd.{side}.doppler', [("tri", "Triphasic"), ("bi", "Biphasic"), ("mono", "Monophasic"), ("not-done", "Not done")], required=False),
        q_number("Capillary refill", f'd.{side}.crt', "s", required=False, min_=0, max_=20, step="0.5"),
    ])


def d_skin(side, label):
    return '\n'.join([
        q_choice("Skin signs", f'd.{side}.skin', [
            ("pallor", "Pallor"), ("dusky", "Dusky"), ("cool", "Cool to touch"), ("oedema", "Oedema"),
            ("hair-loss", "Hair loss"), ("atrophic", "Atrophic skin"), ("none", "None"),
        ], kind="checkbox", required=False, exclusive="none"),
        q_choice("Venous / trophic changes", f'd.{side}.venous', [
            ("sclerosis", "Sclerosis / induration"), ("spider", "Spider veins"), ("varicose", "Varicose veins"),
            ("atrophie", "Atrophie blanche"), ("none", "None"),
        ], kind="checkbox", required=False, exclusive="none"),
    ])


begin("D")
d_body = '\n\n'.join([
    sub("Claudication & rest pain", '\n'.join([
        q_choice("History of intermittent claudication", "d.claudication", YN, error="Answer the claudication question."),
        q_choice("Rest pain", "d.restpain", YN, error="Answer the rest pain question.", hint="Pain in the foot at rest, often at night, eased by hanging the leg down."),
    ])),
    sub("Pulses", per_foot(d_pulses)),
    sub("Doppler & capillary refill", per_foot(d_doppler)),
    sub("Skin & venous changes", per_foot(d_skin)),
])

# ---------- E ----------


def e_indices(side, label):
    return '\n'.join([
        q_number("ABI", f'e.{side}.abi', "", required=False, min_=0, max_=2, step="0.01"),
        q_number("TBI", f'e.{side}.tbi', "", required=False, min_=0, max_=2, step="0.01"),
    ])


def e_pressures(side, label):
    return '\n'.join([
        q_number("Ankle pressure", f'e.{side}.ankle', "mmHg", required=False, min_=0, max_=300, step="1"),
        q_number("Toe pressure", f'e.{side}.toe', "mmHg", required=False, min_=0, max_=300, step="1"),
        q_number("TcPO₂", f'e.{side}.tcpo2', "mmHg", required=False, min_=0, max_=150, step="1"),
    ])


begin("E")
e_body = '\n\n'.join([
    sub("Equipment", q_choice("Perfusion equipment available in this room?", "e.available", YN, required=False)),
    sub("Indices", '<p class="field-hint">Record raw values only. Classification is done at practitioner review.</p>\n' + per_foot(e_indices), reveal="perfusion"),
    sub("Pressures & oxygen", per_foot(e_pressures), reveal="perfusion"),
])

# ---------- F ----------


def f_deformity(side, label):
    return '\n'.join([
        '<!-- assumed: full checklist not in spec (spec lists callus, dry skin, fissures, claw toes, prominent MTHs "etc.") -->',
        q_choice("Findings", f'f.{side}.deformity', [
            ("claw-toes", "Claw toes"), ("hammer-toes", "Hammer toes"), ("hallux-valgus", "Hallux valgus"),
            ("prominent-mth", "Prominent metatarsal heads"), ("high-arch", "High arch"), ("flat-foot", "Flat foot"),
            ("limited-joint", "Limited joint mobility"), ("none", "None"),
        ], kind="checkbox", required=False, exclusive="none"),
    ])


def f_skin(side, label):
    return '\n'.join([
        '<!-- assumed: option list not in spec -->',
        q_choice("Findings", f'f.{side}.skin', [
            ("callus", "Callus"), ("dry", "Dry skin"), ("fissures", "Fissures"), ("maceration", "Interdigital maceration"),
            ("blister", "Blister"), ("haemorrhage", "Haemorrhage under callus"), ("pre-ulcer", "Pre-ulcerative lesion"), ("none", "None"),
        ], kind="checkbox", required=False, exclusive="none"),
    ])


begin("F")
f_body = '\n\n'.join([
    sub("Deformity", per_foot(f_deformity)),
    sub("Skin", per_foot(f_skin)),
])

# ---------- G ----------


def g_nails(side, label):
    return '\n'.join([
        '<!-- assumed: option list not in spec -->',
        q_choice("Findings", f'g.{side}.nails', [
            ("thickened", "Thickened / dystrophic"), ("ingrown", "Ingrown"), ("fungal", "Fungal infection"),
            ("long", "Long / poorly cut"), ("none", "None"),
        ], kind="checkbox", required=False, exclusive="none"),
    ])


begin("G")
g_body = '\n\n'.join([
    sub("Nails", per_foot(g_nails)),
    sub("Footwear", f'''{q_choice("Footwear appropriate for the patient's foot risk?", "g.footwear", YN, error="Answer the footwear question.")}
<div class="reveal" data-reveal="footwear" hidden>
  <!-- assumed: chip values not in spec -->
{ind(q_choice("Footwear concerns", "g.concerns", [
    ("poor-fit", "Poor fit / too tight"), ("worn", "Worn out"), ("thin-slippers", "Barefoot / thin slippers"),
    ("needs-insole", "Needs insole / offloading"), ("gait", "Gait / plantar-pressure concern"),
], kind="checkbox", error="Choose at least one footwear concern."), 2)}
</div>'''),
])

# ---------- H ----------


def h_flags(side, label):
    return q_choice("Red flags", f'h.{side}.flags', [
        ("warmth", "Unilateral warmth"), ("swelling", "Swelling / oedema"), ("redness", "Redness / erythema"),
        ("shape", "Change in foot shape"), ("trauma", "Recent minor trauma / more walking"),
        ("minimal-pain", "Minimal pain despite inflammation"), ("none", "No red flags"),
    ], kind="checkbox", exclusive="none", error=f"Record the red flags, or “No red flags”, {label.lower()}.")


def h_temp(side, label):
    return q_number("Infrared reading", f'h.{side}.temp', "°C", required=False, min_=15, max_=42, step="0.1")


begin("H")
h_body = '\n\n'.join([
    sub("Red flags", '<p class="field-hint">Always performed, both feet.</p>\n' + per_foot(h_flags) + f'''
<div class="callout callout-danger" data-alert="charcot" hidden>
  {WARN_SVG}
  <div><strong>Suspected Charcot foot</strong><p>2 or more red flags including warmth, swelling or redness, or a skin temperature difference over 2 °C. Sending alerts the practitioner immediately.</p></div>
</div>'''),
    sub("Skin temperature", per_foot(h_temp) + '\n<p class="temp-diff" data-temp-diff hidden></p>'),
])

# ---------- I ----------


def i_ulcer(side, label):
    return q_choice("Previous ulcer", f'i.{side}.ulcer', YN, error=f"Answer previous ulcer, {label.lower()}.")


def i_amputation(side, label):
    return '\n'.join([
        q_choice("Minor (digital / ray / transmetatarsal)", f'i.{side}.minor', YN,
                 error=f"Answer previous minor amputation, {label.lower()}."),
        f'''<div class="reveal" data-reveal="{side}-minor" hidden>
{ind(q_choice("Level", f"i.{side}.minorLevel", [("digital", "Digital"), ("ray", "Ray"), ("transmetatarsal", "Transmetatarsal")], error="Choose the amputation level."), 2)}
</div>''',
        q_choice("Hindfoot / tarsal", f'i.{side}.hindfoot', YN,
                 error=f"Answer previous hindfoot amputation, {label.lower()}."),
        q_choice("Major (below / through / above knee)", f'i.{side}.major', YN,
                 error=f"Answer previous major amputation, {label.lower()}."),
        f'''<div class="reveal" data-reveal="{side}-major" hidden>
{ind(q_choice("Level", f"i.{side}.majorLevel", [("below-knee", "Below knee"), ("through-knee", "Through knee"), ("above-knee", "Above knee")], error="Choose the amputation level."), 2)}
</div>''',
    ])


begin("I")
i_body = '\n\n'.join([
    sub("Ulcer history", '<p class="field-hint">Pre-filled from the record. Date and level are captured when an event is first recorded.</p>\n' + per_foot(i_ulcer)),
    sub("Amputation history", per_foot(i_amputation)),
])

# ---------- J ----------
ZONES = [
    ("hallux", "Hallux"), ("toe2", "2nd toe"), ("toe3", "3rd toe"), ("toe4", "4th toe"), ("toe5", "5th toe"),
    ("mth1", "1st metatarsal head"), ("mth2", "2nd metatarsal head"), ("mth3", "3rd metatarsal head"),
    ("mth4", "4th metatarsal head"), ("mth5", "5th metatarsal head"), ("midfoot", "Midfoot"), ("heel", "Heel"),
]


def ulcer_card(n):
    zone_opts = '\n'.join(f'      <option value="{v}">{esc(l)}</option>' for v, l in ZONES)
    return f'''<fieldset class="ulcer-card" data-ulcer="{n}" hidden>
  <legend class="foot-card__title">Ulcer {n}</legend>
{ind(q_choice("Foot", f"j.{n}.foot", [("left", "Left"), ("right", "Right")], error="Choose the foot."), 2)}
  <div class="q" data-required="value" data-error="Choose the zone.">
    <label class="label" for="f-j-{n}-zone">Zone</label>
    <select class="input select" id="f-j-{n}-zone" name="j.{n}.zone">
      <option value="">Choose…</option>
{zone_opts}
    </select>
{ind(error_p(), 4)}
  </div>
{ind(q_choice("Aspect", f"j.{n}.aspect", [("dorsal", "Dorsal"), ("plantar", "Plantar"), ("medial", "Medial"), ("lateral", "Lateral"), ("apex", "Apex")], error="Choose the aspect."), 2)}
  <div class="q">
    <label class="label" for="f-j-{n}-photo">Photo <span class="label__optional">(optional)</span></label>
    <input class="file-input" id="f-j-{n}-photo" name="j.{n}.photo" type="file" accept="image/*" capture="environment" />
  </div>
</fieldset>'''


begin("J")
j_body = '\n\n'.join([
    sub("Ulcer count", f'''{q_choice("Number of ulcers present", "j.count", [("0", "0"), ("1", "1"), ("2", "2"), ("3+", "3 or more")], error="Choose the number of ulcers.")}
<div class="callout callout-warning" data-alert="ulcer" hidden>
  {WARN_SVG}
  <div><strong>Practitioner hands-on evaluation required</strong><p>Record where each ulcer is. Size and infection status are assessed by the practitioner.</p></div>
</div>'''),
    sub("Ulcer locations", f'''<p class="field-hint" data-reveal="ulcer-many" hidden>3 or more: record the three most significant ulcers.</p>
{ulcer_map()}
<div class="ulcer-grid">
{ind(ulcer_card(1), 2)}
{ind(ulcer_card(2), 2)}
{ind(ulcer_card(3), 2)}
</div>''', reveal="ulcers"),
])


sections = '\n\n'.join([
    section('A', 'Patient & Encounter', a_body, open_=True),
    section('B', 'Risk History', b_body, optional=True),
    section('C', 'Neurological Findings', c_body),
    section('D', 'Vascular Bedside Signs', d_body),
    section('E', 'Perfusion Measurements', e_body, optional=True),
    section('F', 'Deformity, Skin', f_body, optional=True),
    section('G', 'Nail & Footwear', g_body),
    section('H', 'Charcot Red-flag Screen', h_body),
    section('I', 'Previous Ulcer / Amputation History', i_body),
    section('J', 'Wounds', j_body),
])

main = f'''    <main class="page-content page-content--with-actions">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="./home.html">Home</a>
        <span aria-hidden="true">/</span>
        <a href="./diabetic-foot.html">Diabetic Foot</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Screening</span>
      </nav>

      <div class="page-header page-header--split">
        <div>
          <h1 class="page-title">Foot Screening</h1>
        </div>
        <button type="button" class="btn btn-outline" id="toggle-sections">Expand all</button>
      </div>

      <form class="screening-form" id="screening-form" novalidate>
{ind(sections, 8)}

        <div class="form-actions">
          <p class="form-actions__progress" id="screening-progress" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
            Send to practitioner
          </button>
        </div>
      </form>

      <!-- Shown after sending -->
      <section class="empty-state" id="screening-sent" aria-labelledby="screening-sent-title" hidden tabindex="-1">
        <div class="empty-state__icon empty-state__icon--success">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        </div>
        <h2 class="empty-state__title" id="screening-sent-title">Sent to practitioner</h2>
        <p class="empty-state__text" id="screening-sent-text"></p>
        <ul class="flag-list" id="screening-sent-flags"></ul>
        <div class="modal__actions">
          <a class="btn btn-outline" href="./diabetic-foot.html">Back to Diabetic Foot</a>
          <a class="btn btn-primary" id="screening-review-link" href="./review.html">Open practitioner review</a>
        </div>
      </section>
    </main>

    <!-- Confirm before sending -->
    <dialog class="modal" id="confirm-send" aria-labelledby="confirm-send-title">
      <form class="modal__inner" method="dialog">
        <div>
          <h2 class="modal__title" id="confirm-send-title">Send screening to practitioner?</h2>
          <p class="modal__description" id="confirm-send-text"></p>
        </div>
        <ul class="flag-list" id="confirm-send-flags"></ul>
        <div class="modal__actions">
          <button type="submit" class="btn btn-outline" value="cancel">Keep editing</button>
          <button type="submit" class="btn btn-primary" value="send">Send</button>
        </div>
      </form>
    </dialog>

    <script src="./scripts/user-menu.js"></script>
    <script src="./scripts/patients.js"></script>
    <script src="./scripts/screening-store.js"></script>
    <script src="./scripts/clinical-rules.js"></script>
    <script src="./scripts/screening-schema.js"></script>
    <script src="./scripts/review-schema.js"></script>
    <script src="./scripts/layout.js"></script>
    <script src="./scripts/drafts.js"></script>
    <script src="./scripts/encounters-ui.js"></script>
    <script src="./scripts/screening.js"></script>
    <script src="./scripts/foot-map.js"></script>
  </body>
</html>
'''

open(ROOT + 'screening.html', 'w', encoding='utf-8', newline='').write(head_and_header + main)
print('ok', len(head_and_header + main))


# Fields built without the q_* helpers
manual = [
    {'name': 'a.complaint', 'label': 'Current complaint', 'type': 'text', 'required': False, 'section': 'A', 'sub': 'Encounter'},
    {'name': 'c.severity', 'label': 'Symptom severity', 'type': 'range', 'min': 0, 'max': 10, 'unit': '/ 10', 'required': False, 'section': 'C', 'sub': 'Neuropathic symptoms'},
]
for n in (1, 2, 3):
    manual.append({'name': f'j.{n}.zone', 'label': 'Zone', 'type': 'select', 'options': [list(z) for z in ZONES], 'required': True, 'section': 'J', 'sub': 'Ulcer locations'})
    manual.append({'name': f'j.{n}.photo', 'label': 'Photo', 'type': 'file', 'required': False, 'section': 'J', 'sub': 'Ulcer locations'})
fields = [f for f in SCHEMA if not f['name'].startswith('_')] + manual
SECTIONS = {'A': 'Patient & Encounter', 'B': 'Risk History', 'C': 'Neurological Findings', 'D': 'Vascular Bedside Signs',
            'E': 'Perfusion Measurements', 'F': 'Deformity, Skin', 'G': 'Nail & Footwear', 'H': 'Charcot Red-flag Screen',
            'I': 'Previous Ulcer / Amputation History', 'J': 'Wounds'}
DIAGRAM = {'outline': FOOT_OUTLINE, 'toes': TOES, 'mths': MTHS,
           'midfoot': [58, 125, 18, 26], 'heel': [51, 188, 16, 17], 'labels': ZONE_LABEL}
schema_js = ('// GENERATED from the screening form generator. Do not edit by hand.' + chr(10)
             + '// Part 1 (nurse) field definitions, used by the practitioner review page.' + chr(10)
             + 'const ScreeningSchema = ' + json.dumps({'sections': SECTIONS, 'fields': fields, 'footDiagram': DIAGRAM}, ensure_ascii=False, indent=1) + ';' + chr(10))
open(ROOT + 'scripts/screening-schema.js', 'w', encoding='utf-8', newline='').write(schema_js)
print('schema fields', len(fields))
