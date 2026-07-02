#!/usr/bin/env node
/* Build a Hebrew (RTL) PDF that explains the generation pipeline step by
   step — what happens from pressing "Generate" until the final report —
   including the two-pass (summarize) path, the repair pass, where the time
   goes, and how to make runs faster. Uses the embedded Heebo font so it
   matches the user guide's look.

   Run: node tools/make-pipeline-doc.js
   Output: pipeline-guide-he.pdf (repo root) */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');

const fontCss = [300, 400, 600, 800].map((w) => {
  const b64 = fs.readFileSync(path.join(ROOT, `vendor/fonts/heebo-${w}.woff2`)).toString('base64');
  return `@font-face{font-family:'Heebo';font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

/* A pipeline step card. n=step number, t=title, d=description, meta=timing note */
function step(n, t, d, meta, cls) {
  return `<div class="step ${cls || ''}">
    <div class="s-num">${n}</div>
    <div class="s-body"><div class="s-title">${t}</div><div class="s-desc">${d}</div>
    ${meta ? `<div class="s-meta">${meta}</div>` : ''}</div>
  </div>`;
}
const arrow = '<div class="s-arrow"></div>';

const HTML = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><style>
${fontCss}
:root{--p:#4F46E5;--p2:#7C3AED;--acc:#F43F5E;--ok:#10B981;--warn:#F59E0B;--ink:#1f2937;--mut:#6b7280;--line:#e5e7eb;--bg:#eef2ff;}
*{box-sizing:border-box;}
body{font-family:'Heebo',system-ui,Arial,sans-serif;color:var(--ink);margin:0;line-height:1.7;font-size:13px;}
.cover{background:linear-gradient(135deg,#4338CA,#DB2777);color:#fff;padding:64px 48px;}
.cover .badge{display:inline-block;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);border-radius:99px;padding:4px 14px;font-size:12px;margin-bottom:14px;}
.cover h1{font-size:34px;font-weight:800;margin:0 0 10px;}
.cover p{font-size:16px;opacity:.92;max-width:600px;margin:0;}
.wrap{padding:26px 40px;}
h2{font-size:19px;font-weight:800;color:var(--p2);border-bottom:3px solid var(--p);display:inline-block;padding-bottom:4px;margin:24px 0 12px;break-after:avoid;}
h2+*{break-before:avoid;}
p{margin:6px 0;}
ul,ol{margin:6px 0;padding-inline-start:22px;}
li{margin:4px 0;}
code{background:var(--bg);border-radius:5px;padding:1px 6px;font-size:12px;direction:ltr;display:inline-block;}
b,strong{color:#111827;}
/* pipeline flow */
.flow{margin:14px 0;}
.step{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:#fff;break-inside:avoid;}
.step.llm{border-inline-start:5px solid var(--acc);background:#FFF1F2;}
.step.local{border-inline-start:5px solid var(--ok);background:#ECFDF5;}
.step.cond{border-style:dashed;}
.s-num{flex:none;width:30px;height:30px;border-radius:50%;background:var(--p);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;}
.step.llm .s-num{background:var(--acc);}
.step.local .s-num{background:var(--ok);}
.s-title{font-weight:800;font-size:14px;}
.s-desc{font-size:12.5px;color:#374151;}
.s-meta{font-size:11.5px;color:var(--mut);margin-top:3px;font-weight:600;}
.s-arrow{width:2px;height:14px;background:var(--p);margin:2px 0 2px 0;margin-inline-start:29px;position:relative;}
.s-arrow::after{content:"";position:absolute;bottom:-1px;inset-inline-start:-4px;border-inline-start:5px solid transparent;border-inline-end:5px solid transparent;border-top:6px solid var(--p);}
.legend{display:flex;gap:14px;font-size:11.5px;color:var(--mut);margin:8px 0 2px;}
.legend span{display:inline-flex;align-items:center;gap:5px;}
.dotb{width:10px;height:10px;border-radius:3px;display:inline-block;}
.note{background:#FFF7ED;border:1px solid #FDBA74;border-radius:10px;padding:10px 14px;margin:10px 0;font-size:12.5px;break-inside:avoid;}
.note b{color:#9a3412;}
.tip{background:#ECFDF5;border:1px solid #6EE7B7;border-radius:10px;padding:10px 14px;margin:10px 0;font-size:12.5px;break-inside:avoid;}
table.g{width:100%;border-collapse:collapse;font-size:12.5px;margin:8px 0;table-layout:fixed;}
table.g th{background:var(--p2);color:#fff;padding:7px 10px;text-align:start;}
table.g td{padding:7px 10px;border-bottom:1px solid var(--line);word-break:break-word;}
table.g tr:nth-child(even) td{background:var(--bg);}
.foot{color:var(--mut);font-size:11px;text-align:center;padding:16px;border-top:1px solid var(--line);margin-top:22px;}
@page{margin:0;}
</style></head><body>

<div class="cover">
  <div class="badge">מסמך טכני · 2026</div>
  <h1>צינור היצירה (Pipeline) — צעד אחר צעד</h1>
  <p>מה קורה מהרגע שלוחצים על ✨ “צור אינפוגרפיקה” ועד שהדוח הסופי מוצג — כולל השלב הכפול שאתם רואים, לאן הולך הזמן, ואיך להאיץ את התהליך.</p>
</div>

<div class="wrap">

<h2>מבט-על: שלבי הצינור</h2>
<div class="legend">
  <span><span class="dotb" style="background:var(--ok)"></span> מקומי — מיידי (אלפיות שנייה)</span>
  <span><span class="dotb" style="background:var(--acc)"></span> קריאה למודל — כאן הולך הזמן</span>
  <span><span class="dotb" style="background:var(--p)"></span> לוגיקה/החלטה</span>
</div>

<div class="flow">
${step(1, 'בניית הבקשה', 'המערכת מרכיבה את הפנייה למודל: פרומפט המערכת (הכללים והחוזה מול המודל) + טקסט המסמך שחולץ + רמזים מבניים (כותרות, טבלאות כ-JSON) + הגדרות הפלט שלכם (ערכת צבעים, רמת פירוט, מספר תרשימים).', 'מקומי · מיידי', 'local')}
${arrow}
${step(2, 'החלטה: מעבר אחד או שניים?', 'המערכת מעריכה את גודל המסמך בטוקנים ומשווה ל“תקציב ההקשר”: חלון ההקשר של המודל (מההגדרות) פחות מקס’ טוקנים לפלט פחות שולי ביטחון. אם המסמך נכנס — קפיצה ישירה לשלב 4. אם לא — עוברים דרך שלב 3.', 'מקומי · מיידי · נשלט על ידי “חלון הקשר של המודל” בהגדרות', '')}
${arrow}
${step(3, 'שלב א’ (מותנה): סיכום במקטעים', 'המסמך מפוצל למקטעים, וכל מקטע נשלח למודל בנפרד כדי לדחוס אותו לתקציר JSON מובנה (מספרים, ישויות, טבלאות — במדויק, בלי להמציא). התקצירים מאוחדים לתדריך אחד קומפקטי שמחליף את המסמך המלא. זהו “השלב הראשון” שאתם רואים בסרגל ההתקדמות.', 'קריאת מודל לכל מקטע · לרוב 30–90 שניות למקטע', 'llm cond')}
${arrow}
${step(4, 'שלב ב’: יצירת הדוח (השלב הכבד)', 'המודל מקבל את המסמך (או התדריך) וכותב את מסמך ה-HTML המלא — כותרת, מקטעים, כרטיסי KPI, קוד תרשימים, תרשים זרימה — תוך הזרמה (streaming) שמוצגת כספירת טוקנים. דוח מלא הוא בדרך כלל 3,000–8,000 טוקנים של פלט.', 'קריאת מודל · רוב זמן ההמתנה — במודל מקומי בקצב 15–50 טוק’/שנ’ זה 1–6+ דקות', 'llm')}
${arrow}
${step(5, 'עיבוד-אחרי מקומי', 'ניקוי גדרות markdown אם המודל הוסיף, הזרקת ספריית התרשימים (Chart.js + התוספים), גיליון העיצוב, ערכת הצבעים והגופן המוטמע — הכול מתוך הקובץ עצמו, ללא רשת.', 'מקומי · מיידי', 'local')}
${arrow}
${step(6, 'בדיקת תקינות (Lint) ותיקון (מותנה)', 'המערכת סורקת את הפלט: הפניות חיצוניות אסורות? HTML שבור? תרשים בלי canvas? אם נמצאו בעיות — סבב תיקון יחיד מול המודל (הסטטוס יסומן “תוקן”). אם התיקון לא מושלם — הסרה מקומית קשיחה של ההפניות + אזהרה.', 'קריאת מודל רק אם צריך · יכול להוסיף עוד דקות', 'llm cond')}
${arrow}
${step(7, 'הצגה ותיעוד', 'הדוח המוגמר מוצג ב-iframe מבודד (sandbox) — מנותק מהמפתחות ומהאחסון של המחולל — וכל המדדים (טוקנים, זמנים, מהירות, סטטוס) נרשמים בתפריט הביצועים.', 'מקומי · מיידי', 'local')}
</div>

<h2>אז מהם “שני השלבים” שאתם רואים?</h2>
<p>אם סרגל ההתקדמות מציג שני שלבים, המסמך שלכם גדול מתקציב ההקשר, ולכן המערכת מפעילה את <b>המסלול הדו-שלבי</b>:</p>
<ol>
<li><b>שלב א’ — סיכום:</b> דחיסת המסמך לתדריך JSON (קריאת מודל אחת לכל מקטע).</li>
<li><b>שלב ב’ — יצירה:</b> כתיבת הדוח המלא מתוך התדריך (הקריאה הכבדה).</li>
</ol>
<p>לעיתים יופיע שלב שלישי — <b>תיקון</b> — אם הפלט הראשון לא עמד בכללים.</p>

<h2>לאן באמת הולך הזמן?</h2>
<p>כמעט כל ההמתנה היא <b>המודל שמייצר טוקנים</b> — לא המחולל. העיבוד המקומי (חילוץ, הזרקה, בדיקות, רינדור) הוא מיידי.</p>
<table class="g">
<thead><tr><th>רכיב</th><th>עלות זמן טיפוסית</th><th>ממה זה נובע</th></tr></thead>
<tbody>
<tr><td>שלב הסיכום (אם רץ)</td><td>30–90 שנ’ למקטע</td><td>קריאת מודל לכל מקטע; מספר המקטעים תלוי בגודל המסמך מול חלון ההקשר</td></tr>
<tr><td>יצירת הדוח</td><td>1–6+ דקות</td><td>3,000–8,000 טוקני פלט בקצב המודל (15–50 טוק’/שנ’ במודל מקומי טיפוסי)</td></tr>
<tr><td>סבב תיקון (אם רץ)</td><td>עד כמו היצירה</td><td>המודל כותב את הדוח מחדש</td></tr>
<tr><td>כל השאר</td><td>שברירי שנייה</td><td>עיבוד מקומי בדפדפן</td></tr>
</tbody>
</table>
<div class="tip"><b>לראות במקום לנחש:</b> פתחו 📈 <b>ביצועים</b> ולחצו על הריצה — תראו לכל שלב (summarize / main / repair) את הטוקנים, זמן התגובה, ואת קצב הטוקנים לשנייה. זה מצביע בדיוק על צוואר הבקבוק.</div>

<h2>איך להאיץ — לפי סדר ההשפעה</h2>
<ol>
<li><b>בטלו את שלב הסיכום אם הוא מיותר:</b> ב-<b>הגדרות ← חיבור</b> ודאו ש“חלון הקשר של המודל” מוגדר לגודל האמיתי של המודל (למשל 32K או 128K). אם המסמך באמת נכנס לחלון — תקבלו מעבר אחד במקום שניים. לרוב זה החיסכון הגדול ביותר.</li>
<li><b>בקשו פחות פלט:</b> ב-<b>הגדרות ← פלט</b> בחרו רמת פירוט “תמציתי” והקטינו את מספר התרשימים המרבי. פחות טוקנים = פחות זמן, כמעט ביחס ישר.</li>
<li><b>צמצמו תיקונים:</b> סבב תיקון נגרם מפלט לא תקין (הפניות חיצוניות, HTML שבור). מודל חזק/מדויק יותר מקטין את תדירותם. בדקו בתפריט הביצועים אם הסטטוס “תוקן” חוזר על עצמו.</li>
<li><b>המודל והחומרה הם התקרה:</b> קצב הטוקנים של השרת (מודל קטן/מהיר יותר, GPU חזק יותר, פחות עומס) הוא המנוף הגדול ביותר. שום דבר בצד הדפדפן לא יכול להאיץ את קצב הפליטה של המודל.</li>
</ol>
<div class="note"><b>הערה כנה:</b> הרצת מקטעי הסיכום במקביל נשמעת מפתה, אבל רוב שרתי המודלים המקומיים על GPU יחיד מעבדים בקשות בטור — מקביליות בדפדפן לא תקצר את הזמן בפועל ועלולה להעמיס על השרת.</div>

<div class="foot">מחולל אינפוגרפיקות אינטראקטיביות · מסמך צינור היצירה · פועל לא-מקוון</div>
</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 703, height: 1400 } });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  if (process.env.GUIDE_PREVIEW) {
    await page.screenshot({ path: '/tmp/pipeline-top.png' });
    await page.evaluate(() => { const el = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('להאיץ')); if (el) el.scrollIntoView(); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/pipeline-bottom.png' });
  }
  const outPdf = path.join(ROOT, 'pipeline-guide-he.pdf');
  await page.pdf({ path: outPdf, printBackground: true, format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  await browser.close();
  console.log('Wrote ' + outPdf + ' (' + Math.round(fs.statSync(outPdf).size / 1024) + ' KB)');
})().catch((e) => { console.error(e); process.exit(1); });
