// GENERATED from the screening form generator. Do not edit by hand.
// Part 1 (nurse) field definitions, used by the practitioner review page.
const ScreeningSchema = {
 "sections": {
  "A": "Patient & Encounter",
  "B": "Risk History",
  "C": "Neurological Findings",
  "D": "Vascular Bedside Signs",
  "E": "Perfusion Measurements",
  "F": "Deformity, Skin",
  "G": "Nail & Footwear",
  "H": "Charcot Red-flag Screen",
  "I": "Previous Ulcer / Amputation History",
  "J": "Wounds"
 },
 "fields": [
  {
   "name": "a.confirmed",
   "label": "Patient details confirmed?",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes, details are correct"
    ],
    [
     "needs-update",
     "Needs update"
    ]
   ],
   "required": true,
   "section": "A",
   "sub": "Patient details"
  },
  {
   "name": "a.temp",
   "label": "Temperature",
   "type": "number",
   "unit": "°C",
   "min": 30,
   "max": 45,
   "step": "0.1",
   "required": true,
   "section": "A",
   "sub": "Vital signs"
  },
  {
   "name": "a.hr",
   "label": "Heart rate",
   "type": "number",
   "unit": "bpm",
   "min": 20,
   "max": 250,
   "step": "1",
   "required": true,
   "section": "A",
   "sub": "Vital signs"
  },
  {
   "name": "a.rr",
   "label": "Respiratory rate",
   "type": "number",
   "unit": "/min",
   "min": 4,
   "max": 60,
   "step": "1",
   "required": true,
   "section": "A",
   "sub": "Vital signs"
  },
  {
   "name": "a.sbp",
   "label": "Systolic blood pressure",
   "type": "number",
   "unit": "mmHg",
   "min": 50,
   "max": 260,
   "step": "1",
   "required": true,
   "section": "A",
   "sub": "Vital signs"
  },
  {
   "name": "a.glucose",
   "label": "Capillary glucose",
   "type": "number",
   "unit": "mg/dL",
   "min": 20,
   "max": 600,
   "step": "1",
   "required": false,
   "section": "A",
   "sub": "Vital signs"
  },
  {
   "name": "a.appearance",
   "label": "General appearance",
   "type": "radio",
   "options": [
    [
     "well",
     "Well"
    ],
    [
     "unwell",
     "Unwell"
    ]
   ],
   "required": true,
   "section": "A",
   "sub": "General condition"
  },
  {
   "name": "a.mobility",
   "label": "Mobility",
   "type": "radio",
   "options": [
    [
     "independent",
     "Independent"
    ],
    [
     "walking-aid",
     "Walking aid"
    ],
    [
     "wheelchair",
     "Wheelchair"
    ]
   ],
   "required": true,
   "section": "A",
   "sub": "General condition"
  },
  {
   "name": "a.support",
   "label": "Social support",
   "type": "radio",
   "options": [
    [
     "family-carer",
     "Family or carer"
    ],
    [
     "lives-alone",
     "Lives alone"
    ]
   ],
   "required": false,
   "section": "A",
   "sub": "General condition"
  },
  {
   "name": "a.reason",
   "label": "Reason for screening",
   "type": "radio",
   "options": [
    [
     "annual-review",
     "Annual review"
    ],
    [
     "new-diagnosis",
     "New diagnosis"
    ],
    [
     "foot-problem",
     "Foot problem"
    ]
   ],
   "required": true,
   "section": "A",
   "sub": "Encounter"
  },
  {
   "name": "b.history",
   "label": "Risk history",
   "type": "checkbox",
   "options": [
    [
     "ckd",
     "Chronic kidney disease"
    ],
    [
     "dialysis",
     "Dialysis or end-stage renal disease"
    ],
    [
     "previous-charcot",
     "Previous Charcot foot"
    ],
    [
     "cardiovascular",
     "Cardiovascular disease"
    ],
    [
     "hypertension",
     "Hypertension"
    ],
    [
     "dyslipidaemia",
     "Dyslipidaemia"
    ],
    [
     "retinopathy",
     "Retinopathy"
    ],
    [
     "immunosuppression",
     "Immunosuppression"
    ],
    [
     "pad",
     "PAD / revascularisation"
    ],
    [
     "neuropathy",
     "Neuropathy diagnosed"
    ],
    [
     "poor-vision",
     "Poor vision / self-care limitation"
    ]
   ],
   "required": false,
   "section": "B",
   "sub": "Conditions"
  },
  {
   "name": "b.smoking",
   "label": "Smoking status",
   "type": "radio",
   "options": [
    [
     "never",
     "Never"
    ],
    [
     "former",
     "Former"
    ],
    [
     "current",
     "Current"
    ]
   ],
   "required": false,
   "section": "B",
   "sub": "Smoking"
  },
  {
   "name": "b.meds",
   "label": "Current medications",
   "type": "checkbox",
   "options": [
    [
     "insulin",
     "Insulin"
    ],
    [
     "oral",
     "Oral agents"
    ],
    [
     "antiplatelet",
     "Antiplatelet"
    ],
    [
     "statin",
     "Statin"
    ],
    [
     "anticoagulant",
     "Anticoagulant"
    ],
    [
     "antibiotics",
     "Antibiotics now"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": true,
   "section": "B",
   "sub": "Medications & allergies"
  },
  {
   "name": "b.allergy",
   "label": "Antibiotic allergy",
   "type": "radio",
   "options": [
    [
     "none",
     "None known"
    ],
    [
     "beta-lactam",
     "Beta-lactam (penicillin, cephalosporin)"
    ],
    [
     "other",
     "Other"
    ]
   ],
   "required": true,
   "section": "B",
   "sub": "Medications & allergies"
  },
  {
   "name": "c.method",
   "label": "Sensation test method",
   "type": "radio",
   "options": [
    [
     "monofilament",
     "10 g monofilament"
    ],
    [
     "light-touch",
     "Light touch (no monofilament)"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Test method"
  },
  {
   "name": "c.right.hallux",
   "label": "Hallux (plantar)",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.right.mth1",
   "label": "1st metatarsal head",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.right.mth5",
   "label": "5th metatarsal head",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.left.hallux",
   "label": "Hallux (plantar)",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.left.mth1",
   "label": "1st metatarsal head",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.left.mth5",
   "label": "5th metatarsal head",
   "type": "radio",
   "options": [
    [
     "detected",
     "Detected"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Protective sensation"
  },
  {
   "name": "c.left.vibration",
   "label": "128 Hz tuning fork (dorsal hallux)",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "reduced",
     "Reduced"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Vibration"
  },
  {
   "name": "c.left.vpt",
   "label": "Vibration perception threshold",
   "type": "number",
   "unit": "V",
   "min": 0,
   "max": 60,
   "step": "0.5",
   "required": false,
   "section": "C",
   "sub": "Vibration"
  },
  {
   "name": "c.right.vibration",
   "label": "128 Hz tuning fork (dorsal hallux)",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "reduced",
     "Reduced"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Vibration"
  },
  {
   "name": "c.right.vpt",
   "label": "Vibration perception threshold",
   "type": "number",
   "unit": "V",
   "min": 0,
   "max": 60,
   "step": "0.5",
   "required": false,
   "section": "C",
   "sub": "Vibration"
  },
  {
   "name": "c.symptoms",
   "label": "Symptoms reported",
   "type": "checkbox",
   "options": [
    [
     "numbness",
     "Numbness"
    ],
    [
     "burning",
     "Burning pain"
    ],
    [
     "tingling",
     "Pins and needles / tingling"
    ],
    [
     "electric",
     "Electric-shock pain"
    ],
    [
     "allodynia",
     "Allodynia / hypersensitivity"
    ],
    [
     "none",
     "No neuropathic symptoms"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Neuropathic symptoms"
  },
  {
   "name": "c.night",
   "label": "Worse at night?",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "C",
   "sub": "Neuropathic symptoms"
  },
  {
   "name": "d.claudication",
   "label": "History of intermittent claudication",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Claudication & rest pain"
  },
  {
   "name": "d.restpain",
   "label": "Rest pain",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Claudication & rest pain"
  },
  {
   "name": "d.left.dp",
   "label": "Dorsalis pedis",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "weak",
     "Weak"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Pulses"
  },
  {
   "name": "d.left.pt",
   "label": "Posterior tibial",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "weak",
     "Weak"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Pulses"
  },
  {
   "name": "d.right.dp",
   "label": "Dorsalis pedis",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "weak",
     "Weak"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Pulses"
  },
  {
   "name": "d.right.pt",
   "label": "Posterior tibial",
   "type": "radio",
   "options": [
    [
     "present",
     "Present"
    ],
    [
     "weak",
     "Weak"
    ],
    [
     "absent",
     "Absent"
    ],
    [
     "not-assessed",
     "Not assessed"
    ]
   ],
   "required": true,
   "section": "D",
   "sub": "Pulses"
  },
  {
   "name": "d.left.doppler",
   "label": "Doppler waveform",
   "type": "radio",
   "options": [
    [
     "tri",
     "Triphasic"
    ],
    [
     "bi",
     "Biphasic"
    ],
    [
     "mono",
     "Monophasic"
    ],
    [
     "not-done",
     "Not done"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Doppler & capillary refill"
  },
  {
   "name": "d.left.crt",
   "label": "Capillary refill",
   "type": "number",
   "unit": "s",
   "min": 0,
   "max": 20,
   "step": "0.5",
   "required": false,
   "section": "D",
   "sub": "Doppler & capillary refill"
  },
  {
   "name": "d.right.doppler",
   "label": "Doppler waveform",
   "type": "radio",
   "options": [
    [
     "tri",
     "Triphasic"
    ],
    [
     "bi",
     "Biphasic"
    ],
    [
     "mono",
     "Monophasic"
    ],
    [
     "not-done",
     "Not done"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Doppler & capillary refill"
  },
  {
   "name": "d.right.crt",
   "label": "Capillary refill",
   "type": "number",
   "unit": "s",
   "min": 0,
   "max": 20,
   "step": "0.5",
   "required": false,
   "section": "D",
   "sub": "Doppler & capillary refill"
  },
  {
   "name": "d.left.skin",
   "label": "Skin signs",
   "type": "checkbox",
   "options": [
    [
     "pallor",
     "Pallor"
    ],
    [
     "dusky",
     "Dusky"
    ],
    [
     "cool",
     "Cool to touch"
    ],
    [
     "oedema",
     "Oedema"
    ],
    [
     "hair-loss",
     "Hair loss"
    ],
    [
     "atrophic",
     "Atrophic skin"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Skin & venous changes"
  },
  {
   "name": "d.left.venous",
   "label": "Venous / trophic changes",
   "type": "checkbox",
   "options": [
    [
     "sclerosis",
     "Sclerosis / induration"
    ],
    [
     "spider",
     "Spider veins"
    ],
    [
     "varicose",
     "Varicose veins"
    ],
    [
     "atrophie",
     "Atrophie blanche"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Skin & venous changes"
  },
  {
   "name": "d.right.skin",
   "label": "Skin signs",
   "type": "checkbox",
   "options": [
    [
     "pallor",
     "Pallor"
    ],
    [
     "dusky",
     "Dusky"
    ],
    [
     "cool",
     "Cool to touch"
    ],
    [
     "oedema",
     "Oedema"
    ],
    [
     "hair-loss",
     "Hair loss"
    ],
    [
     "atrophic",
     "Atrophic skin"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Skin & venous changes"
  },
  {
   "name": "d.right.venous",
   "label": "Venous / trophic changes",
   "type": "checkbox",
   "options": [
    [
     "sclerosis",
     "Sclerosis / induration"
    ],
    [
     "spider",
     "Spider veins"
    ],
    [
     "varicose",
     "Varicose veins"
    ],
    [
     "atrophie",
     "Atrophie blanche"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "D",
   "sub": "Skin & venous changes"
  },
  {
   "name": "e.available",
   "label": "Perfusion equipment available in this room?",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": false,
   "section": "E",
   "sub": "Equipment"
  },
  {
   "name": "e.left.abi",
   "label": "ABI",
   "type": "number",
   "unit": "",
   "min": 0,
   "max": 2,
   "step": "0.01",
   "required": false,
   "section": "E",
   "sub": "Indices"
  },
  {
   "name": "e.left.tbi",
   "label": "TBI",
   "type": "number",
   "unit": "",
   "min": 0,
   "max": 2,
   "step": "0.01",
   "required": false,
   "section": "E",
   "sub": "Indices"
  },
  {
   "name": "e.right.abi",
   "label": "ABI",
   "type": "number",
   "unit": "",
   "min": 0,
   "max": 2,
   "step": "0.01",
   "required": false,
   "section": "E",
   "sub": "Indices"
  },
  {
   "name": "e.right.tbi",
   "label": "TBI",
   "type": "number",
   "unit": "",
   "min": 0,
   "max": 2,
   "step": "0.01",
   "required": false,
   "section": "E",
   "sub": "Indices"
  },
  {
   "name": "e.left.ankle",
   "label": "Ankle pressure",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 300,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "e.left.toe",
   "label": "Toe pressure",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 300,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "e.left.tcpo2",
   "label": "TcPO₂",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 150,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "e.right.ankle",
   "label": "Ankle pressure",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 300,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "e.right.toe",
   "label": "Toe pressure",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 300,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "e.right.tcpo2",
   "label": "TcPO₂",
   "type": "number",
   "unit": "mmHg",
   "min": 0,
   "max": 150,
   "step": "1",
   "required": false,
   "section": "E",
   "sub": "Pressures & oxygen"
  },
  {
   "name": "f.left.deformity",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "claw-toes",
     "Claw toes"
    ],
    [
     "hammer-toes",
     "Hammer toes"
    ],
    [
     "hallux-valgus",
     "Hallux valgus"
    ],
    [
     "prominent-mth",
     "Prominent metatarsal heads"
    ],
    [
     "high-arch",
     "High arch"
    ],
    [
     "flat-foot",
     "Flat foot"
    ],
    [
     "limited-joint",
     "Limited joint mobility"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "F",
   "sub": "Deformity"
  },
  {
   "name": "f.right.deformity",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "claw-toes",
     "Claw toes"
    ],
    [
     "hammer-toes",
     "Hammer toes"
    ],
    [
     "hallux-valgus",
     "Hallux valgus"
    ],
    [
     "prominent-mth",
     "Prominent metatarsal heads"
    ],
    [
     "high-arch",
     "High arch"
    ],
    [
     "flat-foot",
     "Flat foot"
    ],
    [
     "limited-joint",
     "Limited joint mobility"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "F",
   "sub": "Deformity"
  },
  {
   "name": "f.left.skin",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "callus",
     "Callus"
    ],
    [
     "dry",
     "Dry skin"
    ],
    [
     "fissures",
     "Fissures"
    ],
    [
     "maceration",
     "Interdigital maceration"
    ],
    [
     "blister",
     "Blister"
    ],
    [
     "haemorrhage",
     "Haemorrhage under callus"
    ],
    [
     "pre-ulcer",
     "Pre-ulcerative lesion"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "F",
   "sub": "Skin"
  },
  {
   "name": "f.right.skin",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "callus",
     "Callus"
    ],
    [
     "dry",
     "Dry skin"
    ],
    [
     "fissures",
     "Fissures"
    ],
    [
     "maceration",
     "Interdigital maceration"
    ],
    [
     "blister",
     "Blister"
    ],
    [
     "haemorrhage",
     "Haemorrhage under callus"
    ],
    [
     "pre-ulcer",
     "Pre-ulcerative lesion"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "F",
   "sub": "Skin"
  },
  {
   "name": "g.left.nails",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "thickened",
     "Thickened / dystrophic"
    ],
    [
     "ingrown",
     "Ingrown"
    ],
    [
     "fungal",
     "Fungal infection"
    ],
    [
     "long",
     "Long / poorly cut"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "G",
   "sub": "Nails"
  },
  {
   "name": "g.right.nails",
   "label": "Findings",
   "type": "checkbox",
   "options": [
    [
     "thickened",
     "Thickened / dystrophic"
    ],
    [
     "ingrown",
     "Ingrown"
    ],
    [
     "fungal",
     "Fungal infection"
    ],
    [
     "long",
     "Long / poorly cut"
    ],
    [
     "none",
     "None"
    ]
   ],
   "required": false,
   "section": "G",
   "sub": "Nails"
  },
  {
   "name": "g.footwear",
   "label": "Footwear appropriate for the patient's foot risk?",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "G",
   "sub": "Footwear"
  },
  {
   "name": "g.concerns",
   "label": "Footwear concerns",
   "type": "checkbox",
   "options": [
    [
     "poor-fit",
     "Poor fit / too tight"
    ],
    [
     "worn",
     "Worn out"
    ],
    [
     "thin-slippers",
     "Barefoot / thin slippers"
    ],
    [
     "needs-insole",
     "Needs insole / offloading"
    ],
    [
     "gait",
     "Gait / plantar-pressure concern"
    ]
   ],
   "required": true,
   "section": "G",
   "sub": "Footwear"
  },
  {
   "name": "h.left.flags",
   "label": "Red flags",
   "type": "checkbox",
   "options": [
    [
     "warmth",
     "Unilateral warmth"
    ],
    [
     "swelling",
     "Swelling / oedema"
    ],
    [
     "redness",
     "Redness / erythema"
    ],
    [
     "shape",
     "Change in foot shape"
    ],
    [
     "trauma",
     "Recent minor trauma / more walking"
    ],
    [
     "minimal-pain",
     "Minimal pain despite inflammation"
    ],
    [
     "none",
     "No red flags"
    ]
   ],
   "required": true,
   "section": "H",
   "sub": "Red flags"
  },
  {
   "name": "h.right.flags",
   "label": "Red flags",
   "type": "checkbox",
   "options": [
    [
     "warmth",
     "Unilateral warmth"
    ],
    [
     "swelling",
     "Swelling / oedema"
    ],
    [
     "redness",
     "Redness / erythema"
    ],
    [
     "shape",
     "Change in foot shape"
    ],
    [
     "trauma",
     "Recent minor trauma / more walking"
    ],
    [
     "minimal-pain",
     "Minimal pain despite inflammation"
    ],
    [
     "none",
     "No red flags"
    ]
   ],
   "required": true,
   "section": "H",
   "sub": "Red flags"
  },
  {
   "name": "h.left.temp",
   "label": "Infrared reading",
   "type": "number",
   "unit": "°C",
   "min": 15,
   "max": 42,
   "step": "0.1",
   "required": false,
   "section": "H",
   "sub": "Skin temperature"
  },
  {
   "name": "h.right.temp",
   "label": "Infrared reading",
   "type": "number",
   "unit": "°C",
   "min": 15,
   "max": 42,
   "step": "0.1",
   "required": false,
   "section": "H",
   "sub": "Skin temperature"
  },
  {
   "name": "i.left.ulcer",
   "label": "Previous ulcer",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Ulcer history"
  },
  {
   "name": "i.right.ulcer",
   "label": "Previous ulcer",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Ulcer history"
  },
  {
   "name": "i.left.minor",
   "label": "Minor (digital / ray / transmetatarsal)",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.left.minorLevel",
   "label": "Level",
   "type": "radio",
   "options": [
    [
     "digital",
     "Digital"
    ],
    [
     "ray",
     "Ray"
    ],
    [
     "transmetatarsal",
     "Transmetatarsal"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.left.hindfoot",
   "label": "Hindfoot / tarsal",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.left.major",
   "label": "Major (below / through / above knee)",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.left.majorLevel",
   "label": "Level",
   "type": "radio",
   "options": [
    [
     "below-knee",
     "Below knee"
    ],
    [
     "through-knee",
     "Through knee"
    ],
    [
     "above-knee",
     "Above knee"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.right.minor",
   "label": "Minor (digital / ray / transmetatarsal)",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.right.minorLevel",
   "label": "Level",
   "type": "radio",
   "options": [
    [
     "digital",
     "Digital"
    ],
    [
     "ray",
     "Ray"
    ],
    [
     "transmetatarsal",
     "Transmetatarsal"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.right.hindfoot",
   "label": "Hindfoot / tarsal",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.right.major",
   "label": "Major (below / through / above knee)",
   "type": "radio",
   "options": [
    [
     "yes",
     "Yes"
    ],
    [
     "no",
     "No"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "i.right.majorLevel",
   "label": "Level",
   "type": "radio",
   "options": [
    [
     "below-knee",
     "Below knee"
    ],
    [
     "through-knee",
     "Through knee"
    ],
    [
     "above-knee",
     "Above knee"
    ]
   ],
   "required": true,
   "section": "I",
   "sub": "Amputation history"
  },
  {
   "name": "j.count",
   "label": "Number of ulcers present",
   "type": "radio",
   "options": [
    [
     "0",
     "0"
    ],
    [
     "1",
     "1"
    ],
    [
     "2",
     "2"
    ],
    [
     "3+",
     "3 or more"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer count"
  },
  {
   "name": "j.1.foot",
   "label": "Foot",
   "type": "radio",
   "options": [
    [
     "left",
     "Left"
    ],
    [
     "right",
     "Right"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.1.aspect",
   "label": "Aspect",
   "type": "radio",
   "options": [
    [
     "dorsal",
     "Dorsal"
    ],
    [
     "plantar",
     "Plantar"
    ],
    [
     "medial",
     "Medial"
    ],
    [
     "lateral",
     "Lateral"
    ],
    [
     "apex",
     "Apex"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.2.foot",
   "label": "Foot",
   "type": "radio",
   "options": [
    [
     "left",
     "Left"
    ],
    [
     "right",
     "Right"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.2.aspect",
   "label": "Aspect",
   "type": "radio",
   "options": [
    [
     "dorsal",
     "Dorsal"
    ],
    [
     "plantar",
     "Plantar"
    ],
    [
     "medial",
     "Medial"
    ],
    [
     "lateral",
     "Lateral"
    ],
    [
     "apex",
     "Apex"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.3.foot",
   "label": "Foot",
   "type": "radio",
   "options": [
    [
     "left",
     "Left"
    ],
    [
     "right",
     "Right"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.3.aspect",
   "label": "Aspect",
   "type": "radio",
   "options": [
    [
     "dorsal",
     "Dorsal"
    ],
    [
     "plantar",
     "Plantar"
    ],
    [
     "medial",
     "Medial"
    ],
    [
     "lateral",
     "Lateral"
    ],
    [
     "apex",
     "Apex"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "a.complaint",
   "label": "Current complaint",
   "type": "text",
   "required": false,
   "section": "A",
   "sub": "Encounter"
  },
  {
   "name": "c.severity",
   "label": "Symptom severity",
   "type": "range",
   "min": 0,
   "max": 10,
   "unit": "/ 10",
   "required": false,
   "section": "C",
   "sub": "Neuropathic symptoms"
  },
  {
   "name": "j.1.zone",
   "label": "Zone",
   "type": "select",
   "options": [
    [
     "hallux",
     "Hallux"
    ],
    [
     "toe2",
     "2nd toe"
    ],
    [
     "toe3",
     "3rd toe"
    ],
    [
     "toe4",
     "4th toe"
    ],
    [
     "toe5",
     "5th toe"
    ],
    [
     "mth1",
     "1st metatarsal head"
    ],
    [
     "mth2",
     "2nd metatarsal head"
    ],
    [
     "mth3",
     "3rd metatarsal head"
    ],
    [
     "mth4",
     "4th metatarsal head"
    ],
    [
     "mth5",
     "5th metatarsal head"
    ],
    [
     "midfoot",
     "Midfoot"
    ],
    [
     "heel",
     "Heel"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.1.photo",
   "label": "Photo",
   "type": "file",
   "required": false,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.2.zone",
   "label": "Zone",
   "type": "select",
   "options": [
    [
     "hallux",
     "Hallux"
    ],
    [
     "toe2",
     "2nd toe"
    ],
    [
     "toe3",
     "3rd toe"
    ],
    [
     "toe4",
     "4th toe"
    ],
    [
     "toe5",
     "5th toe"
    ],
    [
     "mth1",
     "1st metatarsal head"
    ],
    [
     "mth2",
     "2nd metatarsal head"
    ],
    [
     "mth3",
     "3rd metatarsal head"
    ],
    [
     "mth4",
     "4th metatarsal head"
    ],
    [
     "mth5",
     "5th metatarsal head"
    ],
    [
     "midfoot",
     "Midfoot"
    ],
    [
     "heel",
     "Heel"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.2.photo",
   "label": "Photo",
   "type": "file",
   "required": false,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.3.zone",
   "label": "Zone",
   "type": "select",
   "options": [
    [
     "hallux",
     "Hallux"
    ],
    [
     "toe2",
     "2nd toe"
    ],
    [
     "toe3",
     "3rd toe"
    ],
    [
     "toe4",
     "4th toe"
    ],
    [
     "toe5",
     "5th toe"
    ],
    [
     "mth1",
     "1st metatarsal head"
    ],
    [
     "mth2",
     "2nd metatarsal head"
    ],
    [
     "mth3",
     "3rd metatarsal head"
    ],
    [
     "mth4",
     "4th metatarsal head"
    ],
    [
     "mth5",
     "5th metatarsal head"
    ],
    [
     "midfoot",
     "Midfoot"
    ],
    [
     "heel",
     "Heel"
    ]
   ],
   "required": true,
   "section": "J",
   "sub": "Ulcer locations"
  },
  {
   "name": "j.3.photo",
   "label": "Photo",
   "type": "file",
   "required": false,
   "section": "J",
   "sub": "Ulcer locations"
  }
 ],
 "footDiagram": {
  "outline": "M22,48 C18,62 18,80 22,95 C26,115 30,135 30,155 C30,175 28,190 34,203 C40,214 62,214 68,203 C74,190 72,172 74,150 C76,128 86,108 90,88 C94,70 92,56 86,50 C72,44 36,42 22,48 Z",
  "toes": [
   [
    "hallux",
    30,
    28,
    11,
    14
   ],
   [
    "toe2",
    50,
    20,
    7,
    9
   ],
   [
    "toe3",
    63,
    24,
    6.5,
    8.5
   ],
   [
    "toe4",
    74,
    31,
    6,
    8
   ],
   [
    "toe5",
    83,
    41,
    5.5,
    7
   ]
  ],
  "mths": [
   [
    "mth1",
    32,
    66,
    9
   ],
   [
    "mth2",
    50,
    62,
    6.5
   ],
   [
    "mth3",
    62.5,
    64,
    5.5
   ],
   [
    "mth4",
    73.5,
    68.5,
    5.5
   ],
   [
    "mth5",
    82.5,
    75,
    5.5
   ]
  ],
  "midfoot": [
   58,
   125,
   18,
   26
  ],
  "heel": [
   51,
   188,
   16,
   17
  ],
  "labels": {
   "hallux": "Hallux",
   "toe2": "2nd toe",
   "toe3": "3rd toe",
   "toe4": "4th toe",
   "toe5": "5th toe",
   "mth1": "1st metatarsal head",
   "mth2": "2nd metatarsal head",
   "mth3": "3rd metatarsal head",
   "mth4": "4th metatarsal head",
   "mth5": "5th metatarsal head",
   "midfoot": "Midfoot",
   "heel": "Heel"
  }
 }
};
