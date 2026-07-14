---
name: infographic-report
description: >-
  Turns a source document (Hebrew or English — report, survey, review, spec)
  into a single self-contained interactive HTML infographic: hero header, KPI
  cards, Chart.js charts (17 types incl. heatmaps, country maps, waterfall),
  entity cards, timelines, CSS flow diagrams, optional tabbed-dashboard
  layout, 8 color palettes, full RTL support. Works fully offline — no CDN,
  no external requests. Use when the user asks for an infographic, a visual
  report, a dashboard, a data-visual summary of a document, or says
  "אינפוגרפיקה" / "דוח ויזואלי". The model writes the HTML with two
  placeholder tokens, then writes and runs the embedded python assembler
  (stdlib only, sandboxed) which fetches the bundled chart library once
  from an internal assets URL and produces the final self-contained file.
---

# Infographic Report

Convert a source document into ONE complete, self-contained, interactive HTML
infographic. You are the information designer: read the document, pick the
right visual for each data shape, and write the HTML. The heavy assets
(Chart.js + plugins + world map ≈ 0.4 MB, stylesheet, embedded Hebrew/Latin
font) are fetched once from an internal assets URL by the embedded assembler
script below — you never write them by hand.

## Workflow

1. **Read the source document.** Identify: headline numbers (→ KPI cards),
   themes (→ sections), enumerable entities like companies/products/options
   (→ entity cards), tabular data (→ charts/tables), processes (→ flow
   diagram), dates/milestones (→ timeline), and the language/direction.
2. **Choose palette and layout.** Defaults: palette `colorful`, layout auto
   (single scroll unless the document naturally splits into 3+ themes — then
   tabs). Honor any user preference. Palettes are listed below.
3. **Write `report.html`** (use the file-creation tool) following the OUTPUT
   CONTRACT below. Put the two placeholder tokens in `<head>` — do NOT try to
   inline the chart library.
4. **Write `assemble_infographic.py`** (file-creation tool): copy the code
   block from the "Embedded assembler" section at the end of this skill,
   VERBATIM and in full.
5. **Assemble** — run in the python sandbox (fetches the chart bundle once
   from the internal assets URL, injects stylesheet + font + palette, lints
   for forbidden external references):

   ```bash
   python3 assemble_infographic.py report.html -o infographic.html --palette colorful
   ```

   The assets URL is taken from `--assets-url` > the `INFOGRAPHIC_ASSETS_URL`
   env var > the `ASSETS_BASE_URL` constant at the top of the script (usually
   pre-set by whoever installed this skill). `--list-palettes` works offline.

6. **Deliver `infographic.html`.** It is one file, works from `file://`,
   fully offline for its viewers (the only network use ever is the one-time
   asset fetch by the assembler, which is then cached).

## OUTPUT CONTRACT — hard rules

1. Output a single complete HTML document. Start with `<!DOCTYPE html>`.
2. In the `<head>`, include these two placeholder tokens, each on its own
   line, exactly as written:

   ```
   {{BASE_CSS}}
   {{CHART_LIB}}
   ```

   The assemble script replaces them with the embedded stylesheet and the
   Chart.js library. Do NOT write `<link>` or `<script src=…>` tags for them.
