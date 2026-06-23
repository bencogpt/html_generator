#!/usr/bin/env node
/* Static audit of the built generator.html — locks in the optimization /
   hardening guarantees: no embedded fonts, no eval/new Function, no
   sourceMappingURL pragmas, and no functional external references.
   Run: node tools/build.js && node tools/audit.js */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'generator.html'), 'utf8');
let failed = 0;
function check(name, cond, detail) {
  if (cond) { console.log('  ✓ ' + name); }
  else { failed++; console.error('  ✗ ' + name + (detail ? '\n    ' + detail : '')); }
}

// 1. No embedded fonts anywhere (removed per request — system fonts now).
check('no embedded base64 fonts', !/data:font\/woff2|@font-face/i.test(html));

// 2. Our own application code uses no eval / new Function (avoids relying on
//    CSP unsafe-eval in our code). NOTE: the vendored mammoth.js library uses
//    new Function internally for DOCX parsing — that's inside a trusted MIT
//    dependency and out of scope here; we check our src/ only.
const appSrc = fs.readdirSync(path.resolve(__dirname, '..', 'src/js'))
  .map((f) => fs.readFileSync(path.resolve(__dirname, '..', 'src/js', f), 'utf8'))
  .join('\n')
  .concat(fs.readFileSync(path.resolve(__dirname, '..', 'src/output/chart-extras.js'), 'utf8'));
// strip line/block comments before scanning so prose mentions don't count
const codeOnly = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check('our app code has no eval/new Function', !/\bnew Function\s*\(|[^.\w]eval\s*\(/.test(codeOnly));

// 3. No sourceMappingURL pragmas (stripped from vendored libs).
check('no sourceMappingURL pragmas', !/sourceMappingURL/.test(html));

// 4. No functional external references: no loadable http(s) src/href, no
//    CDN script/link, no @import, no fetch/XHR to a URL. (License-banner and
//    XML-namespace URL *strings* are inert and allowed.)
const functional = [
  /\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//i,
  /@import\s+(?:url\()?\s*["']?https?:/i,
  /\bfetch\(\s*["'`]https?:/i,
  /\.open\(\s*["'](?:GET|POST)["']\s*,\s*["']https?:/i,
];
check('no functional external resource references',
  !functional.some((re) => re.test(html)),
  functional.map((re) => (re.exec(html) || [''])[0]).filter(Boolean).join(' ; '));

// 5. The chart bundle is a real <script> element (not eval'd), so injection
//    reads its textContent.
check('chart bundle shipped as <script id="idg-chart-bundle">', /<script id="idg-chart-bundle">/.test(html));

console.log(failed ? `\nAUDIT FAILED (${failed})` : '\nAudit clean');
process.exit(failed ? 1 : 0);
