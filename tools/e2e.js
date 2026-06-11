#!/usr/bin/env node
/* End-to-end smoke test: loads the built generator.html from file:// in
   headless Chromium against a mock OpenAI-compatible server.

   Exercises: boot (embedded font/i18n), paste-ingestion + extraction preview,
   settings round-trip via UI, test-connection (FR-31), SSE streaming
   generation, fence-strip + lint + repair pass (FR-23, acceptance #5),
   asset injection, sandboxed preview, and the metrics record (FR-40).

   Run: node tools/build.js && node tools/e2e.js */
'use strict';

const http = require('http');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 8765;

/* ---- mock OpenAI-compatible server (CORS-open, like a configured vLLM) ---- */

const DIRTY_HTML = `\`\`\`html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>סקר שוק</title>
{{BASE_CSS}}
{{CHART_LIB}}
<link href="https://fonts.googleapis.com/css2?family=Heebo" rel="stylesheet">
</head>
<body>
<header class="hero"><span class="icon">📊</span><h1>סקר שוק</h1><p class="subtitle">תקציר</p></header>
<div class="container">
<section class="card"><h2 class="section-title">נתונים</h2>
<div class="chart-box"><canvas id="chart1"></canvas></div></section>
<footer class="footer">מקור: pasted-text</footer>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){new Chart(document.getElementById('chart1'),{type:'doughnut',data:{labels:['א','ב'],datasets:[{data:[60,40]}]},options:{responsive:true,maintainAspectRatio:false}});});</scr` + `ipt>
</body>
</html>
\`\`\``;