3. ABSOLUTELY NO external URLs of any kind: no `http://`/`https://` links, no
   CDN scripts, no `@import`, no web fonts, no external images. No `<svg>`
   and no Mermaid. Charts use `<canvas>` + Chart.js only. Decorative icons
   must be emoji or pure CSS. (The assemble script warns and strips
   violations, but don't create them.)
4. Set `<html lang="…" dir="…">` to match the document language (`dir="rtl"`
   for Hebrew/Arabic, otherwise `ltr`). All text in the infographic must be
   in the document's language unless the user asks otherwise.
5. Use ONLY data that appears in the source document. Never invent numbers.
   If the document has no quantitative data, use qualitative visualizations:
   capability matrices (heatmap of 0/1 or scores), timelines, CSS flow
   diagrams, comparison cards.
6. Any JavaScript must be INLINE in a `<script>` at the end of `<body>`,
   wrapped in try/catch, and SANDBOX-SAFE: NEVER call `alert()`, `confirm()`,
   or `prompt()` — they crash sandboxed iframes; show messages via an inline
   element or `IDG_NOTICE(title, body)` instead. Use `textContent` (not
   `innerHTML`) when writing user/data values.
7. Chart robustness: put ALL chart initialization in ONE `<script>` at the
   END of `<body>` inside
   `document.addEventListener('DOMContentLoaded', function () { … });`
   Wrap EACH chart in its OWN `try { … } catch (e) {}`. Before initializing,
   get the canvas with `document.getElementById(...)` and SKIP it if missing.
   Every canvas id referenced must exist in the HTML, initialized only once.
8. Always set `responsive:true` and `maintainAspectRatio:false` on charts.
   For RTL documents also set `options.plugins.legend.rtl = true` and
   `options.plugins.tooltip.rtl = true` with `textDirection:'rtl'`.

## Layout

- **DEFAULT — single scroll:** a vertical sequence of
  `<section class="card">` blocks (best for most documents).
- **Tabbed dashboard:** when the document naturally splits into 3+ distinct
  themes (or the user asks for tabs), group content into 3–6 thematic tabs:

  ```html
  <div class="tabs" data-tab-group="g1">
    <button class="tab-btn" data-tab="t1">Label 1</button>
    <button class="tab-btn" data-tab="t2">Label 2</button>
  </div>
  <div class="tab-content active" data-tab-group="g1" data-tab="t1"> … sections … </div>
  <div class="tab-content" data-tab-group="g1" data-tab="t2"> … </div>
  ```

  Tabs are wired automatically by the bundled runtime (no script needed) and
  charts inside hidden tabs resize when shown. Mark the first pane `active`.
  Charts for ALL tabs still go in the single end-of-body script.
- **Forced single scroll:** if the user asks for "no tabs", use only stacked
  sections — no `.tabs`/`.tab-content` anywhere.

## Structure blueprint

Model it on a professional market-survey infographic, wrapped in
`<div class="container">`:

- **Hero:** `<header class="hero">` with `<span class="icon">📊</span>`, an
  `<h1>` title and `<p class="subtitle">` — derived from the document.
- **KPI strip:** `<div class="grid-3">` (or `grid-4`) of
  `<div class="kpi"><div class="value">…</div><div class="label">…</div></div>`
  for headline numbers found in the document.
- **Content sections:** typically 4–7 (3–4 for a concise report, 6–12 for a
  comprehensive one), each `<section class="card">` with
  `<h2 class="section-title">`. Base every section on the document.
- **Charts:** up to ~4 for a normal report (more only if the data demands
  it), each inside `<div class="chart-box"><canvas id="chart1"></canvas></div>`
  with a unique id. VARY the types — never make every chart a doughnut.
- **Entity cards:** when the document enumerates entities:
  `<div class="grid-3">` of `<div class="entity-card">` each with `<h3>`, a
  one-line description, and a short `<ul>` of key points.
- **Flow diagram:** if the document describes a process, a pure-CSS
  flowchart: `<div class="flow">` containing
  `<div class="flow-step"><span class="step-title">…</span>short text</div>`
  items, each pair separated by an EMPTY `<div class="flow-arrow"></div>`.
  The connector arrow is drawn by CSS — do NOT put any →, ←, -> characters
  inside `flow-arrow` or between steps. No SVG.
- **Footer:** `<footer class="footer">` with the source name and date.

## Chart types — choose by data shape, mix for variety

| Data shape | Chart | How |
|---|---|---|
| Parts of a whole | doughnut / pie / polarArea | `new Chart(el, {type:'doughnut', …})` |
| Compare categories | bar | vertical default |
| Long category labels | horizontal bar | `options.indexAxis:'y'` |
| Series side-by-side | grouped bar | several datasets |
| Composition per category | stacked bar | `options.scales.x.stacked:true` + `y.stacked:true` |
| Profile across dimensions | radar | |
| Trend over time | line / area | area: `datasets[].fill:true` + translucent backgroundColor |
| Correlation | scatter | `data:[{x,y}]` |
| Correlation + 3rd value | bubble | `data:[{x,y,r}]` |
| Bars + line together | mixed | per-dataset `type` |
| Total split into parts | waterfall | helper below |
| Intensity grid / capability matrix | heatmap | helper below |
| Values by country | choropleth / bubbleMap | helpers below |

**Bundled helpers** (palette- and RTL-aware, no options needed — prefer them):

```js
// Heatmap: matrix[rowIndex][colIndex] is a number
IDG_CHARTS.heatmap('canvasId', rowLabels, colLabels, matrix, { label:'…' });

// Country map (ONLY when the document gives per-country numbers).
// English country names; USA/UK aliases handled; map data embedded offline.
IDG_CHARTS.choropleth('canvasId', { 'Israel':12, 'United States':40 }, { label:'…' });
IDG_CHARTS.bubbleMap('canvasId', { 'Israel':12, 'Germany':8 }, { label:'…' });

// Waterfall: each non-total step adds to the running cumulative
IDG_CHARTS.waterfall('canvasId',
  [{label:'Wholesale', value:0.33}, {label:'Margin', value:0.40},
   {label:'Service', value:0.27}, {label:'Total', value:1.00, total:true}],
  { label:'…', prefix:'$' });

// Long chart labels → multi-line array Chart.js understands
labels: [IDG_FMT.wrap('a very long category label'), …]

// Number formatting (calculators, tooltips)
IDG_FMT.usd(n)  IDG_FMT.currency(n,'ILS')  IDG_FMT.num(n)  IDG_FMT.pct(n)

// Sandbox-safe message dialog (instead of alert/confirm)
IDG_NOTICE('Title', 'Body text');
```

Map/heatmap canvases look best in `<div class="chart-box tall">` or
`<div class="chart-box map">`. Plain `new Chart(...)` configs (including
`type:'matrix'`/`'choropleth'`) also work if you need full control.

## Other components — use when the data fits

- **Data table:** `<div class="table-wrap"><table class="data-table">…`
  (sticky header, zebra rows, horizontal scroll).
- **Timeline:** `<div class="timeline"><div class="timeline-item">
  <div class="t-date">2024</div><div class="t-title">…</div>
  <div class="t-body">…</div></div>…</div>`.
- **Numbered steps:** `<div class="num-list"><div class="num-item">
  <div class="num">01</div><div><h4>…</h4><p>…</p></div></div>…</div>`.
- **Bottom-line callout:** `<div class="callout"><div class="ct">Bottom
  line</div><p>…</p></div>`.
- **Stat callouts:** `<div class="stat"><div class="sv">value</div>
  <div class="sl">label</div></div>` — add class `positive` (green) or
  `warning` (amber).
- **Calculator** (ONLY when the document contains a clear formula/rates):
  `<input type="range" class="calc-slider" … oninput="recalc()">` inside a
  `<div class="calc">`, computing live into `.calc-out`/`.calc-result`
  elements with `IDG_FMT` formatting; define `recalc()` in the end-of-body
  script (try/catch) and call it once.

## CSS classes & variables

Prefer the injected classes over custom CSS: `.container .hero .icon
.subtitle .card .section-title .subsection-title .grid-2 .grid-3 .grid-4
.kpi .value .label .stat(.positive/.warning) .sv .sl .entity-card(.alt)
.chart-box(.small/.tall/.map/.wide) .badge .pill .table-wrap .data-table
.tabs .tab-btn .tab-content .calc .calc-row .calc-out .calc-slider
.calc-results .calc-result(.primary) .timeline .timeline-item .t-date
.t-title .t-body .num-list .num-item .num .callout .ct .flow .flow-step
.step-title .flow-arrow .footer .muted .accent`.

You may add ONE small `<style>` block for fine-tuning; it must reference no
external resources. The palette is exposed as CSS variables: `--c-primary
--c-secondary --c-accent --c-bg --c-grad-a --c-grad-b` plus theme surfaces
`--c-surface --c-surface-2 --c-text --c-muted --c-border`.

**Theme rule:** the palette MAY be dark. Do NOT hardcode white backgrounds
(`#fff`) or black/dark text — always use the classes or CSS variables so the
output adapts to light AND dark palettes.

## Color palettes

Pass the palette id to assemble (`--palette <id>`) — it injects the CSS
variables. Use that palette's `series` hex values for chart datasets
(`backgroundColor`/`borderColor`). Default: `colorful`.

<!-- PALETTES:START — generated by tools/build-skill.js; do not edit by hand -->
| id | Name | Character | Chart series (use for datasets) |
|---|---|---|---|
| `vibrant-tech-blues` | Vibrant Tech Blues | Blue single-hue charts | `#2563EB` `#60A5FA` `#1E40AF` `#93C5FD` `#0EA5E9` `#38BDF8` |
| `emerald-forest` | Emerald Forest | Green single-hue | `#059669` `#34D399` `#065F46` `#6EE7B7` `#0D9488` `#2DD4BF` |
| `warm-sunset` | Warm Sunset | Orange single-hue | `#EA580C` `#FB923C` `#9A3412` `#FDBA74` `#DC2626` `#F87171` |
| `royal-violet` | Royal Violet | Purple single-hue | `#7C3AED` `#A78BFA` `#5B21B6` `#C4B5FD` `#DB2777` `#F472B6` |
| `slate-mono` | Slate Mono | Grayscale / minimal | `#475569` `#94A3B8` `#1E293B` `#CBD5E1` `#64748B` `#A8B5C5` |
| `colorful` | Colorful | Multi-color charts (recommended) | `#4F46E5` `#F43F5E` `#F59E0B` `#10B981` `#0EA5E9` `#A855F7` |
| `energetic` | Energetic | Warm teal, yellow & orange | `#2A9D8F` `#E9C46A` `#F4A261` `#E76F51` `#264653` `#287271` |
| `slate-premium` | Slate Premium **(dark)** | Dark glass / dashboard theme | `#3B82F6` `#10B981` `#F59E0B` `#8B5CF6` `#EC4899` `#22D3EE` |

Dark palettes (e.g. `slate-premium`) override the surface variables — never hardcode light backgrounds (rule above).
<!-- PALETTES:END -->

## RTL / Hebrew

- `<html lang="he" dir="rtl">`; all text in Hebrew.
- Charts: `options.plugins.legend.rtl = true`, `options.plugins.tooltip.rtl
  = true`, `textDirection:'rtl'`.
- The bundled font (Heebo, Hebrew+Latin) is embedded by assemble — never add
  a web font.

## Self-check before delivering

- [ ] Starts with `<!DOCTYPE html>`; `{{BASE_CSS}}` and `{{CHART_LIB}}` each
      appear exactly once in `<head>`.
- [ ] Zero occurrences of `http://` / `https://` / `@import` / `<svg`.
- [ ] Every number traces to the source document.
- [ ] Every `<canvas>` id is unique, exists, and its init is guarded
      (`getElementById` + skip-if-missing + per-chart try/catch) inside one
      DOMContentLoaded script at the end of `<body>`.
- [ ] Chart types are varied and match the data shapes.
- [ ] No `alert`/`confirm`/`prompt` anywhere.
- [ ] `lang`/`dir` match the content language; RTL flags set for Hebrew.
- [ ] Ran the assemble script and it reported no violations.

## One-time setup (for whoever installs this skill)

Host the three asset files on any internal static web server (nginx, a
LiteLLM box, a file share with HTTP) under one directory, e.g.
`http://tools.internal/infographic-assets/`:

- `chart-lib.js` — Chart.js v4 + heatmap/geo plugins + embedded world atlas
  + the IDG_CHARTS/IDG_FMT/IDG_NOTICE helpers + tabs runtime (~0.4 MB)
- `base.css` — the output stylesheet
- `fonts.css` — embedded Heebo font (Hebrew+Latin)

(The files ship in the `assets/` folder of the full skill package /
repository.) Then edit the `ASSETS_BASE_URL` constant at the top of the
embedded assembler below to that URL. The assembler downloads them once per
workspace and caches them in `./infographic_assets/`.

## Embedded assembler — write this to `assemble_infographic.py` verbatim

```python
#!/usr/bin/env python3
"""Infographic assembler — single-file variant (python3 stdlib only).

Same behavior as assemble.py, but instead of reading assets from a local
folder it fetches them ONCE from an internal assets URL (then caches them in
./infographic_assets/), so the whole skill can travel as one markdown file.

    python3 assemble_infographic.py report.html [-o out.html]
        [--palette <id>] [--assets-url http://server/infographic-assets]
    python3 assemble_infographic.py --list-palettes

Assets URL priority: --assets-url > INFOGRAPHIC_ASSETS_URL env var > the
ASSETS_BASE_URL constant below (set it once when installing the skill).
The URL must serve: chart-lib.js, base.css, fonts.css
(the contents of the skill's assets/ folder)."""
import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# ── set once by the admin installing this skill ──────────────────────────
ASSETS_BASE_URL = "http://CHANGE-ME.internal/infographic-assets"
# ──────────────────────────────────────────────────────────────────────────

CACHE = Path('./infographic_assets')
ASSET_FILES = ['chart-lib.js', 'base.css', 'fonts.css']

# Palette definitions are inlined at build time so no fetch is needed.
PALETTES_JSON = r'''{"vibrant-tech-blues":{"label":"Vibrant Tech Blues","desc":"Blue single-hue charts","primary":"#2563EB","secondary":"#1E40AF","accent":"#60A5FA","bg":"#EFF6FF","gradA":"#1E3A8A","gradB":"#3B82F6","series":["#2563EB","#60A5FA","#1E40AF","#93C5FD","#0EA5E9","#38BDF8"]},"emerald-forest":{"label":"Emerald Forest","desc":"Green single-hue","primary":"#059669","secondary":"#065F46","accent":"#34D399","bg":"#ECFDF5","gradA":"#064E3B","gradB":"#10B981","series":["#059669","#34D399","#065F46","#6EE7B7","#0D9488","#2DD4BF"]},"warm-sunset":{"label":"Warm Sunset","desc":"Orange single-hue","primary":"#EA580C","secondary":"#9A3412","accent":"#FB923C","bg":"#FFF7ED","gradA":"#7C2D12","gradB":"#F97316","series":["#EA580C","#FB923C","#9A3412","#FDBA74","#DC2626","#F87171"]},"royal-violet":{"label":"Royal Violet","desc":"Purple single-hue","primary":"#7C3AED","secondary":"#5B21B6","accent":"#A78BFA","bg":"#F5F3FF","gradA":"#4C1D95","gradB":"#8B5CF6","series":["#7C3AED","#A78BFA","#5B21B6","#C4B5FD","#DB2777","#F472B6"]},"slate-mono":{"label":"Slate Mono","desc":"Grayscale / minimal","primary":"#475569","secondary":"#1E293B","accent":"#94A3B8","bg":"#F8FAFC","gradA":"#0F172A","gradB":"#475569","series":["#475569","#94A3B8","#1E293B","#CBD5E1","#64748B","#A8B5C5"]},"colorful":{"label":"Colorful","desc":"Multi-color charts (recommended)","primary":"#4F46E5","secondary":"#7C3AED","accent":"#F43F5E","bg":"#EEF2FF","gradA":"#4338CA","gradB":"#DB2777","series":["#4F46E5","#F43F5E","#F59E0B","#10B981","#0EA5E9","#A855F7"]},"energetic":{"label":"Energetic","desc":"Warm teal, yellow & orange","primary":"#2A9D8F","secondary":"#264653","accent":"#E76F51","bg":"#F0FDFA","gradA":"#264653","gradB":"#2A9D8F","series":["#2A9D8F","#E9C46A","#F4A261","#E76F51","#264653","#287271"]},"slate-premium":{"label":"Slate Premium","desc":"Dark glass / dashboard theme","dark":true,"primary":"#3B82F6","secondary":"#60A5FA","accent":"#10B981","bg":"#0F172A","gradA":"#1E293B","gradB":"#0B1220","series":["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#22D3EE"],"surface":"rgba(30, 41, 59, 0.72)","surface2":"rgba(15, 23, 42, 0.6)","text":"#E2E8F0","muted":"#94A3B8","border":"rgba(255, 255, 255, 0.08)","page":"#0F172A","heroText":"#FFFFFF","onPrimary":"#FFFFFF","shadow":"0 8px 30px rgba(0, 0, 0, 0.35)","blur":"blur(12px)"}}'''

SURFACE_MAP = {
    'surface': '--c-surface', 'surface2': '--c-surface-2', 'text': '--c-text',
    'muted': '--c-muted', 'border': '--c-border', 'page': '--c-page',
    'heroText': '--c-hero-text', 'onPrimary': '--c-on-primary',
    'shadow': '--c-shadow', 'blur': '--c-blur',
}

EXTERNAL_RES = [
    (re.compile(r'\s(?:src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']', re.I), 'external attribute'),
    (re.compile(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', re.I), 'external url()'),
    (re.compile(r'@import\s+(?:url\()?\s*["\']?https?:', re.I), '@import'),
]


def load_palettes():
    if PALETTES_JSON.startswith('__'):
        # Running from the repo (placeholder not substituted): use the local assets folder.
        local = Path(__file__).resolve().parent.parent / 'assets' / 'palettes.json'
        return json.loads(local.read_text(encoding='utf-8'))
    return json.loads(PALETTES_JSON)


def get_asset(name, base_url):
    """Return asset text, downloading to the cache once."""
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / name
    if cached.exists() and cached.stat().st_size > 0:
        return cached.read_text(encoding='utf-8')
    url = base_url.rstrip('/') + '/' + name
    try:
        # Connect DIRECTLY to the internal assets server — ignore any
        # http_proxy/https_proxy env vars (a corporate proxy usually cannot
        # reach an internal/localhost assets host and would time out).
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=30) as r:
            data = r.read().decode('utf-8')
    except Exception as e:  # noqa: BLE001 - single clear failure path
        sys.exit(f'✗ cannot fetch {url} ({e}).\n'
                 f'  Host the skill assets (chart-lib.js, base.css, fonts.css) on an\n'
                 f'  internal static server and pass --assets-url (or set the\n'
                 f'  INFOGRAPHIC_ASSETS_URL env var / ASSETS_BASE_URL constant).')
    cached.write_text(data, encoding='utf-8')
    return data


def palette_css(pal):
    vars_ = (f"--c-primary:{pal['primary']};--c-secondary:{pal['secondary']};"
             f"--c-accent:{pal['accent']};--c-bg:{pal['bg']};"
             f"--c-grad-a:{pal['gradA']};--c-grad-b:{pal['gradB']};")
    for key, var in SURFACE_MAP.items():
        if pal.get(key):
            vars_ += f"{var}:{pal[key]};"
    return ':root{' + vars_ + '}'


def lint_external(s):
    hits = []
    for rx, kind in EXTERNAL_RES:
        hits += [f'{kind}: {m.group(0).strip()[:120]}' for m in rx.finditer(s)]
    return hits


def strip_external(s):
    s = re.sub(r'\s(src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']',
               ' data-removed-external=""', s, flags=re.I)
    s = re.sub(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', 'none', s, flags=re.I)
    s = re.sub(r'@import\s+(?:url\()?\s*["\']?https?:[^;]+;?', '', s, flags=re.I)
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out')
    ap.add_argument('-p', '--palette', default='colorful')
    ap.add_argument('--assets-url', default=os.environ.get('INFOGRAPHIC_ASSETS_URL') or ASSETS_BASE_URL)
    ap.add_argument('--list-palettes', action='store_true')
    args = ap.parse_args()

    palettes = load_palettes()
    if args.list_palettes:
        for pid, p in palettes.items():
            dark = '[dark] ' if p.get('dark') else ''
            print(f"{pid:<20} {dark}{p['label']} — {p['desc']}")
        return
    if not args.input:
        ap.error('input file required (or --list-palettes)')
    pal = palettes.get(args.palette)
    if not pal:
        sys.exit(f'Unknown palette "{args.palette}". Available: {", ".join(palettes)}')

    html = Path(args.input).read_text(encoding='utf-8')
    # Tolerate a model that wrapped the document in markdown fences. (The
    # fence chars are built with chr() so this script itself can be embedded
    # inside a markdown code block.)
    tick3 = chr(96) * 3
    fence = re.match(r'^\s*' + tick3 + r'(?:html)?\s*\n([\s\S]*?)\n' + tick3 + r'\s*$', html)
    if fence:
        html = fence.group(1)

    css_block = ('<style>\n' + get_asset('fonts.css', args.assets_url) + '\n'
                 + get_asset('base.css', args.assets_url) + '\n</style>'
                 + '<style>' + palette_css(pal) + '</style>')
    lib = re.sub(r'</script', r'<\\/script', get_asset('chart-lib.js', args.assets_url), flags=re.I)
    lib_block = '<script>\n' + lib + '\n</script>'

    css_in = '{{BASE_CSS}}' in html
    lib_in = '{{CHART_LIB}}' in html
    html = html.replace('{{BASE_CSS}}', css_block).replace('{{CHART_LIB}}', lib_block)
    if not css_in or not lib_in:
        inject = ('' if css_in else css_block + '\n') + ('' if lib_in else lib_block + '\n')
        if re.search(r'</head>', html, re.I):
            html = re.sub(r'</head>', lambda m: inject + m.group(0), html, count=1, flags=re.I)
        elif re.search(r'<body[^>]*>', html, re.I):
            html = re.sub(r'<body[^>]*>', lambda m: m.group(0) + '\n' + inject, html, count=1, flags=re.I)
        else:
            html = inject + html
        missing = ('' if css_in else '{{BASE_CSS}} ') + ('' if lib_in else '{{CHART_LIB}}')
        print(f'⚠ token(s) missing ({missing.strip()}) — injected into <head> instead.', file=sys.stderr)

    html = re.sub(r'\{\{[A-Z_]+\}\}', '', html)

    violations = lint_external(html)
    if violations:
        print(f'⚠ {len(violations)} forbidden external reference(s) removed:', file=sys.stderr)
        for v in violations[:10]:
            print('  - ' + v, file=sys.stderr)
        html = strip_external(html)

    out = args.out or re.sub(r'\.html?$', '', args.input, flags=re.I) + '-final.html'
    Path(out).write_text(html, encoding='utf-8')
    dark = ' [dark]' if pal.get('dark') else ''
    print(f'✓ {out} ({len(html) / 1024 / 1024:.2f} MB, palette: {args.palette}{dark}, offline self-contained)')


if __name__ == '__main__':
    main()
```
