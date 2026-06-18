#!/usr/bin/env python3
"""idg-cors-proxy (Python stdlib, no dependencies) — lets the browser-based
generator reach an internal OpenAI-compatible endpoint (OpenShift AI /
KServe-vLLM, etc.) WITHOUT launching Chrome with --disable-web-security.

The generator runs in the browser, which blocks cross-origin responses that
lack CORS headers. OpenShift Routes don't send them, so the call fails. This
proxy runs on localhost, forwards every request to your real endpoint, and
adds the missing CORS headers — so the browser accepts the response.

Usage:
  python3 tools/cors_proxy.py --upstream https://<model>-<project>.apps.<cluster> [options]

Options:
  --upstream URL   Required. Your endpoint's origin (scheme://host[:port]) —
                   the part of your working URL before "/v1". A path prefix is
                   allowed and is prepended to forwarded requests.
  --port N         Local port (default 8008).
  --host ADDR      Local bind address (default 127.0.0.1).
  --insecure       Skip TLS certificate verification (internal/self-signed CA).
  --origin O       Access-Control-Allow-Origin value (default "*").

Then in the generator (Settings -> Connection):
  Base URL = http://localhost:8008/v1 ; Model = your model ; API key = token if needed

No internet access is used; it only relays to the --upstream you provide.
"""
import argparse
import http.client
import ssl
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOP = {"host", "origin", "referer", "connection", "content-length", "accept-encoding"}


def build_handler(opts):
    up = urlparse(opts.upstream)
    prefix = up.path.rstrip("/")
    is_https = up.scheme == "https"
    port = up.port or (443 if is_https else 80)
    ctx = None
    if is_https:
        ctx = ssl.create_default_context()
        if opts.insecure:
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def _allow_origin(self):
            o = self.headers.get("Origin")
            return o if (opts.origin == "*" and o) else opts.origin

        def _send_cors(self):
            self.send_header("Access-Control-Allow-Origin", self._allow_origin())
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header(
                "Access-Control-Allow-Headers",
                self.headers.get("Access-Control-Request-Headers", "Authorization, Content-Type"),
            )
            self.send_header("Access-Control-Max-Age", "86400")
            self.send_header("Vary", "Origin")

        def do_OPTIONS(self):
            self.send_response(204)
            self._send_cors()
            self.send_header("Content-Length", "0")
            self.end_headers()

        def _relay(self):
            body = None
            n = int(self.headers.get("Content-Length", 0) or 0)
            if n:
                body = self.rfile.read(n)
            fwd = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
            conn = (http.client.HTTPSConnection(up.hostname, port, context=ctx)
                    if is_https else http.client.HTTPConnection(up.hostname, port))
            try:
                conn.request(self.command, prefix + self.path, body=body, headers=fwd)
                resp = conn.getresponse()
                self.send_response(resp.status)
                for k, v in resp.getheaders():
                    if k.lower() in ("transfer-encoding", "connection", "content-length",
                                     "access-control-allow-origin"):
                        continue
                    self.send_header(k, v)
                self._send_cors()
                self.send_header("Transfer-Encoding", "chunked")
                self.end_headers()
                # Stream upstream → client in chunks (keeps SSE responsive).
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    self.wfile.write(b"%X\r\n%s\r\n" % (len(chunk), chunk))
                    self.wfile.flush()
                self.wfile.write(b"0\r\n\r\n")
            except Exception as e:  # noqa: BLE001
                msg = ('{"error":"proxy_upstream_error","detail":"%s"}' % str(e)).encode()
                self.send_response(502)
                self._send_cors()
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(msg)))
                self.end_headers()
                self.wfile.write(msg)
            finally:
                conn.close()

        do_GET = _relay
        do_POST = _relay

        def log_message(self, fmt, *args):  # quieter logging
            sys.stderr.write("  %s %s\n" % (self.command, self.path))

    return Handler


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--upstream", required=True)
    ap.add_argument("--port", type=int, default=8008)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--origin", default="*")
    ap.add_argument("--insecure", action="store_true")
    opts = ap.parse_args()

    httpd = ThreadingHTTPServer((opts.host, opts.port), build_handler(opts))
    up = urlparse(opts.upstream)
    print("idg-cors-proxy → forwarding http://%s:%d  ⟶  %s://%s%s"
          % (opts.host, opts.port, up.scheme, up.netloc, up.path.rstrip("/")))
    print("TLS verification: %s" % ("OFF (--insecure)" if opts.insecure else "on"))
    print("In the generator set Base URL to:  http://%s:%d/v1"
          % ("localhost" if opts.host == "0.0.0.0" else opts.host, opts.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


if __name__ == "__main__":
    main()
