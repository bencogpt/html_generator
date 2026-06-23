# Offline Interactive Infographic Generator

A **single HTML file** (`generator.html`) that converts review/survey documents
(DOCX, TXT, MD, or pasted text) into **self-contained, interactive HTML
infographics** — hero header, KPI cards, Chart.js charts, entity cards and a
CSS-only flowchart — using an **internal, OpenAI-compatible LLM endpoint**
(vLLM, Ollama, llama.cpp server, LM Studio, TGI…).

Built per the v1.1 specification: air-gapped friendly, zero external runtime
dependencies, system fonts (no embedded webfont), full RTL support, and a
performance/metrics dashboard.

## Using it

1. Take `generator.html` (≈1.1 MB) to the target machine and open it in
   Chrome/Edge/Firefox — `file://` or any static server both work. No
   internet access is needed or used.
2. **Settings → Connection**: set the base URL of your internal endpoint
   (e.g. `http://10.0.0.5:8000/v1` for vLLM, `http://localhost:11434/v1` for
   Ollama), pick a model (the *Fetch model list* button queries
   `GET /v1/models`), and press **Test connection**.
3. Drop a `.docx` (or `.txt`/`.md`, or paste raw text), check the extraction
   preview, choose a palette, and **Generate**. Settings → Output has a
   **Detail level** (Concise / Balanced / Comprehensive) to control how much of
   the document the report covers.
4. Export the result, four ways: **Download HTML** (interactive single file —
   Chart.js and stylesheet embedded), **PDF** (print dialog →
   "Save as PDF"; portable, no scripts, correct colors and page breaks),
   **Static HTML** (a script-free copy — charts are snapshotted to embedded
   PNG images and every `<script>`/`<canvas>` is removed, so it renders with
   JavaScript disabled / under strict CSP; chart interactivity becomes static),
   or **Copy**. Regenerate with free-text feedback if you want changes.

The only network traffic the generator ever produces is to the endpoint you
configured. Legacy binary `.doc` files are rejected with a "re-save as .docx"
message.

### Chart variety

Generated infographics can use the full Chart.js type palette — doughnut/pie,
**polar area**, bar (vertical, **horizontal**, **stacked**, grouped), line/area,
radar, **scatter** and **bubble** — plus two vendored, fully-offline extras the
model drives through one-call helpers injected into every output:

- **Heatmaps / matrices** (`chartjs-chart-matrix`): `IDG_CHARTS.heatmap(canvas, rows, cols, matrix, opts)` — capability matrices, density grids.
- **Geographic maps** (`chartjs-chart-geo` + an embedded 177-country world atlas): `IDG_CHARTS.choropleth(canvas, {Country: value}, opts)` and `IDG_CHARTS.bubbleMap(...)`. Country names are English with common aliases (USA/UK) handled; no map data is fetched. Used only when the document actually contains per-country numbers (the "never invent data" rule still applies).

All of these render on `<canvas>` (no SVG, no Plotly, no CDNs), so outputs stay
self-contained and offline. This adds ~0.2 MB to the artifact.

### Connection presets & multiple profiles

Settings → Connection supports multiple named profiles (e.g. a "LiteLLM"
profile and an "OpenShift AI" profile) — switch the active one from the
dropdown. The **Quick setup** picker pre-fills a profile for a known stack
(LiteLLM, OpenShift AI / KServe-vLLM, vLLM, Ollama); you then add the model
name and, if the deployment requires it, a token.

Note: a profile only carries request-side settings (URL, model, key,
headers). It can't add CORS headers to a server's responses or make the
browser trust an untrusted cert — so for **OpenShift AI**, the reliable path
is to front the model with **LiteLLM** (which allows browser CORS) and point
the generator at the LiteLLM URL. See CORS below.

Palettes: Vibrant Tech Blues (default), Colorful (multi-hue indigo/rose/amber/
emerald — vibrant, distinct chart colors), Emerald Forest, Warm Sunset, Royal
Violet, Slate Mono. Set in Settings → Output or the palette row on the main
screen.

