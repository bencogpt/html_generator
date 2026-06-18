#!/usr/bin/env node
/* Verifies the CORS proxies (Node + Python) make a no-CORS upstream usable
   from a browser: preflight handling, CORS headers on responses, request body
   + Authorization forwarding, and SSE streaming passthrough.

   Run: node tools/proxy-test.js */
'use strict';

const http = require('http');
const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const { createProxyServer } = require('./cors-proxy');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message)); }
}

/* A deliberately CORS-less upstream that echoes what it received and can stream. */
function startUpstream() {
  const seen = {};
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.auth = req.headers['authorization'];
      seen.path = req.url;
      seen.body = body;
      // NOTE: intentionally no Access-Control-* headers here.
      if (req.url.endsWith('/stream')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"a":1}\n\n');
        res.write('data: {"b":2}\n\n');
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, gotBody: body, gotAuth: seen.auth }));
    });
  });
  return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port, seen })));
}

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}

(async () => {
  const up = await startUpstream();
  const upstreamUrl = `http://127.0.0.1:${up.port}`;

  console.log('Node proxy (tools/cors-proxy.js)');
  const proxy = createProxyServer({ upstream: upstreamUrl, origin: '*' });
  const pport = await listen(proxy);
  const base = `http://127.0.0.1:${pport}`;

  await test('OPTIONS preflight returns 204 + CORS allow headers', async () => {
    const res = await fetch(base + '/v1/chat/completions', {
      method: 'OPTIONS',
      headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'null'); // reflected
    assert.ok(/authorization/i.test(res.headers.get('access-control-allow-headers')));
  });

  await test('POST forwards body + Authorization, response carries CORS', async () => {
    const res = await fetch(base + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok123', Origin: 'null' },
      body: JSON.stringify({ model: 'm', hi: true }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'null'); // browser would accept
    const j = await res.json();
    assert.equal(j.gotAuth, 'Bearer tok123', 'Authorization forwarded');
    assert.ok(j.gotBody.includes('"hi":true'), 'request body forwarded');
    assert.equal(up.seen.path, '/v1/chat/completions', 'path forwarded verbatim');
  });

  await test('SSE stream is passed through with CORS headers', async () => {
    const res = await fetch(base + '/v1/stream', { method: 'POST', headers: { Origin: 'null' }, body: '{}' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'null');
    const text = await res.text();
    assert.ok(text.includes('data: {"a":1}') && text.includes('[DONE]'), 'streamed chunks relayed');
  });

  proxy.close();

  // Python proxy: same upstream, only run if python3 is available.
  console.log('Python proxy (tools/cors_proxy.py)');
  const pyPort = 8019;
  const py = spawn('python3', [path.join(__dirname, 'cors_proxy.py'), '--upstream', upstreamUrl, '--port', String(pyPort), '--host', '127.0.0.1'], { stdio: 'ignore' });
  let pyUp = false;
  py.on('error', () => { /* python3 missing */ });
  // wait for it to bind
  for (let i = 0; i < 30 && !pyUp; i++) {
    await new Promise((r) => setTimeout(r, 100));
    pyUp = await fetch(`http://127.0.0.1:${pyPort}/v1/ping`, { method: 'OPTIONS' }).then((r) => r.status === 204).catch(() => false);
  }
  if (!pyUp) {
    console.log('  ⚠ skipped (python3 not available or failed to start)');
  } else {
    const pbase = `http://127.0.0.1:${pyPort}`;
    await test('py: POST forwards body + Authorization + CORS', async () => {
      const res = await fetch(pbase + '/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pytok', Origin: 'null' },
        body: JSON.stringify({ py: 1 }),
      });
      assert.equal(res.headers.get('access-control-allow-origin'), 'null');
      const j = await res.json();
      assert.equal(j.gotAuth, 'Bearer pytok');
      assert.ok(j.gotBody.includes('"py":1'));
    });
    await test('py: SSE stream passthrough', async () => {
      const res = await fetch(pbase + '/v1/stream', { method: 'POST', headers: { Origin: 'null' }, body: '{}' });
      const text = await res.text();
      assert.ok(text.includes('[DONE]'));
    });
  }
  py.kill();

  up.server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
