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
  (stdlib only, sandboxed) which pulls chart.js + plugins once from your
  internal npm registry (Artifactory) and produces the final
  self-contained interactive file.
---

# Infographic Report

Convert a source document into ONE complete, self-contained, interactive HTML
infographic. You are the information designer: read the document, pick the
right visual for each data shape, and write the HTML. The heavy assets
(Chart.js + plugins + world map ≈ 0.4 MB, stylesheet, embedded Hebrew/Latin
font) are pulled once from your internal npm registry (Artifactory) by the
embedded assembler script below — you never write them by hand.

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
4. **Write `build_infographic.py`** (file-creation tool): copy the code
   block from the "Embedded assembler" section at the end of this skill,
   VERBATIM and in full.
5. **Assemble** — run in the python sandbox (first run downloads ~0.7 MB of
   chart libraries from the npm registry and caches them; then injects
   stylesheet + palette + chart bundle and lints for forbidden external
   references):

   ```bash
   python3 build_infographic.py report.html -o infographic.html --palette colorful
   ```

   The registry is taken from `--registry` > the `INFOGRAPHIC_NPM_REGISTRY`
   env var > the `NPM_REGISTRY` constant at the top of the script (usually
   pre-set by whoever installed this skill). `--list-palettes` works offline.
   Read any warnings it prints and fix your HTML if needed.

6. **Deliver `infographic.html`.** One file, opens from `file://`, fully
   interactive (hover tooltips, tabs, calculators) and fully offline for its
   viewers — the only network use ever is the assembler's one-time library
   download from your registry.

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

Edit ONE line in the embedded assembler below: set `NPM_REGISTRY` to your
internal npm-compatible registry — for Artifactory that is typically
`https://artifactory.<company>/artifactory/api/npm/<npm-remote-or-virtual-repo>`.
The assembler pulls pinned versions of `chart.js`, `chartjs-chart-matrix`,
`chartjs-chart-geo`, `topojson-client` and `world-atlas` (≈0.7 MB total,
standard public npm packages every Artifactory npm remote already mirrors),
caches them in `./infographic_assets/`, and never touches the network again.
The stylesheet, helper runtime (IDG_CHARTS/IDG_FMT/IDG_NOTICE/tabs) and
palettes are embedded in the script itself.

## Embedded assembler — write this to `build_infographic.py` verbatim

