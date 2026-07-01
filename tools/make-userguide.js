#!/usr/bin/env node
/* Build a Hebrew (RTL) user-guide PDF for the Interactive Infographic
   Generator: real UI screenshots + live examples of every chart type +
   full instructions. Uses the exact chart bundle + embedded Heebo font that
   ship in generator.html.

   Run: node tools/build.js && node tools/make-userguide.js
   Output: user-guide-he.pdf (repo root) */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const gen = fs.readFileSync(path.join(ROOT, 'generator.html'), 'utf8');
const chartBundle = (gen.match(/<script id="idg-chart-bundle">([\s\S]*?)<\/script>/) || [])[1];
if (!chartBundle) { console.error('Build generator.html first.'); process.exit(1); }

const fontCss = [300, 400, 600, 800].map((w) => {
  const b64 = fs.readFileSync(path.join(ROOT, `vendor/fonts/heebo-${w}.woff2`)).toString('base64');
  return `@font-face{font-family:'Heebo';font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

const PORT = 8811;
const SAMPLE = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">{{BASE_CSS}}{{CHART_LIB}}</head><body>
<header class="hero"><span class="icon">📊</span><h1>סקר שוק תוכנה 2026</h1><p class="subtitle">חמש חברות מובילות · שוק של 12 מיליארד ש״ח</p></header>
<div class="container">
<section class="card"><h2 class="section-title">מדדים מרכזיים</h2><div class="grid-4">
<div class="kpi"><div class="value">12 מיליארד ₪</div><div class="label">גודל שוק</div></div>
<div class="kpi"><div class="value">8%</div><div class="label">צמיחה</div></div>
<div class="kpi"><div class="value">5</div><div class="label">חברות</div></div>
<div class="kpi"><div class="value">273K</div><div class="label">מועסקים</div></div></div></section>
<section class="card"><h2 class="section-title">התפלגות ומגמות</h2><div class="grid-2">
<div class="chart-box"><canvas id="d1"></canvas></div><div class="chart-box"><canvas id="d2"></canvas></div></div></section>
</div>
<script>document.addEventListener("DOMContentLoaded",function(){if(window.Chart)Chart.defaults.animation=false;var S=['#4F46E5','#F43F5E','#F59E0B','#10B981','#0EA5E9','#A855F7'];
try{new Chart(document.getElementById('d1'),{type:'doughnut',data:{labels:['אלפא','בטא','גמא'],datasets:[{data:[45,34,21],backgroundColor:S}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right'}}}});}catch(e){}
try{new Chart(document.getElementById('d2'),{type:'bar',data:{labels:['2024','2025','2026'],datasets:[{data:[8,10,12],backgroundColor:S[0]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});}catch(e){}
});<\/script></body></html>`;

// 17 chart types with Hebrew name + when-to-use + a live example.
const CHARTS = [
  ['doughnut', 'דונאט', 'חלקים מתוך שלם (עם חור מרכזי)'],
  ['pie', 'עוגה', 'חלקים מתוך שלם'],
  ['polar', 'פולאר', 'חלקים שמשתנים גם באורך'],
  ['bar', 'עמודות', 'השוואה בין קטגוריות'],
  ['hbar', 'עמודות אופקיות', 'השוואה עם תוויות ארוכות'],
  ['stacked', 'עמודות מוערמות', 'הרכב בתוך כל קטגוריה'],
  ['grouped', 'עמודות מקובצות', 'כמה סדרות זו לצד זו'],
  ['line', 'קו', 'מגמה לאורך זמן'],
  ['area', 'שטח', 'מגמה עם הדגשת נפח'],
  ['radar', 'רדאר', 'פרופיל על פני כמה מדדים'],
  ['scatter', 'פיזור', 'קורלציה בין שני ערכים'],
  ['bubble', 'בועות', 'קורלציה + ערך שלישי (גודל)'],
  ['mixed', 'משולב', 'עמודות + קו יחד'],
  ['heatmap', 'מפת חום', 'עוצמה בטבלה (X מול Y)'],
  ['choropleth', 'מפת מדינות', 'ערכים לפי מדינה'],
  ['bubblemap', 'מפת בועות', 'ערכים כעיגולים על מדינות'],
  ['waterfall', 'מפל', 'פירוק סכום לרכיבים מצטברים'],
];

const chartCards = CHARTS.map((c, i) => {
  const big = ['heatmap', 'choropleth', 'bubblemap'].includes(c[0]);
  return `<div class="ch-card${big ? ' big' : ''}"><div class="ch-ex"><canvas id="g_${c[0]}"></canvas></div>` +
    `<div class="ch-name">${i + 1}. ${c[1]}</div><div class="ch-when">${c[2]}</div></div>`;
}).join('\n');

/* ---------- capture UI screenshots from the real generator ---------- */
async function shots() {
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end(JSON.stringify({ choices: [{ message: { content: SAMPLE } }], usage: { prompt_tokens: 1450, completion_tokens: 980 } }));
    });
  });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const out = {};
  const b64 = async (target) => 'data:image/png;base64,' + (await target.screenshot()).toString('base64');
  await page.goto('file://' + path.join(ROOT, 'generator.html'));
  await page.waitForFunction(() => document.querySelector('[data-i18n="app_title"]').textContent.length > 0);
  await page.click('#btn-settings');
  await page.fill('#p-baseurl', `http://127.0.0.1:${PORT}/v1`);
  await page.fill('#p-model', 'my-model');
  await page.uncheck('#p-stream');
  out.connection = await b64(page.locator('#settings-modal .modal'));
  await page.click('#settings-tabs [data-tab="tab-output"]');
  await page.waitForTimeout(200);
  out.output = await b64(page.locator('#settings-modal .modal'));
  await page.click('#btn-settings-save');
  await page.click('#settings-modal .modal-foot .modal-close');
  await page.click('#paste-details summary');
  await page.fill('#paste-area', 'סקר שוק תוכנה בישראל 2026 עם חמש חברות מובילות.');
  await page.click('#btn-paste-use');
  await page.waitForTimeout(200);
  out.main = 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
  await page.click('#btn-generate');
  await page.waitForFunction(() => !document.querySelector('#btn-download').disabled, null, { timeout: 30000 });
  await page.waitForTimeout(1400);
  out.result = await b64(page.locator('#result-frame'));
  await page.click('#btn-metrics');
  await page.click('#metrics-tabs [data-tab="tab-dash"]');
  await page.waitForTimeout(600);
  out.perf = await b64(page.locator('#metrics-modal .modal'));
  await browser.close();
  server.close();
  return out;
}

