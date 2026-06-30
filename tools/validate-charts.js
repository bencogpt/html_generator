#!/usr/bin/env node
/* Validate that every supported chart type renders correctly through the real
   generator pipeline: a report exercising all types is generated (mock LLM →
   asset injection → sandboxed iframe), then each chart is checked for (a) a
   live Chart.js instance and (b) actually-drawn (non-blank) pixels. Also
   writes full-page screenshots for visual confirmation.

   Run: node tools/build.js && node tools/validate-charts.js */
'use strict';

const http = require('http');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const PORT = 8790;

// One report exercising every chart type. Each init is isolated in try/catch
// (per the generated-output contract) and animation is disabled for stable
// snapshots. Canvas ids encode the type so failures are identifiable.
const REPORT = `<!DOCTYPE html>
<html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>בדיקת תרשימים</title>
{{BASE_CSS}}
{{CHART_LIB}}
</head><body>
<header class="hero"><span class="icon">🧪</span><h1>בדיקת כל סוגי התרשימים</h1></header>
<div class="container">
<section class="card"><h2 class="section-title">Chart.js — native</h2>
<div class="grid-3">
<div><h3 class="subsection-title">doughnut</h3><div class="chart-box small"><canvas id="t_doughnut"></canvas></div></div>
<div><h3 class="subsection-title">pie</h3><div class="chart-box small"><canvas id="t_pie"></canvas></div></div>
<div><h3 class="subsection-title">polarArea</h3><div class="chart-box small"><canvas id="t_polar"></canvas></div></div>
<div><h3 class="subsection-title">bar</h3><div class="chart-box small"><canvas id="t_bar"></canvas></div></div>
<div><h3 class="subsection-title">horizontal bar</h3><div class="chart-box small"><canvas id="t_hbar"></canvas></div></div>
<div><h3 class="subsection-title">stacked bar</h3><div class="chart-box small"><canvas id="t_stacked"></canvas></div></div>
<div><h3 class="subsection-title">grouped bar</h3><div class="chart-box small"><canvas id="t_grouped"></canvas></div></div>
<div><h3 class="subsection-title">line</h3><div class="chart-box small"><canvas id="t_line"></canvas></div></div>
<div><h3 class="subsection-title">area</h3><div class="chart-box small"><canvas id="t_area"></canvas></div></div>
<div><h3 class="subsection-title">radar</h3><div class="chart-box small"><canvas id="t_radar"></canvas></div></div>
<div><h3 class="subsection-title">scatter</h3><div class="chart-box small"><canvas id="t_scatter"></canvas></div></div>
<div><h3 class="subsection-title">bubble</h3><div class="chart-box small"><canvas id="t_bubble"></canvas></div></div>
<div><h3 class="subsection-title">mixed bar+line</h3><div class="chart-box small"><canvas id="t_mixed"></canvas></div></div>
</div></section>
<section class="card"><h2 class="section-title">Plugins (offline helpers)</h2>
<div class="grid-2">
<div><h3 class="subsection-title">heatmap (matrix)</h3><div class="chart-box tall"><canvas id="t_heatmap"></canvas></div></div>
<div><h3 class="subsection-title">choropleth map</h3><div class="chart-box map"><canvas id="t_choropleth"></canvas></div></div>
<div><h3 class="subsection-title">bubble map</h3><div class="chart-box map"><canvas id="t_bubblemap"></canvas></div></div>
<div><h3 class="subsection-title">waterfall</h3><div class="chart-box small"><canvas id="t_waterfall"></canvas></div></div>
</div></section>
</div>
<script>
window.__chartErr={};
function mk(id,fn){try{fn();}catch(e){window.__chartErr[id]=String(e&&e.message||e);}}
document.addEventListener('DOMContentLoaded',function(){
if(window.Chart)Chart.defaults.animation=false;
var S=['#4F46E5','#F43F5E','#F59E0B','#10B981','#0EA5E9','#A855F7'];
var R={responsive:true,maintainAspectRatio:false};
mk('t_doughnut',function(){new Chart(t_doughnut,{type:'doughnut',data:{labels:['א','ב','ג'],datasets:[{data:[5,3,2],backgroundColor:S}]},options:R});});
mk('t_pie',function(){new Chart(t_pie,{type:'pie',data:{labels:['א','ב','ג'],datasets:[{data:[4,4,2],backgroundColor:S}]},options:R});});
mk('t_polar',function(){new Chart(t_polar,{type:'polarArea',data:{labels:['א','ב','ג','ד'],datasets:[{data:[11,7,9,4],backgroundColor:S}]},options:R});});
mk('t_bar',function(){new Chart(t_bar,{type:'bar',data:{labels:['א','ב','ג','ד'],datasets:[{data:[5,9,4,7],backgroundColor:S}]},options:R});});
mk('t_hbar',function(){new Chart(t_hbar,{type:'bar',data:{labels:['א','ב','ג'],datasets:[{data:[5,9,4],backgroundColor:S}]},options:Object.assign({indexAxis:'y'},R)});});
mk('t_stacked',function(){new Chart(t_stacked,{type:'bar',data:{labels:['א','ב','ג'],datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true}}},R)});});
mk('t_grouped',function(){new Chart(t_grouped,{type:'bar',data:{labels:['א','ב','ג'],datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:R});});
mk('t_line',function(){new Chart(t_line,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,7],borderColor:S[0]}]},options:R});});
mk('t_area',function(){new Chart(t_area,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,7],borderColor:S[3],backgroundColor:'rgba(16,185,129,0.3)',fill:true}]},options:R});});
mk('t_radar',function(){new Chart(t_radar,{type:'radar',data:{labels:['א','ב','ג','ד','ה'],datasets:[{data:[8,6,9,5,7],borderColor:S[5],backgroundColor:'rgba(168,85,247,0.3)'}]},options:R});});
mk('t_scatter',function(){new Chart(t_scatter,{type:'scatter',data:{datasets:[{data:[{x:1,y:2},{x:3,y:5},{x:4,y:3},{x:6,y:7}],backgroundColor:S[4]}]},options:R});});
mk('t_bubble',function(){new Chart(t_bubble,{type:'bubble',data:{datasets:[{data:[{x:1,y:2,r:8},{x:3,y:5,r:14},{x:5,y:3,r:6}],backgroundColor:S[1]}]},options:R});});
mk('t_mixed',function(){new Chart(t_mixed,{data:{labels:['1','2','3','4'],datasets:[{type:'bar',data:[3,5,4,7],backgroundColor:S[0]},{type:'line',data:[2,4,3,6],borderColor:S[1]}]},options:R});});
mk('t_heatmap',function(){IDG_CHARTS.heatmap('t_heatmap',['ש1','ש2','ש3'],['A','B','C','D'],[[1,5,9,3],[7,3,2,8],[4,6,1,5]],{label:'x'});});
mk('t_choropleth',function(){IDG_CHARTS.choropleth('t_choropleth',{'Israel':40,'United States':25,'Germany':15,'India':10,'Brazil':6},{label:'x'});});
mk('t_bubblemap',function(){IDG_CHARTS.bubbleMap('t_bubblemap',{'Israel':40,'United States':25,'Germany':15,'France':10},{label:'x'});});
mk('t_waterfall',function(){IDG_CHARTS.waterfall('t_waterfall',[{label:'A',value:0.33},{label:'B',value:0.40},{label:'C',value:0.27},{label:'Total',value:1.0,total:true}],{label:'',prefix:'$'});});
});
</scr`+`ipt></body></html>`;

