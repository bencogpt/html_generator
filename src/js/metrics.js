/* IDG.metrics — per-run metric records, aggregates and exports (FR-4x, §7).
   History persisted in localStorage, FIFO-capped (FR-44). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const { mean, median, percentile } = IDG.util;

  const KEY = 'idg.metrics.v1';
  const CAP = 200;

  let runs = null;

  function load() {
    if (runs) return runs;
    try { runs = JSON.parse(global.localStorage.getItem(KEY) || '[]'); }
    catch (e) { runs = []; }
    if (!Array.isArray(runs)) runs = [];
    return runs;
  }

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(runs)); }
    catch (e) {
      // Quota hit — drop oldest half and retry once.
      runs = runs.slice(Math.floor(runs.length / 2));
      try { global.localStorage.setItem(KEY, JSON.stringify(runs)); } catch (e2) { /* give up */ }
    }
  }

  /* Run record shape (§7):
     { id, ts, source, model, profileName, status, passes: [{type, tokensIn,
       tokensOut, estimated, ttftMs, latencyMs}], tokensIn, tokensOut,
       estimated, ttftMs, latencyMs, tokPerSec, retries, errorCode,
       outputBytes, modelBytes, injectedBytes, lintFound, lintFixed,
       costEst, extract: {words, tables, headings, lang} } */

  function totalsFromPasses(passes) {
    const t = { tokensIn: 0, tokensOut: 0, latencyMs: 0, estimated: false };
    for (const p of passes || []) {
      t.tokensIn += p.tokensIn || 0;
      t.tokensOut += p.tokensOut || 0;
      t.latencyMs += p.latencyMs || 0;
      if (p.estimated) t.estimated = true;
    }
    return t;
  }

  function costFor(profile, tokensIn, tokensOut) {
    if (!profile) return null;
    const pi = parseFloat(profile.priceIn), po = parseFloat(profile.priceOut);
    if (isNaN(pi) && isNaN(po)) return null;
    return ((isNaN(pi) ? 0 : pi) * (tokensIn || 0) + (isNaN(po) ? 0 : po) * (tokensOut || 0)) / 1e6;
  }

  function record(run) {
    load();
    runs.push(run);
    while (runs.length > CAP) runs.shift();  // FIFO (FR-44)
    save();
    return run;
  }

  function inWindow(run, windowMs) {
    return !windowMs || run.ts >= Date.now() - windowMs;
  }

  function aggregates(windowMs) {
    const sel = load().filter((r) => inWindow(r, windowMs));
    const done = sel.filter((r) => r.status !== 'cancelled');
    const ok = sel.filter((r) => r.status === 'success' || r.status === 'repaired');
    const lat = done.map((r) => r.latencyMs).filter((v) => v != null);
    const tps = ok.map((r) => r.tokPerSec).filter((v) => v != null && isFinite(v));
    const costs = sel.map((r) => r.costEst).filter((v) => v != null);
    return {
      count: sel.length,
      successRate: done.length ? ok.length / done.length : null,
      tokensIn: sel.reduce((a, r) => a + (r.tokensIn || 0), 0),
      tokensOut: sel.reduce((a, r) => a + (r.tokensOut || 0), 0),
      anyEstimated: sel.some((r) => r.estimated),
      latMean: mean(lat), latMedian: median(lat), latP95: percentile(lat, 95),
      tpsMean: mean(tps),
      costTotal: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      errors: sel.filter((r) => r.status === 'failed').length,
      runs: sel,
    };
  }

  const CSV_COLS = [
    'id', 'timestamp', 'source', 'model', 'profile', 'status', 'passes',
    'tokens_in', 'tokens_out', 'tokens_estimated', 'ttft_ms', 'latency_ms',
    'tokens_per_sec', 'truncated', 'retries', 'error_code', 'output_bytes', 'model_bytes',
    'injected_bytes', 'lint_found', 'lint_fixed', 'cost_estimate',
    'source_words', 'source_tables', 'source_language',
  ];

  function toCSV() {
    const rows = [CSV_COLS];
    for (const r of load()) {
      rows.push([
        r.id, new Date(r.ts).toISOString(), r.source, r.model, r.profileName,
        r.status, (r.passes || []).map((p) => p.type).join('+'),
        r.tokensIn, r.tokensOut, r.estimated ? 'yes' : 'no',
        r.ttftMs != null ? Math.round(r.ttftMs) : '', Math.round(r.latencyMs || 0),
        r.tokPerSec != null ? r.tokPerSec.toFixed(2) : '',
        r.truncated ? 'yes' : 'no',
        r.retries || 0, r.errorCode || '',
        r.outputBytes || '', r.modelBytes || '', r.injectedBytes || '',
        r.lintFound || 0, r.lintFixed || 0,
        r.costEst != null ? r.costEst.toFixed(6) : '',
        r.extract ? r.extract.words : '', r.extract ? r.extract.tables : '',
        r.extract ? r.extract.lang : '',
      ]);
    }
    // BOM so Excel opens UTF-8 (Hebrew filenames) correctly.
    return '﻿' + IDG.util.toCSV(rows);
  }

  function toJSON() {
    return JSON.stringify({ exported: new Date().toISOString(), runs: load() }, null, 2);
  }

  function clear() { runs = []; save(); }

  IDG.metrics = { load, record, aggregates, totalsFromPasses, costFor, toCSV, toJSON, clear, CAP };
})(typeof window !== 'undefined' ? window : globalThis);
