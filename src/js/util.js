/* IDG.util — small shared helpers (pure where possible; node-testable). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});

  const util = {
    $(sel, root) { return (root || global.document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || global.document).querySelectorAll(sel)); },

    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    },

    uid() {
      return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    },

    /* Rough token estimate when the server reports no usage (chars/4,
       flagged "estimated" wherever displayed). */
    estimateTokens(text) {
      return Math.ceil(String(text || '').length / 4);
    },

    fmtInt(n) {
      if (n == null || isNaN(n)) return '—';
      return Number(n).toLocaleString('en-US');
    },

    fmtMs(ms) {
      if (ms == null || isNaN(ms)) return '—';
      return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s';
    },

    fmtBytes(b) {
      if (b == null || isNaN(b)) return '—';
      if (b < 1024) return b + ' B';
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
      return (b / (1024 * 1024)).toFixed(2) + ' MB';
    },

    fmtDate(ts) {
      const d = new Date(ts);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    /* Filename timestamp per FR-25: yyyymmdd-hhmm */
    fileStamp(ts) {
      const d = new Date(ts || Date.now());
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    },

    /* Resolve a dot/bracket path like "choices[0].message.content" against an
       object. Returns undefined when any segment is missing. */
    getPath(obj, path) {
      if (!path) return undefined;
      const parts = String(path)
        .replace(/\[(\d+)\]/g, '.$1')
        .split('.')
        .filter(Boolean);
      let cur = obj;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    },

    median(arr) {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    },

    percentile(arr, p) {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      const idx = Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1);
      return s[Math.max(0, idx)];
    },

    mean(arr) {
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    },

    /* CSV cell escaping (RFC 4180; Excel-friendly). */
    csvCell(v) {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    },

    toCSV(rows) {
      return rows.map((r) => r.map(util.csvCell).join(',')).join('\r\n');
    },

    downloadBlob(name, mime, data) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = global.document.createElement('a');
      a.href = url;
      a.download = name;
      global.document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    },

    sanitizeBaseName(name) {
      return String(name || 'document')
        .replace(/\.[^.]+$/, '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .slice(0, 80) || 'document';
    },
  };

  IDG.util = util;
})(typeof window !== 'undefined' ? window : globalThis);
