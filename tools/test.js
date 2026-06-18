#!/usr/bin/env node
/* Unit tests for the pure/DOM-free parts of the generator.
   Run: node tools/test.js */
'use strict';

const assert = require('assert');
const path = require('path');

// Minimal browser-ish globals before loading modules.
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const ROOT = path.resolve(__dirname, '..');
for (const m of ['util', 'i18n', 'store', 'extract', 'llm', 'prompt', 'postprocess', 'metrics']) {
  require(path.join(ROOT, 'src/js', m + '.js'));
}
const IDG = globalThis.IDG;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('util');
test('getPath resolves bracket & dot paths', () => {
  const obj = { choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 7 } };
  assert.equal(IDG.util.getPath(obj, 'choices[0].message.content'), 'hi');
  assert.equal(IDG.util.getPath(obj, 'choices.0.message.content'), 'hi');
  assert.equal(IDG.util.getPath(obj, 'usage.prompt_tokens'), 7);
  assert.equal(IDG.util.getPath(obj, 'nope.x'), undefined);
});
test('csv escapes quotes/commas/newlines', () => {
  assert.equal(IDG.util.toCSV([['a', 'b,c', 'd"e', 'f\ng']]), 'a,"b,c","d""e","f\ng"');
});
test('percentile & median', () => {
  assert.equal(IDG.util.median([1, 3, 2]), 2);
  assert.equal(IDG.util.median([1, 2, 3, 4]), 2.5);
  assert.equal(IDG.util.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
});
test('fileStamp shape', () => {
  assert.match(IDG.util.fileStamp(new Date('2026-06-11T09:05:00').getTime()), /^20260611-0905$/);
});
test('sanitizeBaseName strips extension and bad chars', () => {
  assert.equal(IDG.util.sanitizeBaseName('סקר שוק: 2026?.docx'), 'סקר שוק_ 2026_');
});

console.log('extract');
test('detectLanguage Hebrew → rtl', () => {
  const r = IDG.extract.detectLanguage('סקר שוק מקיף על תחום התוכנה בישראל בשנת 2026');
  assert.deepEqual(r, { lang: 'he', dir: 'rtl' });
});
test('detectLanguage English → ltr', () => {
  assert.deepEqual(IDG.extract.detectLanguage('A market survey about software'), { lang: 'en', dir: 'ltr' });
});
test('markdown structure: headings + table', () => {
  const md = '# Title\n\nSome text\n\n## Sub\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
  const s = IDG.extract.structureFromPlain(md, true);
  assert.equal(s.headings.length, 2);
  assert.equal(s.tables.length, 1);
  assert.deepEqual(s.tables[0][1], ['1', '2']);
});

console.log('llm');
test('mapUsage: OpenAI usage', () => {
  assert.deepEqual(IDG.llm.mapUsage({ usage: { prompt_tokens: 10, completion_tokens: 20 } }),
    { tokensIn: 10, tokensOut: 20, estimated: false });
});
test('mapUsage: Ollama eval counts (FR-30a)', () => {
  assert.deepEqual(IDG.llm.mapUsage({ prompt_eval_count: 5, eval_count: 9 }),
    { tokensIn: 5, tokensOut: 9, estimated: false });
});
test('mapUsage: none → null', () => {
  assert.equal(IDG.llm.mapUsage({ foo: 1 }), null);
});
test('fillTemplate escapes JSON and unquotes numerics', () => {
  const tpl = '{"model":"{{MODEL}}","sys":"{{SYSTEM}}","p":"{{PROMPT}}","t":"{{TEMPERATURE}}","m":{{MAX_TOKENS}}}';
  const out = IDG.llm.fillTemplate(tpl, {
    MODEL: 'm1', SYSTEM: 'line1\n"quoted"', PROMPT: 'דו"ח', TEMPERATURE: 0.3, MAX_TOKENS: 4096,
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.sys, 'line1\n"quoted"');
  assert.equal(parsed.p, 'דו"ח');
  assert.strictEqual(parsed.t, 0.3);
  assert.strictEqual(parsed.m, 4096);
});
test('joinUrl strips trailing slashes', () => {
  assert.equal(IDG.llm.joinUrl('http://x:8000/v1/', '/chat/completions'), 'http://x:8000/v1/chat/completions');
});

console.log('postprocess');
test('stripFences: fenced html (acceptance #5)', () => {
  const raw = 'Sure! Here is the infographic:\n```html\n<!DOCTYPE html><html><body>hi</body></html>\n```\nLet me know!';
  assert.equal(IDG.post.stripFences(raw), '<!DOCTYPE html><html><body>hi</body></html>');
  assert.ok(IDG.post.looksLikeFences(raw));
});
test('stripFences: leading prose without fences', () => {
  const raw = 'Here you go:\n<!DOCTYPE html>\n<html><body>x</body></html>';
  assert.ok(IDG.post.stripFences(raw).startsWith('<!DOCTYPE html>'));
});
test('lintExternal finds CDN refs, url(), @import, fetch', () => {
  const html = `<html><head>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link href="https://fonts.googleapis.com/css2?family=Heebo" rel="stylesheet">
    <style>@import url("https://x.com/a.css"); body{background:url(https://x.com/i.png)}</style>
    </head><body><script>fetch("https://api.example.com")<\/script></body></html>`;
  const v = IDG.post.lintExternal(html);
  assert.ok(v.length >= 5, 'found ' + v.length);
});
test('lintExternal clean output → none', () => {
  assert.equal(IDG.post.lintExternal('<html><head><style>body{color:#000}</style></head><body><a href="#x">in-page</a></body></html>').length, 0);
});
test('stripExternal removes refs', () => {
  const dirty = '<img src="https://x.com/a.png"><style>@import url("https://x.com/a.css");</style>';
  assert.equal(IDG.post.lintExternal(IDG.post.stripExternal(dirty)).length, 0);
});
test('injectAssets replaces tokens', () => {
  const assets = { CHART_SRC: '/*chart*/', BASE_CSS: '/*base*/', FONT_CSS: '/*font*/', PALETTE_CSS: ':root{}' };
  const r = IDG.post.injectAssets('<html><head>{{BASE_CSS}}\n{{CHART_LIB}}</head><body></body></html>', assets);
  assert.ok(r.usedTokens);
  assert.ok(r.html.includes('/*chart*/') && r.html.includes('/*base*/') && r.html.includes('/*font*/'));
  assert.ok(!r.html.includes('{{'));
});
test('injectAssets falls back to </head> when tokens missing (FR-23)', () => {
  const assets = { CHART_SRC: '/*chart*/', BASE_CSS: '/*base*/', FONT_CSS: '/*font*/', PALETTE_CSS: '' };
  const r = IDG.post.injectAssets('<html><head><title>t</title></head><body></body></html>', assets);
  assert.ok(!r.usedTokens);
  assert.ok(r.html.indexOf('/*chart*/') < r.html.indexOf('</head>'));
  assert.ok(r.html.includes('/*base*/'));
});

console.log('prompt');
test('chunkText respects budget and keeps content', () => {
  const para = 'word '.repeat(200).trim();                  // ~1000 chars
  const text = Array(40).fill(para).join('\n\n');           // ~40k chars
  const chunks = IDG.prompt.chunkText(text, 2000);          // 8000 chars each
  assert.ok(chunks.length >= 5, 'chunks: ' + chunks.length);
  assert.ok(chunks.every((c) => c.length <= 8200));
  assert.equal(chunks.join('\n\n').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});
test('renderSystemPrompt fills placeholders', () => {
  IDG.store.load();
  const sp = IDG.prompt.renderSystemPrompt(IDG.store.state);
  assert.ok(!/\{\{(MAX_CHARTS|FLOW_RULE|PALETTE_JSON|LANG_RULE|SECTIONS_RULE)\}\}/.test(sp));
  assert.ok(sp.includes('{{BASE_CSS}}') && sp.includes('{{CHART_LIB}}'));  // tokens for the model stay
  assert.ok(sp.includes('#2563EB'));
  assert.ok(/try \{/.test(sp) && /catch/.test(sp), 'per-chart try/catch instruction present');
});
test('detail level changes section guidance', () => {
  const s = IDG.store.load();
  s.output.detailLevel = 'concise';
  assert.match(IDG.prompt.renderSystemPrompt(s), /3–4 concise/);
  s.output.detailLevel = 'comprehensive';
  const comp = IDG.prompt.renderSystemPrompt(s);
  assert.match(comp, /thoroughly|every major topic/);
  assert.ok(!/\{\{SECTIONS_RULE\}\}/.test(comp));
  s.output.detailLevel = 'balanced';
});
test('docBudget leaves room for output', () => {
  const profile = { contextWindow: 8192, maxTokens: 4096 };
  const b = IDG.prompt.docBudget(profile, 'x'.repeat(4000)); // 1000 tokens
  assert.ok(b >= 2000 && b < 8192);
});
test('mergeBriefs concatenates sections/numbers', () => {
  const merged = IDG.prompt.mergeBriefs([
    '{"sections":[{"heading":"a","summary":"s"}],"numbers":[{"label":"x","value":"1"}]}',
    '{"sections":[{"heading":"b","summary":"t"}]}',
  ]);
  assert.equal(merged.sections.length, 2);
  assert.equal(merged.numbers.length, 1);
});

console.log('metrics');
test('totals + cost + CSV export', () => {
  IDG.metrics.clear();
  const passes = [
    { type: 'summarize', tokensIn: 100, tokensOut: 50, latencyMs: 1000 },
    { type: 'main', tokensIn: 200, tokensOut: 300, estimated: false, ttftMs: 200, latencyMs: 3000 },
  ];
  const totals = IDG.metrics.totalsFromPasses(passes);
  assert.deepEqual([totals.tokensIn, totals.tokensOut, totals.latencyMs], [300, 350, 4000]);
  assert.equal(IDG.metrics.costFor({ priceIn: 1, priceOut: 2 }, 1e6, 1e6), 3);
  IDG.metrics.record({
    id: 'r1', ts: Date.now(), source: 'דוח.docx', model: 'llama3', profileName: 'p',
    status: 'success', passes, tokensIn: 300, tokensOut: 350, latencyMs: 4000,
    ttftMs: 200, tokPerSec: 116.7, outputBytes: 1000,
    extract: { words: 10, tables: 1, headings: 2, lang: 'he' },
  });
  const csv = IDG.metrics.toCSV();
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('tokens_in,tokens_out'));
  assert.ok(lines[1].includes('300,350'));
  assert.ok(csv.charCodeAt(0) === 0xfeff, 'BOM for Excel');
  const agg = IDG.metrics.aggregates(0);
  assert.equal(agg.count, 1);
  assert.equal(agg.successRate, 1);
});
test('FIFO cap (FR-44)', () => {
  IDG.metrics.clear();
  for (let i = 0; i < IDG.metrics.CAP + 25; i++) {
    IDG.metrics.record({ id: 'x' + i, ts: i, status: 'success', passes: [] });
  }
  const runs = IDG.metrics.load();
  assert.equal(runs.length, IDG.metrics.CAP);
  assert.equal(runs[0].id, 'x25');
});

console.log('store');
test('profiles round-trip; session-only key never persisted (FR-34)', () => {
  IDG.store.clearAll();
  const s = IDG.store.load();
  const p = IDG.store.activeProfile;
  p.apiKey = 'sekret';
  p.persistKey = false;
  IDG.store.setSessionKey(p.id, 'sekret');
  p.apiKey = '';
  IDG.store.save();
  assert.ok(!globalThis.localStorage.getItem('idg.settings.v1').includes('sekret'));
  assert.equal(IDG.store.apiKeyFor(p), 'sekret');
  // export excludes secrets by default (FR-32)
  p.apiKey = 'sekret2'; p.persistKey = true; IDG.store.save();
  assert.ok(!IDG.store.exportProfiles(false).includes('sekret2'));
  assert.ok(IDG.store.exportProfiles(true).includes('sekret2'));
});
test('parseHeaders', () => {
  assert.deepEqual(IDG.store.parseHeaders('X-Org: abc\nAuthorization: Bearer t\n\nbad line'),
    { 'X-Org': 'abc', 'Authorization': 'Bearer t' });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
