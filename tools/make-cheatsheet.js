#!/usr/bin/env node
/* Generate a downloadable "Chart Types Cheat Sheet" PDF (+ PNG preview) with a
   live example of each of the 16 supported chart types, rendered with the
   exact chart bundle that ships in generator.html.

   Run: node tools/build.js && node tools/make-cheatsheet.js
   Output: chart-cheatsheet.pdf (repo root), /tmp/chart-cheatsheet.png */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

// Pull the identical chart bundle out of the built generator.
const gen = fs.readFileSync(path.join(ROOT, 'generator.html'), 'utf8');
const m = gen.match(/<script id="idg-chart-bundle">([\s\S]*?)<\/script>/);
if (!m) { console.error('Build generator.html first (chart bundle not found).'); process.exit(1); }
const chartBundle = m[1];

// id, number, display name, how the model refers to it, what it's best for.
const CHARTS = [
  ['doughnut', 'Doughnut', "type: 'doughnut'", 'Parts of a whole (with a center hole)'],
  ['pie', 'Pie', "type: 'pie'", 'Parts of a whole (full circle)'],
  ['polar', 'Polar area', "type: 'polarArea'", 'Parts of a whole where slices also vary in length'],
  ['bar', 'Bar (column)', "type: 'bar'", 'Comparing categories'],
  ['hbar', 'Horizontal bar', "type: 'bar', indexAxis: 'y'", 'Comparing categories with long labels'],
  ['stacked', 'Stacked bar', "type: 'bar' + stacked scales", 'Composition within each category'],
  ['grouped', 'Grouped bar', "type: 'bar', multiple datasets", 'Several series side-by-side'],
  ['line', 'Line', "type: 'line'", 'Trend over time'],
  ['area', 'Area', "type: 'line', fill: true", 'Trend over time, emphasizing volume'],
  ['radar', 'Radar', "type: 'radar'", 'Profile across several dimensions'],
  ['scatter', 'Scatter', "type: 'scatter'", 'Correlation between two values'],
  ['bubble', 'Bubble', "type: 'bubble'", 'Correlation + a third value as size'],
  ['mixed', 'Mixed (bar + line)', "datasets with per-type", 'Combining two different series'],
  ['heatmap', 'Heatmap (matrix)', 'IDG_CHARTS.heatmap(…)', 'Intensity grid / capability matrix (X vs Y)'],
  ['choropleth', 'Choropleth map', 'IDG_CHARTS.choropleth(…)', 'Values shaded by country *'],
  ['bubblemap', 'Bubble map', 'IDG_CHARTS.bubbleMap(…)', 'Values as sized circles on countries *'],
];

const cards = CHARTS.map((c, i) => {
  const big = ['heatmap', 'choropleth', 'bubblemap'].includes(c[0]);
  return `<div class="card${big ? ' big' : ''}">
    <div class="ex"><canvas id="c_${c[0]}"></canvas></div>
    <div class="n">${i + 1}. ${c[1]}</div>
    <div class="code">${c[2]}</div>
    <div class="bf">${c[3]}</div>
  </div>`;
}).join('\n');

