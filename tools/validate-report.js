#!/usr/bin/env node
/* GLM-class report validation: a large, content-rich Hebrew infographic with
   the full set of content blocks AND many chart types — including one
   deliberately broken chart — is generated through the real pipeline, then we
   verify every content block and chart renders, the broken chart stays
   isolated (the "not all graphs work" case), and all three exports succeed.

   (Cannot reach a private GLM endpoint from here; this simulates a GLM-class
   output: rich content + many charts + one imperfect chart.)

   Run: node tools/build.js && node tools/validate-report.js */
'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 8796;

const REPORT = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>סקר שוק תוכנה 2026</title>
{{BASE_CSS}}
{{CHART_LIB}}
</head><body>
<header class="hero"><span class="icon">📊</span><h1>סקר שוק התוכנה בישראל 2026</h1>
<p class="subtitle">סקירה אסטרטגית מקיפה של חמש החברות המובילות, מגמות וצמיחה</p></header>
<div class="container">

<section class="card"><h2 class="section-title">מדדים מרכזיים</h2>
<div class="grid-4">
<div class="kpi"><div class="value">12 מיליארד ₪</div><div class="label">גודל השוק</div></div>
<div class="kpi"><div class="value">8%</div><div class="label">צמיחה שנתית</div></div>
<div class="kpi"><div class="value">5</div><div class="label">חברות מובילות</div></div>
<div class="kpi"><div class="value">273K</div><div class="label">מועסקים</div></div>
</div></section>

<section class="card"><h2 class="section-title">התפלגות הכנסות</h2>
<p>השוק מתחלק לשלושה תחומי פעילות מרכזיים, כאשר הייעוץ מוביל בצמיחה.</p>
<div class="grid-2">
<div class="chart-box"><canvas id="c_doughnut"></canvas></div>
<div class="chart-box"><canvas id="c_radar"></canvas></div>
</div></section>

<section class="card"><h2 class="section-title">מגמות והשוואה שנתית</h2>
<div class="grid-2">
<div class="chart-box"><canvas id="c_grouped"></canvas></div>
<div class="chart-box"><canvas id="c_line"></canvas></div>
<div class="chart-box"><canvas id="c_area"></canvas></div>
<div class="chart-box"><canvas id="c_polar"></canvas></div>
</div></section>

<section class="card"><h2 class="section-title">החברות המובילות</h2>
<div class="grid-3">
<div class="entity-card"><h3>אלפא טכנולוגיות</h3><p>מובילת שוק הייעוץ.</p><ul><li>נתח 40%</li><li>1200 עובדים</li></ul></div>
<div class="entity-card alt"><h3>בטא מערכות</h3><p>מתמחה בענן.</p><ul><li>נתח 25%</li><li>800 עובדים</li></ul></div>
<div class="entity-card"><h3>גמא סייבר</h3><p>אבטחת מידע.</p><ul><li>נתח 20%</li><li>600 עובדים</li></ul></div>
<div class="entity-card alt"><h3>דלתא דאטה</h3><p>ניתוח נתונים.</p><ul><li>נתח 9%</li><li>300 עובדים</li></ul></div>
<div class="entity-card"><h3>אפסילון AI</h3><p>בינה מלאכותית.</p><ul><li>נתח 6%</li><li>250 עובדים</li></ul></div>
<div class="entity-card alt"><h3>זeta ענן</h3><p>תשתיות.</p><ul><li>נתח 5%</li><li>200 עובדים</li></ul></div>
</div></section>

<section class="card"><h2 class="section-title">מטריצת יכולות וקורלציות</h2>
<div class="grid-2">
<div class="chart-box tall"><canvas id="c_heatmap"></canvas></div>
<div class="chart-box"><canvas id="c_scatter"></canvas></div>
</div></section>

<section class="card"><h2 class="section-title">פריסה גלובלית</h2>
<div class="grid-2">
<div class="chart-box map"><canvas id="c_choropleth"></canvas></div>
<div class="chart-box map"><canvas id="c_bubblemap"></canvas></div>
</div></section>

<section class="card"><h2 class="section-title">תרשים נוסף</h2>
<div class="chart-box"><canvas id="c_broken"></canvas></div></section>

<section class="card"><h2 class="section-title">תהליך הרכש</h2>
<div class="flow">
<div class="flow-step"><span class="step-title">איסוף דרישות</span>מיפוי צרכים</div>
<div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">השוואת ספקים</span>הערכת חלופות</div>
<div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">פיילוט</span>בדיקת היתכנות</div>
<div class="flow-arrow"></div>
<div class="flow-step"><span class="step-title">הטמעה</span>חתימת חוזה</div>
</div></section>

