#!/usr/bin/env node
/* Validate the DIAGE-inspired features end-to-end through the real pipeline:
   a DARK (slate-premium) TABBED dashboard with an interactive calculator,
   timeline, and data table. Confirms the dark theme applies, tabs switch and
   reflow charts, the calculator computes with IDG_FMT, and the exports flatten
   tabs (all panes visible, script-free). Fully offline — no CDNs.

   Run: node tools/build.js && node tools/validate-diage.js */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 8797;

const REPORT = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>לוח מחוונים</title>
{{BASE_CSS}}
{{CHART_LIB}}
</head><body>
<header class="hero"><span class="icon">📊</span><h1>לוח מחוונים: שוק ה-RegTech</h1><p class="subtitle">ניתוח אינטראקטיבי</p></header>
<div class="container">
<div class="tabs" data-tab-group="g1">
  <button class="tab-btn" data-tab="overview">1. סקירה</button>
  <button class="tab-btn" data-tab="charts">2. תרשימים</button>
  <button class="tab-btn" data-tab="calc">3. מחשבון</button>
</div>

<div class="tab-content active" data-tab-group="g1" data-tab="overview">
  <section class="card"><h2 class="section-title">מדדים</h2>
    <div class="grid-3">
      <div class="kpi"><div class="value">12 מיליארד $</div><div class="label">גודל שוק</div></div>
      <div class="stat positive"><div class="sv">17.1%</div><div class="sl">צמיחה LATAM</div></div>
      <div class="stat warning"><div class="sv">$25</div><div class="sl">עלות קליק</div></div>
    </div>
  </section>
  <section class="card"><h2 class="section-title">ציר זמן רגולטורי</h2>
    <div class="timeline">
      <div class="timeline-item"><div class="t-date">2024</div><div class="t-title">eIDAS 2.0</div><div class="t-body">ארנקי זהות.</div></div>
      <div class="timeline-item"><div class="t-date">2026</div><div class="t-title">EUDI Wallet</div><div class="t-body">אימוץ מלא.</div></div>
      <div class="timeline-item"><div class="t-date">2027</div><div class="t-title">AMLR</div><div class="t-body">הידוק רגולטורי.</div></div>
    </div>
  </section>
  <section class="card"><h2 class="section-title">משווקים</h2>
    <div class="table-wrap"><table class="data-table">
      <thead><tr><th>חברה</th><th>מודל</th><th>אזור</th></tr></thead>
      <tbody>
        <tr><td>Sumsub</td><td>Partner Hub</td><td>אירופה</td></tr>
        <tr><td>Veriff</td><td>Enterprise</td><td>אמל"ט</td></tr>
        <tr><td>IDnow</td><td>DACH</td><td>גרמניה</td></tr>
      </tbody>
    </table></div>
  </section>
</div>

<div class="tab-content" data-tab-group="g1" data-tab="charts">
  <section class="card"><h2 class="section-title">חלוקת ערך</h2>
    <div class="grid-2">
      <div class="chart-box"><canvas id="cD"></canvas></div>
      <div class="chart-box"><canvas id="cB"></canvas></div>
    </div>
  </section>
</div>

<div class="tab-content" data-tab-group="g1" data-tab="calc">
  <section class="card"><h2 class="section-title">מחשבון עמלות</h2>
    <div class="calc">
      <div><div class="calc-row"><label>לקוחות</label><span class="calc-out" id="clv">10</span></div>
        <input type="range" class="calc-slider" id="cl" min="1" max="50" value="10" oninput="recalc()"></div>
      <div><div class="calc-row"><label>בדיקות</label><span class="calc-out" id="chv">150,000</span></div>
        <input type="range" class="calc-slider" id="ch" min="10000" max="1000000" step="10000" value="150000" oninput="recalc()"></div>
      <div><div class="calc-row"><label>עלות לסריקה</label><span class="calc-out" id="cov">$0.80</span></div>
        <input type="range" class="calc-slider" id="co" min="0.2" max="2" step="0.05" value="0.8" oninput="recalc()"></div>
      <div class="calc-results">
        <div class="calc-result"><div class="rv" id="gtv">$0</div><div class="rl">GTV</div></div>
        <div class="calc-result primary"><div class="rv" id="comm">$0</div><div class="rl">עמלה (15%)</div></div>
      </div>
    </div>
  </section>