### Connecting without `--disable-web-security` (bundled CORS proxy)

If your endpoint works from `curl`/LiteLLM but the generator can't reach it,
and launching Chrome with `--disable-web-security` "fixes" it, the issue is
**CORS** — the server (e.g. an OpenShift AI Route) doesn't send the headers the
browser requires, and no in-page code can bypass that. Instead of the insecure
Chrome flag, run the bundled zero-dependency proxy on the same machine; it
forwards to your endpoint and adds the CORS headers:

```bash
# Node (or the Python version, tools/cors_proxy.py — identical flags)
node tools/cors-proxy.js --upstream https://<model>-<project>.apps.<cluster>
#   --port 8008    local port (default)
#   --insecure     skip TLS verification for an internal/self-signed cluster CA
```

Then in the generator → Settings → Connection set **Base URL** to
`http://localhost:8008/v1`, plus your model name and token (if required). No
browser flags; fully offline (it only relays to the `--upstream` you give it);
streaming and bearer-token auth pass through. If you already run LiteLLM,
pointing it at the OpenShift model is an equivalent alternative.

### CORS (deployment requirement)

The browser calls your LLM server (or the proxy above) directly, so it must
allow the generator's origin (including `null` when opened from `file://`):

- **Ollama**: `OLLAMA_ORIGINS="*" ollama serve`
- **vLLM**: `--allowed-origins '["*"]'`
- Otherwise, front the gateway with any one-line local proxy that adds CORS
  headers.

### Performance menu

Every LLM call (summarize / main / repair passes) is recorded: tokens in/out
(from the server's `usage`, or Ollama's `prompt_eval_count`/`eval_count`;
estimated and flagged `*` when neither is reported), TTFT, latency,
throughput, status (`success` / `repaired` / `cancelled` / `failed`), output
size split (model vs. injected assets), lint results and optional cost.
History (200 runs, FIFO) lives in `localStorage`; export as CSV/JSON.

⚠️ API keys are stored unencrypted in `localStorage` **only if** you check
"Persist key"; the default keeps keys in memory for the session only.

## Repository layout

```
generator.html        ← the deliverable (built, committed)
src/
  shell.html          page skeleton with build tokens
  app.css             generator UI styles
  output/base.css     utility CSS injected into every generated infographic
  js/                 modules: util, i18n, store, extract, llm, prompt,
                      postprocess, metrics, pipeline, ui, main
vendor/
  chart.umd.min.js        Chart.js 4.4.0 (MIT) — UI dashboard + injected into outputs
  chartjs-chart-matrix.min.js   matrix plugin (MIT) — heatmaps
  chartjs-chart-geo.umd.min.js  geo plugin (MIT) — choropleth/bubble maps
  topojson-client.min.js  topojson-client (ISC) — world topology → features
  world-countries-110m.json  world-atlas (ISC) — 177 country borders, embedded
  mammoth.browser.min.js  mammoth.js 1.8.0 (BSD-2) — DOCX extraction
src/output/
  base.css            utility CSS injected into every generated infographic
  chart-extras.js     IDG_CHARTS/IDG_GEO helper runtime injected into outputs
tools/
  build.js            assembles everything into generator.html (no deps)
  test.js             node unit tests for the pure logic
  audit.js            static audit of the built file (no fonts, no eval, no
                      sourcemaps, no functional external references)
  e2e.js              headless-Chromium end-to-end test with a mock
                      OpenAI-compatible server (needs `npx playwright install chromium`)
  cors-proxy.js / cors_proxy.py   zero-dependency local CORS proxy (Node/Python)
  proxy-test.js       verifies the proxies (CORS, body/auth, SSE streaming)
  fixtures/sample-he.docx  Hebrew test document
```

## Building & testing

```bash
npm run build         # → generator.html (fails above the 6 MB ceiling)
npm run test          # unit tests, no browser needed
npm run audit         # build + static audit (no fonts/eval/sourcemaps/ext refs)
npm run e2e           # build + full browser flow against a mock LLM server
```

`index.html` is a small redirect to `generator.html` kept for old links.