<footer class="footer">מקור: market-survey.docx · נוצר 2026-06-23 · מודל: glm-4.6</footer>
</div>
<script>
window.__chartErr={};
function mk(id,fn){try{fn();}catch(e){window.__chartErr[id]=String(e&&e.message||e);}}
document.addEventListener('DOMContentLoaded',function(){
if(window.Chart)Chart.defaults.animation=false;
var S=['#4F46E5','#F43F5E','#F59E0B','#10B981','#0EA5E9','#A855F7'];
var R={responsive:true,maintainAspectRatio:false};
mk('c_doughnut',function(){new Chart(c_doughnut,{type:'doughnut',data:{labels:['ייעוץ','ענן','סייבר'],datasets:[{data:[45,34,21],backgroundColor:S}]},options:R});});
mk('c_radar',function(){new Chart(c_radar,{type:'radar',data:{labels:['AI','ענן','סייבר','דאטה','ESG'],datasets:[{data:[95,88,85,90,70],borderColor:S[0],backgroundColor:'rgba(79,70,229,.2)'}]},options:R});});
mk('c_grouped',function(){new Chart(c_grouped,{type:'bar',data:{labels:['2024','2025','2026'],datasets:[{label:'הכנסה',data:[8,10,12],backgroundColor:S[0]},{label:'רווח',data:[2,3,4],backgroundColor:S[1]}]},options:R});});
mk('c_line',function(){new Chart(c_line,{type:'line',data:{labels:['Q1','Q2','Q3','Q4'],datasets:[{data:[3,5,4,7],borderColor:S[2]}]},options:R});});
mk('c_area',function(){new Chart(c_area,{type:'line',data:{labels:['Q1','Q2','Q3','Q4'],datasets:[{data:[3,5,4,8],borderColor:S[3],backgroundColor:'rgba(16,185,129,.3)',fill:true}]},options:R});});
mk('c_polar',function(){new Chart(c_polar,{type:'polarArea',data:{labels:['א','ב','ג','ד'],datasets:[{data:[11,7,9,4],backgroundColor:S}]},options:R});});
mk('c_scatter',function(){new Chart(c_scatter,{type:'scatter',data:{datasets:[{data:[{x:1,y:2},{x:3,y:5},{x:4,y:3},{x:6,y:7}],backgroundColor:S[4]}]},options:R});});
mk('c_heatmap',function(){IDG_CHARTS.heatmap('c_heatmap',['אלפא','בטא','גמא'],['AI','ענן','סייבר','דאטה'],[[95,80,70,88],[60,90,75,65],[40,55,95,70]],{label:'יכולת'});});
mk('c_choropleth',function(){IDG_CHARTS.choropleth('c_choropleth',{'Israel':40,'United States':25,'Germany':15,'India':12,'Japan':8},{label:'נתח'});});
mk('c_bubblemap',function(){IDG_CHARTS.bubbleMap('c_bubblemap',{'Israel':40,'United States':25,'Germany':15,'France':10},{label:'נוכחות'});});
// Deliberately broken chart (simulates a model mistake): references an
// undefined variable. Must be isolated by its own try/catch so the rest live.
mk('c_broken',function(){new Chart(c_broken,{type:'bar',data:{labels:['x'],datasets:[{data:THIS_IS_UNDEFINED}]},options:R});});
});
</scr`+`ipt></body></html>`;

const GOOD = ['c_doughnut', 'c_radar', 'c_grouped', 'c_line', 'c_area', 'c_polar', 'c_scatter', 'c_heatmap', 'c_choropleth', 'c_bubblemap'];

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({ choices: [{ message: { content: REPORT } }], usage: { prompt_tokens: 2000, completion_tokens: 1500 } }));
  });
});

let failed = 0;
const ok = (name, cond, extra) => { if (cond) console.log('  ✓ ' + name); else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'generator.html'));
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);
  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.fill('#p-model', 'glm-4.6');
  await page.uncheck('#p-stream');
  // comprehensive detail level, like GLM produces
  await page.click('#settings-tabs [data-tab="tab-output"]');
  await page.selectOption('#o-detail', 'comprehensive');
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');
  await page.click('#paste-details summary');
  await page.fill('#paste-area', 'סקר שוק התוכנה בישראל לשנת 2026, חמש חברות מובילות.');
  await page.click('#btn-paste-use');
  await page.click('#btn-generate');
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled, null, { timeout: 30000 });

  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.waitForFunction(() => window.Chart && window.Chart.getChart('c_bubblemap'), null, { timeout: 20000 });
  await page.waitForTimeout(1300);

  const data = await frame.evaluate((goodIds) => {
    const drew = (c) => {
      try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) n++; return n > 15; } catch (e) { return false; }
    };
    const charts = {};
    goodIds.forEach((id) => { const c = document.getElementById(id); charts[id] = c ? { inst: !!window.Chart.getChart(c), drew: drew(c) } : null; });
    const brokenC = document.getElementById('c_broken');
    return {
      charts,
      content: {
        hero: !!document.querySelector('.hero') && document.querySelector('.hero h1').textContent.trim().length > 0,
        kpis: document.querySelectorAll('.kpi').length,
        sections: document.querySelectorAll('.card').length,
        entities: document.querySelectorAll('.entity-card').length,
        flowSteps: document.querySelectorAll('.flow-step').length,
        flowArrowChevron: (function () { const a = document.querySelector('.flow-arrow'); if (!a) return false; const af = getComputedStyle(a, '::after'); return Math.round(parseFloat(af.width) || 0) >= 10; })(),
        footer: !!document.querySelector('.footer') && /glm/i.test(document.querySelector('.footer').textContent),
      },
      brokenIsolated: !!(window.__chartErr && window.__chartErr.c_broken),
      brokenBlank: brokenC ? !drew(brokenC) : true,
    };
  }, GOOD);

  console.log('\nCONTENT blocks:');
  ok('hero header with title', data.content.hero);
  ok('KPI tiles (4)', data.content.kpis === 4, 'got ' + data.content.kpis);
  ok('content sections (cards)', data.content.sections >= 7, 'got ' + data.content.sections);
  ok('entity cards (6)', data.content.entities === 6, 'got ' + data.content.entities);
  ok('flow diagram (4 steps)', data.content.flowSteps === 4, 'got ' + data.content.flowSteps);
  ok('flow connectors render single CSS chevron', data.content.flowArrowChevron);
  ok('footer with source/date/model', data.content.footer);

  console.log('\nCHARTS (instance + drawn pixels):');
  GOOD.forEach((id) => {
    const r = data.charts[id];
    ok(id.replace('c_', '').padEnd(11), r && r.inst && r.drew, r ? `inst=${r.inst} drew=${r.drew}` : 'missing');
  });

  console.log('\nFAULT ISOLATION (the GLM "not all graphs work" case):');
  ok('broken chart error caught (isolated)', data.brokenIsolated);
  ok('broken chart left blank, did NOT crash the page', data.brokenBlank && pageErrors.length === 0, 'pageErrors=' + pageErrors.length);
  ok('all 10 valid charts still rendered despite the broken one', GOOD.every((id) => data.charts[id] && data.charts[id].inst && data.charts[id].drew));

  console.log('\nEXPORTS:');
  // Static (script-free) export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-static')]);
  const staticHtml = fs.readFileSync(await dl.path(), 'utf8');
  ok('static HTML: no <script>/<canvas>, charts → images', !/<script[\s>]/i.test(staticHtml) && !/<canvas[\s>]/i.test(staticHtml) && /<img[^>]+src="data:image\/png/i.test(staticHtml));
  ok('static HTML: embedded font + no external refs', /data:font\/woff2/.test(staticHtml) && !/(?:src|href)=["'](?:https?:)?\/\//.test(staticHtml));
  // PDF export spawns a sandboxed print frame
  await page.click('#btn-pdf');
  const pdfFrame = await page.evaluate(() => { const f = [...document.querySelectorAll('iframe')].find((x) => x.id !== 'result-frame' && /allow-modals/.test(x.getAttribute('sandbox') || '')); return !!f; });
  ok('PDF export spawns sandboxed print frame', pdfFrame);
  ok('download HTML enabled', !(await page.getAttribute('#btn-download', 'disabled')) || (await page.isEnabled('#btn-download')));

  // Full visual
  const srcdoc = await page.getAttribute('#result-frame', 'srcdoc');
  const vp = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  await vp.setContent(srcdoc, { waitUntil: 'load' });
  await vp.waitForTimeout(1600);
  await vp.screenshot({ path: '/tmp/glm-report.png', fullPage: true });

  await browser.close();
  server.close();
  console.log('\nVisual: /tmp/glm-report.png');
  console.log(failed ? `\n✗ ${failed} check(s) FAILED` : '\n✓ ALL content, charts, fault-isolation and exports working');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
