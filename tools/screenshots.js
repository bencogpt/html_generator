#!/usr/bin/env node
/* Capture demo screenshots of the generator (uses the same mock server flow
   as e2e.js). Run: node tools/build.js && node tools/screenshots.js */
'use strict';

const path = require('path');
const { chromium } = require('playwright');

// Reuse the mock server by importing e2e? Keep standalone: minimal copy.
const http = require('http');
const PORT = 8766;

const RESULT_HTML = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8"><title>סקר שוק תוכנה בישראל 2026</title>
{{BASE_CSS}}
{{CHART_LIB}}
</head>
<body>
<header class="hero"><span class="icon">📊</span><h1>סקר שוק תוכנה בישראל 2026</h1><p class="subtitle">חמש חברות מובילות · שוק של 12 מיליארד ש״ח · צמיחה שנתית 8%</p></header>
<div class="container">
<section class="card"><h2 class="section-title">מדדים מרכזיים</h2>
<div class="grid-3">
<div class="kpi"><div class="value">12 מיליארד ₪</div><div class="label">גודל השוק</div></div>
<div class="kpi"><div class="value">8%</div><div class="label">צמיחה שנתית</div></div>
<div class="kpi"><div class="value">5</div><div class="label">חברות מובילות</div></div>
</div></section>
<section class="card"><h2 class="section-title">נתחי שוק</h2>
<div class="chart-box"><canvas id="chart1"></canvas></div></section>
<section class="card"><h2 class="section-title">תהליך הרכש</h2>
<div class="flow">
<div class="flow-step"><span class="step-title">איסוף דרישות</span></div><div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">השוואת ספקים</span></div><div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">פיילוט</span></div><div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">חתימת חוזה</span></div>
</div></section>
<footer class="footer">מקור: sample-he.docx · נוצר 2026-06-11 · מודל: mock-llama</footer>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){new Chart(document.getElementById('chart1'),{type:'doughnut',data:{labels:['אלפא','בטא','גמא','אחרים'],datasets:[{data:[40,25,20,15],backgroundColor:['#2563EB','#60A5FA','#1E40AF','#93C5FD']}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',rtl:true,textDirection:'rtl',labels:{font:{family:'Heebo',size:14}}}}}});});</scr` + `ipt>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({ choices: [{ message: { content: RESULT_HTML } }], usage: { prompt_tokens: 1450, completion_tokens: 980 } }));
  });
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file://' + path.resolve(__dirname, '..', 'generator.html'));
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);

  // configure endpoint via UI (non-stream so the simple mock suffices)
  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.fill('#p-model', 'mock-llama');
  await page.uncheck('#p-stream');
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');

  await page.setInputFiles('#file-input', path.resolve(__dirname, 'fixtures', 'sample-he.docx'));
  await page.waitForSelector('#preview-card:not([hidden])');
  await page.screenshot({ path: '/tmp/shot-1-main.png' });

  await page.click('#btn-generate');
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled, null, { timeout: 30000 });
  await page.waitForTimeout(900); // let the chart animate in
  await page.screenshot({ path: '/tmp/shot-2-result.png' });

  await page.click('#btn-metrics');
  await page.click('#metrics-tabs [data-tab="tab-dash"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/shot-3-metrics.png' });
  await page.keyboard.press('Escape');

  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/shot-4-settings.png' });

  await browser.close();
  server.close();
  console.log('screenshots written to /tmp/shot-*.png');
})().catch((e) => { console.error(e); process.exit(1); });
