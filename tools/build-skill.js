#!/usr/bin/env node
/* Builds the standalone "infographic-report" skill package for external
   chatbots (skills architecture): generates skill/infographic-report/assets/
   from the SAME sources the generator ships (so they cannot drift), injects
   the palette table into SKILL.md between the PALETTES markers, and zips the
   whole skill folder to infographic-skill.zip.

   Run: node tools/build-skill.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skill', 'infographic-report');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function stripSourceMaps(js) {
  return js.replace(/^[ \t]*\/\/[#@]\s*sourceMappingURL=.*$/gm, '');
}

/* Load IDG.store in node to get the canonical palette definitions. */
function loadPalettes() {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  for (const m of ['util', 'i18n', 'store']) require(path.join(ROOT, 'src/js', m + '.js'));
  return globalThis.IDG.store.PALETTES;
}

function main() {
  fs.mkdirSync(path.join(SKILL, 'assets'), { recursive: true });

  /* chart-lib.js — identical composition to the generator's output bundle:
     Chart.js + matrix + topojson + geo + embedded world atlas + IDG helpers
     (heatmap/choropleth/bubbleMap/waterfall, IDG_FMT, IDG_NOTICE, tabs). */
  const chartLib = stripSourceMaps([
    read('vendor/chart.umd.min.js'),
    read('vendor/chartjs-chart-matrix.min.js'),
    read('vendor/topojson-client.min.js'),
    read('vendor/chartjs-chart-geo.umd.min.js'),
    ';window.__IDG_WORLD_TOPO__=' + read('vendor/world-countries-110m.json').trim() + ';',
    read('src/output/chart-extras.js'),
  ].join('\n;\n'));
  if (/<\/script/i.test(chartLib)) throw new Error('chart lib contains </script');
  fs.writeFileSync(path.join(SKILL, 'assets', 'chart-lib.js'), chartLib);

  fs.writeFileSync(path.join(SKILL, 'assets', 'base.css'), read('src/output/base.css'));

  const fontCss = [300, 400, 600, 800].map((w) => {
    const b64 = fs.readFileSync(path.join(ROOT, `vendor/fonts/heebo-${w}.woff2`)).toString('base64');
    return `@font-face{font-family:'Heebo';font-style:normal;font-weight:${w};font-display:swap;` +
      `src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }).join('\n');
  fs.writeFileSync(path.join(SKILL, 'assets', 'fonts.css'), fontCss);

  const palettes = loadPalettes();
  fs.writeFileSync(path.join(SKILL, 'assets', 'palettes.json'), JSON.stringify(palettes, null, 2));

  /* Inject the palette table into SKILL.md between the markers. */
  const rows = Object.entries(palettes).map(([id, p]) =>
    `| \`${id}\` | ${p.label}${p.dark ? ' **(dark)**' : ''} | ${p.desc} | ${p.series.map((c) => '`' + c + '`').join(' ')} |`
  ).join('\n');
  const table = `\n| id | Name | Character | Chart series (use for datasets) |\n|---|---|---|---|\n${rows}\n\nDark palettes (e.g. \`slate-premium\`) override the surface variables — never hardcode light backgrounds (rule above).\n`;
  const mdPath = path.join(SKILL, 'SKILL.md');
  const md = fs.readFileSync(mdPath, 'utf8');
  const re = /(<!-- PALETTES:START[^>]*-->)[\s\S]*?(<!-- PALETTES:END -->)/;
  if (!re.test(md)) throw new Error('PALETTES markers missing in SKILL.md');
  fs.writeFileSync(mdPath, md.replace(re, `$1${table}$2`));

  /* Single-file variant: for skill platforms that accept ONE markdown file
     only. Derived from the (palette-injected) SKILL.md so the contract text
     cannot drift; the assembler is embedded as a code block the model writes
     to disk and runs, fetching assets once from an internal URL. */
  buildSingleFileMd(palettes);
  buildPythonMd(palettes);
  buildNpmMd(palettes);

  /* Zip the package (python3 zipfile — no npm deps). */
  const zipPath = path.join(ROOT, 'infographic-skill.zip');
  execFileSync('python3', ['-c', `
import zipfile, os, sys
root, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(root):
        for f in sorted(files):
            p = os.path.join(dirpath, f)
            z.write(p, os.path.join('infographic-report', os.path.relpath(p, root)))
print('zipped')`, SKILL, zipPath]);

  const size = (p) => (fs.statSync(p).size / 1024).toFixed(0) + ' KB';
  console.log(`skill assets: chart-lib ${size(path.join(SKILL, 'assets/chart-lib.js'))} · base.css ${size(path.join(SKILL, 'assets/base.css'))} · fonts ${size(path.join(SKILL, 'assets/fonts.css'))}`);
  console.log(`✓ ${zipPath} (${size(zipPath)})`);
}

function buildSingleFileMd(palettes) {
  let md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');

  // Embedded assembler = assemble-remote.py with the palettes baked in.
  const py = fs.readFileSync(path.join(SKILL, 'scripts', 'assemble-remote.py'), 'utf8')
    .replace('__PALETTES_JSON__', JSON.stringify(palettes));
  if (py.includes('__PALETTES_JSON__')) throw new Error('palette substitution failed');
  if (/```/.test(py)) throw new Error('assembler contains ``` — would break the md code fence');

  // Frontmatter: describe the single-file mechanics.
  md = md.replace(
    /placeholder tokens, then runs scripts\/assemble\.py[\s\S]*?library and stylesheet\./,
    'placeholder tokens, then writes and runs the embedded python assembler\n' +
    '  (stdlib only, sandboxed) which fetches the bundled chart library once\n' +
    '  from an internal assets URL and produces the final self-contained file.');

  // Intro: assets are fetched, not bundled alongside.
  md = md.replace(
    /are bundled with this skill and injected by a script — you never write\nthem by hand\./,
    'are fetched once from an internal assets URL by the embedded assembler\nscript below — you never write them by hand.');

  // Workflow: file-creation + sandbox flow for a one-file skill.
  md = md.replace(/3\. \*\*Write `report\.html`\*\*[\s\S]*?## OUTPUT CONTRACT/,
    `3. **Write \`report.html\`** (use the file-creation tool) following the OUTPUT
   CONTRACT below. Put the two placeholder tokens in \`<head>\` — do NOT try to
   inline the chart library.
4. **Write \`assemble_infographic.py\`** (file-creation tool): copy the code
   block from the "Embedded assembler" section at the end of this skill,
   VERBATIM and in full.
5. **Assemble** — run in the python sandbox (fetches the chart bundle once
   from the internal assets URL, injects stylesheet + font + palette, lints
   for forbidden external references):

   \`\`\`bash
   python3 assemble_infographic.py report.html -o infographic.html --palette colorful
   \`\`\`

   The assets URL is taken from \`--assets-url\` > the \`INFOGRAPHIC_ASSETS_URL\`
   env var > the \`ASSETS_BASE_URL\` constant at the top of the script (usually
   pre-set by whoever installed this skill). \`--list-palettes\` works offline.

6. **Deliver \`infographic.html\`.** It is one file, works from \`file://\`,
   fully offline for its viewers (the only network use ever is the one-time
   asset fetch by the assembler, which is then cached).

## OUTPUT CONTRACT`);

  // Replace the package-file listing with the embedded assembler + admin
  // setup. Replacer FUNCTION so `$`-sequences in the python source stay literal.
  md = md.replace(/## Files in this skill[\s\S]*$/, () =>
    `## One-time setup (for whoever installs this skill)

Host the three asset files on any internal static web server (nginx, a
LiteLLM box, a file share with HTTP) under one directory, e.g.
\`http://tools.internal/infographic-assets/\`:

- \`chart-lib.js\` — Chart.js v4 + heatmap/geo plugins + embedded world atlas
  + the IDG_CHARTS/IDG_FMT/IDG_NOTICE helpers + tabs runtime (~0.4 MB)
- \`base.css\` — the output stylesheet
- \`fonts.css\` — embedded Heebo font (Hebrew+Latin)

(The files ship in the \`assets/\` folder of the full skill package /
repository.) Then edit the \`ASSETS_BASE_URL\` constant at the top of the
embedded assembler below to that URL. The assembler downloads them once per
workspace and caches them in \`./infographic_assets/\`.

## Embedded assembler — write this to \`assemble_infographic.py\` verbatim

\`\`\`python
${py}\`\`\`
`);

  const out = path.join(ROOT, 'infographic-skill-single.md');
  fs.writeFileSync(out, md);
  console.log(`✓ ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB single-file skill)`);
}

/* Python-rendered variant: ONE md file, zero hosting — charts are rendered
   by the chatbot's python sandbox (matplotlib) and embedded as images. */
function buildPythonMd(palettes) {
  const py = fs.readFileSync(path.join(SKILL, 'scripts', 'build-python.py'), 'utf8')
    .replace('__PALETTES_JSON__', JSON.stringify(palettes));
  if (py.includes('__PALETTES_JSON__')) throw new Error('palette substitution failed (python md)');
  if (/```/.test(py)) throw new Error('python builder contains ``` — would break the md code fence');

  const rows = Object.entries(palettes).map(([id, p]) =>
    `| \`${id}\` | ${p.label}${p.dark ? ' **(dark)**' : ''} | ${p.desc} |`
  ).join('\n');
  const table = `| id | Name | Character |\n|---|---|---|\n${rows}`;

  let md = fs.readFileSync(path.join(SKILL, 'SKILL-python.template.md'), 'utf8');
  md = md.replace('{{PALETTE_TABLE}}', () => table).replace('{{BUILDER_PY}}', () => py);
  if (/\{\{(PALETTE_TABLE|BUILDER_PY)\}\}/.test(md)) throw new Error('python md tokens left unfilled');

  const out = path.join(ROOT, 'infographic-skill-python.md');
  fs.writeFileSync(out, md);
  console.log(`✓ ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB python-rendered single-file skill)`);
}

/* npm/Artifactory variant: ONE md file, fully interactive Chart.js output —
   the embedded python assembler fetches chart.js + plugins + world atlas
   from an npm-compatible registry (internal Artifactory) and inlines them,
   with base.css + the IDG helper runtime embedded in the script itself. */
function buildNpmMd(palettes) {
  let py = fs.readFileSync(path.join(SKILL, 'scripts', 'assemble-npm.py'), 'utf8')
    .replace('__PALETTES_JSON__', () => JSON.stringify(palettes))
    .replace('__BASE_CSS__', () => read('src/output/base.css'))
    .replace('__CHART_EXTRAS__', () => read('src/output/chart-extras.js'));
  if (/__(PALETTES_JSON|BASE_CSS|CHART_EXTRAS)__/.test(py)) throw new Error('npm md substitution failed');
  if (/```/.test(py)) throw new Error('npm builder contains ``` — would break the md code fence');

  let md = fs.readFileSync(path.join(SKILL, 'SKILL.md'), 'utf8');

  md = md.replace(
    /placeholder tokens, then runs scripts\/assemble\.py[\s\S]*?library and stylesheet\./,
    'placeholder tokens, then writes and runs the embedded python assembler\n' +
    '  (stdlib only, sandboxed) which pulls chart.js + plugins once from your\n' +
    '  internal npm registry (Artifactory) and produces the final\n' +
    '  self-contained interactive file.');

  md = md.replace(
    /are bundled with this skill and injected by a script — you never write\nthem by hand\./,
    'are pulled once from your internal npm registry (Artifactory) by the\n' +
    'embedded assembler script below — you never write them by hand.');

  md = md.replace(/3\. \*\*Write `report\.html`\*\*[\s\S]*?## OUTPUT CONTRACT/,
    `3. **Write \`report.html\`** (use the file-creation tool) following the OUTPUT
   CONTRACT below. Put the two placeholder tokens in \`<head>\` — do NOT try to
   inline the chart library.
4. **Write \`build_infographic.py\`** (file-creation tool): copy the code
   block from the "Embedded assembler" section at the end of this skill,
   VERBATIM and in full.
5. **Assemble** — run in the python sandbox (first run downloads ~0.7 MB of
   chart libraries from the npm registry and caches them; then injects
   stylesheet + palette + chart bundle and lints for forbidden external
   references):

   \`\`\`bash
   python3 build_infographic.py report.html -o infographic.html --palette colorful
   \`\`\`

   The registry is taken from \`--registry\` > the \`INFOGRAPHIC_NPM_REGISTRY\`
   env var > the \`NPM_REGISTRY\` constant at the top of the script (usually
   pre-set by whoever installed this skill). \`--list-palettes\` works offline.
   Read any warnings it prints and fix your HTML if needed.

6. **Deliver \`infographic.html\`.** One file, opens from \`file://\`, fully
   interactive (hover tooltips, tabs, calculators) and fully offline for its
   viewers — the only network use ever is the assembler's one-time library
   download from your registry.

## OUTPUT CONTRACT`);

  md = md.replace(/## Files in this skill[\s\S]*$/, () =>
    `## One-time setup (for whoever installs this skill)

Edit ONE line in the embedded assembler below: set \`NPM_REGISTRY\` to your
internal npm-compatible registry — for Artifactory that is typically
\`https://artifactory.<company>/artifactory/api/npm/<npm-remote-or-virtual-repo>\`.
The assembler pulls pinned versions of \`chart.js\`, \`chartjs-chart-matrix\`,
\`chartjs-chart-geo\`, \`topojson-client\` and \`world-atlas\` (≈0.7 MB total,
standard public npm packages every Artifactory npm remote already mirrors),
caches them in \`./infographic_assets/\`, and never touches the network again.
The stylesheet, helper runtime (IDG_CHARTS/IDG_FMT/IDG_NOTICE/tabs) and
palettes are embedded in the script itself.

## Embedded assembler — write this to \`build_infographic.py\` verbatim

\`\`\`python
${py}\`\`\`
`);

  const out = path.join(ROOT, 'infographic-skill-npm.md');
  fs.writeFileSync(out, md);
  console.log(`✓ ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} KB npm/Artifactory single-file skill)`);
}

main();
