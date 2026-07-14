---
name: infographic-report
description: >-
  Turns a source document (Hebrew or English — report, survey, review, spec)
  into a single self-contained interactive HTML infographic: hero header, KPI
  cards, charts (doughnut, bar, stacked, line, radar, scatter, bubble, mixed,
  heatmap, waterfall), entity cards, timelines, CSS flow diagrams, optional
  tabbed layout, 8 color palettes (incl. dark), full RTL support. Charts are
  rendered by the python sandbox (matplotlib) and embedded as images — no
  internet, no hosting, no JavaScript libraries needed. Use when the user
  asks for an infographic, a visual report, a dashboard, a data-visual
  summary of a document, or says "אינפוגרפיקה" / "דוח ויזואלי".
---

# Infographic Report (python-rendered)

Convert a source document into ONE complete, self-contained HTML infographic.
You are the information designer: read the document, pick the right visual
for each data shape, write the page and a chart spec, then run the embedded
builder script — it renders every chart with matplotlib, embeds them as
images, injects the design-system stylesheet and palette, and lints the
result. The final file is fully offline (zero external references).

## Workflow

1. **Read the source document.** Identify: headline numbers (→ KPI cards),
   themes (→ sections), enumerable entities like companies/products/options
   (→ entity cards), tabular data (→ charts/tables), processes (→ flow
   diagram), dates/milestones (→ timeline), and the language/direction.
2. **Choose palette and layout.** Defaults: palette `colorful`, single
   scroll; use tabs when the document splits into 3+ distinct themes or the
   user asks. Honor any user preference. Palettes are listed below.
3. **Write `report.html`** (file-creation tool) following the OUTPUT
   CONTRACT: page structure in HTML with `{{BASE_CSS}}` in `<head>` and a
   `{{CHART:<id>}}` placeholder inside each chart box.
4. **Write `charts.json`** (file-creation tool): one spec per chart, format
   below.
5. **Write `build_infographic.py`** (file-creation tool): copy the code
   block from the "Embedded builder" section at the end of this skill,
   VERBATIM and in full.
6. **Run in the python sandbox:**

   ```bash
   python3 build_infographic.py report.html charts.json -o infographic.html --palette colorful
   ```

   Requires matplotlib (standard in analysis sandboxes). `--list-palettes`
   shows the palette ids. Read the warnings it prints and fix your files if
   any chart was skipped.
7. **Deliver `infographic.html`** — one file, opens from `file://`, fully
   offline.

## OUTPUT CONTRACT — hard rules

1. `report.html` is a single complete HTML document starting with
   `<!DOCTYPE html>`, with `{{BASE_CSS}}` on its own line in `<head>` (the
   builder replaces it with the stylesheet + palette).
