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

{{PALETTE_TABLE}}

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
{{BUILDER_PY}}```