function section(title, body) { return `<section class="guide-sec"><h2>${title}</h2>${body}</section>`; }
function fig(src, cap) { return `<figure><img src="${src}"><figcaption>${cap}</figcaption></figure>`; }

(async () => {
  const s = await shots();

  const HTML = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>
${fontCss}
:root{--p:#4F46E5;--p2:#7C3AED;--acc:#F43F5E;--ink:#1f2937;--mut:#6b7280;--line:#e5e7eb;--bg:#eef2ff;}
*{box-sizing:border-box;}
img{max-width:100%;}
code{word-break:break-word;white-space:normal;}
table.g{table-layout:fixed;}
table.g td,table.g th{word-break:break-word;}
body{font-family:'Heebo',system-ui,Arial,sans-serif;color:var(--ink);margin:0;line-height:1.7;font-size:13px;}
.cover{background:linear-gradient(135deg,#4338CA,#DB2777);color:#fff;padding:80px 48px;min-height:280px;}
.cover .badge{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:99px;padding:4px 14px;font-size:12px;margin-bottom:16px;}
.cover h1{font-size:38px;font-weight:800;margin:0 0 10px;}
.cover p{font-size:17px;opacity:.92;max-width:560px;margin:0;}
.wrap{padding:26px 40px;}
.toc{background:var(--bg);border-radius:14px;padding:18px 24px;margin-bottom:8px;}
.toc h3{margin:0 0 8px;color:var(--p2);}
.toc ol{margin:0;padding-inline-start:22px;columns:2;font-size:12.5px;}
.toc li{margin:2px 0;}
.guide-sec{margin:22px 0;}
.guide-sec h2{font-size:20px;font-weight:800;color:var(--p2);border-bottom:3px solid var(--p);display:inline-block;padding-bottom:4px;margin:0 0 12px;}
.guide-sec h3{font-size:15px;margin:16px 0 4px;color:var(--ink);}
.guide-sec p{margin:6px 0;}
ul,ol{margin:6px 0;padding-inline-start:22px;}
li{margin:3px 0;}
b,strong{color:#111827;}
code{background:var(--bg);border-radius:5px;padding:1px 6px;font-size:12px;direction:ltr;display:inline-block;}
figure{margin:12px 0;break-inside:avoid;}
figure img{width:100%;border:1px solid var(--line);border-radius:10px;display:block;}
figcaption{font-size:11.5px;color:var(--mut);text-align:center;margin-top:5px;}
.note{background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;padding:10px 14px;margin:10px 0;font-size:12.5px;}
.note b{color:#9a3412;}
.tip{background:#ECFDF5;border:1px solid #6EE7B7;border-radius:10px;padding:10px 14px;margin:10px 0;font-size:12.5px;}
.ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px;}
.ch-card{border:1px solid var(--line);border-radius:10px;padding:8px;break-inside:avoid;}
.ch-ex{position:relative;height:110px;margin-bottom:6px;}
.ch-ex canvas{max-width:100%!important;}
.ch-card.big .ch-ex{height:130px;}
.ch-name{font-weight:700;font-size:12px;}
.ch-when{font-size:11px;color:var(--mut);}
table.g{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0;}
table.g th{background:var(--p2);color:#fff;padding:7px 10px;text-align:start;}
table.g td{padding:7px 10px;border-bottom:1px solid var(--line);}
table.g tr:nth-child(even) td{background:var(--bg);}
.foot{color:var(--mut);font-size:11px;text-align:center;padding:16px;border-top:1px solid var(--line);margin-top:20px;}
/* Keep a section heading with the start of its text — if there's no room, the
   heading moves to the top of the next page instead of being orphaned. */
.guide-sec h2{break-after:avoid;break-inside:avoid;}
.guide-sec h2 + *{break-before:avoid;}
.guide-sec h3{break-after:avoid;}
@page{margin:0;}
</style></head><body>

<div class="cover">
  <div class="badge">מדריך למשתמש · גרסה 2026</div>
  <h1>מחולל אינפוגרפיקות אינטראקטיביות</h1>
  <p>מדריך מלא: הפעלה, חיבור למודל, יצירת דוחות, כל סוגי התרשימים, פריסות, ייצוא, אבטחה ופתרון תקלות — הכול לא־מקוון.</p>
</div>

<div class="wrap">

<div class="toc"><h3>תוכן העניינים</h3><ol>
<li>מבוא — מה המערכת עושה</li>
<li>הפעלה ודרישות</li>
<li>חיבור למודל (Settings ← Connection)</li>
<li>העלאת מסמך</li>
<li>הגדרות פלט (Output)</li>
<li>יצירת האינפוגרפיקה</li>
<li>תצוגה מקדימה ויצירה מחדש</li>
<li>אפשרויות ייצוא</li>
<li>כל סוגי התרשימים (17)</li>
<li>פריסות ורכיבים אינטראקטיביים</li>
<li>הכוונת המודל (Regenerate)</li>
<li>ביצועים ומדדים</li>
<li>אבטחה ופרטיות</li>
<li>פתרון תקלות</li>
</ol></div>

${section('1. מבוא — מה המערכת עושה', `
<p>המערכת היא <b>קובץ HTML יחיד</b> (<code>generator.html</code>) שממיר מסמכים (DOCX, TXT, MD, או טקסט מודבק) ל<b>אינפוגרפיקה אינטראקטיבית</b>: כותרת גרפית, כרטיסי מדדים, תרשימים, כרטיסי ישויות, תרשים זרימה ועוד.</p>
<ul>
<li><b>לא־מקוון לחלוטין:</b> כל הספריות, הגופנים והנתונים מוטמעים בקובץ. אין קריאות רשת חיצוניות — מלבד לנקודת הקצה של המודל שתגדירו.</li>
<li><b>קובץ יחיד:</b> ניתן לפתוח מ-<code>file://</code> או משרת סטטי, ולהעביר את הדוח שנוצר כקובץ אחד עצמאי.</li>
<li><b>תמיכה מלאה בעברית (RTL)</b> וזיהוי שפה אוטומטי.</li>
</ul>`)}

${section('2. הפעלה ודרישות', `
<p>פתחו את <code>generator.html</code> בדפדפן מודרני (Chrome / Edge / Firefox). אין צורך בהתקנה. נדרשת גישה לנקודת קצה של מודל שפה תואם-OpenAI ברשת הפנימית (למשל vLLM, Ollama, LiteLLM, או OpenShift AI).</p>
${fig(s.main, 'המסך הראשי: אזור העלאה, תצוגת חילוץ, בורר ערכת צבעים וכפתור \"צור אינפוגרפיקה\".')}`)}

${section('3. חיבור למודל (Settings ← Connection)', `
<p>לחצו על <b>⚙️ הגדרות ← חיבור</b>. השתמשו ב<b>הגדרה מהירה</b> כדי למלא פרופיל לפי סוג השרת (LiteLLM, OpenShift AI, vLLM, Ollama), ואז השלימו:</p>
<ul>
<li><b>כתובת בסיס (Base URL):</b> למשל <code>http://localhost:11434/v1</code>. אפשר לנהל כמה פרופילים ולעבור ביניהם.</li>
<li><b>שם מודל:</b> לחצו \"שליפת רשימת מודלים\" (<code>GET /v1/models</code>) או הקלידו ידנית.</li>
<li><b>מפתח API (אופציונלי):</b> נשמר <b>לסשן בלבד</b> כברירת מחדל (לא נכתב לדיסק).</li>
<li><b>בדיקת חיבור:</b> שולח בקשת בדיקה קטנה ומציג זמן תגובה ושגיאות מפורטות.</li>
</ul>
${fig(s.connection, 'מסך החיבור: פרופילים, הגדרה מהירה, כתובת, מודל, מפתח, ובדיקת חיבור.')}`)}

${section('4. העלאת מסמך', `
<p>גררו קובץ לאזור ההעלאה, לחצו לבחירה, או הדביקו טקסט גולמי. נתמכים: <b>.docx</b> (מומלץ), <b>.txt</b>, <b>.md</b>. קובצי <code>.doc</code> ישנים נדחים עם הנחיה לשמור מחדש כ-<code>.docx</code>.</p>
<p>לאחר ההעלאה תוצג <b>תצוגת חילוץ</b>: מספר מילים, כותרות, טבלאות והשפה שזוהתה — כדי לוודא שהחילוץ תקין לפני היצירה.</p>`)}

${section('5. הגדרות פלט (Output)', `
<p>ב-<b>הגדרות ← פלט</b> (וגם בבורר במסך הראשי):</p>
<ul>
<li><b>ערכת צבעים:</b> בחירה מתוך כרטיסים המציגים את צבעי התרשימים בפועל. ברירת המחדל היא <b>Colorful</b> (רב-גוני). <b>Slate Premium</b> נותנת מראה כהה (dashboard). ראו את תיוג ה-DARK.</li>
<li><b>רמת פירוט:</b> תמציתי / מאוזן / מקיף — קובע כמה מהמסמך יכוסה.</li>
<li><b>כפיית שפה/כיוון, מספר תרשימים מרבי, וכלול תרשים זרימה.</b></li>
</ul>
${fig(s.output, 'בורר ערכת הצבעים ככרטיסים: גרדיאנט, נקודות צבעי התרשים, שם ותיאור.')}`)}

${section('6. יצירת האינפוגרפיקה', `
<p>לחצו <b>✨ צור אינפוגרפיקה</b>. תוצג התקדמות (מספר טוקנים וזמן). ניתן לבטל בכל רגע (<b>ביטול</b>). למסמכים גדולים מחלון ההקשר, המערכת מבצעת סיכום דו-שלבי אוטומטי.</p>`)}

${section('7. תצוגה מקדימה ויצירה מחדש', `
<p>התוצאה מוצגת ב-<b>iframe מבודד (sandbox)</b> להגנה. אפשר לעבור בין תצוגת <b>מחשב/נייד</b>. לשיפור התוצאה, כתבו משוב חופשי בתיבת <b>צור מחדש</b> — למשל: \"החלף את הדונאט ברדאר\" או \"הוסף מפת חום\".</p>
${fig(s.result, 'דוגמת דוח שנוצר (ערכת Colorful): כותרת, מדדי KPI ותרשימים.')}`)}

${section('8. אפשרויות ייצוא', `
<table class="g"><thead><tr><th>אפשרות</th><th>מה מקבלים</th><th>מתי להשתמש</th></tr></thead><tbody>
<tr><td><b>הורדת HTML</b></td><td>קובץ יחיד אינטראקטיבי (Chart.js + גופן מוטמעים)</td><td>שיתוף מלא עם אינטראקטיביות</td></tr>
<tr><td><b>PDF</b></td><td>נפתח חלון הדפסה ← \"שמירה כ-PDF\"</td><td>מסמך נייד להדפסה/הצגה, ללא סקריפטים</td></tr>
<tr><td><b>HTML סטטי</b></td><td>ללא סקריפטים — התרשימים הופכים לתמונות</td><td>סביבות שחוסמות JavaScript (CSP קשיח)</td></tr>
<tr><td><b>העתקה</b></td><td>העתקת ה-HTML ללוח</td><td>הדבקה מהירה</td></tr>
</tbody></table>
<div class="tip"><b>טיפ:</b> בייצוא PDF ו-HTML סטטי, דוח עם לשוניות נפרש אוטומטית לגלילה אחת כך ששום תוכן לא מוסתר.</div>`)}

${section('9. כל סוגי התרשימים (17)', `
<p>המודל בוחר את סוג התרשים לפי צורת הנתונים. אפשר לבקש סוג מסוים בתיבת \"צור מחדש\" (למשל \"הפוך את העמודות לאופקיות\"). המפות דורשות נתונים אמיתיים לפי מדינה.</p>
<div class="ch-grid">${chartCards}</div>`)}

${section('10. פריסות ורכיבים אינטראקטיביים', `
<p><b>פריסה — נקבעת על ידי המודל לפי הנתונים:</b></p>
<ul>
<li><b>גלילה יחידה</b> (ברירת מחדל) — עמוד אחד של מקטעים, מתאים לרוב המסמכים.</li>
<li><b>לוח מחוונים עם לשוניות</b> — כשהמסמך מתחלק ל-3+ נושאים מרכזיים, המודל עשוי לארגן אותם בלשוניות (התרשימים מתאימים את עצמם במעבר בין לשוניות).</li>
</ul>
<p><b>הפריסה אינה תלויה בערכת הצבעים.</b> ערכת Slate Premium נותנת מראה כהה — אך ניתן לקבל לוח לשוניות בהיר או דוח כהה בגלילה יחידה.</p>
<p><b>רכיבים נוספים</b> שהמודל עשוי להוסיף כשהנתונים מתאימים: מחשבון אינטראקטיבי (מחוונים + חישוב חי), ציר זמן, רשימה ממוספרת, טבלאות, כרטיסי ישויות, תרשים זרימה וקריאות הדגשה.</p>`)}

${section('11. הכוונת המודל (Regenerate)', `
<p>בתיבת <b>צור מחדש</b> אפשר לכוון בשפה חופשית (בעברית או אנגלית):</p>
<ul>
<li>\"החלף את תרשים העוגה במפל (waterfall)\"</li>
<li>\"ארגן כלוח מחוונים עם לשוניות\" / \"השתמש בעמוד גלילה אחד\"</li>
<li>\"הוסף מחשבון עמלות\" · \"הפוך את העמודות לאופקיות\" · \"קצר את הדוח\"</li>
</ul>`)}

${section('12. ביצועים ומדדים', `
<p>תפריט <b>📈 ביצועים</b> מתעד כל קריאה למודל: טוקנים נכנסים/יוצאים, TTFT, זמן תגובה, תפוקה (טוק׳/שנ׳), סטטוס, גודל פלט ועלות משוערת. ניתן לייצא ל-CSV/JSON. ההיסטוריה נשמרת מקומית (עד 200 ריצות).</p>
${fig(s.perf, 'לוח המחוונים של הביצועים: מצרפים וגרפים.')}`)}

${section('13. אבטחה ופרטיות', `
<ul>
<li><b>מפתחות API</b> נשמרים כברירת מחדל <b>לסשן בלבד</b> (בזיכרון), לא נכתבים לאחסון. שמירה קבועה היא בחירה מפורשת (עם אזהרה).</li>
<li>הפלט של המודל רץ רק בתוך <b>iframe מבודד</b> (ללא גישה לאחסון/מפתחות של המחולל).</li>
<li>המערכת <b>אינה שולחת נתונים לשום מקום</b> מלבד נקודת הקצה שהגדרתם. אין CDN, אין טלמטריה, אין גופנים מרוחקים.</li>
</ul>`)}

${section('14. פתרון תקלות', `
<table class="g"><thead><tr><th>תסמין</th><th>סיבה סבירה</th><th>פתרון</th></tr></thead><tbody>
<tr><td>\"נקודת הקצה אינה זמינה\" / Failed to fetch</td><td>CORS — השרת לא מחזיר כותרות מתאימות</td><td>הריצו את הפרוקסי המצורף, או נתבו דרך LiteLLM, או הוסיפו CORS לשרת</td></tr>
<tr><td>נדרש דגל <code>--disable-web-security</code></td><td>CORS</td><td>אותו פתרון — פרוקסי מקומי במקום הדגל</td></tr>
<tr><td>שגיאת TLS / תעודה</td><td>תעודה פנימית לא מהימנה</td><td>סמכו על ה-CA של האשכול, או <code>--insecure</code> בפרוקסי</td></tr>
<tr><td>HTTP 401/403</td><td>טוקן חסר/שגוי</td><td>הזינו את הטוקן בשדה מפתח ה-API</td></tr>
<tr><td>HTTP 404 (מודל)</td><td>שם מודל שגוי</td><td>\"שליפת רשימת מודלים\"</td></tr>
<tr><td>חלק מהתרשימים ריקים</td><td>המודל כתב קוד תרשים שגוי</td><td>כל תרשים מבודד — היתר עדיין מוצגים; נסו \"צור מחדש\"</td></tr>
<tr><td>קובץ .doc ישן</td><td>פורמט בינארי לא נתמך</td><td>שמרו מחדש כ-.docx</td></tr>
</tbody></table>`)}

<div class="foot">מחולל אינפוגרפיקות אינטראקטיביות · מדריך למשתמש · נוצר לא־מקוון · כל הזכויות שמורות</div>
</div>

<script>${chartBundle}</script>
<script>
(function(){
function mk(id,fn){try{fn();}catch(e){}}
if(window.Chart)Chart.defaults.animation=false;
var S=['#4F46E5','#F43F5E','#F59E0B','#10B981','#0EA5E9','#A855F7'];
var R={responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}};
mk('g_doughnut',function(){new Chart(g_doughnut,{type:'doughnut',data:{labels:['a','b','c'],datasets:[{data:[5,3,2],backgroundColor:S}]},options:R});});
mk('g_pie',function(){new Chart(g_pie,{type:'pie',data:{labels:['a','b','c'],datasets:[{data:[4,4,2],backgroundColor:S}]},options:R});});
mk('g_polar',function(){new Chart(g_polar,{type:'polarArea',data:{labels:['a','b','c','d'],datasets:[{data:[11,7,9,4],backgroundColor:S}]},options:R});});
mk('g_bar',function(){new Chart(g_bar,{type:'bar',data:{labels:['a','b','c','d'],datasets:[{data:[5,9,4,7],backgroundColor:S}]},options:R});});
mk('g_hbar',function(){new Chart(g_hbar,{type:'bar',data:{labels:['a','b','c'],datasets:[{data:[5,9,4],backgroundColor:S}]},options:Object.assign({indexAxis:'y'},R)});});
mk('g_stacked',function(){new Chart(g_stacked,{type:'bar',data:{labels:['a','b','c'],datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:Object.assign({scales:{x:{stacked:true},y:{stacked:true}}},R)});});
mk('g_grouped',function(){new Chart(g_grouped,{type:'bar',data:{labels:['a','b','c'],datasets:[{data:[3,4,2],backgroundColor:S[0]},{data:[2,1,3],backgroundColor:S[1]}]},options:R});});
mk('g_line',function(){new Chart(g_line,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,7],borderColor:S[0]}]},options:R});});
mk('g_area',function(){new Chart(g_area,{type:'line',data:{labels:['1','2','3','4'],datasets:[{data:[3,5,4,8],borderColor:S[3],backgroundColor:'rgba(16,185,129,.3)',fill:true}]},options:R});});
mk('g_radar',function(){new Chart(g_radar,{type:'radar',data:{labels:['a','b','c','d','e'],datasets:[{data:[8,6,9,5,7],borderColor:S[5],backgroundColor:'rgba(168,85,247,.3)'}]},options:R});});
mk('g_scatter',function(){new Chart(g_scatter,{type:'scatter',data:{datasets:[{data:[{x:1,y:2},{x:3,y:5},{x:4,y:3},{x:6,y:7}],backgroundColor:S[4]}]},options:R});});
mk('g_bubble',function(){new Chart(g_bubble,{type:'bubble',data:{datasets:[{data:[{x:1,y:2,r:8},{x:3,y:5,r:15},{x:5,y:3,r:7}],backgroundColor:S[1]}]},options:R});});
mk('g_mixed',function(){new Chart(g_mixed,{data:{labels:['1','2','3','4'],datasets:[{type:'bar',data:[3,5,4,7],backgroundColor:S[0]},{type:'line',data:[2,4,3,6],borderColor:S[1]}]},options:R});});
mk('g_heatmap',function(){IDG_CHARTS.heatmap('g_heatmap',['R1','R2','R3'],['A','B','C','D'],[[1,5,9,3],[7,3,2,8],[4,6,1,5]],{label:''});});
mk('g_choropleth',function(){IDG_CHARTS.choropleth('g_choropleth',{'Israel':40,'United States':25,'Germany':15,'India':10,'Brazil':6},{label:''});});
mk('g_bubblemap',function(){IDG_CHARTS.bubbleMap('g_bubblemap',{'Israel':40,'United States':25,'Germany':15,'France':10},{label:''});});
mk('g_waterfall',function(){IDG_CHARTS.waterfall('g_waterfall',[{label:'A',value:0.33},{label:'B',value:0.40},{label:'C',value:0.27},{label:'Total',value:1.0,total:true}],{label:'',prefix:'$'});});
})();
</scr`+`ipt>
</body></html>`;

  const browser = await chromium.launch();
  // Render at ~A4 content width so Chart.js sizes canvases to the final PDF
  // layout (avoids charts overflowing their cards).
  const page = await browser.newPage({ viewport: { width: 703, height: 1400 } });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.waitForFunction(() => window.Chart && window.Chart.getChart && window.Chart.getChart('g_waterfall'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  if (process.env.GUIDE_PREVIEW) {
    const drawn = await page.evaluate(() => [...document.querySelectorAll('.ch-ex canvas')].filter((c) => c.width > 0).length);
    console.log('chart examples drawn: ' + drawn + '/17');
    await page.screenshot({ path: '/tmp/guide-top.png' });
    await page.evaluate(() => { const el = [...document.querySelectorAll('.guide-sec h2')].find((h) => h.textContent.includes('סוגי התרשימים')); if (el) el.scrollIntoView(); });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/guide-charts.png' });
    await page.evaluate(() => { const el=[...document.querySelectorAll('.guide-sec h2')].find(h=>h.textContent.includes('חיבור למודל')); if(el) el.scrollIntoView(); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/guide-sec3.png' }); // guide-sec3
    try { await page.locator('.ch-grid').screenshot({ path: '/tmp/guide-grid.png' }); } catch(e){}
  }
  const outPdf = path.join(ROOT, 'user-guide-he.pdf');
  await page.pdf({ path: outPdf, printBackground: true, format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await browser.close();
  console.log('Wrote ' + outPdf + ' (' + Math.round(fs.statSync(outPdf).size / 1024) + ' KB)');
})().catch((e) => { console.error(e); process.exit(1); });
