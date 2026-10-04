# Shared helpers for the static page generators (screening.html, review.html).
# Output is plain HTML; nothing is rendered at runtime.
import html

import os

# Project root (this file lives in tools/)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '')

ERR_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
           'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" />'
           '<line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>')
WARN_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />'
            '<path d="M12 9v4" /><path d="M12 17h.01" /></svg>')
CHEVRON = ('<svg class="form-section__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
           'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>')

FEET = [('left', 'Left foot'), ('right', 'Right foot')]

# Field schema: every q_choice / q_number records itself so the review page can
# render Part 1 findings (labels, options, units) without a hand-kept copy.
SCHEMA = []
_PENDING = []
CTX = {'section': None}


def begin(section):
    CTX['section'] = section


def record(entry):
    entry['section'] = CTX['section']
    SCHEMA.append(entry)
    _PENDING.append(entry)
    return entry


def esc(s):
    return html.escape(s, quote=True)


def ind(text, n):
    pad = ' ' * n
    return '\n'.join((pad + line) if line.strip() else '' for line in text.split('\n'))


def error_p():
    return f'<p class="field-error" hidden>\n  {ERR_SVG}\n  <span></span>\n</p>'


def chips(name, options, kind='radio', exclusive=None):
    """options: list of (value, label). exclusive: value that clears the others."""
    out = ['<div class="chips">']
    for value, label in options:
        extra = ' data-exclusive' if exclusive == value else ''
        out.append(f'  <label class="chip"><input type="{kind}" name="{name}" value="{esc(value)}"{extra} /><span>{esc(label)}</span></label>')
    out.append('</div>')
    return '\n'.join(out)


def q_choice(legend, name, options, kind='radio', required=True, error=None, exclusive=None, hint=None, extra_attrs=''):
    record({'name': name, 'label': legend, 'type': kind, 'options': [list(o) for o in options], 'required': required})
    req = ''
    if required:
        req = f' data-required="{"radio" if kind == "radio" else "any"}" data-error="{esc(error or "Choose an option.")}"'
    parts = [f'<fieldset class="q"{req}{extra_attrs}>', f'  <legend class="label">{esc(legend)}</legend>']
    if hint:
        parts.append(f'  <p class="field-hint">{esc(hint)}</p>')
    parts.append(ind(chips(name, options, kind, exclusive), 2))
    if required:
        parts.append(ind(error_p(), 2))
    parts.append('</fieldset>')
    return '\n'.join(parts)


def q_number(label, name, unit, required=True, min_=None, max_=None, step='any', error=None, hint=None):
    record({'name': name, 'label': label, 'type': 'number', 'unit': unit, 'min': min_, 'max': max_, 'step': step, 'required': required})
    attrs = f'type="number" inputmode="decimal" step="{step}"'
    if min_ is not None:
        attrs += f' min="{min_}"'
    if max_ is not None:
        attrs += f' max="{max_}"'
    req = f' data-required="value" data-error="{esc(error or "Enter a value.")}"' if required else ''
    fid = 'f-' + name.replace('.', '-')
    parts = [f'<div class="q"{req}>', f'  <label class="label" for="{fid}">{esc(label)}</label>',
             '  <div class="input-unit">',
             f'    <input class="input" id="{fid}" name="{name}" {attrs} />',
             f'    <span class="input-unit__suffix">{esc(unit)}</span>' if unit else '',
             '  </div>']
    parts = [p for p in parts if p]
    if hint:
        parts.append(f'  <p class="field-hint">{esc(hint)}</p>')
    if required:
        parts.append(ind(error_p(), 2))
    parts.append('</div>')
    return '\n'.join(parts)


def foot_grid(render_foot):
    """render_foot(side, label) -> inner html for one foot card."""
    cards = []
    for side, label in FEET:
        cards.append(f'<fieldset class="foot-card">\n  <legend class="foot-card__title">{label}</legend>\n{ind(render_foot(side, label), 2)}\n</fieldset>')
    return '<div class="foot-grid">\n' + ind('\n'.join(cards), 2) + '\n</div>'


def section(letter, title, body, open_=False, optional=False):
    o = ' open' if open_ else ''
    opt = ' data-optional' if optional else ''
    return f'''<details class="form-section" data-section="{letter}"{opt}{o}>
  <summary class="form-section__summary">
    <span class="form-section__letter" aria-hidden="true">{letter}</span>
    <span class="form-section__title"><span class="sr-only">Section {letter}: </span>{esc(title)}</span>
    <span class="badge form-section__status" data-status></span>
    {CHEVRON}
  </summary>
  <div class="form-section__body">
{ind(body, 4)}
  </div>
</details>'''


