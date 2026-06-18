#!/usr/bin/env node
/* idg-cors-proxy — a tiny, zero-dependency local proxy that lets the
   browser-based generator reach an internal OpenAI-compatible endpoint
   (OpenShift AI / KServe-vLLM, etc.) WITHOUT launching Chrome with
   --disable-web-security.
 *
 * Why this is needed: the generator runs in the browser, and the browser
 * blocks cross-origin responses that don't carry CORS headers. OpenShift
 * Routes don't send those headers, so the call fails. This proxy sits on
 * localhost, forwards every request to your real endpoint, and adds the
 * missing CORS headers to the response — so the browser is satisfied.
 *
 * Usage:
 *   node tools/cors-proxy.js --upstream https://<model>-<project>.apps.<cluster> [options]
 *
 * Options:
 *   --upstream <url>   Required. Your real endpoint's ORIGIN (scheme://host[:port]),
 *                      i.e. the part of your working URL before "/v1".
 *                      A path prefix is allowed and will be prepended.
 *   --port <n>         Local port to listen on (default 8008).
 *   --host <addr>      Local bind address (default 127.0.0.1).
 *   --insecure         Skip TLS certificate verification (for clusters using an
 *                      internal/self-signed CA the machine doesn't trust).
 *   --origin <o>       Value for Access-Control-Allow-Origin (default "*").
 *
 * Then in the generator: Settings -> Connection
 *   Base URL  = http://localhost:8008/v1
 *   Model     = your model name
 *   API key   = your token (if the deployment requires one)
 *
 * No internet access is used; this only relays to the --upstream you provide.
 */
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
  const o = { port: 8008, host: '127.0.0.1', insecure: false, origin: '*' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--upstream') o.upstream = argv[++i];
    else if (a === '--port') o.port = parseInt(argv[++i], 10);
    else if (a === '--host') o.host = argv[++i];
    else if (a === '--origin') o.origin = argv[++i];
    else if (a === '--insecure') o.insecure = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

// Headers we must not forward verbatim to the upstream.
const HOP = new Set(['host', 'origin', 'referer', 'connection', 'content-length', 'accept-encoding']);

/* Build an http.Server (not yet listening) that proxies to opts.upstream and
   adds CORS headers. Exported so the test harness can drive it directly. */
function createProxyServer(opts) {
  const upstream = new URL(opts.upstream);
  const upstreamLib = upstream.protocol === 'https:' ? https : http;
  const prefix = upstream.pathname.replace(/\/$/, ''); // '' when just an origin
  const allowOrigin = opts.origin || '*';
  const agent = upstream.protocol === 'https:'
    ? new https.Agent({ rejectUnauthorized: !opts.insecure, keepAlive: true })
    : new http.Agent({ keepAlive: true });

  function corsHeaders(req) {
    const reqHeaders = req.headers['access-control-request-headers'];
    return {
      'Access-Control-Allow-Origin': allowOrigin === '*' && req.headers.origin ? req.headers.origin : allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': reqHeaders || 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
  }

  return http.createServer((req, res) => {
    const cors = corsHeaders(req);

    if (req.method === 'OPTIONS') {            // CORS preflight
      res.writeHead(204, cors);
      return res.end();
    }

    const targetPath = prefix + req.url;
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!HOP.has(k.toLowerCase())) headers[k] = v;
    }

    const upReq = upstreamLib.request({
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || (upstream.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: targetPath,
      headers,
      agent,
    }, (upRes) => {
      // Relay upstream status + headers, then overlay CORS (so the browser
      // accepts it). Streaming bodies (SSE) are piped through unchanged.
      const outHeaders = Object.assign({}, upRes.headers, cors);
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    });

    upReq.on('error', (err) => {
      res.writeHead(502, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end(JSON.stringify({ error: 'proxy_upstream_error', detail: String(err.message || err) }));
    });

    req.pipe(upReq);
  });
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.upstream) {
    console.log('Usage: node tools/cors-proxy.js --upstream https://<host> [--port 8008] [--host 127.0.0.1] [--insecure] [--origin "*"]');
    process.exit(opts.help ? 0 : 1);
  }
  try { new URL(opts.upstream); }
  catch (e) { console.error('Invalid --upstream URL: ' + opts.upstream); process.exit(1); }

  const server = createProxyServer(opts);
  server.listen(opts.port, opts.host, () => {
    const up = new URL(opts.upstream);
    console.log(`idg-cors-proxy → forwarding http://${opts.host}:${opts.port}  ⟶  ${up.origin}${up.pathname.replace(/\/$/, '')}`);
    console.log(`TLS verification: ${opts.insecure ? 'OFF (--insecure)' : 'on'}`);
    console.log('In the generator set Base URL to:  ' +
      `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}/v1`);
  });
}

if (require.main === module) main();

module.exports = { createProxyServer, parseArgs };
