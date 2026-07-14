#!/usr/bin/env node
/* Validates the infographic-report skill package end-to-end:
   1. assemble.js turns examples/sample-report.html into a final file
      (default palette + a dark palette).
   2. The assembled file renders fully offline in Chromium: all four charts
      (doughnut, stacked bar, heatmap helper, waterfall helper) draw, no
      console/page errors, no external references.
   3. assemble.js lints: a report with a CDN reference gets it stripped.
   Run: node tools/build-skill.js && node tools/skill-test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SKILL = path.join(ROOT, 'skill', 'infographic-report');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'idg-skill-'));
// Both assemblers must behave identically; run via node or python3.
function run(cmd, script, args) {
  const r = spawnSync(cmd, [path.join(SKILL, 'scripts', script), ...args], { encoding: 'utf8' });
  if (r.status !== 0 && !args.includes('--expect-fail')) {
    throw new Error(`${script} exited ${r.status}: ${r.stderr}`);
  }
  return (r.stdout || '') + (r.stderr || '');
}
const asm = (args) => run('node', 'assemble.js', args);
const asmPy = (args) => run('python3', 'assemble.py', args);

(async () => {
  // 1. assemble the sample with the default palette and a dark palette
  const src = path.join(SKILL, 'examples/sample-report.html');
  const outLight = path.join(TMP, 'light.html');
  const outDark = path.join(TMP, 'dark.html');
  console.log(asm([src, '-o', outLight]).trim());
  console.log(asm([src, '-o', outDark, '--palette', 'slate-premium']).trim());

  for (const [name, file] of [['light', outLight], ['dark', outDark]]) {
    const html = fs.readFileSync(file, 'utf8');
    assert.ok(!html.includes('{{'), name + ': no leftover tokens');
    assert.ok(!/(?:src|href)=["'](?:https?:)?\/\//.test(html), name + ': no external refs');
    assert.ok(html.includes('IDG_CHARTS'), name + ': helpers bundled');
    assert.ok(html.includes('Heebo'), name + ': font embedded');
  }
  assert.ok(fs.readFileSync(outDark, 'utf8').includes('--c-surface:rgba(30, 41, 59'), 'dark palette surface vars injected');

  // 2. offline render
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ offline: false }); // file:// only; requests would fail anyway
  const page = await ctx.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('data:')) errors.push('network: ' + r.url()); });

  await page.goto('file://' + outDark);
  await page.waitForFunction(() =>
    window.Chart && window.Chart.getChart('cShare') && window.Chart.getChart('cRevenue') &&
    window.Chart.getChart('cMatrix') && window.Chart.getChart('cWaterfall'), null, { timeout: 20000 });
  const info = await page.evaluate(() => ({
    matrixType: window.Chart.getChart('cMatrix').config.type,
    waterfallBars: window.Chart.getChart('cWaterfall').data.datasets[0].data.length,
    dir: document.documentElement.getAttribute('dir'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  assert.equal(info.matrixType, 'matrix', 'heatmap helper rendered a matrix chart');
  assert.equal(info.waterfallBars, 5, 'waterfall rendered all steps');
  assert.equal(info.dir, 'rtl', 'RTL document');
  assert.ok(errors.length === 0, 'no errors/external requests: ' + errors.join(' ;; '));
  await browser.close();
  console.log(`✓ assembled report renders offline (4 charts incl. heatmap+waterfall, RTL, dark bg ${info.bg})`);

  // 3. lint: CDN reference is stripped with a warning
  const bad = path.join(TMP, 'bad.html');
  fs.writeFileSync(bad, '<!DOCTYPE html><html><head>{{BASE_CSS}}\n{{CHART_LIB}}</head><body>' +
    '<script src="https://cdn.example.com/x.js"></scr' + 'ipt><p>hi</p></body></html>');
  const lintOut = asm([bad, '-o', path.join(TMP, 'bad-final.html')]);
  assert.ok(/external/.test(lintOut), 'lint warned about the CDN reference');
  assert.ok(!/https:\/\/cdn\.example\.com/.test(fs.readFileSync(path.join(TMP, 'bad-final.html'), 'utf8')), 'CDN ref stripped');
  console.log('✓ assembler lints & strips forbidden external references');

  // 4. --list-palettes shows all 8
  const list = asm(['--list-palettes']);
  assert.equal(list.trim().split('\n').length, 8, 'eight palettes listed');
  console.log('✓ palette listing OK');

  // 5. python assembler parity: same input + palette → byte-identical output
  const outPy = path.join(TMP, 'dark-py.html');
  console.log(asmPy([src, '-o', outPy, '--palette', 'slate-premium']).trim());
  assert.ok(fs.readFileSync(outPy, 'utf8') === fs.readFileSync(outDark, 'utf8'),
    'assemble.py output is byte-identical to assemble.js');
  const lintPy = asmPy([bad, '-o', path.join(TMP, 'bad-final-py.html')]);
  assert.ok(/external/.test(lintPy), 'python lint warned about the CDN reference');
  console.log('✓ assemble.py parity: identical output + same linting');

  // 6. single-file MD variant: extract the embedded assembler exactly like
  //    the chatbot would, serve assets over HTTP, assemble, compare bytes.
  const singleMd = fs.readFileSync(path.join(ROOT, 'infographic-skill-single.md'), 'utf8');
  const block = singleMd.match(/## Embedded assembler[^\n]*\n\n```python\n([\s\S]*?)```/);
  assert.ok(block, 'embedded assembler block present in single-file md');
  assert.ok(!singleMd.includes('__PALETTES_JSON__'), 'palettes baked into embedded assembler');
  const pyPath = path.join(TMP, 'assemble_infographic.py');
  fs.writeFileSync(pyPath, block[1]);

  const http = require('http');
  const assetsDir = path.join(SKILL, 'assets');
  const server = http.createServer((req, res) => {
    const f = path.join(assetsDir, path.basename(req.url));
    if (fs.existsSync(f)) { res.writeHead(200); res.end(fs.readFileSync(f)); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const outSingle = path.join(TMP, 'single.html');
  // async spawn — spawnSync would block the event loop and deadlock the
  // in-process assets server above
  const runPy = (args) => new Promise((resolve) => {
    const c = require('child_process').spawn('python3', args, { cwd: TMP });
    let err = '';
    c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => resolve({ code, err }));
  });
  const rs = await runPy([pyPath, src, '-o', outSingle, '--palette', 'slate-premium', '--assets-url', url]);
  assert.equal(rs.code, 0, 'single-file assembler ran: ' + rs.err);
  assert.ok(fs.readFileSync(outSingle, 'utf8') === fs.readFileSync(outDark, 'utf8'),
    'single-file assembler output byte-identical to the packaged assemblers');
  server.close();
  // second run with the server DOWN must succeed from the cache
  const rs2 = await runPy([pyPath, src, '-o', path.join(TMP, 'single2.html'), '--palette', 'slate-premium', '--assets-url', url]);
  assert.equal(rs2.code, 0, 'cached run succeeded with assets server down: ' + rs2.err);
  console.log('✓ single-file md skill: embedded assembler extracted, fetched+cached assets, identical output');

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('\nSKILL PACKAGE: all checks passed');
})().catch((e) => { console.error('SKILL TEST FAILED:', e.message); process.exit(1); });