# Section bodies v2: every section split into titled sub-sections with dividers.
# Spliced between the helpers and the page template of gen_screening.py.


SUB_ICONS = {'Patient details': '<circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" />', 'Vital signs': '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />', 'Encounter': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />', 'Conditions': '<path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />', 'Smoking': '<path d="M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14" /><path d="M18 8c0-2.5-2-2.5-2-5" /><path d="M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M22 8c0-2.5-2-2.5-2-5" /><path d="M7 12v4" />', 'Test method': '<path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />', 'Protective sensation': '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" /><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" /><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />', 'Vibration': '<path d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2" />', 'Neuropathic symptoms': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />', 'Claudication': '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" /><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" /><path d="M16 17h4" /><path d="M4 13h4" />', 'Pulses': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />', 'Doppler & capillary refill': '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />', 'Skin & venous changes': '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" /><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />', 'Equipment': '<path d="M11 2v2" /><path d="M5 2v2" /><path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><path d="M8 15a6 6 0 0 0 12 0v-3" /><circle cx="20" cy="10" r="2" />', 'Indices': '<path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />', 'Pressures & oxygen': '<path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" /><path d="M9.8 4.4A2 2 0 1 1 11 8H2" />', 'Deformity': '<path d="M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z" />', 'Skin': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />', 'Nails': '<circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" />', 'Footwear': '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" /><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z" /><path d="M16 17h4" /><path d="M4 13h4" />', 'Red flags': '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" />', 'Skin temperature': '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />', 'Ulcer history': '<path d="M10 10.01h.01" /><path d="M10 14.01h.01" /><path d="M14 10.01h.01" /><path d="M14 14.01h.01" /><path d="M18 6v12" /><path d="M6 6v12" /><rect x="2" y="6" width="20" height="12" rx="2" />', 'Amputation history': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" />', 'Ulcer count': '<line x1="4" x2="20" y1="9" y2="9" /><line x1="4" x2="20" y1="15" y2="15" /><line x1="10" x2="8" y1="3" y2="21" /><line x1="16" x2="14" y1="3" y2="21" />', 'Ulcer locations': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" />'}


def sub(title, body, reveal=None):
    for e in _PENDING:
        e.setdefault('sub', title)
    _PENDING.clear()
    attr = f' data-reveal="{reveal}" hidden' if reveal else ''
    icon = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + SUB_ICONS[title] + '</svg>')
    return f'''<section class="subsection"{attr}>
  <h3 class="subsection__title">{icon}{esc(title)}</h3>
{ind(body, 2)}
</section>'''


def per_foot(fn):
    return foot_grid(fn)


# ---------- Foot diagrams (static SVG; right foot drawn, left foot mirrored) ----------
# viewBox 0 0 100 220, hallux on the medial side so the two feet face each other.
FOOT_OUTLINE = ('M22,48 C18,62 18,80 22,95 C26,115 30,135 30,155 C30,175 28,190 34,203 '
                'C40,214 62,214 68,203 C74,190 72,172 74,150 C76,128 86,108 90,88 '
                'C94,70 92,56 86,50 C72,44 36,42 22,48 Z')
TOES = [('hallux', 30, 28, 11, 14), ('toe2', 50, 20, 7, 9), ('toe3', 63, 24, 6.5, 8.5),
        ('toe4', 74, 31, 6, 8), ('toe5', 83, 41, 5.5, 7)]
MTHS = [('mth1', 32, 66, 9), ('mth2', 50, 62, 6.5), ('mth3', 62.5, 64, 5.5),
        ('mth4', 73.5, 68.5, 5.5), ('mth5', 82.5, 75, 5.5)]
ZONE_LABEL = dict([("hallux", "Hallux"), ("toe2", "2nd toe"), ("toe3", "3rd toe"), ("toe4", "4th toe"), ("toe5", "5th toe"),
                   ("mth1", "1st metatarsal head"), ("mth2", "2nd metatarsal head"), ("mth3", "3rd metatarsal head"),
                   ("mth4", "4th metatarsal head"), ("mth5", "5th metatarsal head"), ("midfoot", "Midfoot"), ("heel", "Heel")])