const PAGE = `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="UTF-8">
<style>
:root{--c-primary:#4F46E5;--c-secondary:#7C3AED;--c-accent:#F43F5E;--c-bg:#EEF2FF;--c-grad-a:#4338CA;--c-grad-b:#DB2777;}
*{box-sizing:border-box;}
body{font-family:system-ui,-apple-system,'Segoe UI','Arial',sans-serif;color:#1f2937;margin:0;}
.head{background:linear-gradient(135deg,var(--c-grad-a),var(--c-grad-b));color:#fff;padding:22px 26px;}
.head h1{margin:0 0 4px;font-size:24px;font-weight:800;}
.head p{margin:0;opacity:.9;font-size:13px;}
.wrap{padding:18px 22px;}
.section{font-size:14px;font-weight:800;color:var(--c-secondary);border-bottom:3px solid var(--c-primary);
  display:inline-block;margin:6px 0 12px;padding-bottom:3px;}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.card{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;break-inside:avoid;page-break-inside:avoid;background:#fff;}
.card.big{grid-column:span 1;}
.ex{position:relative;height:150px;margin-bottom:8px;}
.card.big .ex{height:175px;}
.n{font-weight:700;font-size:13.5px;}
.code{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--c-primary);background:var(--c-bg);
  border-radius:5px;padding:2px 6px;display:inline-block;margin:3px 0;}
.bf{font-size:12px;color:#6b7280;}
.tips{margin-top:16px;font-size:12px;color:#374151;background:#F9FAFB;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;}
.tips b{color:var(--c-secondary);}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
@page{margin:12mm;}
</style></head>
<body>
<div class="head">
  <h1>Chart Types Cheat Sheet</h1>
  <p>Interactive Infographic Generator · name any of these in the <b>Regenerate</b> box, e.g. "change the doughnut to a radar chart" or "add a heatmap of companies vs capabilities".</p>
</div>
<div class="wrap">
  <div class="section">Native Chart.js types (1–13)</div>
  <div class="grid">${cards.split('<div class="card').slice(1, 14).map((s) => '<div class="card' + s).join('')}</div>
  <div class="section" style="margin-top:18px">Offline plugin charts (14–16) · maps need per-country data *</div>
  <div class="grid">${cards.split('<div class="card').slice(14).map((s) => '<div class="card' + s).join('')}</div>
  <div class="tips">
    <b>Tips:</b> Charts are chosen by the model from your document; steer them with free-text feedback in any language.
    The <b>maps</b> (*) only render when your document has real per-country numbers — geographic data is never invented.
    Raise <b>Settings → Output → Max chart count</b> if you ask for more charts than the current cap.
  </div>
</div>
<script>${chartBundle}</script>
<script>
(function(){
  function mk(id,fn){try{fn();}catch(e){var el=document.getElementById(id);if(el&&el.parentNode)el.parentNode.innerHTML='<div style=\"color:#9ca3af;font-size:12px;text-align:center;padding-top:60px\">('+id+')</div>';}}
  if(window.Chart)Chart.defaults.animation=false;
  var S=['#4F46E5','#F43F5E','#F59E0B','#10B981','#0EA5E9','#A855F7'];
  var R={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}};
  var L3=['A','B','C'],L4=['A','B','C','D'];
  mk('c_doughnut',function(){new Chart(c_doughnut,{type:'doughnut',data:{labels:L3,datasets:[{data:[5,3,2],backgroundColor:S}]},options:R});});
  mk('c_pie',function(){new Chart(c_pie,{type:'pie',data:{labels:L3,datasets:[{data:[4,4,2],backgroundColor:S}]},options:R});});
  mk('c_polar',function(){new Chart(c_polar,{type:'polarArea',data:{labels:L4,datasets:[{data:[11,7,9,4],backgroundColor:S}]},options:R});});
  mk('c_bar',function(){new Chart(c_bar,{type:'bar',data:{labels:L4,datasets:[{data:[5,9,4,7],backgroundColor:S}]},options:R});});
  mk('c_hbar',function(){new Chart(c_hbar,{type:'bar',data:{labels:L3,datasets:[{data:[5,9,4],backgroundColor:S}]},options:Object.assign({indexAxis:'y'},R)});});
  mk('c_stacked',function(){new Chart(c_stacked,{type:'bar',data:{labels:L3,datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true}}},R)});});
  mk('c_grouped',function(){new Chart(c_grouped,{type:'bar',data:{labels:L3,datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:R});});
  mk('c_line',function(){new Chart(c_line,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,7],borderColor:S[0]}]},options:R});});
  mk('c_area',function(){new Chart(c_area,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,7],borderColor:S[3],backgroundColor:'rgba(16,185,129,.3)',fill:true}]},options:R});});
  mk('c_radar',function(){new Chart(c_radar,{type:'radar',data:{labels:['א','ב','ג','ד','ה'],datasets:[{data:[8,6,9,5,7],borderColor:S[5],backgroundColor:'rgba(168,85,247,.3)'}]},options:R});});
  mk('c_scatter',function(){new Chart(c_scatter,{type:'scatter',data:{datasets:[{data:[{x:1,y:2},{x:3,y:5},{x:4,y:3},{x:6,y:7}],backgroundColor:S[4]}]},options:R});});
  mk('c_bubble',function(){new Chart(c_bubble,{type:'bubble',data:{datasets:[{data:[{x:1,y:2,r:8},{x:3,y:5,r:15},{x:5,y:3,r:7}],backgroundColor:S[1]}]},options:R});});
  mk('c_mixed',function(){new Chart(c_mixed,{data:{labels:['1','2','3','4'],datasets:[{type:'bar',data:[3,5,4,7],backgroundColor:S[0]},{type:'line',data:[2,4,3,6],borderColor:S[1]}]},options:R});});
  mk('c_heatmap',function(){IDG_CHARTS.heatmap('c_heatmap',['R1','R2','R3'],['A','B','C','D'],[[1,5,9,3],[7,3,2,8],[4,6,1,5]],{label:''});});
  mk('c_choropleth',function(){IDG_CHARTS.choropleth('c_choropleth',{'Israel':40,'United States':25,'Germany':15,'India':10,'Brazil':6},{label:''});});
  mk('c_bubblemap',function(){IDG_CHARTS.bubbleMap('c_bubblemap',{'Israel':40,'United States':25,'Germany':15,'France':10},{label:''});});
})();
</script>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
  await page.setContent(PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Chart && window.Chart.getChart && window.Chart.getChart('c_bubblemap'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const outPdf = path.join(ROOT, 'chart-cheatsheet.pdf');
  await page.pdf({ path: outPdf, printBackground: true, format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await page.screenshot({ path: '/tmp/chart-cheatsheet.png', fullPage: true });
  await browser.close();
  console.log('Wrote ' + outPdf + ' (' + Math.round(fs.statSync(outPdf).size / 1024) + ' KB) and /tmp/chart-cheatsheet.png');
})().catch((e) => { console.error(e); process.exit(1); });
