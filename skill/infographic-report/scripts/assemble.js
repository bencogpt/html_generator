#!/usr/bin/env node
/* Infographic skill assembler — turns the model's token-form report into a
   final self-contained offline HTML file.

     node scripts/assemble.js report.html [-o out.html] [--palette <id>]
     node scripts/assemble.js --list-palettes

   Replaces {{BASE_CSS}} with the stylesheet + embedded font + palette CSS
   variables, and {{CHART_LIB}} with the bundled Chart.js (+ heatmap/geo
   plugins, world atlas, IDG_* helpers, tabs runtime). Falls back to
   injecting before </head> if the model omitted the tokens. Lints for
   forbidden external references and strips them (with a warning).
   Zero dependencies; node >= 16. */
'use strict';

const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const readAsset = (f) => fs.readFileSync(path.join(ASSETS, f), 'utf8');

function parseArgs(argv) {
  const a = { palette: 'colorful', out: null, input: null, list: false };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '-o' || v === '--out') a.out = argv[++i];
    else if (v === '--palette' || v === '-p') a.palette = argv[++i];
    else if (v === '--list-palettes') a.list = true;
    else if (!a.input) a.input = v;
  }
  return a;
}

/* Palette id -> :root CSS variable overrides (dark palettes also override
   the surface tokens; light palettes inherit the base.css defaults). */
function paletteCss(pal) {
  let vars = `--c-primary:${pal.primary};--c-secondary:${pal.secondary};` +
    `--c-accent:${pal.accent};--c-bg:${pal.bg};--c-grad-a:${pal.gradA};--c-grad-b:${pal.gradB};`;
  const map = {
    surface: '--c-surface', surface2: '--c-surface-2', text: '--c-text', muted: '--c-muted',
    border: '--c-border', page: '--c-page', heroText: '--c-hero-text', onPrimary: '--c-on-primary',
    shadow: '--c-shadow', blur: '--c-blur',
  };
  for (const k in map) if (pal[k]) vars += `${map[k]}:${pal[k]};`;
  return `:root{${vars}}`;
}

/* Find forbidden external references (same patterns the generator lints). */
function lintExternal(s) {
  const res = [
    [/\s(?:src|href|srcset|poster)\s*=\s*["'](?:https?:)?\/\/[^"']*["']/gi, 'external attribute'],
    [/url\(\s*["']?(?:https?:)?\/\/[^)"']+["']?\s*\)/gi, 'external url()'],
    [/@import\s+(?:url\()?\s*["']?https?:/gi, '@import'],
  ];
  const hits = [];
  for (const [re, kind] of res) {
    let m; while ((m = re.exec(s))) hits.push(kind + ': ' + m[0].trim().slice(0, 120));
  }
  return hits;
}

function stripExternal(s) {
  return s
    .replace(/\s(src|href|srcset|poster)\s*=\s*["'](?:https?:)?\/\/[^"']*["']/gi, ' data-removed-external=""')
    .replace(/url\(\s*["']?(?:https?:)?\/\/[^)"']+["']?\s*\)/gi, 'none')
    .replace(/@import\s+(?:url\()?\s*["']?https?:[^;]+;?/gi, '');
}

function main() {
  const args = parseArgs(process.argv);
  const palettes = JSON.parse(readAsset('palettes.json'));

  if (args.list) {
    for (const [id, p] of Object.entries(palettes)) {
      console.log(`${id.padEnd(20)} ${p.dark ? '[dark] ' : ''}${p.label} — ${p.desc}`);
    }
    return;
  }
  if (!args.input) {
    console.error('Usage: node scripts/assemble.js report.html [-o out.html] [--palette <id>] [--list-palettes]');
    process.exit(1);
  }
  const pal = palettes[args.palette];
  if (!pal) {
    console.error(`Unknown palette "${args.palette}". Available: ${Object.keys(palettes).join(', ')}`);
    process.exit(1);
  }

  let html = fs.readFileSync(args.input, 'utf8');

  // Tolerate a model that wrapped the document in markdown fences.
  const fence = html.match(/^\s*```(?:html)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fence) html = fence[1];

  const cssBlock = '<style>\n' + readAsset('fonts.css') + '\n' + readAsset('base.css') + '\n</style>' +
    '<style>' + paletteCss(pal) + '</style>';
  // Escape any literal </script so the bundle can't close its tag early.
  const libBlock = '<script>\n' + readAsset('chart-lib.js').replace(/<\/script/gi, '<\\/script') + '\n</script>';

  let cssIn = false, libIn = false;
  if (html.includes('{{BASE_CSS}}')) { html = html.split('{{BASE_CSS}}').join(cssBlock); cssIn = true; }
  if (html.includes('{{CHART_LIB}}')) { html = html.split('{{CHART_LIB}}').join(libBlock); libIn = true; }
  if (!cssIn || !libIn) {
    const inject = (!cssIn ? cssBlock + '\n' : '') + (!libIn ? libBlock + '\n' : '');
    if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, inject + '</head>');
    else if (/<body[^>]*>/i.test(html)) html = html.replace(/<body[^>]*>/i, (m) => m + '\n' + inject);
    else html = inject + html;
    console.warn(`⚠ token(s) missing (${!cssIn ? '{{BASE_CSS}} ' : ''}${!libIn ? '{{CHART_LIB}}' : ''}) — injected into <head> instead.`);
  }
  // Remove leftover invented tokens.
  html = html.replace(/\{\{[A-Z_]+\}\}/g, '');

  const violations = lintExternal(html);
  if (violations.length) {
    console.warn(`⚠ ${violations.length} forbidden external reference(s) removed:`);
    violations.slice(0, 10).forEach((v) => console.warn('  - ' + v));
    html = stripExternal(html);
  }

  const out = args.out || args.input.replace(/\.html?$/i, '') + '-final.html';
  fs.writeFileSync(out, html);
  console.log(`✓ ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB, palette: ${args.palette}${pal.dark ? ' [dark]' : ''}, offline self-contained)`);
}

main();