2. ABSOLUTELY NO external URLs: no `http(s)://` links, CDN scripts,
   `@import`, web fonts, or external images. No `<svg>`, no Mermaid, no
   `<canvas>`. Charts are ONLY `{{CHART:<id>}}` placeholders rendered by the
   builder. Decorative icons must be emoji or pure CSS. (The builder lints
   and strips violations — don't create them.)
3. Set `<html lang="…" dir="…">` to match the document language (`dir="rtl"`
   for Hebrew/Arabic). All text in the document's language unless the user
   asks otherwise. The builder handles Hebrew/Arabic text inside charts.
4. Use ONLY data that appears in the source document. Never invent numbers.
   If the document has no quantitative data, use qualitative visuals:
   capability-matrix heatmaps (scores you can justify from the text),
   timelines, flow diagrams, comparison cards — or no charts at all.
5. Do NOT write `<script>` tags. The builder injects the only script needed
   (tab switching) automatically when the page uses tabs.
6. Every `{{CHART:<id>}}` placeholder must have a matching spec in
   `charts.json` and vice versa; ids unique.

## Structure blueprint

Wrap main content in `<div class="container">`; model it on a professional
market-survey infographic:

- **Hero:** `<header class="hero">` with `<span class="icon">📊</span>`, an
  `<h1>` title and `<p class="subtitle">` — derived from the document.
- **KPI strip:** `<div class="grid-3">` (or `grid-4`) of
  `<div class="kpi"><div class="value">…</div><div class="label">…</div></div>`
  for headline numbers found in the document.
- **Content sections:** typically 4–7 (3–4 concise, 6–12 comprehensive),
  each `<section class="card">` with `<h2 class="section-title">`.
- **Charts:** up to ~4 for a normal report, each inside
  `<div class="chart-box">{{CHART:chart1}}</div>`. VARY the chart types —
  never make every chart a doughnut. Two charts side by side: put two
  chart-boxes in a `<div class="grid-2">`.
- **Entity cards:** `<div class="grid-3">` of `<div class="entity-card">`
  each with `<h3>`, a one-line description, and a short `<ul>`.
- **Flow diagram** (process/sequence): `<div class="flow">` containing
  `<div class="flow-step"><span class="step-title">…</span>short text</div>`
  items, each pair separated by an EMPTY `<div class="flow-arrow"></div>`.
  The arrow is drawn by CSS — do NOT put →, ←, -> characters anywhere in it.
- **Tabs** (3+ distinct themes):

  ```html
  <div class="tabs" data-tab-group="g1">
    <button class="tab-btn" data-tab="t1">Label 1</button>
    <button class="tab-btn" data-tab="t2">Label 2</button>
  </div>
  <div class="tab-content active" data-tab-group="g1" data-tab="t1"> … </div>
  <div class="tab-content" data-tab-group="g1" data-tab="t2"> … </div>
  ```

  Mark the first pane `active`; the builder wires the clicks.
- **Other components:** data table
  (`<div class="table-wrap"><table class="data-table">`), timeline
  (`.timeline > .timeline-item > .t-date/.t-title/.t-body`), numbered steps
  (`.num-list > .num-item > .num + div`), bottom-line callout
  (`.callout > .ct + p`), stat highlights
  (`.stat(.positive/.warning) > .sv + .sl`), badges (`.badge`/`.pill`).
- **Footer:** `<footer class="footer">` with the source name and date.

## charts.json — chart spec format

```json
{"charts": [
  {"id":"c1","type":"doughnut","title":"נתחי שוק (%)",
   "labels":["אלפא","בטא","אחרים"],"data":[34,21,45]},

  {"id":"c2","type":"bar","title":"הכנסות","labels":["א","ב","ג"],
   "datasets":[{"label":"רישיונות","data":[2.1,1.2,0.9]},
               {"label":"שירותים","data":[1.4,0.6,0.8]}],
   "stacked":true,"horizontal":false},

  {"id":"c3","type":"line","title":"מגמה","labels":["2024","2025","2026"],
   "datasets":[{"label":"שוק","data":[10,11,12],"fill":true}]},

  {"id":"c4","type":"radar","title":"פרופיל","labels":["ענן","אבטחה","AI"],
   "datasets":[{"label":"אלפא","data":[5,4,3]},{"label":"בטא","data":[4,3,5]}]},

  {"id":"c5","type":"scatter","title":"מתאם",
   "datasets":[{"label":"חברות","points":[{"x":1,"y":2},{"x":3,"y":4}]}]},

  {"id":"c6","type":"bubble","title":"גודל מול צמיחה",
   "datasets":[{"label":"…","points":[{"x":34,"y":6,"r":12}]}]},

  {"id":"c7","type":"mixed","title":"עמודות + קו","labels":["…"],
   "datasets":[{"label":"…","data":[9,10],"kind":"bar"},
               {"label":"…","data":[7,8],"kind":"line"}]},

  {"id":"c8","type":"heatmap","title":"בשלות","rows":["אלפא","בטא"],
   "cols":["ענן","AI"],"matrix":[[5,3],[4,5]]},

  {"id":"c9","type":"waterfall","title":"הרכב מחיר","prefix":"$",
   "steps":[{"label":"פיתוח","value":45},{"label":"שיווק","value":25},
            {"label":"סה\"כ","value":70,"total":true}]}
]}
```

Type by data shape: parts-of-whole → `doughnut`/`pie` · compare categories →
`bar` (`"horizontal":true` for long labels, `"stacked":true` for
composition, several datasets for grouped) · trend → `line` (`"fill":true`
for area) · multi-dimension profile → `radar` · correlation → `scatter`
(+ size → `bubble`) · bars+line → `mixed` (per-dataset `"kind"`) · X-vs-Y
intensity → `heatmap` · total split into parts → `waterfall`
(each non-total step adds to a running cumulative; `"total":true` bars show
the absolute total). There is NO map chart in this variant — present
per-country data as a horizontal bar or a table instead.

## Color palettes

Pass the id via `--palette`; the builder colors both the page (CSS
variables) and the charts (series colors). Default: `colorful`.

| id | Name | Character |
|---|---|---|
| `vibrant-tech-blues` | Vibrant Tech Blues | Blue single-hue charts |
| `emerald-forest` | Emerald Forest | Green single-hue |
| `warm-sunset` | Warm Sunset | Orange single-hue |
| `royal-violet` | Royal Violet | Purple single-hue |
| `slate-mono` | Slate Mono | Grayscale / minimal |
| `colorful` | Colorful | Multi-color charts (recommended) |
| `energetic` | Energetic | Warm teal, yellow & orange |
| `slate-premium` | Slate Premium **(dark)** | Dark glass / dashboard theme |

**Theme rule:** dark palettes restyle the whole page automatically — never
hardcode white backgrounds or black text in your HTML; use the provided
classes. You may add ONE small `<style>` block for fine-tuning (no external
resources).

## RTL / Hebrew

`<html lang="he" dir="rtl">`; all layout classes are direction-aware, and
the builder reorders Hebrew/Arabic text inside chart images when the
matplotlib version needs it (override with env `INFOGRAPHIC_BIDI=1`/`0` if
chart labels ever come out reversed).

## Self-check before delivering

- [ ] Starts with `<!DOCTYPE html>`; `{{BASE_CSS}}` appears exactly once.
- [ ] Zero occurrences of `http://` / `https://` / `<svg` / `<script`.
- [ ] Every number traces to the source document.
- [ ] Every `{{CHART:id}}` has a spec in charts.json and vice versa; types
      are varied and match the data shapes.
- [ ] The builder ran without warnings and reported all charts rendered.
- [ ] `lang`/`dir` match the content language.

## Embedded builder — write this to `build_infographic.py` verbatim

```python
#!/usr/bin/env python3
"""Infographic builder — pure-python variant (matplotlib, no JS chart lib).

Everything needed ships in this one file: the design-system CSS, the color
palettes, and chart rendering via matplotlib. Charts are rendered to PNG and
embedded as data: URIs, so the final HTML is one self-contained offline file
with zero external references and zero JavaScript dependencies (a tiny inline
tabs script is injected only if the page uses tabs).

    python3 build_infographic.py report.html charts.json -o infographic.html --palette colorful
    python3 build_infographic.py --list-palettes

report.html   the page the model wrote: {{BASE_CSS}} in <head>, and a
              {{CHART:<id>}} placeholder inside each chart box.
charts.json   {"charts":[ …chart specs, see the skill instructions… ]}

Requires: python3 + matplotlib (standard in analysis sandboxes)."""
import argparse
import base64
import io
import json
import re
import sys
import textwrap
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# Palette definitions are inlined at build time (fallback: repo assets file).
PALETTES_JSON = r'''{"vibrant-tech-blues":{"label":"Vibrant Tech Blues","desc":"Blue single-hue charts","primary":"#2563EB","secondary":"#1E40AF","accent":"#60A5FA","bg":"#EFF6FF","gradA":"#1E3A8A","gradB":"#3B82F6","series":["#2563EB","#60A5FA","#1E40AF","#93C5FD","#0EA5E9","#38BDF8"]},"emerald-forest":{"label":"Emerald Forest","desc":"Green single-hue","primary":"#059669","secondary":"#065F46","accent":"#34D399","bg":"#ECFDF5","gradA":"#064E3B","gradB":"#10B981","series":["#059669","#34D399","#065F46","#6EE7B7","#0D9488","#2DD4BF"]},"warm-sunset":{"label":"Warm Sunset","desc":"Orange single-hue","primary":"#EA580C","secondary":"#9A3412","accent":"#FB923C","bg":"#FFF7ED","gradA":"#7C2D12","gradB":"#F97316","series":["#EA580C","#FB923C","#9A3412","#FDBA74","#DC2626","#F87171"]},"royal-violet":{"label":"Royal Violet","desc":"Purple single-hue","primary":"#7C3AED","secondary":"#5B21B6","accent":"#A78BFA","bg":"#F5F3FF","gradA":"#4C1D95","gradB":"#8B5CF6","series":["#7C3AED","#A78BFA","#5B21B6","#C4B5FD","#DB2777","#F472B6"]},"slate-mono":{"label":"Slate Mono","desc":"Grayscale / minimal","primary":"#475569","secondary":"#1E293B","accent":"#94A3B8","bg":"#F8FAFC","gradA":"#0F172A","gradB":"#475569","series":["#475569","#94A3B8","#1E293B","#CBD5E1","#64748B","#A8B5C5"]},"colorful":{"label":"Colorful","desc":"Multi-color charts (recommended)","primary":"#4F46E5","secondary":"#7C3AED","accent":"#F43F5E","bg":"#EEF2FF","gradA":"#4338CA","gradB":"#DB2777","series":["#4F46E5","#F43F5E","#F59E0B","#10B981","#0EA5E9","#A855F7"]},"energetic":{"label":"Energetic","desc":"Warm teal, yellow & orange","primary":"#2A9D8F","secondary":"#264653","accent":"#E76F51","bg":"#F0FDFA","gradA":"#264653","gradB":"#2A9D8F","series":["#2A9D8F","#E9C46A","#F4A261","#E76F51","#264653","#287271"]},"slate-premium":{"label":"Slate Premium","desc":"Dark glass / dashboard theme","dark":true,"primary":"#3B82F6","secondary":"#60A5FA","accent":"#10B981","bg":"#0F172A","gradA":"#1E293B","gradB":"#0B1220","series":["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#22D3EE"],"surface":"rgba(30, 41, 59, 0.72)","surface2":"rgba(15, 23, 42, 0.6)","text":"#E2E8F0","muted":"#94A3B8","border":"rgba(255, 255, 255, 0.08)","page":"#0F172A","heroText":"#FFFFFF","onPrimary":"#FFFFFF","shadow":"0 8px 30px rgba(0, 0, 0, 0.35)","blur":"blur(12px)"}}'''

# ── condensed design-system stylesheet (mirrors the generator's base.css) ──
BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
:root{--c-primary:#4F46E5;--c-secondary:#7C3AED;--c-accent:#F43F5E;--c-bg:#EEF2FF;
--c-grad-a:#4338CA;--c-grad-b:#DB2777;--c-surface:#ffffff;--c-surface-2:#f8fafc;
--c-text:#1f2937;--c-muted:#6b7280;--c-border:#e5e7eb;--c-page:#f4f5fb;
--c-hero-text:#fff;--c-on-primary:#fff;--c-shadow:0 4px 18px rgba(15,23,42,.06)}
body{font-family:'Segoe UI','Heebo',system-ui,Arial,sans-serif;background:var(--c-page);
color:var(--c-text);line-height:1.65;font-size:16px}
.container{max-width:1100px;margin:0 auto;padding:20px 18px 40px}
.hero{background:linear-gradient(135deg,var(--c-grad-a),var(--c-grad-b));color:var(--c-hero-text);
text-align:center;padding:52px 20px 44px}
.hero .icon{font-size:44px;display:block;margin-bottom:10px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:-.5px}
.hero .subtitle{margin-top:10px;font-size:17px;opacity:.92}
.card{background:var(--c-surface);border:1px solid var(--c-border);border-radius:16px;
padding:24px 22px;margin:18px 0;box-shadow:var(--c-shadow)}
.section-title{font-size:21px;font-weight:800;color:var(--c-primary);margin-bottom:14px;
padding-bottom:8px;border-bottom:3px solid var(--c-primary);display:inline-block}
.subsection-title{font-size:16px;font-weight:700;margin:12px 0 8px}
.grid-2,.grid-3,.grid-4{display:grid;gap:14px;margin:12px 0}
.grid-2{grid-template-columns:repeat(2,1fr)}.grid-3{grid-template-columns:repeat(3,1fr)}
.grid-4{grid-template-columns:repeat(4,1fr)}
.kpi{background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:14px;
padding:18px 12px;text-align:center}
.kpi .value{font-size:26px;font-weight:800;color:var(--c-primary)}
.kpi .label{font-size:13px;color:var(--c-muted);margin-top:4px}
.stat{border-inline-start:4px solid var(--c-primary);background:var(--c-surface-2);
border-radius:10px;padding:10px 14px;margin:8px 0}
.stat.positive{border-color:#10B981}.stat.warning{border-color:#F59E0B}
.stat .sv{font-size:20px;font-weight:800}.stat .sl{font-size:12.5px;color:var(--c-muted)}
.entity-card{background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:14px;padding:16px}
.entity-card.alt{border-inline-start:4px solid var(--c-accent)}
.entity-card h3{font-size:16px;color:var(--c-primary);margin-bottom:6px}
.entity-card ul{padding-inline-start:18px;font-size:13.5px;color:var(--c-muted)}
.chart-box{background:var(--c-surface-2);border:1px solid var(--c-border);border-radius:14px;
padding:12px;margin:10px 0;text-align:center}
.chart-img{max-width:100%;height:auto;border-radius:8px}
.badge,.pill{display:inline-block;background:var(--c-bg);color:var(--c-primary);border-radius:99px;
padding:2px 12px;font-size:12.5px;font-weight:600;margin:2px}
.table-wrap{overflow-x:auto;border:1px solid var(--c-border);border-radius:12px;margin:10px 0}
.data-table{width:100%;border-collapse:collapse;font-size:14px}
.data-table th{background:var(--c-primary);color:var(--c-on-primary);padding:9px 12px;
text-align:start;position:sticky;top:0}
.data-table td{padding:8px 12px;border-bottom:1px solid var(--c-border)}
.data-table tr:nth-child(even) td{background:var(--c-surface-2)}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 0}
.tab-btn{border:1px solid var(--c-border);background:var(--c-surface);color:var(--c-text);
border-radius:10px 10px 0 0;padding:9px 18px;font-size:14.5px;font-weight:600;cursor:pointer}
.tab-btn.active{background:var(--c-primary);color:var(--c-on-primary);border-color:var(--c-primary)}
.tab-content{display:none}.tab-content.active{display:block}
.timeline{border-inline-start:3px solid var(--c-primary);margin:12px 6px;padding-inline-start:18px}
.timeline-item{position:relative;margin:0 0 16px}
.timeline-item::before{content:'';position:absolute;inset-inline-start:-25px;top:6px;width:11px;
height:11px;border-radius:50%;background:var(--c-primary)}
.t-date{font-size:12.5px;font-weight:700;color:var(--c-accent)}
.t-title{font-weight:700}.t-body{font-size:14px;color:var(--c-muted)}
.num-list{display:grid;gap:10px}.num-item{display:flex;gap:12px;align-items:flex-start}
.num{flex:none;width:34px;height:34px;border-radius:10px;background:var(--c-primary);
color:var(--c-on-primary);font-weight:800;display:flex;align-items:center;justify-content:center}
.callout{background:linear-gradient(135deg,var(--c-grad-a),var(--c-grad-b));color:#fff;
border-radius:16px;padding:20px 22px;margin:18px 0}
.callout .ct{font-weight:800;font-size:15px;margin-bottom:6px;opacity:.9}
.flow{display:flex;flex-wrap:wrap;align-items:stretch;gap:0;margin:12px 0}
.flow-step{flex:1;min-width:130px;background:var(--c-surface-2);border:1px solid var(--c-border);
border-radius:12px;padding:12px;font-size:13.5px;color:var(--c-muted);text-align:center}
.flow-step .step-title{display:block;font-weight:800;color:var(--c-primary);font-size:14.5px;margin-bottom:4px}
.flow-arrow{flex:none;width:34px;position:relative;font-size:0}
.flow-arrow::after{content:'';position:absolute;top:50%;inset-inline-start:50%;width:12px;height:12px;
border-top:3px solid var(--c-primary);border-inline-end:3px solid var(--c-primary);
transform:translate(-50%,-50%) rotate(45deg)}
[dir="rtl"] .flow-arrow::after{transform:translate(50%,-50%) rotate(-135deg)}
.footer{text-align:center;color:var(--c-muted);font-size:13px;margin-top:26px;
padding-top:14px;border-top:1px solid var(--c-border)}
.muted{color:var(--c-muted)}.accent{color:var(--c-accent)}
@media(max-width:720px){.grid-2,.grid-3,.grid-4{grid-template-columns:1fr}
.hero h1{font-size:26px}.flow{flex-direction:column}.flow-arrow{width:auto;height:26px}
.flow-arrow::after{transform:translate(-50%,-50%) rotate(135deg)}
[dir="rtl"] .flow-arrow::after{transform:translate(50%,-50%) rotate(135deg)}}
"""

# Tiny inline tabs runtime — injected only when the page uses .tabs.
TABS_JS = ("<script>document.addEventListener('DOMContentLoaded',function(){try{"
           "document.querySelectorAll('.tabs').forEach(function(nav){"
           "var g=nav.getAttribute('data-tab-group');"
           "var btns=nav.querySelectorAll('.tab-btn');"
           "btns.forEach(function(b,i){if(i===0)b.classList.add('active');"
           "b.addEventListener('click',function(){"
           "btns.forEach(function(x){x.classList.remove('active')});b.classList.add('active');"
           "document.querySelectorAll('.tab-content[data-tab-group=\"'+g+'\"]').forEach(function(p){"
           "p.classList.toggle('active',p.getAttribute('data-tab')===b.getAttribute('data-tab'))})})})})"
           "}catch(e){}});</script>")

SURFACE_MAP = {
    'surface': '--c-surface', 'surface2': '--c-surface-2', 'text': '--c-text',
    'muted': '--c-muted', 'border': '--c-border', 'page': '--c-page',
    'heroText': '--c-hero-text', 'onPrimary': '--c-on-primary', 'shadow': '--c-shadow',
}

HEB = re.compile(r'[֐-׿؀-ۿ]')


def load_palettes():
    if PALETTES_JSON.startswith('__'):
        local = Path(__file__).resolve().parent.parent / 'assets' / 'palettes.json'
        return json.loads(local.read_text(encoding='utf-8'))
    return json.loads(PALETTES_JSON)


def _needs_bidi_fix():
    """matplotlib >= 3.11 shapes bidi text natively; older versions render
    Hebrew/Arabic in logical order (visually reversed) and need our fix.
    Override with INFOGRAPHIC_BIDI=1 (force fix) / =0 (never fix) if a
    sandbox behaves differently."""
    import os
    env = os.environ.get('INFOGRAPHIC_BIDI')
    if env in ('0', '1'):
        return env == '1'
    try:
        major, minor = (int(x) for x in matplotlib.__version__.split('.')[:2])
        return (major, minor) < (3, 11)
    except Exception:
        return False


NEEDS_BIDI_FIX = _needs_bidi_fix()


def fix_rtl(s):
    """Reorder Hebrew/Arabic runs for display on matplotlibs without bidi."""
    s = str(s)
    if not NEEDS_BIDI_FIX or not HEB.search(s):
        return s
    try:
        from bidi.algorithm import get_display  # use the real thing if present
        return get_display(s)
    except Exception:
        toks = re.findall(r'[֐-׿؀-ۿ]+|[^֐-׿؀-ۿ]+', s)
        return ''.join(t[::-1] if HEB.search(t) else t for t in reversed(toks)).strip()


def rlabel(s, width=18):
    """Wrap a long label, bidi-fixing each line."""
    lines = textwrap.wrap(str(s), width) or ['']
    return '\n'.join(fix_rtl(l) for l in lines)


def style_axes(ax, pal, dark):
    txt = pal.get('text', '#1f2937') if dark else '#374151'
    mut = pal.get('muted', '#94A3B8') if dark else '#6b7280'
    grid = (1, 1, 1, 0.12) if dark else (0, 0, 0, 0.08)
    ax.tick_params(colors=mut, labelsize=9)
    for sp in ('top', 'right'):
        ax.spines[sp].set_visible(False)
    for sp in ('left', 'bottom'):
        ax.spines[sp].set_color(grid)
    ax.yaxis.grid(True, color=grid, linewidth=.8)
    ax.set_axisbelow(True)
    ax.title.set_color(txt)
    return txt, mut


def new_fig(kind, pal, dark):
    square = kind in ('doughnut', 'pie', 'radar')
    fig = plt.figure(figsize=(5.4, 5.0) if square else (7.6, 4.2), dpi=150)
    fig.patch.set_alpha(0)  # transparent — the .chart-box provides the surface
    return fig


def render_chart(spec, pal, dark):
    kind = spec.get('type', 'bar')
    series = pal['series']
    title = fix_rtl(spec.get('title', ''))
    fig = new_fig(kind, pal, dark)
    txtcol = pal.get('text', '#E2E8F0') if dark else '#374151'

    if kind in ('doughnut', 'pie'):
        ax = fig.add_subplot(111)
        labels = [rlabel(x, 14) for x in spec.get('labels', [])]
        data = spec.get('data', [])
        wedge = dict(width=0.42, edgecolor='none') if kind == 'doughnut' else dict(edgecolor='none')
        ax.pie(data, colors=series[:len(data)] * 8, wedgeprops=wedge, startangle=90,
               autopct=lambda p: f'{p:.0f}%' if p >= 4 else '', pctdistance=0.79 if kind == 'doughnut' else 0.6,
               textprops={'color': '#fff' if kind == 'doughnut' else txtcol, 'fontsize': 9, 'fontweight': 'bold'})
        ax.legend(labels, loc='lower center', bbox_to_anchor=(0.5, -0.14), ncol=min(3, max(1, len(labels))),
                  frameon=False, fontsize=9, labelcolor=txtcol)
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold')

    elif kind == 'radar':
        labels = [rlabel(x, 12) for x in spec.get('labels', [])]
        n = len(labels)
        ang = [i / n * 2 * np.pi for i in range(n)] + [0]
        ax = fig.add_subplot(111, polar=True)
        ax.set_facecolor('none')
        for i, ds in enumerate(spec.get('datasets', [])):
            vals = list(ds.get('data', [])) + [ds.get('data', [0])[0]]
            c = series[i % len(series)]
            ax.plot(ang, vals, color=c, linewidth=2, label=fix_rtl(ds.get('label', '')))
            ax.fill(ang, vals, color=c, alpha=.15)
        ax.set_xticks(ang[:-1]); ax.set_xticklabels(labels, fontsize=9, color=txtcol)
        ax.tick_params(axis='y', labelsize=8, colors=pal.get('muted', '#6b7280'))
        ax.grid(color=(1, 1, 1, .15) if dark else (0, 0, 0, .1))
        ax.spines['polar'].set_color((1, 1, 1, .2) if dark else (0, 0, 0, .15))
        if len(spec.get('datasets', [])) > 1:
            ax.legend(loc='lower center', bbox_to_anchor=(0.5, -0.18), ncol=2, frameon=False,
                      fontsize=9, labelcolor=txtcol)
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold', pad=24)

    elif kind == 'heatmap':
        ax = fig.add_subplot(111)
        rows = [rlabel(x, 14) for x in spec.get('rows', [])]
        cols = [rlabel(x, 12) for x in spec.get('cols', [])]
        m = np.array(spec.get('matrix', [[0]]), dtype=float)
        from matplotlib.colors import LinearSegmentedColormap
        cmap = LinearSegmentedColormap.from_list('idg', [pal.get('surface2', '#f8fafc') if not dark else '#0b1220', pal['primary']])
        ax.imshow(m, cmap=cmap, aspect='auto')
        ax.set_xticks(range(len(cols))); ax.set_xticklabels(cols, fontsize=9, color=txtcol)
        ax.set_yticks(range(len(rows))); ax.set_yticklabels(rows, fontsize=9, color=txtcol)
        thresh = m.min() + (m.max() - m.min()) * .55 if m.max() > m.min() else m.max()
        for r in range(m.shape[0]):
            for c in range(m.shape[1]):
                ax.text(c, r, f'{m[r, c]:g}', ha='center', va='center', fontsize=9, fontweight='bold',
                        color='#fff' if m[r, c] >= thresh else txtcol)
        for sp in ax.spines.values():
            sp.set_visible(False)
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold')

    elif kind == 'waterfall':
        ax = fig.add_subplot(111)
        style_axes(ax, pal, dark)
        steps = spec.get('steps', [])
        labels, run = [], 0.0
        for i, s in enumerate(steps):
            v = float(s.get('value', 0))
            labels.append(rlabel(s.get('label', ''), 12))
            if s.get('total'):
                ax.bar(i, v, color=pal['secondary'])
                top = v
            else:
                ax.bar(i, v, bottom=run, color=pal['primary'] if v >= 0 else pal['accent'])
                top = run + max(v, 0)
                run += v
            ax.text(i, top, f"{spec.get('prefix', '')}{abs(v):g}", ha='center', va='bottom',
                    fontsize=9, fontweight='bold', color=txtcol)
        ax.set_xticks(range(len(labels))); ax.set_xticklabels(labels, fontsize=9)
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold')

    elif kind in ('scatter', 'bubble'):
        ax = fig.add_subplot(111)
        style_axes(ax, pal, dark)
        for i, ds in enumerate(spec.get('datasets', [])):
            pts = ds.get('points', [])
            xs = [p.get('x', 0) for p in pts]; ys = [p.get('y', 0) for p in pts]
            sz = [max(20, float(p.get('r', 5)) ** 2 * 3.2) for p in pts] if kind == 'bubble' else 46
            ax.scatter(xs, ys, s=sz, color=series[i % len(series)], alpha=.65,
                       edgecolors='none', label=fix_rtl(ds.get('label', '')))
        if len(spec.get('datasets', [])) > 1:
            ax.legend(frameon=False, fontsize=9, labelcolor=txtcol)
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold')

    else:  # bar / hbar / stacked / grouped / line / area / mixed
        ax = fig.add_subplot(111)
        style_axes(ax, pal, dark)
        labels = [rlabel(x, 14) for x in spec.get('labels', [])]
        x = np.arange(len(labels))
        dss = spec.get('datasets') or [{'label': '', 'data': spec.get('data', [])}]
        horizontal = bool(spec.get('horizontal')) or kind == 'hbar'
        stacked = bool(spec.get('stacked'))
        bars = [d for d in dss if (d.get('kind', 'line' if kind in ('line', 'area') else 'bar')) == 'bar']
        lines = [d for d in dss if (d.get('kind', 'line' if kind in ('line', 'area') else 'bar')) == 'line']
        bw = 0.72 / max(1, len(bars)) if (not stacked and len(bars) > 1) else 0.62
        offset = np.zeros(len(labels))
        for i, ds in enumerate(bars):
            data = np.array(ds.get('data', []), dtype=float)
            c = series[i % len(series)]
            pos = x if stacked or len(bars) == 1 else x + (i - (len(bars) - 1) / 2) * bw
            if horizontal:
                ax.barh(pos, data, height=bw, left=offset if stacked else None,
                        color=c, label=fix_rtl(ds.get('label', '')))
            else:
                ax.bar(pos, data, width=bw, bottom=offset if stacked else None,
                       color=c, label=fix_rtl(ds.get('label', '')))
            if stacked:
                offset = offset + data
        for i, ds in enumerate(lines):
            data = np.array(ds.get('data', []), dtype=float)
            c = series[(len(bars) + i) % len(series)]
            ax.plot(x, data, color=c, linewidth=2.4, marker='o', markersize=4,
                    label=fix_rtl(ds.get('label', '')))
            if ds.get('fill') or kind == 'area':
                ax.fill_between(x, data, color=c, alpha=.18)
        if horizontal:
            ax.set_yticks(x); ax.set_yticklabels(labels, fontsize=9)
            ax.xaxis.grid(True, color=(1, 1, 1, 0.12) if dark else (0, 0, 0, 0.08)); ax.yaxis.grid(False)
        else:
            ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=9)
        if len(dss) > 1:
            ax.legend(frameon=False, fontsize=9, labelcolor=txtcol,
                      loc='upper center', bbox_to_anchor=(0.5, -0.12), ncol=min(4, len(dss)))
        ax.set_title(title, color=txtcol, fontsize=12, fontweight='bold')

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format='png', transparent=True, bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def palette_css(pal):
    vars_ = (f"--c-primary:{pal['primary']};--c-secondary:{pal['secondary']};"
             f"--c-accent:{pal['accent']};--c-bg:{pal['bg']};"
             f"--c-grad-a:{pal['gradA']};--c-grad-b:{pal['gradB']};")
    for key, var in SURFACE_MAP.items():
        if pal.get(key):
            vars_ += f"{var}:{pal[key]};"
    if pal.get('dark') and not pal.get('page'):
        vars_ += f"--c-page:{pal['bg']};"
    return ':root{' + vars_ + '}'


EXTERNAL_RES = [
    (re.compile(r'\s(?:src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']', re.I), 'external attribute'),
    (re.compile(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', re.I), 'external url()'),
    (re.compile(r'@import\s+(?:url\()?\s*["\']?https?:', re.I), '@import'),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('charts', nargs='?')
    ap.add_argument('-o', '--out')
    ap.add_argument('-p', '--palette', default='colorful')
    ap.add_argument('--list-palettes', action='store_true')
    args = ap.parse_args()

    palettes = load_palettes()
    if args.list_palettes:
        for pid, p in palettes.items():
            print(f"{pid:<20} {'[dark] ' if p.get('dark') else ''}{p['label']} — {p['desc']}")
        return
    if not args.input:
        ap.error('report.html required (or --list-palettes)')
    pal = palettes.get(args.palette)
    if not pal:
        sys.exit(f'Unknown palette "{args.palette}". Available: {", ".join(palettes)}')
    dark = bool(pal.get('dark'))

    html = Path(args.input).read_text(encoding='utf-8')
    tick3 = chr(96) * 3
    fence = re.match(r'^\s*' + tick3 + r'(?:html)?\s*\n([\s\S]*?)\n' + tick3 + r'\s*$', html)
    if fence:
        html = fence.group(1)

    specs = []
    if args.charts:
        data = json.loads(Path(args.charts).read_text(encoding='utf-8'))
        specs = data.get('charts', data if isinstance(data, list) else [])

    # Render every chart and replace its placeholder.
    for spec in specs:
        cid = spec.get('id')
        token = '{{CHART:' + str(cid) + '}}'
        if token not in html:
            print(f'⚠ chart "{cid}" has no {token} placeholder in the HTML — skipped', file=sys.stderr)
            continue
        try:
            b64 = render_chart(spec, pal, dark)
            alt = str(spec.get('title', cid)).replace('"', '')
            img = f'<img class="chart-img" src="data:image/png;base64,{b64}" alt="{alt}">'
            html = html.replace(token, img)
        except Exception as e:  # noqa: BLE001 — one bad chart must not kill the report
            print(f'⚠ chart "{cid}" failed to render ({e}) — placeholder removed', file=sys.stderr)
            html = html.replace(token, f'<p class="muted">[{spec.get("title", cid)}]</p>')

    leftovers = re.findall(r'\{\{CHART:([^}]+)\}\}', html)
    for cid in leftovers:
        print(f'⚠ placeholder {{{{CHART:{cid}}}}} had no spec in charts.json — removed', file=sys.stderr)
    html = re.sub(r'\{\{CHART:[^}]+\}\}', '', html)

    css_block = '<style>\n' + BASE_CSS + '\n' + palette_css(pal) + '\n</style>'
    if '{{BASE_CSS}}' in html:
        html = html.replace('{{BASE_CSS}}', css_block)
    elif re.search(r'</head>', html, re.I):
        html = re.sub(r'</head>', lambda m: css_block + m.group(0), html, count=1, flags=re.I)
    else:
        html = css_block + html
    html = re.sub(r'\{\{[A-Z_]+\}\}', '', html)

    if 'class="tabs"' in html or "class='tabs'" in html:
        if re.search(r'</body>', html, re.I):
            html = re.sub(r'</body>', lambda m: TABS_JS + m.group(0), html, count=1, flags=re.I)
        else:
            html += TABS_JS

    hits = []
    for rx, kind in EXTERNAL_RES:
        hits += [f'{kind}: {m.group(0).strip()[:120]}' for m in rx.finditer(html)]
    if hits:
        print(f'⚠ {len(hits)} forbidden external reference(s) removed:', file=sys.stderr)
        for v in hits[:10]:
            print('  - ' + v, file=sys.stderr)
        html = re.sub(r'\s(src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']',
                      ' data-removed-external=""', html, flags=re.I)
        html = re.sub(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', 'none', html, flags=re.I)

    out = args.out or re.sub(r'\.html?$', '', args.input, flags=re.I) + '-final.html'
    Path(out).write_text(html, encoding='utf-8')
    n = len(specs) - len(leftovers)
    print(f'✓ {out} ({len(html) / 1024 / 1024:.2f} MB, {n} chart(s), palette: {args.palette}'
          f'{" [dark]" if dark else ""}, offline self-contained)')


if __name__ == '__main__':
    main()
```
