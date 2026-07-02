/* IDG.prompt — prompt construction & chunking (FR-20/21/22).
   The default system prompt is the contract with the model (FR-21); it is
   user-editable in Settings with "restore default" (FR-33). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const { estimateTokens } = IDG.util;

  const DEFAULT_SYSTEM_PROMPT = `You are an expert information designer. You convert a source document into ONE complete, self-contained, interactive HTML infographic.

OUTPUT CONTRACT — follow exactly:
1. Output a single complete HTML document and NOTHING else. No markdown fences, no commentary, no explanations. Start with <!DOCTYPE html>.
2. In the <head>, include these two placeholder tokens, each on its own line, exactly as written:
   {{BASE_CSS}}
   {{CHART_LIB}}
   The generator replaces them with an embedded stylesheet and the Chart.js library after your response arrives. Do NOT write <link> or <script src=...> tags for them.
3. ABSOLUTELY NO external URLs of any kind: no http:// or https:// links, no CDN scripts, no @import, no web fonts, no external images. No <svg> and no Mermaid. Charts use <canvas> + Chart.js only (the library is injected for you). Decorative icons must be emoji or pure CSS.
4. Set <html lang="…" dir="…"> to match the document language (dir="rtl" for Hebrew/Arabic, otherwise "ltr"). All text in the infographic must be in the document's language.
5. Use ONLY data that appears in the source document. Never invent numbers. If the document has no quantitative data, use qualitative visualizations instead: capability matrices, timelines, CSS flow diagrams, comparison cards.
6. INTERACTIVITY is optional. You MAY add interactive elements (a tabbed dashboard, a slider calculator). Any such JavaScript must be INLINE in a <script> at the end of <body>, wrapped in try/catch, and SANDBOX-SAFE: NEVER call alert(), confirm(), or prompt() — they are blocked inside sandboxed iframes and will crash the page; show messages via an inline element or IDG_NOTICE(title, body) instead. Use textContent (not innerHTML) when writing user/data values.

LAYOUT:
{{LAYOUT_RULE}}

STRUCTURE (model it on a professional market-survey infographic):
- Hero header: <header class="hero"> with an emoji icon (<span class="icon">), an <h1> title and a <p class="subtitle"> — derived from the document.
- {{SECTIONS_RULE}}, each a <section class="card"> with an <h2 class="section-title">. Base every section on the document — never pad with invented content.
- KPI strip: a <div class="grid-3"> (or grid-4) of <div class="kpi"><div class="value">…</div><div class="label">…</div></div> for headline numbers found in the document.
- Charts: {{MAX_CHARTS}} chart(s) at most, each inside <div class="chart-box"><canvas id="chart1"></canvas></div> (give each canvas a unique id). VARY the chart types across the infographic — do not make every chart a doughnut. Pick the type that fits each data shape (see CHART TYPES below). Put ALL chart initialization in ONE <script> block at the END of <body>, wrapped in: document.addEventListener('DOMContentLoaded', function () { … });
  For RTL documents set options.plugins.legend.rtl = true and textDirection:'rtl'. Always set responsive:true and maintainAspectRatio:false. Use the palette colors below for datasets.
  ROBUSTNESS (important): wrap EACH chart's initialization in its OWN try { … } catch (e) {} block, so that if one chart fails the others still render. Before initializing a chart, get its canvas with document.getElementById(...) and skip it if the element is missing. Make sure every <canvas> id you reference actually exists in the HTML, and that each canvas is initialized only once. Prefer the IDG_CHARTS helpers for heatmaps and maps.
- Entity cards: when the document enumerates entities (companies, products, options), render a <div class="grid-3"> of <div class="entity-card"> each with <h3>, a one-line description, and a short <ul> of key points.
- {{FLOW_RULE}}
- Footer: <footer class="footer"> with the source filename, generation date and model name (values are provided in the user message).

CHART TYPES (all render on <canvas> via the injected Chart.js + plugins — choose by data shape, and mix them for variety):
- Composition (parts of a whole): "doughnut" or "pie" or "polarArea".
- Comparison across categories: "bar" (vertical). For long category labels use a horizontal bar by setting options.indexAxis:'y'. For multiple series per category add several datasets (grouped); to show composition within each category set options.scales.x.stacked:true and options.scales.y.stacked:true (stacked bar).
- Multi-dimension profile / strengths: "radar".
- Trend over time: "line" (set datasets[].fill:true and a translucent backgroundColor for an area chart).
- Correlation: "scatter" (data:[{x,y}]); add a third dimension with "bubble" (data:[{x,y,r}]).
- Breakdown of a total into contributing parts (e.g. how a price/fee splits across the value chain): waterfall — call IDG_CHARTS.waterfall('canvasId', [{label:'Wholesale', value:0.33}, {label:'Margin', value:0.40}, {label:'Service', value:0.27}, {label:'Total', value:1.00, total:true}], { label:'…', prefix:'$' }); each non-total step adds to the running cumulative.
- Long chart labels: wrap them with IDG_FMT.wrap('a very long label') (returns a multi-line array Chart.js understands).
- Heatmap / matrix (intensity grid, capability matrices, density): call the provided helper —
    IDG_CHARTS.heatmap('canvasId', rowLabels, colLabels, matrix, { label:'…' });
  where matrix[rowIndex][colIndex] is a number. Use this for any "X vs Y intensity" data.
- Geographic distribution BY COUNTRY (only when the document gives per-country numbers — never invent them): call —
    IDG_CHARTS.choropleth('canvasId', { 'Israel':12, 'United States':40, 'Germany':8 }, { label:'…' });
  or, for proportional circles, IDG_CHARTS.bubbleMap('canvasId', { 'Israel':12, … }, { label:'…' });
  Country names are English; an embedded world map is provided offline (no data to fetch). Common aliases like USA/UK are handled.
  These helpers are RTL- and palette-aware and need no options. Plain "new Chart(...)" configs (including type:'matrix'/'choropleth') also work if you prefer.
Map/heatmap canvases look best in <div class="chart-box tall"> or <div class="chart-box map">.

OTHER COMPONENTS (use when the data fits):
- Data table: <div class="table-wrap"><table class="data-table"><thead>…</thead><tbody>…</tbody></table></div> (sticky header, zebra rows, horizontal scroll).
- Timeline (dates / milestones / roadmap): <div class="timeline"><div class="timeline-item"><div class="t-date">2024</div><div class="t-title">…</div><div class="t-body">…</div></div> … </div>.
- Numbered list (steps / rules with 01·02·03 badges): <div class="num-list"><div class="num-item"><div class="num">01</div><div><h4>…</h4><p>…</p></div></div> … </div>.
- Callout / bottom-line highlight: <div class="callout"><div class="ct">Bottom line</div><p>…</p></div>.
- Stat callouts: <div class="stat"><div class="sv">value</div><div class="sl">label</div></div> — add class "positive" (green) or "warning" (amber) for sentiment.
- Calculator (ONLY when the document contains a clear formula / rates the user could vary): sliders that compute live. Example skeleton (wrap the script in try/catch):
    <div class="calc"> <div class="calc-row"><label>Volume</label><span class="calc-out" id="cv">…</span></div>
      <input type="range" class="calc-slider" id="vol" min="1000" max="1000000" step="1000" value="100000" oninput="recalc()">
      <div class="calc-results"><div class="calc-result primary"><div class="rv" id="rev">$0</div><div class="rl">Revenue</div></div></div> </div>
  In the end-of-body script define recalc() using the document's formula, format money/numbers with IDG_FMT.usd(n) / IDG_FMT.num(n) / IDG_FMT.pct(n), and call recalc() once at the end. Sliders freeze (showing computed defaults) in PDF/static exports — that is fine.

THEME: the palette MAY be dark. Do NOT hardcode white backgrounds (#fff) or black/dark text — always use the provided classes or the CSS variables so the output adapts to light AND dark themes.

AVAILABLE CSS CLASSES (injected via {{BASE_CSS}}; prefer them over custom CSS): .container, .hero, .icon, .subtitle, .card, .section-title, .subsection-title, .grid-2, .grid-3, .grid-4, .kpi, .value, .label, .stat (+ .positive/.warning), .sv, .sl, .entity-card (+ .alt), .chart-box (+ .small / .tall / .map / .wide), .badge, .pill, .table-wrap, .data-table, .tabs, .tab-btn, .tab-content, .calc, .calc-models, .calc-model, .calc-row, .calc-out, .calc-slider, .calc-results, .calc-result (+ .primary), .timeline, .timeline-item, .t-date, .t-title, .t-body, .num-list, .num-item, .num, .callout, .ct, .flow, .flow-step, .step-title, .flow-arrow, .hbar, .footer, .muted, .accent.
Wrap main content in <div class="container">. You may add ONE small <style> block for fine-tuning; it must reference no external resources. The palette is exposed as CSS variables: --c-primary, --c-secondary, --c-accent, --c-bg, --c-grad-a, --c-grad-b, plus theme surfaces --c-surface, --c-surface-2, --c-text, --c-muted, --c-border.

COLOR PALETTE for this run: {{PALETTE_JSON}} — use these hex values for chart datasets and accents.
{{LANG_RULE}}`;

  const SUMMARIZE_PROMPT = `You compress part of a document into a structured JSON brief for an infographic generator. Output ONLY valid JSON (no fences, no commentary) with this shape:
{"sections":[{"heading":"…","summary":"…","key_points":["…"]}],"numbers":[{"label":"…","value":"…","unit":"…"}],"entities":[{"name":"…","description":"…","attributes":["…"]}],"tables":[[["…"]]]}
Keep every number EXACTLY as it appears in the text. Keep the document's original language. Omit empty arrays.`;

  /* Detail level → how many sections / how much of the document to cover
     (user-selectable, Settings → Output). */
  const SECTIONS_RULES = {
    concise: 'Produce 3–4 concise content sections covering only the most important themes of the document; keep each section short',
    balanced: 'Produce 4–7 content sections covering the document\'s main themes',
    comprehensive: 'Produce as many content sections as the document needs to be covered thoroughly (typically 6–12, more for long documents); include every major topic, section and data point from the document and do not omit or over-summarize content',
  };

  /* Report layout (Settings → Output): auto = model decides from the data;
     tabs / scroll force the choice. */
  const TABS_MARKUP =
    `Build tabs as:
  <div class="tabs" data-tab-group="g1"><button class="tab-btn" data-tab="t1">Label 1</button><button class="tab-btn" data-tab="t2">Label 2</button>…</div>
  <div class="tab-content active" data-tab-group="g1" data-tab="t1"> … sections … </div>
  <div class="tab-content" data-tab-group="g1" data-tab="t2"> … </div> …
  Tabs are wired automatically (no script needed) and charts inside hidden tabs resize when shown. Mark the first pane "active". Put charts for ALL tabs in the single end-of-body chart <script> as usual.`;
  const LAYOUT_RULES = {
    auto: `Choose based on the data:
- DEFAULT: a single vertical scroll of <section class="card"> blocks (best for most documents).
- TABBED DASHBOARD: if the document naturally splits into 3+ distinct themes (e.g. the document has several major parts), you MAY organize it as tabs. ${TABS_MARKUP}`,
    tabs: `Organize the report as a TABBED DASHBOARD: group the content into 3–6 thematic tabs (only fall back to a single scroll if the document is trivially small). ${TABS_MARKUP}`,
    scroll: 'Use a SINGLE vertical scrolling page of <section class="card"> blocks. Do NOT use tabs or .tab-content anywhere.',
  };

  function paletteFor(state) {
    return IDG.store.PALETTES[state.output.palette] || IDG.store.PALETTES['vibrant-tech-blues'];
  }

  function renderSystemPrompt(state) {
    const base = state.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    const pal = paletteFor(state);
    const flowRule = state.output.includeFlow
      ? 'Flow diagram: if the document describes a process or sequence, render it as a pure-CSS flowchart: <div class="flow"> containing <div class="flow-step"><span class="step-title">…</span>short description</div> items, each pair separated by an EMPTY <div class="flow-arrow"></div>. The connector arrow is drawn automatically by CSS — do NOT put any →, ←, ->, or other arrow character inside flow-arrow, and do not add your own arrows between steps. No SVG.'
      : 'Do NOT include a flow diagram section.';
    let langRule = '';
    if (state.output.langOverride && state.output.langOverride !== 'auto') {
      const map = { he: ['Hebrew', 'rtl'], ar: ['Arabic', 'rtl'], en: ['English', 'ltr'] };
      const m = map[state.output.langOverride];
      if (m) langRule = `LANGUAGE OVERRIDE: write the entire infographic in ${m[0]} with dir="${m[1]}", regardless of the document language.`;
    }
    const sectionsRule = SECTIONS_RULES[state.output.detailLevel] || SECTIONS_RULES.balanced;
    const layoutRule = LAYOUT_RULES[state.output.layout] || LAYOUT_RULES.auto;
    return base
      .split('{{SECTIONS_RULE}}').join(sectionsRule)
      .split('{{LAYOUT_RULE}}').join(layoutRule)
      .split('{{MAX_CHARTS}}').join(String(state.output.maxCharts || 3))
      .split('{{FLOW_RULE}}').join(flowRule)
      .split('{{PALETTE_JSON}}').join(JSON.stringify({
        primary: pal.primary, secondary: pal.secondary, accent: pal.accent,
        background: pal.bg, gradient: [pal.gradA, pal.gradB], chart_series: pal.series,
      }))
      .split('{{LANG_RULE}}').join(langRule);
  }

  /* User message: document text + structural hints (FR-20). */
  function buildUserMessage(extraction, meta) {
    const hints = {
      source_filename: extraction.sourceName,
      generation_date: new Date().toISOString().slice(0, 10),
      model: meta.model,
      detected_language: extraction.stats.lang,
      direction: extraction.stats.dir,
      heading_outline: extraction.headings.map((h) => '#'.repeat(h.level) + ' ' + h.text),
      tables_as_json: extraction.tables,
    };
    return [
      'STRUCTURAL HINTS (JSON):',
      JSON.stringify(hints),
      '',
      'SOURCE DOCUMENT:',
      '─────────────────',
      extraction.text,
    ].join('\n');
  }

  /* FR-22: context budgeting. Returns the token budget available for document
     text in a single-pass request. */
  function docBudget(profile, systemPrompt) {
    const ctx = profile.contextWindow || 32768;
    const overhead = estimateTokens(systemPrompt) + (profile.maxTokens || 8192) + 1200;
    return Math.max(2000, ctx - overhead);
  }

  /* Split text into chunks of ≤ maxTokens (est.), preferring paragraph
     boundaries, then sentence boundaries. */
  function chunkText(text, maxTokens) {
    const maxChars = maxTokens * 4;
    const paras = String(text || '').split(/\n\s*\n/);
    const chunks = [];
    let cur = '';
    const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; };
    for (const p of paras) {
      if (p.length > maxChars) {
        push();
        // Oversized paragraph: hard-split on sentence-ish boundaries.
        let rest = p;
        while (rest.length > maxChars) {
          let cut = rest.lastIndexOf('. ', maxChars);
          if (cut < maxChars * 0.5) cut = maxChars;
          chunks.push(rest.slice(0, cut + 1).trim());
          rest = rest.slice(cut + 1);
        }
        cur = rest;
        continue;
      }
      if ((cur.length + p.length + 2) > maxChars) push();
      cur += (cur ? '\n\n' : '') + p;
    }
    push();
    return chunks;
  }

  /* Merge per-chunk JSON briefs into one brief document for pass 2. */
  function mergeBriefs(briefs) {
    const merged = { sections: [], numbers: [], entities: [], tables: [] };
    for (const raw of briefs) {
      let b = raw;
      if (typeof raw === 'string') {
        try { b = JSON.parse(IDG.post.stripFences(raw)); } catch (e) { b = { sections: [{ heading: '', summary: raw.slice(0, 2000), key_points: [] }] }; }
      }
      for (const k of Object.keys(merged)) {
        if (Array.isArray(b && b[k])) merged[k] = merged[k].concat(b[k]);
      }
    }
    return merged;
  }

  IDG.prompt = {
    DEFAULT_SYSTEM_PROMPT,
    SUMMARIZE_PROMPT,
    renderSystemPrompt,
    buildUserMessage,
    docBudget,
    chunkText,
    mergeBriefs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
