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

main();
