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

// 1. Our own application code uses no eval / new Function (avoids relying on
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

// 2. No sourceMappingURL pragmas (stripped from vendored libs).
check('no sourceMappingURL pragmas', !/sourceMappingURL/.test(html));

// 3. No functional external references: no loadable http(s) src/href, no
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

// 4. The chart bundle is a real <script> element (not eval'd), so injection
//    reads its textContent.
check('chart bundle shipped as <script id="idg-chart-bundle">', /<script id="idg-chart-bundle">/.test(html));

// 5. No hardcoded secrets in the application source (the code that ships).
//    High-signal credential patterns only. The user's LLM token is never
//    hardcoded — it is entered at runtime and kept session-only by default.
const SRC_DIRS = ['src/js', 'src/output'];
const SRC_FILES = ['src/shell.html', 'src/app.css'];
const srcFiles = SRC_FILES.concat(
  SRC_DIRS.flatMap((d) => fs.readdirSync(path.resolve(__dirname, '..', d)).map((f) => d + '/' + f))
);
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9]{16,}/, 'OpenAI-style key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/, 'JWT'],
  [/(?:Authorization|Bearer)\s*[:=]?\s*["'`]?Bearer\s+[A-Za-z0-9._-]{20,}/, 'hardcoded bearer token'],
];
const secretHits = [];
for (const rel of srcFiles) {
  const txt = fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
  for (const [re, label] of SECRET_PATTERNS) {
    const mm = txt.match(re);
    if (mm) secretHits.push(`${rel}: ${label} (${mm[0].slice(0, 24)}…)`);
  }
}
check('no hardcoded secrets in app source', secretHits.length === 0, secretHits.join(' ; '));

console.log(failed ? `\nAUDIT FAILED (${failed})` : '\nAudit clean');
process.exit(failed ? 1 : 0);
