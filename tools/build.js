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

const FONT_WEIGHTS = [300, 400, 600, 800];

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

/* Drop sourceMappingURL pragmas — they point at .map files we don't ship, are
   irrelevant to operation, and are the only "external reference" with any
   fetch semantics (devtools-only). License/copyright banners are kept, as
   their licenses (MIT/BSD/ISC/OFL) require retaining the notice. */
function stripSourceMaps(js) {
  return js.replace(/^[ \t]*\/\/[#@]\s*sourceMappingURL=.*$/gm, '');
}

/* Embedded Heebo subset (OFL): Hebrew + Basic Latin, weights 300/400/600/800,
   base64 WOFF2. Used by the generator UI and injected into every output so
   typography matches even on machines with no Hebrew fonts and no network. */
function buildFontCss() {
  return FONT_WEIGHTS.map((w) => {
    const b64 = readBin(`vendor/fonts/heebo-${w}.woff2`).toString('base64');
    return `@font-face{font-family:'Heebo';font-style:normal;font-weight:${w};font-display:swap;` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
}

function main() {
  const outFile = process.argv[2] || 'generator.html';

  const shell = read('src/shell.html');
  const appCss = read('src/app.css');
  const baseCss = read('src/output/base.css');
  const fontCss = buildFontCss();
  const mammothSrc = stripSourceMaps(read('vendor/mammoth.browser.min.js'));
  const appJs = JS_MODULES.map((m) => `/* === ${m} === */\n${read(m)}`).join('\n');

  /* The chart bundle: Chart.js + the matrix(heatmap) and geo(map) plugins +
     topojson-client, then the embedded world topology, then the IDG_CHARTS /
     IDG_GEO helper runtime. Order matters: plugins and topojson-client must
     see the global Chart/topojson and auto-register. It is shipped as a real
     <script> (id="idg-chart-bundle"): it runs once to power the generator's
     own dashboard (no eval/new Function needed), and the app reads its
     textContent to inject the identical library into every exported report. */
  const worldTopo = read('vendor/world-countries-110m.json').trim();
  const chartBundle = stripSourceMaps([
    read('vendor/chart.umd.min.js'),
    read('vendor/chartjs-chart-matrix.min.js'),
    read('vendor/topojson-client.min.js'),
    read('vendor/chartjs-chart-geo.umd.min.js'),
    ';window.__IDG_WORLD_TOPO__=' + worldTopo + ';',
    read('src/output/chart-extras.js'),
  ].join('\n;\n'));

  // The textContent-read injection path requires the bundle to contain no
  // literal "</script" (none of the vendored libs do); guard it.
  if (/<\/script/i.test(chartBundle)) {
    throw new Error('chart bundle contains </script — would break the script element');
  }

  // The base output stylesheet and embedded font travel as JS strings (for
  // injection at {{BASE_CSS}}); the chart bundle lives in the script element.
  const vendorJs =
    'window.IDG_ASSETS = {\n' +
    `BASE_CSS: ${jsonStringSafe(JSON.stringify(baseCss))},\n` +
    `FONT_CSS: ${jsonStringSafe(JSON.stringify(fontCss))}\n` +
    '};';

  const buildInfo = `built ${new Date().toISOString()} · chart.js 4.4.0 + matrix/geo plugins · mammoth.js 1.8.0 · world-atlas 110m · Heebo subset (OFL) w${FONT_WEIGHTS.join('/')}`;

  let html = shell
    .replace('{{BUILD_INFO}}', buildInfo)
    .replace('{{FONT_CSS}}', fontCss)
    .replace('{{APP_CSS}}', appCss)
    .replace('{{MAMMOTH_JS}}', () => scriptSafe(mammothSrc))
    .replace('{{CHART_BUNDLE}}', () => chartBundle)   // already verified </script-free
    .replace('{{VENDOR_JS}}', () => vendorJs)
    .replace('{{APP_JS}}', () => scriptSafe(appJs));

  const leftovers = html.match(/\{\{(BUILD_INFO|FONT_CSS|APP_CSS|MAMMOTH_JS|CHART_BUNDLE|VENDOR_JS|APP_JS)\}\}/g);
  if (leftovers) throw new Error('Unreplaced build tokens: ' + leftovers.join(', '));

  fs.writeFileSync(path.join(ROOT, outFile), html);

  const size = Buffer.byteLength(html);
  const mb = (size / 1024 / 1024).toFixed(2);
  console.log(`${outFile}: ${size.toLocaleString()} bytes (${mb} MB)`);
  console.log(`  chart bundle: ${chartBundle.length.toLocaleString()} · mammoth: ${mammothSrc.length.toLocaleString()} · fonts(css): ${fontCss.length.toLocaleString()} · app js: ${appJs.length.toLocaleString()} · app css: ${appCss.length.toLocaleString()}`);
  if (size > 6 * 1024 * 1024) throw new Error('Exceeds the 6 MB hard ceiling (spec §3.2)');
  if (size > 4 * 1024 * 1024) console.warn('WARNING: above the 4 MB target (spec §3.2)');
}

main();