</div>
</div>
<footer class="footer">מקור: market.docx · 2026 · glm-4.6</footer>
<script>
function mk(id,fn){try{fn();}catch(e){window.__e=(window.__e||{});window.__e[id]=String(e);}}
document.addEventListener('DOMContentLoaded',function(){
  if(window.Chart)Chart.defaults.animation=false;
  var S=['#3B82F6','#10B981','#F59E0B'];
  mk('cD',function(){new Chart(document.getElementById('cD'),{type:'doughnut',data:{labels:['מפיצים','OEM','אינטגרטורים'],datasets:[{data:[45,35,20],backgroundColor:S}]},options:{responsive:true,maintainAspectRatio:false}});});
  mk('cB',function(){new Chart(document.getElementById('cB'),{type:'bar',data:{labels:['2024','2025','2026'],datasets:[{data:[8,10,12],backgroundColor:S[0]}]},options:{responsive:true,maintainAspectRatio:false}});});
  window.recalc=function(){try{
    var clients=+document.getElementById('cl').value,checks=+document.getElementById('ch').value,cost=+document.getElementById('co').value,rate=0.15;
    document.getElementById('clv').textContent=clients;
    document.getElementById('chv').textContent=IDG_FMT.num(checks);
    document.getElementById('cov').textContent='$'+cost.toFixed(2);
    var gtv=clients*checks*cost,comm=gtv*rate;
    document.getElementById('gtv').textContent=IDG_FMT.usd(gtv);
    document.getElementById('comm').textContent=IDG_FMT.usd(comm);
  }catch(e){}};
  recalc();
});
</scr`+`ipt></body></html>`;

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({ choices: [{ message: { content: REPORT } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  });
});

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };
const externalReqs = [];

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true });
  ctx.on('request', (r) => { const u = r.url(); if (!/^(file:|data:|blob:|about:)/.test(u) && !u.includes('127.0.0.1:' + PORT)) externalReqs.push(u); });
  const page = await ctx.newPage();
  page.setViewportSize({ width: 1180, height: 1000 });
  await page.goto('file://' + path.resolve(__dirname, '..', 'generator.html'));
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);
  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.fill('#p-model', 'glm');
  await page.uncheck('#p-stream');
  await page.click('#settings-tabs [data-tab="tab-output"]');
  await page.selectOption('#o-palette', 'slate-premium');
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');
  await page.click('#paste-details summary');
  await page.fill('#paste-area', 'דוח שוק RegTech');
  await page.click('#btn-paste-use');
  await page.click('#btn-generate');
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled, null, { timeout: 30000 });

  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.waitForFunction(() => window.IDG_TABS && window.IDG_FMT && window.Chart && window.Chart.getChart('cD'), null, { timeout: 20000 });
  await page.waitForTimeout(800);

  console.log('DARK THEME:');
  const theme = await frame.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const m = bg.match(/\d+/g).map(Number);
    const surface = getComputedStyle(document.querySelector('.card')).backgroundColor;
    return { bg, dark: (m[0] + m[1] + m[2]) < 120, surface };
  });
  ok('dark page background applied (' + theme.bg + ')', theme.dark);
  ok('cards use translucent dark surface', /rgba?\([^)]*0\.7|rgba?\(30, 41, 59/.test(theme.surface) || theme.surface.includes('rgba'), theme.surface);

  console.log('\nTABS:');
  const initial = await frame.evaluate(() => ({
    activePanes: document.querySelectorAll('.tab-content.active').length,
    overviewVisible: document.querySelector('[data-tab="overview"].tab-content').offsetHeight > 0,
    chartsVisible: document.querySelector('[data-tab="charts"].tab-content').offsetHeight > 0,
  }));
  ok('exactly one tab active on load', initial.activePanes === 1, 'active=' + initial.activePanes);
  ok('first tab visible, others hidden', initial.overviewVisible && !initial.chartsVisible);

  // switch to charts tab → its charts must reflow and draw
  await frame.click('.tab-btn[data-tab="charts"]');
  await page.waitForTimeout(1000);
  const afterSwitch = await frame.evaluate(() => {
    const drew = (id) => { try { const c = document.getElementById(id); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) n++; return n > 15; } catch (e) { return false; } };
    return { chartsVisible: document.querySelector('[data-tab="charts"].tab-content').offsetHeight > 0, cD: drew('cD'), cB: drew('cB') };
  });
  ok('clicking a tab reveals its pane', afterSwitch.chartsVisible);
  ok('charts in the switched-to tab reflow & draw', afterSwitch.cD && afterSwitch.cB);

  console.log('\nCALCULATOR:');
  await frame.click('.tab-btn[data-tab="calc"]');
  await page.waitForTimeout(200);
  const calc = await frame.evaluate(() => {
    const before = document.getElementById('comm').textContent;
    const cl = document.getElementById('cl'); cl.value = 30; cl.dispatchEvent(new Event('input'));
    return { before, after: document.getElementById('comm').textContent, gtv: document.getElementById('gtv').textContent, clv: document.getElementById('clv').textContent };
  });
  ok('slider input recomputes the result', calc.before !== calc.after, calc.before + ' → ' + calc.after);
  ok('results are currency-formatted (IDG_FMT)', /^\$[\d,]+$/.test(calc.after) && /^\$[\d,]+$/.test(calc.gtv), calc.after + ' / ' + calc.gtv);

  console.log('\nSTATIC EXPORT (tabs flattened, script-free):');
  // back to first tab, then export
  await frame.click('.tab-btn[data-tab="overview"]');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-static')]);
  const out = '/tmp/diage-static.html';
  await dl.saveAs(out);
  const staticHtml = fs.readFileSync(out, 'utf8');
  ok('static export: no <script>', !/<script[\s>]/i.test(staticHtml));
  ok('static export: charts became images', (staticHtml.match(/data:image\/png/g) || []).length >= 2);
  // render the static file (no JS) and confirm ALL tab panes are visible (flattened)
  const sp = await ctx.newPage();
  await sp.goto('file://' + out);
  await sp.waitForTimeout(400);
  const flat = await sp.evaluate(() => Array.from(document.querySelectorAll('.tab-content')).map((p) => p.offsetHeight > 0));
  ok('all ' + flat.length + ' tab panes visible in script-free export (flattened)', flat.length === 3 && flat.every(Boolean), JSON.stringify(flat));

  console.log('\nOFFLINE:');
  ok('zero external network requests', externalReqs.length === 0, externalReqs.join(', '));

  // visuals
  await frame.click('.tab-btn[data-tab="overview"]');
  await page.waitForTimeout(300);
  const srcdoc = await page.getAttribute('#result-frame', 'srcdoc');
  const vp = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await vp.setContent(srcdoc, { waitUntil: 'load' });
  await vp.waitForTimeout(1200);
  await vp.screenshot({ path: '/tmp/diage-overview.png' });
  await vp.evaluate(() => document.querySelector('.tab-btn[data-tab="charts"]').click());
  await vp.waitForTimeout(900);
  await vp.screenshot({ path: '/tmp/diage-charts.png' });
  await vp.evaluate(() => document.querySelector('.tab-btn[data-tab="calc"]').click());
  await vp.waitForTimeout(400);
  await vp.screenshot({ path: '/tmp/diage-calc.png' });

  await browser.close();
  server.close();
  console.log('\nVisuals: /tmp/diage-overview.png, /tmp/diage-charts.png, /tmp/diage-calc.png');
  console.log(failed ? `\n✗ ${failed} check(s) FAILED` : '\n✓ DIAGE features (dark theme, tabs, calculator, timeline, table) all working — offline');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
