/* IDG chart-extras — runtime injected into every generated infographic,
   loaded right after Chart.js + the matrix/geo plugins + topojson-client.

   It does two things:
   1. Builds window.IDG_GEO from the embedded world topology (set just above
      as window.__IDG_WORLD_TOPO__) so outputs get ready-to-use country
      features with zero network access.
   2. Exposes window.IDG_CHARTS — one-call, RTL-aware, palette-aware builders
      for the chart types that are fiddly to configure by hand (heatmap,
      choropleth map, bubble map). Raw Chart.js configs still work too; these
      just make the hard ones reliable for smaller models.

   Everything is wrapped so it can never throw at load time (it also runs in
   the generator's own page, which has no canvases). */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : this;
  if (!W || typeof W.Chart === 'undefined') return;

  /* ---------- palette helpers ---------- */
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || '').trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function hexToRgb(hex) {
    hex = String(hex || '').replace('#', '').trim();
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    if (isNaN(n) || hex.length !== 6) return [37, 99, 235];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; }
  function isRTL() {
    try { return (document.documentElement.getAttribute('dir') || document.dir || '').toLowerCase() === 'rtl'; }
    catch (e) { return false; }
  }
  function ctxOf(target) {
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return null;
    return el.getContext ? el : (el.querySelector ? el.querySelector('canvas') : null);
  }

  /* ---------- IDG_GEO: country features from the embedded topology ---------- */
  var GEO = { ready: false, countries: [], outline: [], _byName: {} };
  (function buildGeo() {
    try {
      var topo = W.__IDG_WORLD_TOPO__;
      if (!topo || !W.topojson || !topo.objects || !topo.objects.countries) return;
      var fc = W.topojson.feature(topo, topo.objects.countries);
      GEO.countries = fc.features || [];
      GEO.outline = GEO.countries;
      GEO.countries.forEach(function (f) {
        var n = f.properties && f.properties.name;
        if (n) GEO._byName[n.toLowerCase()] = f;
      });
    } catch (e) { /* leave GEO empty; helpers will no-op */ }
    GEO.ready = GEO.countries.length > 0;
  })();

  // Common name aliases → world-atlas canonical names.
  var ALIASES = {
    'usa': 'united states of america', 'us': 'united states of america',
    'united states': 'united states of america', 'u.s.': 'united states of america',
    'uk': 'united kingdom', 'u.k.': 'united kingdom', 'england': 'united kingdom',
    'south korea': 'south korea', 'korea': 'south korea', 'russia': 'russia',
    'uae': 'united arab emirates', 'czech republic': 'czechia', 'czech': 'czechia',
    'ivory coast': "côte d'ivoire", 'drc': 'dem. rep. congo',
    'congo': 'dem. rep. congo', 'bosnia': 'bosnia and herz.',
  };
  GEO.feature = function (name) {
    if (!name) return null;
    var k = String(name).toLowerCase().trim();
    return GEO._byName[k] || GEO._byName[ALIASES[k] || ''] || null;
  };

  W.IDG_GEO = GEO;

  /* ---------- IDG_CHARTS: one-call builders ---------- */
  function commonPlugins(rtl) {
    return { legend: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr', labels: { font: { family: 'Heebo' } } } };
  }

  var IDG_CHARTS = {
    /* Heatmap / matrix.
       rows: array of row labels (y). cols: array of column labels (x).
       matrix: 2D array matrix[rowIndex][colIndex] = number.
       opts: { label, min, max } */
    heatmap: function (target, rows, cols, matrix, opts) {
      var el = ctxOf(target);
      if (!el) return null;
      opts = opts || {};
      var rtl = isRTL();
      var prim = hexToRgb(cssVar('--c-primary', '#2563EB'));
      var light = hexToRgb(cssVar('--c-bg', '#EFF6FF'));
      var vals = [];
      var points = [];
      for (var r = 0; r < rows.length; r++) {
        for (var c = 0; c < cols.length; c++) {
          var v = (matrix[r] && matrix[r][c] != null) ? +matrix[r][c] : null;
          if (v != null && !isNaN(v)) vals.push(v);
          points.push({ x: cols[c], y: rows[r], v: v });
        }
      }
      var min = opts.min != null ? opts.min : Math.min.apply(null, vals.length ? vals : [0]);
      var max = opts.max != null ? opts.max : Math.max.apply(null, vals.length ? vals : [1]);
      var span = (max - min) || 1;
      return new W.Chart(el, {
        type: 'matrix',
        data: {
          datasets: [{
            label: opts.label || '',
            data: points,
            backgroundColor: function (c) {
              var raw = c.raw || {};
              if (raw.v == null || isNaN(raw.v)) return 'rgba(0,0,0,0.04)';
              return rgba(mix(light, prim, (raw.v - min) / span), 0.95);
            },
            borderColor: 'rgba(255,255,255,0.6)',
            borderWidth: 1,
            width: function (c) { var a = c.chart.chartArea || {}; return (a.width || 0) / cols.length - 2; },
            height: function (c) { var a = c.chart.chartArea || {}; return (a.height || 0) / rows.length - 2; },
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr',
              callbacks: {
                title: function (items) { var r = items[0].raw; return r.y + ' · ' + r.x; },
                label: function (item) { return (opts.label ? opts.label + ': ' : '') + (item.raw.v == null ? '—' : item.raw.v); },
              },
            },
          },
          scales: {
            x: { type: 'category', labels: cols, position: rtl ? 'top' : 'bottom', grid: { display: false }, ticks: { font: { family: 'Heebo' } } },
            y: { type: 'category', labels: rows, offset: true, reverse: true, grid: { display: false }, ticks: { font: { family: 'Heebo' } } },
          },
        },
      });
    },

    /* Choropleth world map.
       valuesByName: { "Israel": 12, "United States": 40, ... }
       opts: { label, projection, quantize } */
    choropleth: function (target, valuesByName, opts) {
      var el = ctxOf(target);
      if (!el || !GEO.ready) return null;
      opts = opts || {};
      var rtl = isRTL();
      var data = GEO.countries.map(function (f) {
        var name = f.properties && f.properties.name;
        var v = null, lk = name && valuesByName[name];
        if (lk == null) {
          // try case-insensitive / alias match against provided keys
          for (var key in valuesByName) {
            if (GEO.feature(key) === f) { v = valuesByName[key]; break; }
          }
        } else v = lk;
        return { feature: f, value: v == null ? 0 : +v };
      });
      return new W.Chart(el, {
        type: 'choropleth',
        data: {
          labels: GEO.countries.map(function (f) { return f.properties.name; }),
          datasets: [{ label: opts.label || '', outline: GEO.outline, data: data }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          showOutline: true, showGraticule: false,
          plugins: { legend: { display: false }, tooltip: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr' } },
          scales: {
            projection: { axis: 'x', projection: opts.projection || 'equalEarth' },
            color: {
              axis: 'x', quantize: opts.quantize || 5,
              legend: { position: rtl ? 'bottom-left' : 'bottom-right', align: 'bottom' },
              missing: cssVar('--c-bg', '#EFF6FF'),
            },
          },
        },
      });
    },

    /* Proportional bubble map.
       valuesByName: { "Israel": 12, ... }  opts: { label } */
    bubbleMap: function (target, valuesByName, opts) {
      var el = ctxOf(target);
      if (!el || !GEO.ready) return null;
      opts = opts || {};
      var rtl = isRTL();
      var prim = cssVar('--c-primary', '#2563EB');
      var data = [];
      for (var key in valuesByName) {
        var f = GEO.feature(key);
        if (!f) continue;
        data.push({ feature: f, value: +valuesByName[key] });
      }
      return new W.Chart(el, {
        type: 'bubbleMap',
        data: { labels: data.map(function (d) { return d.feature.properties.name; }),
          datasets: [{ label: opts.label || '', outline: GEO.outline, backgroundColor: prim, data: data }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          showOutline: true, showGraticule: false,
          plugins: { legend: { display: false }, tooltip: { rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr' } },
          scales: {
            projection: { axis: 'x', projection: opts.projection || 'equalEarth' },
            size: { axis: 'x', range: [2, 26] },
          },
        },
      });
    },
  };

  W.IDG_CHARTS = IDG_CHARTS;
})();