def mx(side, x):
    return round(100 - x, 2) if side == 'left' else x


def foot_shapes(view, zones):
    """zones: True -> clickable zone shapes; False -> decorative landmarks."""
    cls = 'foot-zone' if zones else 'foot-landmark'
    out = [f'<path class="foot-outline" d="{FOOT_OUTLINE}" />']
    for z, cx, cy, rx, ry in TOES:
        out.append(f'<ellipse class="{cls}" data-zone="{z}" cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"><title>{ZONE_LABEL[z]}</title></ellipse>')
        if view == 'dorsal':
            out.append(f'<ellipse class="foot-nail" cx="{cx}" cy="{cy - ry * 0.35:.1f}" rx="{rx * 0.55:.1f}" ry="{ry * 0.4:.1f}" />')
    for z, cx, cy, r in MTHS:
        out.append(f'<circle class="{cls}" data-zone="{z}" cx="{cx}" cy="{cy}" r="{r}"><title>{ZONE_LABEL[z]}</title></circle>')
    out.append(f'<ellipse class="{cls}" data-zone="midfoot" cx="58" cy="125" rx="18" ry="26"><title>Midfoot</title></ellipse>')
    if view == 'plantar':
        out.append(f'<ellipse class="{cls}" data-zone="heel" cx="51" cy="188" rx="16" ry="17"><title>Heel</title></ellipse>')
    return '\n'.join(out)


def foot_svg(side, view, zones, overlay=''):
    mirror = ' transform="translate(100 0) scale(-1 1)"' if side == 'left' else ''
    return f"""<svg class="foot-map__svg" viewBox="0 0 100 220" data-side="{side}" data-view="{view}" aria-hidden="true">
  <g{mirror}>
{ind(foot_shapes(view, zones), 4)}
  </g>
{ind(overlay, 2)}
</svg>"""


SENS_SITES = [('hallux', 'Hallux', 30, 28), ('mth1', '1st metatarsal head', 32, 66), ('mth5', '5th metatarsal head', 82.5, 75)]


def sensation_map(side, label):
    markers = '\n'.join(
        f'<g class="sens-marker" data-target="c.{side}.{site}" data-site="{esc(site_label)}" role="button" tabindex="0">'
        f'<circle cx="{mx(side, x)}" cy="{y}" r="8" /><text x="{mx(side, x)}" y="{y}"></text></g>'
        for site, site_label, x, y in SENS_SITES)
    svg = foot_svg(side, 'plantar', False, markers).replace(' aria-hidden="true"', f' role="group" aria-label="{label} sensation sites"')
    return f'<div class="sens-map">\n{ind(svg, 2)}\n  <p class="field-hint">Tap a site to cycle the result.</p>\n</div>'


SENS_LEGEND = '''<ul class="map-legend" aria-hidden="true">
  <li><span class="map-legend__dot" data-state="detected">+</span>Detected</li>
  <li><span class="map-legend__dot" data-state="absent">−</span>Absent</li>
  <li><span class="map-legend__dot" data-state="not-assessed">?</span>Not assessed</li>
  <li><span class="map-legend__dot"></span>Not recorded</li>
</ul>'''


def ulcer_map():
    def view(view_name, title):
        figs = '\n'.join(f'''<figure class="ulcer-map__foot">
{ind(foot_svg(side, view_name, True, '<g class="pin-layer" data-pins></g>'), 2)}
  <figcaption>{label}</figcaption>
</figure>''' for side, label in FEET)
        return f'''<div class="ulcer-map__view">
  <p class="ulcer-map__view-title">{title}</p>
  <div class="ulcer-map__feet">
{ind(figs, 4)}
  </div>
</div>'''

    picks = '\n'.join(
        f'  <label class="chip" data-ulcer-pick="{n}"><input type="radio" name="_place" value="{n}"{" checked" if n == 1 else ""} /><span>Ulcer {n}</span></label>'
        for n in (1, 2, 3))
    return f'''<div class="ulcer-map" data-ulcer-map>
  <div class="ulcer-map__toolbar">
    <span class="label">Placing</span>
    <div class="chips">
{picks}
    </div>
  </div>
  <p class="field-hint">Tap a toe, metatarsal head, midfoot or heel to place the selected ulcer. You can also choose below.</p>
  <div class="ulcer-map__views">
{ind(view("plantar", "Plantar (sole)"), 4)}
{ind(view("dorsal", "Dorsal (top)"), 4)}
  </div>
</div>'''