const TYPES = ['t_doughnut', 't_pie', 't_polar', 't_bar', 't_hbar', 't_stacked', 't_grouped',
  't_line', 't_area', 't_radar', 't_scatter', 't_bubble', 't_mixed',
  't_heatmap', 't_choropleth', 't_bubblemap', 't_waterfall'];

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({ choices: [{ message: { content: REPORT } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
  });
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto('file://' + path.resolve(__dirname, '..', 'generator.html'));
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);

  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.fill('#p-model', 'm');
  await page.uncheck('#p-stream');
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');
  await page.click('#paste-details summary');
  await page.fill('#paste-area', 'x');
  await page.click('#btn-paste-use');
  await page.click('#btn-generate');
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled, null, { timeout: 30000 });

  const frame = page.frames().find((f) => f !== page.mainFrame());
  await frame.waitForFunction(() => window.IDG_CHARTS && window.Chart && window.Chart.getChart('t_bubblemap'), null, { timeout: 20000 });
  await page.waitForTimeout(1200);

  // For each canvas: live Chart instance + actually-drawn (non-blank) pixels.
  const report = await frame.evaluate(() => {
    const result = {};
    document.querySelectorAll('canvas').forEach((c) => {
      let instance = false, drew = false, pixels = 0;
      try { instance = !!window.Chart.getChart(c); } catch (e) { /* */ }
      try {
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let i = 3; i < d.length; i += 4 * 37) if (d[i] > 0) pixels++;
        drew = pixels > 15;
      } catch (e) { /* */ }
      result[c.id] = { instance, drew, pixels, w: c.width, h: c.height };
    });
    return { charts: result, errors: window.__chartErr || {} };
  });

  console.log('Chart render validation (instance + non-blank pixels):\n');
  let failed = 0;
  for (const id of TYPES) {
    const r = report.charts[id];
    const ok = r && r.instance && r.drew;
    if (!ok) failed++;
    const label = id.replace('t_', '').padEnd(12);
    const detail = r ? `instance=${r.instance} drew=${r.drew} (px~${r.pixels}, ${r.w}x${r.h})` : 'MISSING';
    const err = report.errors[id] ? '  ERROR: ' + report.errors[id] : '';
    console.log(`  ${ok ? '✓' : '✗'} ${label} ${detail}${err}`);
  }

  // Full-page visual proof: render the injected report standalone and shoot it.
  const srcdoc = await page.getAttribute('#result-frame', 'srcdoc');
  const vp = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await vp.setContent(srcdoc, { waitUntil: 'load' });
  await vp.waitForTimeout(1500);
  await vp.evaluate(() => { if (window.Chart) Object.values(Chart.instances || {}).forEach((c) => c.resize()); });
  await vp.screenshot({ path: '/tmp/charts-all.png', fullPage: true });

  await browser.close();
  server.close();
  console.log(`\n${TYPES.length - failed}/${TYPES.length} chart types render correctly`);
  console.log('Visual: /tmp/charts-all.png');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