const CLEAN_HTML = DIRTY_HTML
  .replace(/```(html)?\n?/g, '')
  .replace(/<link href="https:[^>]+>\n?/, '');

let chatCalls = 0;

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (req.url === '/v1/models') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    return res.end(JSON.stringify({ data: [{ id: 'mock-llama' }, { id: 'mock-qwen' }] }));
  }

  if (req.url === '/v1/chat/completions') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body);
      const isPing = JSON.stringify(parsed.messages).includes('pong');
      chatCalls++;
      const isRepair = JSON.stringify(parsed.messages).includes('previous HTML output has problems');
      const content = isPing ? 'pong' : isRepair ? CLEAN_HTML : DIRTY_HTML;

      if (parsed.stream) {
        res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream' }, cors));
        const pieces = content.match(/[\s\S]{1,400}/g) || [];
        for (const p of pieces) {
          res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n');
        }
        res.write('data: ' + JSON.stringify({
          choices: [],
          usage: { prompt_tokens: 321, completion_tokens: 654 },
        }) + '\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      return res.end(JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 11, completion_tokens: 2 },
      }));
    });
    return;
  }

  res.writeHead(404, cors);
  res.end('{}');
});

/* ---------- the test ---------- */

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = 'file://' + path.resolve(__dirname, '..', 'generator.html');
  await page.goto(url);

  // boot: i18n applied, Chart installed from the embedded string
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);
  assert.ok(await page.evaluate(() => typeof window.Chart === 'function'), 'Chart.js installed at boot');
  assert.ok(await page.evaluate(() => typeof window.mammoth === 'object'), 'mammoth available');
  assert.ok(await page.evaluate(() =>
    [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.cssText.includes('Heebo')); } catch (e) { return false; } })
  ), 'embedded Heebo @font-face present');
  console.log('✓ boot (font, chart lib, mammoth, i18n)');

  // ingestion via paste (shares the FR-1x pipeline)
  await page.click('#paste-details summary');
  await page.fill('#paste-area', [
    '# סקר שוק תוכנה 2026',
    '',
    'המסמך סוקר חמש חברות מובילות בתחום. סך השוק נאמד ב-12 מיליארד ש"ח.',
    '',
    '| חברה | נתח שוק |',
    '| --- | --- |',
    '| אלפא | 40 |',
    '| בטא | 25 |',
  ].join('\n'));
  await page.click('#btn-paste-use');
  await page.waitForSelector('#preview-card:not([hidden])');
  const chips = await page.$$eval('#stats-chips .chip', (els) => els.map((e) => e.textContent));
  assert.ok(chips.some((c) => /rtl/.test(c)), 'Hebrew detected as RTL: ' + chips.join(' | '));
  assert.ok(chips.some((c) => c.includes('1')), 'table counted');
  console.log('✓ extraction preview (Hebrew RTL, table detected)');

  // settings: configure mock endpoint through the real UI
  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.click('#btn-fetch-models');
  await page.waitForFunction(() => document.querySelectorAll('#model-list option').length === 2);
  await page.fill('#p-model', 'mock-llama');
  await page.click('#btn-test');
  await page.waitForFunction(() => /\d/.test(document.querySelector('#test-result').textContent));
  const testResult = await page.textContent('#test-result');
  assert.ok(testResult.includes('11/2'), 'test connection reports server usage: ' + testResult);
  console.log('✓ test connection + fetch models:', testResult.trim());
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');

  // settings persistence (acceptance #3): reload, value must survive
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#endpoint-url').textContent.includes('127.0.0.1'));
  console.log('✓ settings persisted across reload');

  // re-ingest after reload — this time a real Hebrew .docx through mammoth
  // (acceptance #1), then generate
  await page.setInputFiles('#file-input', path.resolve(__dirname, 'fixtures', 'sample-he.docx'));
  await page.waitForSelector('#preview-card:not([hidden])');
  const docxChips = await page.$$eval('#stats-chips .chip', (els) => els.map((e) => e.textContent));
  assert.ok(docxChips.some((c) => /rtl/.test(c)), 'docx detected as Hebrew RTL');
  assert.ok(docxChips.some((c) => c.includes('1')), 'docx table extracted: ' + docxChips.join(' | '));
  const previewText = await page.textContent('#preview-text');
  assert.ok(previewText.includes('אלפא | 40'), 'table rows in extraction preview');
  assert.ok(previewText.includes('# סקר שוק תוכנה בישראל 2026'), 'heading extracted with level');
  console.log('✓ Hebrew DOCX extracted via mammoth (headings + tables)');
  await page.click('#btn-generate');
  await page.waitForSelector('#result-frame:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled);

  const srcdoc = await page.getAttribute('#result-frame', 'srcdoc');
  assert.ok(srcdoc.startsWith('<!DOCTYPE html>'), 'fences stripped');
  assert.ok(!srcdoc.includes('fonts.googleapis.com'), 'external font link removed');
  assert.ok(srcdoc.includes('Chart.js'), 'chart lib injected');
  assert.ok(srcdoc.includes('--c-primary'), 'base css injected');
  assert.ok(srcdoc.includes("font-family:'Heebo'"), 'heebo @font-face injected into output');
  assert.ok(!/(?:src|href)=["'](?:https?:)?\/\//.test(srcdoc), 'no external refs in artifact');
  assert.ok(await page.getAttribute('#result-frame', 'sandbox') === 'allow-scripts', 'sandboxed iframe (NFR-6)');
  console.log('✓ generation: fences stripped, repair pass ran, assets injected, artifact clean');

  // chart actually renders inside the sandboxed iframe
  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.waitForFunction(() => {
    const c = document.getElementById('chart1');
    return c && c.width > 0;
  }, null, { timeout: 10000 });
  console.log('✓ Chart.js renders inside sandboxed iframe');

  // metrics record (FR-40, acceptance #4): status=repaired, exact server usage
  const runs = await page.evaluate(() => JSON.parse(localStorage.getItem('idg.metrics.v1')));
  const run = runs[runs.length - 1];
  assert.equal(run.status, 'repaired', 'status=repaired (acceptance #5)');
  assert.equal(run.passes.length, 2, 'main + repair passes');
  assert.equal(run.tokensIn, 321 * 2, 'tokens in = sum over passes, exact (±0)');
  assert.equal(run.tokensOut, 654 * 2, 'tokens out exact');
  assert.equal(run.estimated, false, 'usage from server, not estimated');
  assert.ok(run.outputBytes > run.modelBytes, 'injected assets accounted');
  console.log('✓ metrics: status=repaired, passes=2, tokens exact from server usage');

  // performance modal renders the run
  await page.click('#btn-metrics');
  await page.waitForSelector('#metrics-modal:not([hidden])');
  const rows = await page.$$eval('#runs-tbody tr', (els) => els.length);
  assert.ok(rows >= 1, 'runs table has rows');
  await page.click('#metrics-tabs [data-tab="tab-dash"]');
  await page.waitForFunction(() => document.querySelectorAll('#agg-cards .agg-card').length === 6);
  console.log('✓ performance modal: runs table + dashboard aggregates');

  // legacy .doc rejection (FR-12 / acceptance #6)
  await page.keyboard.press('Escape');
  const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
  await page.setInputFiles('#file-input', { name: 'old.doc', mimeType: 'application/msword', buffer: ole });
  await page.waitForFunction(() => document.querySelector('#warnings .banner.error') !== null);
  const msg = await page.textContent('#warnings .banner.error');
  assert.ok(msg.includes('.docx'), 'legacy .doc message instructs re-save: ' + msg);
  console.log('✓ legacy .doc rejected with re-save guidance');

  // Hebrew UI toggle (NFR-4)
  await page.click('#btn-lang');
  assert.equal(await page.getAttribute('html', 'dir'), 'rtl', 'UI flips to RTL');
  const genLabel = await page.textContent('#btn-generate');
  assert.ok(/אינפוגרפיקה/.test(genLabel), 'Hebrew strings applied');
  console.log('✓ bilingual UI toggle (RTL)');

  const fatal = errors.filter((e) => !/favicon/i.test(e));
  assert.deepEqual(fatal, [], 'no page errors: ' + fatal.join(' ;; '));

  await browser.close();
  server.close();
  console.log('\nE2E: all checks passed (chat calls served: ' + chatCalls + ')');
})().catch((err) => {
  console.error('E2E FAILED:', err.message);
  process.exit(1);
});