```python
#!/usr/bin/env python3
"""Infographic assembler — npm/Artifactory variant (python3 stdlib only).

Produces the SAME fully interactive Chart.js infographic as the main
generator, with the chart libraries fetched ONCE from an npm-compatible
registry (your internal Artifactory npm remote/virtual repo, or any npm
mirror) and cached locally. The design-system stylesheet, the IDG_CHARTS/
IDG_FMT helper runtime and the color palettes are embedded in this file, so
the whole skill travels as one markdown file — nothing to host.

    python3 build_infographic.py report.html [-o out.html] [--palette <id>]
        [--registry https://artifactory.company/artifactory/api/npm/npm]
    python3 build_infographic.py --list-palettes

Registry priority: --registry > INFOGRAPHIC_NPM_REGISTRY env var > the
NPM_REGISTRY constant below (set it once when installing the skill).
Downloads ~0.7 MB on first run (chart.js + heatmap/geo plugins + world map),
cached in ./infographic_assets/ afterwards."""
import argparse
import io
import json
import os
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

# ── set once by whoever installs this skill (Artifactory npm repo URL) ────
NPM_REGISTRY = "https://registry.npmjs.org"
# e.g. "https://artifactory.company/artifactory/api/npm/npm-virtual"
# ──────────────────────────────────────────────────────────────────────────

CACHE = Path('./infographic_assets')

# (package, version, file-pattern candidates in the tarball — first match wins)
PACKAGES = [
    ('chart.js', '4.4.0', [r'dist/chart\.umd\.min\.js$', r'dist/chart\.umd\.js$']),
    ('chartjs-chart-matrix', '2.0.1', [r'dist/.*matrix\.min\.js$', r'dist/.*matrix\.js$']),
    ('topojson-client', '3.1.0', [r'dist/topojson-client\.min\.js$', r'dist/topojson-client\.js$']),
    ('chartjs-chart-geo', '4.3.4', [r'build/index\.umd\.min\.js$', r'dist/.*geo\.umd\.min\.js$',
                                    r'build/index\.umd\.js$', r'dist/.*geo\.umd\.js$']),
    ('world-atlas', '2.0.2', [r'countries-110m\.json$']),
]

# Build-time-injected constants (fallback: read from the repo checkout).
PALETTES_JSON = r'''{"vibrant-tech-blues":{"label":"Vibrant Tech Blues","desc":"Blue single-hue charts","primary":"#2563EB","secondary":"#1E40AF","accent":"#60A5FA","bg":"#EFF6FF","gradA":"#1E3A8A","gradB":"#3B82F6","series":["#2563EB","#60A5FA","#1E40AF","#93C5FD","#0EA5E9","#38BDF8"]},"emerald-forest":{"label":"Emerald Forest","desc":"Green single-hue","primary":"#059669","secondary":"#065F46","accent":"#34D399","bg":"#ECFDF5","gradA":"#064E3B","gradB":"#10B981","series":["#059669","#34D399","#065F46","#6EE7B7","#0D9488","#2DD4BF"]},"warm-sunset":{"label":"Warm Sunset","desc":"Orange single-hue","primary":"#EA580C","secondary":"#9A3412","accent":"#FB923C","bg":"#FFF7ED","gradA":"#7C2D12","gradB":"#F97316","series":["#EA580C","#FB923C","#9A3412","#FDBA74","#DC2626","#F87171"]},"royal-violet":{"label":"Royal Violet","desc":"Purple single-hue","primary":"#7C3AED","secondary":"#5B21B6","accent":"#A78BFA","bg":"#F5F3FF","gradA":"#4C1D95","gradB":"#8B5CF6","series":["#7C3AED","#A78BFA","#5B21B6","#C4B5FD","#DB2777","#F472B6"]},"slate-mono":{"label":"Slate Mono","desc":"Grayscale / minimal","primary":"#475569","secondary":"#1E293B","accent":"#94A3B8","bg":"#F8FAFC","gradA":"#0F172A","gradB":"#475569","series":["#475569","#94A3B8","#1E293B","#CBD5E1","#64748B","#A8B5C5"]},"colorful":{"label":"Colorful","desc":"Multi-color charts (recommended)","primary":"#4F46E5","secondary":"#7C3AED","accent":"#F43F5E","bg":"#EEF2FF","gradA":"#4338CA","gradB":"#DB2777","series":["#4F46E5","#F43F5E","#F59E0B","#10B981","#0EA5E9","#A855F7"]},"energetic":{"label":"Energetic","desc":"Warm teal, yellow & orange","primary":"#2A9D8F","secondary":"#264653","accent":"#E76F51","bg":"#F0FDFA","gradA":"#264653","gradB":"#2A9D8F","series":["#2A9D8F","#E9C46A","#F4A261","#E76F51","#264653","#287271"]},"slate-premium":{"label":"Slate Premium","desc":"Dark glass / dashboard theme","dark":true,"primary":"#3B82F6","secondary":"#60A5FA","accent":"#10B981","bg":"#0F172A","gradA":"#1E293B","gradB":"#0B1220","series":["#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#22D3EE"],"surface":"rgba(30, 41, 59, 0.72)","surface2":"rgba(15, 23, 42, 0.6)","text":"#E2E8F0","muted":"#94A3B8","border":"rgba(255, 255, 255, 0.08)","page":"#0F172A","heroText":"#FFFFFF","onPrimary":"#FFFFFF","shadow":"0 8px 30px rgba(0, 0, 0, 0.35)","blur":"blur(12px)"}}'''
BASE_CSS_SRC = r'''/* IDG base.css — compact utility stylesheet injected into every generated
   infographic ({{BASE_CSS}} token). Hero gradient, cards, KPI tiles, entity
   cards, CSS flowchart, tabs, calculator, timeline, tables — all themeable via
   CSS variables (light by default; a dark "Slate Premium" palette overrides
   the surface variables). No external dependencies. */

:root {
  --c-primary: #2563EB;
  --c-secondary: #1E40AF;
  --c-accent: #60A5FA;
  --c-bg: #EFF6FF;
  --c-grad-a: #1E3A8A;
  --c-grad-b: #3B82F6;
  /* Surfaces (a dark palette overrides these) */
  --c-surface: #FFFFFF;          /* card background */
  --c-surface-2: #EFF6FF;        /* inner panels / tints */
  --c-text: #1F2937;
  --c-muted: #6B7280;
  --c-border: rgba(15, 23, 42, 0.08);
  --c-page: var(--c-bg);         /* body background */
  --c-hero-text: #FFFFFF;
  --c-on-primary: #FFFFFF;       /* text on a primary-colored fill */
  --c-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);
  --c-blur: none;                /* glassmorphism blur (dark theme sets it) */
  --c-positive: #10B981;
  --c-warning: #F59E0B;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }

body {
  font-family: 'Heebo', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  background: var(--c-page);
  color: var(--c-text);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.container { max-width: 1100px; margin: 0 auto; padding: 0 20px 40px; }

/* ---- Hero ---- */
.hero {
  background: linear-gradient(135deg, var(--c-grad-a), var(--c-grad-b));
  color: var(--c-hero-text);
  text-align: center;
  padding: 56px 24px 48px;
  margin-bottom: 32px;
}
.hero .icon { font-size: 52px; line-height: 1; display: block; margin-bottom: 12px; }
.hero h1 { font-size: 38px; font-weight: 800; margin: 0 0 10px; letter-spacing: -0.5px; }
.hero .subtitle { font-size: 18px; font-weight: 300; opacity: 0.92; max-width: 760px; margin: 0 auto; }

/* ---- Cards & sections ---- */
.card {
  background: var(--c-surface);
  -webkit-backdrop-filter: var(--c-blur);
  backdrop-filter: var(--c-blur);
  border: 1px solid var(--c-border);
  border-radius: 16px;
  box-shadow: var(--c-shadow);
  padding: 28px 32px;
  margin-bottom: 28px;
}
.section-title {
  display: inline-block;
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 18px;
  padding-bottom: 6px;
  border-bottom: 4px solid var(--c-primary);
}
.subsection-title { font-size: 17px; font-weight: 600; margin: 18px 0 8px; color: var(--c-secondary); }
.muted { color: var(--c-muted); }
.accent { color: var(--c-primary); }

/* ---- Grids ---- */
.grid-2, .grid-3, .grid-4 { display: grid; gap: 20px; }
.grid-2 { grid-template-columns: repeat(2, 1fr); }
.grid-3 { grid-template-columns: repeat(3, 1fr); }
.grid-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 860px) {
  .grid-3, .grid-4 { grid-template-columns: repeat(2, 1fr); }
  .hero h1 { font-size: 28px; }
}
@media (max-width: 560px) {
  .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
}

/* ---- KPI tiles ---- */
.kpi {
  background: var(--c-surface-2);
  border-radius: 14px;
  padding: 20px 16px;
  text-align: center;
  border-top: 4px solid var(--c-primary);
}
.kpi .value { font-size: 34px; font-weight: 800; color: var(--c-primary); line-height: 1.15; }
.kpi .label { font-size: 13.5px; color: var(--c-muted); margin-top: 4px; }

/* ---- Stat callout (accent-bordered) ---- */
.stat { background: var(--c-surface-2); border-radius: 12px; padding: 14px 16px; border-inline-start: 4px solid var(--c-primary); }
.stat .sv { font-size: 22px; font-weight: 800; color: var(--c-text); }
.stat .sl { font-size: 12.5px; color: var(--c-muted); }
.stat.positive { border-inline-start-color: var(--c-positive); }
.stat.positive .sv { color: var(--c-positive); }
.stat.warning { border-inline-start-color: var(--c-warning); }
.stat.warning .sv { color: var(--c-warning); }

/* ---- Entity cards ---- */
.entity-card {
  background: var(--c-surface);
  -webkit-backdrop-filter: var(--c-blur);
  backdrop-filter: var(--c-blur);
  border-radius: 14px;
  border: 1px solid var(--c-border);
  border-top: 5px solid var(--c-primary);
  padding: 20px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.entity-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(15, 23, 42, 0.18); }
.entity-card h3 { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
.entity-card ul { margin: 8px 0 0; padding-inline-start: 18px; font-size: 14px; }
.entity-card.alt { border-top-color: var(--c-accent); }

/* ---- Charts ---- */
/* width:100% is required so a chart-box placed in a grid/flex cell stretches to
   the cell (auto margins would otherwise collapse it to its 0-width content). */
.chart-box { position: relative; width: 100%; height: 320px; max-width: 640px; margin: 0 auto; }
.chart-box.small { height: 240px; }
.chart-box.tall { height: 420px; max-width: 760px; }
.chart-box.wide { max-width: 960px; }
.chart-box.map { height: 460px; max-width: 920px; }

/* ---- Badges & pills ---- */
.badge {
  display: inline-block;
  background: var(--c-primary);
  color: var(--c-on-primary);
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  padding: 3px 12px;
}
.pill {
  display: inline-block;
  background: var(--c-surface-2);
  color: var(--c-secondary);
  border: 1.5px solid var(--c-accent);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 16px;
  margin: 3px;
}

/* ---- Tables ---- */
.table-wrap { overflow-x: auto; border: 1px solid var(--c-border); border-radius: 12px; margin: 4px 0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.data-table th {
  background: var(--c-secondary);
  color: var(--c-on-primary);
  font-weight: 600;
  padding: 10px 12px;
  text-align: start;
  position: sticky;
  top: 0;
}
.data-table td { padding: 9px 12px; border-bottom: 1px solid var(--c-border); }
.data-table tr:nth-child(even) td { background: var(--c-surface-2); }
.data-table tbody tr:hover td { background: var(--c-surface-2); filter: brightness(0.97); }

/* ---- Tabs (interactive in the live/HTML output; auto-wired by IDG_TABS,
        flattened to a single scroll in PDF/Static exports) ---- */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  border-bottom: 1px solid var(--c-border);
  margin-bottom: 24px;
  overflow-x: auto;
}
.tab-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 10px 18px;
  font-weight: 600;
  font-size: 15px;
  color: var(--c-muted);
  border-bottom: 3px solid transparent;
  white-space: nowrap;
  font-family: inherit;
  margin-bottom: -1px;
}
.tab-btn:hover { color: var(--c-text); }
.tab-btn.tab-active { color: var(--c-primary); border-bottom-color: var(--c-primary); }
.tab-content { display: none; }
.tab-content.active { display: block; }

/* ---- Interactive calculator ---- */
.calc { display: flex; flex-direction: column; gap: 18px; }
.calc-models { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.calc-model {
  background: var(--c-surface-2);
  border: 2px solid var(--c-border);
  border-radius: 12px;
  padding: 14px;
  text-align: center;
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  color: var(--c-text);
  font-family: inherit;
}
.calc-model.active { border-color: var(--c-primary); color: var(--c-primary); }
.calc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-weight: 600; font-size: 14px; }
.calc-out { color: var(--c-primary); font-variant-numeric: tabular-nums; }
input[type="range"].calc-slider {
  width: 100%; height: 6px; border-radius: 999px; background: var(--c-surface-2);
  -webkit-appearance: none; appearance: none; cursor: pointer; outline: none;
}
input[type="range"].calc-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
  background: var(--c-primary); border: 2px solid var(--c-surface); cursor: pointer;
}
input[type="range"].calc-slider::-moz-range-thumb {
  width: 18px; height: 18px; border-radius: 50%; background: var(--c-primary); border: none; cursor: pointer;
}
.calc-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.calc-result { background: var(--c-surface-2); border-radius: 12px; padding: 16px; text-align: center; }
.calc-result.primary { border: 1px solid var(--c-accent); }
.calc-result .rv { font-size: 24px; font-weight: 800; color: var(--c-primary); font-variant-numeric: tabular-nums; }
.calc-result .rl { font-size: 12.5px; color: var(--c-muted); }

/* ---- Numbered list (01/02/03 circular badges) ---- */
.num-list { display: flex; flex-direction: column; gap: 16px; }
.num-item { display: flex; gap: 14px; align-items: flex-start; }
.num-item .num {
  flex: none; width: 34px; height: 34px; border-radius: 50%;
  background: var(--c-primary); color: var(--c-on-primary);
  font-weight: 800; display: flex; align-items: center; justify-content: center;
}
.num-item h4 { margin: 0 0 2px; font-size: 15px; }
.num-item p { margin: 0; font-size: 13.5px; color: var(--c-muted); }

/* ---- Callout / "bottom line" highlight box ---- */
.callout { background: var(--c-surface-2); border-inline-start: 5px solid var(--c-accent); border-radius: 10px; padding: 14px 18px; margin: 8px 0; }
.callout .ct { font-weight: 800; color: var(--c-accent); margin-bottom: 4px; }

/* ---- Timeline ---- */
.timeline { position: relative; padding-inline-start: 26px; }
.timeline::before { content: ""; position: absolute; inset-inline-start: 6px; top: 4px; bottom: 4px; width: 2px; background: var(--c-border); }
.timeline-item { position: relative; padding: 0 0 22px; }
.timeline-item::before {
  content: ""; position: absolute; inset-inline-start: -26px; top: 4px;
  width: 12px; height: 12px; border-radius: 50%; background: var(--c-primary);
  border: 2px solid var(--c-surface);
}
.timeline-item .t-date { font-size: 12.5px; font-weight: 700; color: var(--c-primary); }
.timeline-item .t-title { font-weight: 700; margin: 2px 0; }
.timeline-item .t-body { font-size: 13.5px; color: var(--c-muted); }

/* ---- CSS-only flowchart ---- */
.flow {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  justify-content: center;
  gap: 6px;
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
  border-radius: 16px;
  padding: 28px 20px;
}
.flow-step {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-top: 4px solid var(--c-primary);
  color: var(--c-text);
  border-radius: 12px;
  padding: 16px 18px;
  min-width: 140px;
  max-width: 230px;
  text-align: center;
  font-size: 14px;
  align-self: center;
  box-shadow: var(--c-shadow);
}
.flow-step .step-title { font-weight: 700; color: var(--c-secondary); display: block; margin-bottom: 4px; }
/* The connector is drawn purely in CSS. font-size:0 hides any stray →/←/->
   glyph a model may place inside the element, so only one arrow ever shows. */
.flow-arrow {
  align-self: center;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0;
  padding: 0 10px;
  user-select: none;
}
.flow-arrow::after {
  content: "";
  display: block;
  width: 13px;
  height: 13px;
  border-top: 3px solid var(--c-primary);
  border-right: 3px solid var(--c-primary);
  transform: rotate(45deg);            /* LTR: points right */
}
[dir="rtl"] .flow-arrow::after { transform: rotate(-135deg); }   /* RTL: points left */
@media (max-width: 700px) {
  .flow { flex-direction: column; align-items: center; }
  .flow-step { width: 100%; max-width: 340px; }
  .flow-arrow { padding: 4px 0; }
  .flow-arrow::after,
  [dir="rtl"] .flow-arrow::after { transform: rotate(135deg); }  /* points down */
}

/* ---- Progress / comparison bars ---- */
.hbar { background: var(--c-surface-2); border-radius: 999px; height: 14px; overflow: hidden; margin: 6px 0 14px; }
.hbar > span { display: block; height: 100%; background: linear-gradient(90deg, var(--c-primary), var(--c-accent)); border-radius: 999px; }

/* ---- Inline notice modal (sandbox-safe replacement for alert/confirm) ---- */
.idg-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); z-index: 9999; padding: 20px; }
.idg-modal.open { display: flex; }
.idg-modal .idg-modal-box { background: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border); border-radius: 16px; padding: 22px 24px; max-width: 380px; width: 100%; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
.idg-modal h3 { margin: 0 0 8px; font-size: 17px; }
.idg-modal p { margin: 0 0 16px; color: var(--c-muted); font-size: 14px; }
.idg-modal button { background: var(--c-primary); color: var(--c-on-primary); border: none; border-radius: 9px; padding: 8px 18px; font-weight: 600; cursor: pointer; font-family: inherit; }

/* ---- Footer ---- */
.footer {
  text-align: center;
  font-size: 13px;
  color: var(--c-muted);
  padding: 26px 16px 34px;
  border-top: 1px solid var(--c-border);
  margin-top: 36px;
}

/* ---- Print / Save-as-PDF (also reveal all tabs as one scroll) ---- */
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { background: #fff; }
  .container { max-width: 100%; padding: 0 12px; }
  .hero { padding: 28px 20px; }
  .tabs { display: none; }
  .tab-content { display: block !important; }
  .card, .entity-card, .chart-box, .flow, .kpi, table { break-inside: avoid; page-break-inside: avoid; }
  .section-title { break-after: avoid; page-break-after: avoid; }
  .entity-card:hover { transform: none; box-shadow: none; }
  a[href]:after { content: ""; }
}
@page { margin: 14mm; }
'''
CHART_EXTRAS_SRC = r'''/* IDG chart-extras — runtime injected into every generated infographic,
   loaded right after Chart.js + the matrix/geo plugins + topojson-client.

   It does two things:
   1. Builds window.IDG_GEO from the embedded world topology (set just above
      as window.__IDG_WORLD_TOPO__) so outputs get ready-to-use country
      features with zero network access.
   2. Exposes window.IDG_CHARTS — one-call, RTL-aware, palette-aware builders
      for the chart types that are fiddly to configure by hand (heatmap,
      choropleth map, bubble map). Raw Chart.js configs still work too; these
      just make the hard ones reliable for smaller models.

   Everything is wrapped so it can never throw at load time (it also runs in
   the generator's own page, which has no canvases). */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : this;
  if (!W || typeof W.Chart === 'undefined') return;

  /* ---------- palette helpers ---------- */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || '').trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    if (isNaN(n) || hex.length !== 6) return [37, 99, 235];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  function isRTL() {
    try { return (document.documentElement.getAttribute('dir') || document.dir || '').toLowerCase() === 'rtl'; }
    catch (e) { return false; }
  }
  function ctxOf(target) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return null;
    return el.getContext ? el : (el.querySelector ? el.querySelector('canvas') : null);
  }

  /* ---------- IDG_GEO: country features from the embedded topology ---------- */
  var GEO = { ready: false, countries: [], outline: [], _byName: {} };
  (function buildGeo() {
    try {
      var topo = W.__IDG_WORLD_TOPO__;
      if (!topo || !W.topojson || !topo.objects || !topo.objects.countries) return;
      var fc = W.topojson.feature(topo, topo.objects.countries);
      GEO.countries = fc.features || [];
      GEO.outline = GEO.countries;
      GEO.countries.forEach(function (f) {
        var n = f.properties && f.properties.name;
        if (n) GEO._byName[n.toLowerCase()] = f;
      });
    } catch (e) { /* leave GEO empty; helpers will no-op */ }
    GEO.ready = GEO.countries.length > 0;
  })();

  // Common name aliases → world-atlas canonical names.
  var ALIASES = {
    'usa': 'united states of america', 'us': 'united states of america',
    'united states': 'united states of america', 'u.s.': 'united states of america',
    'uk': 'united kingdom', 'u.k.': 'united kingdom', 'england': 'united kingdom',
    'south korea': 'south korea', 'korea': 'south korea', 'russia': 'russia',
    'uae': 'united arab emirates', 'czech republic': 'czechia', 'czech': 'czechia',
    'ivory coast': "côte d'ivoire", 'drc': 'dem. rep. congo',
    'congo': 'dem. rep. congo', 'bosnia': 'bosnia and herz.',
  };
  GEO.feature = function (name) {
    if (!name) return null;
    var k = String(name).toLowerCase().trim();
    return GEO._byName[k] || GEO._byName[ALIASES[k] || ''] || null;
  };

  W.IDG_GEO = GEO;

  /* Approximate [lon,lat] centroid of a country feature (bbox centre of its
     largest ring) — good enough to place a bubble inside the country. */
  function centroid(f) {
    try {
      var g = f && f.geometry;
      if (!g) return null;
      var ring = null;
      if (g.type === 'Polygon') ring = g.coordinates[0];
      else if (g.type === 'MultiPolygon') {
        var best = 0;
        g.coordinates.forEach(function (poly) {
          if (poly[0] && poly[0].length > best) { best = poly[0].length; ring = poly[0]; }
        });
      }
      if (!ring || !ring.length) return null;
      var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (var i = 0; i < ring.length; i++) {
        var p = ring[i];
        if (p[0] < minx) minx = p[0];
        if (p[0] > maxx) maxx = p[0];
        if (p[1] < miny) miny = p[1];
        if (p[1] > maxy) maxy = p[1];
      }
      return [(minx + maxx) / 2, (miny + maxy) / 2];
    } catch (e) { return null; }
  }
  GEO.centroid = centroid;

  /* ---------- IDG_CHARTS: one-call builders ---------- */
  function commonPlugins(rtl) {
    return { legend: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr', labels: { font: { family: 'Heebo' } } } };
  }

  var IDG_CHARTS = {
    /* Heatmap / matrix.
       rows: array of row labels (y). cols: array of column labels (x).
       matrix: 2D array matrix[rowIndex][colIndex] = number.
       opts: { label, min, max } */
    heatmap: function (target, rows, cols, matrix, opts) {
      var el = ctxOf(target);
      if (!el) return null;
      opts = opts || {};
      var rtl = isRTL();
      var prim = hexToRgb(cssVar('--c-primary', '#2563EB'));
      var light = hexToRgb(cssVar('--c-bg', '#EFF6FF'));
      var vals = [];
      var points = [];
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < cols.length; c++) {
          var v = (matrix[r] && matrix[r][c] != null) ? +matrix[r][c] : null;
          if (v != null && !isNaN(v)) vals.push(v);
          points.push({ x: cols[c], y: rows[r], v: v });
        }
      }
      var min = opts.min != null ? opts.min : Math.min.apply(null, vals.length ? vals : [0]);
      var max = opts.max != null ? opts.max : Math.max.apply(null, vals.length ? vals : [1]);
      var span = (max - min) || 1;
      return new W.Chart(el, {
        type: 'matrix',
        data: {
          datasets: [{
            label: opts.label || '',
            data: points,
            backgroundColor: function (c) {
              var raw = c.raw || {};
              if (raw.v == null || isNaN(raw.v)) return 'rgba(0,0,0,0.04)';
              return rgba(mix(light, prim, (raw.v - min) / span), 0.95);
            },
            borderColor: 'rgba(255,255,255,0.6)',
            borderWidth: 1,
            width: function (c) { var a = c.chart.chartArea || {}; return (a.width || 0) / cols.length - 2; },
            height: function (c) { var a = c.chart.chartArea || {}; return (a.height || 0) / rows.length - 2; },
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr',
              callbacks: {
                title: function (items) { var r = items[0].raw; return r.y + ' · ' + r.x; },
                label: function (item) { return (opts.label ? opts.label + ': ' : '') + (item.raw.v == null ? '—' : item.raw.v); },
              },
            },
          },
          scales: {
            x: { type: 'category', labels: cols, position: rtl ? 'top' : 'bottom', grid: { display: false }, ticks: { font: { family: 'Heebo' } } },
            y: { type: 'category', labels: rows, offset: true, reverse: true, grid: { display: false }, ticks: { font: { family: 'Heebo' } } },
          },
        },
      });
    },

    /* Choropleth world map.
       valuesByName: { "Israel": 12, "United States": 40, ... }
       opts: { label, projection, quantize } */
    choropleth: function (target, valuesByName, opts) {
      var el = ctxOf(target);
      if (!el || !GEO.ready) return null;
      opts = opts || {};
      var rtl = isRTL();
      var data = GEO.countries.map(function (f) {
        var name = f.properties && f.properties.name;
        var v = null, lk = name && valuesByName[name];
        if (lk == null) {
          // try case-insensitive / alias match against provided keys
          for (var key in valuesByName) {
            if (GEO.feature(key) === f) { v = valuesByName[key]; break; }
          }
        } else v = lk;
        return { feature: f, value: v == null ? 0 : +v };
      });
      return new W.Chart(el, {
        type: 'choropleth',
        data: {
          labels: GEO.countries.map(function (f) { return f.properties.name; }),
          datasets: [{ label: opts.label || '', outline: GEO.outline, data: data }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          showOutline: true, showGraticule: false,
          plugins: { legend: { display: false }, tooltip: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr' } },
          scales: {
            projection: { axis: 'x', projection: opts.projection || 'equalEarth' },
            color: {
              axis: 'x', quantize: opts.quantize || 5,
              legend: { position: rtl ? 'bottom-left' : 'bottom-right', align: 'bottom' },
              missing: cssVar('--c-bg', '#EFF6FF'),
            },
          },
        },
      });
    },

    /* Proportional bubble map.
       valuesByName: { "Israel": 12, ... }  opts: { label }
       BubbleMap needs explicit longitude/latitude per point (it does not derive
       them from a feature), so we place each bubble at the country centroid. */
    bubbleMap: function (target, valuesByName, opts) {
      var el = ctxOf(target);
      if (!el || !GEO.ready) return null;
      opts = opts || {};
      var rtl = isRTL();
      var prim = cssVar('--c-primary', '#2563EB');
      var data = [], labels = [];
      for (var key in valuesByName) {
        var f = GEO.feature(key);
        if (!f) continue;
        var c = centroid(f);
        if (!c) continue;
        labels.push(f.properties.name);
        data.push({ longitude: c[0], latitude: c[1], value: +valuesByName[key] });
      }
      return new W.Chart(el, {
        type: 'bubbleMap',
        data: { labels: labels,
          datasets: [{ label: opts.label || '', outline: GEO.outline, backgroundColor: prim, data: data }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          showOutline: true, showGraticule: false,
          plugins: { legend: { display: false }, tooltip: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr' } },
          scales: {
            projection: { axis: 'x', projection: opts.projection || 'equalEarth' },
            size: { axis: 'x', range: [2, 26] },
          },
        },
      });
    },
  };

  /* Waterfall — cumulative build-up of relative steps to a total, drawn as
     Chart.js floating bars (offline, canvas; no Plotly needed).
     steps: [{label, value, total?}]. Each non-total step adds `value` to the
     running cumulative; a {total:true} step draws a full bar from 0 (to its
     value, or to the running cumulative if value is omitted). */
  IDG_CHARTS.waterfall = function (target, steps, opts) {
    var el = ctxOf(target);
    if (!el || !steps || !steps.length) return null;
    opts = opts || {};
    var rtl = isRTL();
    var inc = cssVar('--c-primary', '#2563EB');
    var dec = cssVar('--c-accent', '#F43F5E');
    var tot = cssVar('--c-secondary', '#1E40AF');
    var labels = [], data = [], colors = [], running = 0;
    steps.forEach(function (s) {
      var v = +s.value || 0;
      labels.push(s.label);
      if (s.total) {
        data.push([0, s.value != null ? v : running]);
        colors.push(tot);
      } else {
        data.push([running, running + v]);
        colors.push(v >= 0 ? inc : dec);
        running += v;
      }
    });
    return new W.Chart(el, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: opts.label || '', data: data, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr',
            callbacks: { label: function (c) { var r = c.raw || [0, 0]; return (opts.prefix || '') + (Math.round(Math.abs(r[1] - r[0]) * 100) / 100); } },
          },
        },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
      },
    });
  };

  W.IDG_CHARTS = IDG_CHARTS;

  /* ---------- IDG_FMT: number / currency / percent / label-wrap ---------- */
  W.IDG_FMT = {
    usd: function (n) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + Math.round(n || 0); } },
    currency: function (n, cur) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); } catch (e) { return '' + Math.round(n || 0); } },
    num: function (n) { try { return new Intl.NumberFormat().format(n); } catch (e) { return '' + n; } },
    pct: function (n, d) { var f = Math.pow(10, d == null ? 1 : d); return (Math.round((n || 0) * f) / f) + '%'; },
    // Wrap a long chart label onto multiple lines (Chart.js accepts an array
    // of strings as a multi-line label). Returns the string unchanged if short.
    wrap: function (label, max) {
      max = max || 16;
      var s = String(label == null ? '' : label);
      if (s.length <= max) return s;
      var words = s.split(' '), lines = [], cur = '';
      words.forEach(function (w) {
        if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur.trim()); cur = w; }
        else cur += ' ' + w;
      });
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    },
  };

  /* ---------- IDG_NOTICE: sandbox-safe replacement for alert()/confirm() ----
     (native dialogs throw / are blocked inside sandboxed iframes). */
  W.IDG_NOTICE = function (title, body) {
    try {
      var m = document.getElementById('idg-notice');
      if (!m) {
        m = document.createElement('div');
        m.id = 'idg-notice';
        m.className = 'idg-modal';
        m.innerHTML = '<div class="idg-modal-box"><h3></h3><p></p><div style="text-align:end"><button>OK</button></div></div>';
        document.body.appendChild(m);
        m.querySelector('button').addEventListener('click', function () { m.classList.remove('open'); });
      }
      m.querySelector('h3').textContent = title || '';
      m.querySelector('p').textContent = body || '';
      m.classList.add('open');
    } catch (e) { /* noop */ }
  };

  /* ---------- IDG_TABS: auto-wire tab dashboards + chart reflow ----------
     Markup convention (no per-chart script needed):
       <div class="tabs" data-tab-group="g"><button class="tab-btn" data-tab="a">…</button>…</div>
       <div class="tab-content" data-tab-group="g" data-tab="a">…</div> …
     The first pane of each group is shown; switching reveals the target pane
     and resizes any charts inside it (charts created in hidden panes render at
     0px until first shown). */
  var raf = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : function (cb) { return setTimeout(cb, 16); };
  var IDG_TABS = {
    // Resize charts after layout has flushed. Charts created in a display:none
    // (or 0-width grid) container have a 0-size canvas; we wait two animation
    // frames so the revealed container has real dimensions, then resize+redraw.
    reflow: function (root) {
      if (!W.Chart) return;
      raf(function () { raf(function () {
        (root || document).querySelectorAll('canvas').forEach(function (c) {
          var ch = W.Chart.getChart(c);
          if (ch) { try { ch.resize(); ch.update('none'); } catch (e) { /* noop */ } }
        });
      }); });
    },
    activate: function (group, tab) {
      document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) {
        b.classList.toggle('tab-active', b.getAttribute('data-tab') === tab);
      });
      document.querySelectorAll('.tab-content[data-tab-group="' + group + '"]').forEach(function (p) {
        var on = p.getAttribute('data-tab') === tab;
        p.classList.toggle('active', on);
        if (on) IDG_TABS.reflow(p);
      });
    },
    init: function () {
      var groups = {};
      document.querySelectorAll('.tabs[data-tab-group]').forEach(function (nav) {
        var g = nav.getAttribute('data-tab-group');
        nav.querySelectorAll('.tab-btn').forEach(function (btn) {
          if (groups[g] == null) groups[g] = btn.getAttribute('data-tab');
          btn.addEventListener('click', function () { IDG_TABS.activate(g, btn.getAttribute('data-tab')); });
        });
      });
      // Ensure exactly one active pane per group on load.
      Object.keys(groups).forEach(function (g) {
        var any = document.querySelector('.tab-content[data-tab-group="' + g + '"].active');
        IDG_TABS.activate(g, any ? any.getAttribute('data-tab') : groups[g]);
      });
    },
  };
  W.IDG_TABS = IDG_TABS;

  /* On load: make charts theme-aware (light text on the dark palette) and wire
     up any tab dashboards. Registered here (before the model's own
     DOMContentLoaded chart script) so it runs first. */
  function onReady() {
    try {
      if (W.Chart) {
        var cs = getComputedStyle(document.documentElement);
        var txt = (cs.getPropertyValue('--c-text') || '').trim();
        var bdr = (cs.getPropertyValue('--c-border') || '').trim();
        if (txt) W.Chart.defaults.color = txt;
        if (bdr) W.Chart.defaults.borderColor = bdr;
      }
    } catch (e) { /* noop */ }
    try { IDG_TABS.init(); } catch (e) { /* noop */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
'''

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


def _embedded(src, repo_rel):
    if not src.startswith('__'):
        return src
    p = Path(__file__).resolve().parent.parent.parent.parent / repo_rel
    return p.read_text(encoding='utf-8')


def load_palettes():
    if PALETTES_JSON.startswith('__'):
        local = Path(__file__).resolve().parent.parent / 'assets' / 'palettes.json'
        return json.loads(local.read_text(encoding='utf-8'))
    return json.loads(PALETTES_JSON)


def http_get(url):
    """GET bytes; try the environment's proxy config first, then a direct
    connection (internal registries are often not reachable via a corporate
    proxy)."""
    last = None
    for handlers in ([], [urllib.request.ProxyHandler({})]):
        try:
            opener = urllib.request.build_opener(*handlers)
            with opener.open(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — fall through to next strategy
            last = e
    raise RuntimeError(f'{url}: {last}')


def fetch_asset(name, version, patterns, registry):
    """Return the wanted file's text from an npm package, cached locally."""
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / f"{name.replace('/', '_')}-{version}.asset"
    if cached.exists() and cached.stat().st_size > 0:
        return cached.read_text(encoding='utf-8')
    base = registry.rstrip('/')
    try:
        meta = json.loads(http_get(f'{base}/{name}/{version}').decode('utf-8'))
        tarball_url = meta['dist']['tarball']
    except Exception:
        # Some registries block metadata routes — fall back to the standard tarball path.
        tarball_url = f"{base}/{name}/-/{name.split('/')[-1]}-{version}.tgz"
    try:
        data = http_get(tarball_url)
        tf = tarfile.open(fileobj=io.BytesIO(data), mode='r:gz')
        names = tf.getnames()
        for pat in patterns:
            for member in names:
                if re.search(pat, member):
                    text = tf.extractfile(member).read().decode('utf-8')
                    cached.write_text(text, encoding='utf-8')
                    return text
        raise RuntimeError(f'no file matching {patterns} in {tarball_url} (members: {names[:8]}…)')
    except Exception as e:  # noqa: BLE001 — single clear failure path
        sys.exit(f'✗ cannot fetch {name}@{version} from {base} ({e}).\n'
                 f'  Point --registry / INFOGRAPHIC_NPM_REGISTRY / the NPM_REGISTRY\n'
                 f'  constant at your internal Artifactory npm repo, e.g.\n'
                 f'  https://artifactory.company/artifactory/api/npm/npm-virtual')


def build_chart_lib(registry):
    """Compose the same offline chart bundle the main generator ships."""
    parts = []
    topo = None
    for name, version, patterns in PACKAGES:
        text = fetch_asset(name, version, patterns, registry)
        if name == 'world-atlas':
            topo = text.strip()
        else:
            parts.append(text)
    parts.append(';window.__IDG_WORLD_TOPO__=' + topo + ';')
    parts.append(_embedded(CHART_EXTRAS_SRC, 'src/output/chart-extras.js'))
    bundle = '\n;\n'.join(parts)
    # sourceMappingURL pragmas point at files we don't ship
    return re.sub(r'^[ \t]*//[#@]\s*sourceMappingURL=.*$', '', bundle, flags=re.M)


def palette_css(pal):
    vars_ = (f"--c-primary:{pal['primary']};--c-secondary:{pal['secondary']};"
             f"--c-accent:{pal['accent']};--c-bg:{pal['bg']};"
             f"--c-grad-a:{pal['gradA']};--c-grad-b:{pal['gradB']};")
    for key, var in SURFACE_MAP.items():
        if pal.get(key):
            vars_ += f"{var}:{pal[key]};"
    return ':root{' + vars_ + '}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out')
    ap.add_argument('-p', '--palette', default='colorful')
    ap.add_argument('--registry', default=os.environ.get('INFOGRAPHIC_NPM_REGISTRY') or NPM_REGISTRY)
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

    html = Path(args.input).read_text(encoding='utf-8')
    tick3 = chr(96) * 3
    fence = re.match(r'^\s*' + tick3 + r'(?:html)?\s*\n([\s\S]*?)\n' + tick3 + r'\s*$', html)
    if fence:
        html = fence.group(1)

    css_block = ('<style>\n' + _embedded(BASE_CSS_SRC, 'src/output/base.css') + '\n</style>'
                 + '<style>' + palette_css(pal) + '</style>')
    lib = re.sub(r'</script', r'<\\/script', build_chart_lib(args.registry), flags=re.I)
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
        html = re.sub(r'@import\s+(?:url\()?\s*["\']?https?:[^;]+;?', '', html, flags=re.I)

    out = args.out or re.sub(r'\.html?$', '', args.input, flags=re.I) + '-final.html'
    Path(out).write_text(html, encoding='utf-8')
    print(f'✓ {out} ({len(html) / 1024 / 1024:.2f} MB, palette: {args.palette}'
          f'{" [dark]" if pal.get("dark") else ""}, interactive Chart.js, offline self-contained)')


if __name__ == '__main__':
    main()
```
