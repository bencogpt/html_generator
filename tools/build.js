#!/usr/bin/env node
/* Build script (spec §3.2): compiles the modular sources + vendored assets
   into the single-file deliverable, generator.html. Zero npm dependencies.

   Usage: node tools/build.js [outfile]            (default: generator.html) */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const readBin = (p) => fs.readFileSync(path.join(ROOT, p));

/* Order matters: later modules use earlier ones at definition time. */
const JS_MODULES = [
  'src/js/util.js',
  'src/js/i18n.js',
  'src/js/store.js',
  'src/js/extract.js',
  'src/js/llm.js',
  'src/js/prompt.js',
  'src/js/postprocess.js',
  'src/js/metrics.js',
  'src/js/pipeline.js',
  'src/js/ui.js',
  'src/js/main.js',
];

const FONT_WEIGHTS = [300, 400, 600, 800];

/* Inline-into-<script> safety: a literal "</script" anywhere in the JS would
   terminate the tag early. Escaping to "<\/script" is a no-op inside JS
   strings/regexes and never occurs in valid code outside them. */
function scriptSafe(js) {
  return js.replace(/<\/script/gi, '<\\/script');
}

/* For JS embedded as a JSON string literal: "\/" is a legal JSON escape. */
function jsonStringSafe(jsonLiteral) {
  return jsonLiteral.replace(/<\/script/gi, '<\\/script');
}

function buildFontCss() {
  const parts = [];
  for (const w of FONT_WEIGHTS) {
    const b64 = readBin(`vendor/fonts/heebo-${w}.woff2`).toString('base64');
    parts.push(
      `@font-face{font-family:'Heebo';font-style:normal;font-weight:${w};font-display:swap;` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2');}`
    );
  }
  return parts.join('\n');
}

function main() {
  const outFile = process.argv[2] || 'generator.html';

  const shell = read('src/shell.html');
  const appCss = read('src/app.css');
  const baseCss = read('src/output/base.css');
  const fontCss = buildFontCss();
  const mammothSrc = read('vendor/mammoth.browser.min.js');
  const appJs = JS_MODULES.map((m) => `/* === ${m} === */\n${read(m)}`).join('\n');

  /* The chart bundle injected at {{CHART_LIB}} (and run in the generator's own
     page for the dashboard): Chart.js + the matrix(heatmap) and geo(map)
     plugins + topojson-client, then the embedded world topology, then the
     IDG_CHARTS / IDG_GEO helper runtime. Order matters: plugins and
     topojson-client must see the global Chart/topojson and auto-register. */
  const worldTopo = read('vendor/world-countries-110m.json').trim();
  const chartSrc = [
    read('vendor/chart.umd.min.js'),
    read('vendor/chartjs-chart-matrix.min.js'),
    read('vendor/topojson-client.min.js'),
    read('vendor/chartjs-chart-geo.umd.min.js'),
    ';window.__IDG_WORLD_TOPO__=' + worldTopo + ';',
    read('src/output/chart-extras.js'),
  ].join('\n;\n');

  /* Assets shipped once as string literals: CHART_SRC doubles as the
     generator's own chart runtime (installed via new Function at boot) and as
     the library injected into every generated artifact (FR-23). */
  const vendorJs =
    'window.IDG_ASSETS = {\n' +
    `CHART_SRC: ${jsonStringSafe(JSON.stringify(chartSrc))},\n` +
    `BASE_CSS: ${jsonStringSafe(JSON.stringify(baseCss))},\n` +
    `FONT_CSS: ${jsonStringSafe(JSON.stringify(fontCss))}\n` +
    '};';

  const buildInfo = `built ${new Date().toISOString()} · chart.js 4.4.0 + matrix/geo plugins · mammoth.js 1.8.0 · world-atlas 110m · Heebo subset (OFL) w${FONT_WEIGHTS.join('/')}`;

  let html = shell
    .replace('{{BUILD_INFO}}', buildInfo)
    .replace('{{FONT_CSS}}', fontCss)
    .replace('{{APP_CSS}}', appCss)
    .replace('{{MAMMOTH_JS}}', () => scriptSafe(mammothSrc))
    .replace('{{VENDOR_JS}}', () => vendorJs)
    .replace('{{APP_JS}}', () => scriptSafe(appJs));

  // Only build-time tokens; runtime placeholders ({{MODEL}}, {{BASE_CSS}} in
  // the system prompt, …) legitimately survive into the artifact.
  const leftovers = html.match(/\{\{(BUILD_INFO|FONT_CSS|APP_CSS|MAMMOTH_JS|VENDOR_JS|APP_JS)\}\}/g);
  if (leftovers) throw new Error('Unreplaced build tokens: ' + leftovers.join(', '));

  fs.writeFileSync(path.join(ROOT, outFile), html);

  const size = Buffer.byteLength(html);
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(`${outFile}: ${size.toLocaleString()} bytes (${mb} MB)`);
  console.log(`  chart bundle: ${chartSrc.length.toLocaleString()} · mammoth: ${mammothSrc.length.toLocaleString()} · fonts(css): ${fontCss.length.toLocaleString()} · app js: ${appJs.length.toLocaleString()} · app css: ${appCss.length.toLocaleString()}`);
  if (size > 6 * 1024 * 1024) throw new Error('Exceeds the 6 MB hard ceiling (spec §3.2)');
  if (size > 4 * 1024 * 1024) console.warn('WARNING: above the 4 MB target (spec §3.2)');
}

main();
