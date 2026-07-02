#!/usr/bin/env node
/* LLM-client behavior tests against a local mock server:
   - 429 rate limit → retried (honoring Retry-After) and succeeds
   - 429 with no retries left → surfaces http-429
   - finish_reason capture on JSON and SSE responses (truncation detection)
   Run: node tools/llm-test.js */
'use strict';

const http = require('http');
const assert = require('assert');
const path = require('path');

// Minimal browser-ish globals before loading modules (same as tools/test.js).
const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};

const ROOT = path.resolve(__dirname, '..');
for (const m of ['util', 'i18n', 'store', 'llm']) require(path.join(ROOT, 'src/js', m + '.js'));
const IDG = globalThis.IDG;

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); }
}

function profileFor(port, extra) {
  return Object.assign(IDG.store.defaultProfile(), {
    baseUrl: `http://127.0.0.1:${port}/v1`, model: 'm', stream: false,
    timeoutSec: 10, maxRetries: 1,
  }, extra || {});
}

/* Mock: behavior switches on the request path/body via a handler queue. */
function startServer(handler) {
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => handler(req, res, b));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })));
}

(async () => {
  console.log('429 handling');
  await test('429 with Retry-After is retried and succeeds', async () => {
    let calls = 0;
    const { server, port } = await startServer((req, res) => {
      calls++;
      if (calls === 1) {
        res.writeHead(429, { 'Retry-After': '0', 'Content-Type': 'application/json' });
        return res.end('{"error":"rate limited"}');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } }));
    });
    const r = await IDG.llm.chat(profileFor(port), [{ role: 'user', content: 'hi' }], { stream: false });
    server.close();
    assert.equal(calls, 2, 'retried once');
    assert.equal(r.text, 'ok');
  });

  await test('429 with maxRetries=0 surfaces http-429', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end('{"error":"rate limited"}');
    });
    await assert.rejects(
      IDG.llm.chat(profileFor(port, { maxRetries: 0 }), [{ role: 'user', content: 'hi' }], { stream: false }),
      (e) => e.code === 'http-429'
    );
    server.close();
  });

  console.log('finish_reason (truncation) capture');
  await test('JSON response: finish_reason length is surfaced', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: '<!DOCTYPE html><html><body>cut' }, finish_reason: 'length' }], usage: { prompt_tokens: 5, completion_tokens: 9 } }));
    });
    const r = await IDG.llm.chat(profileFor(port), [{ role: 'user', content: 'go' }], { stream: false });
    server.close();
    assert.equal(r.finishReason, 'length');
  });

  await test('SSE response: finish_reason length is surfaced', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '<!DOCTYPE html><html><body>par' } }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 7, completion_tokens: 4 } }) + '\n\n');
      res.write('data: [DONE]\n\n');
      res.end();
    });
    const r = await IDG.llm.chat(profileFor(port, { stream: true }), [{ role: 'user', content: 'go' }], {});
    server.close();
    assert.equal(r.finishReason, 'length');
    assert.equal(r.tokensIn, 7, 'usage still mapped');
  });

  await test('normal completion: finish_reason stop', async () => {
    const { server, port } = await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 1 } }));
    });
    const r = await IDG.llm.chat(profileFor(port), [{ role: 'user', content: 'go' }], { stream: false });
    server.close();
    assert.equal(r.finishReason, 'stop');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
