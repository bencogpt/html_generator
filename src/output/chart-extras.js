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

  /* Approximate [lon,lat] centroid of a country feature (bbox centre of its
     largest ring) — good enough to place a bubble inside the country. */
  function centroid(f) {
    try {
      var g = f && f.geometry;
      if (!g) return null;
      var ring = null;
      if (g.type === 'Polygon') ring = g.coordinates[0];
      else if (g.type === 'MultiPolygon') {
        var best = 0;
        g.coordinates.forEach(function (poly) {
          if (poly[0] && poly[0].length > best) { best = poly[0].length; ring = poly[0]; }
        });
      }
      if (!ring || !ring.length) return null;
      var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (var i = 0; i < ring.length; i++) {
        var p = ring[i];
        if (p[0] < minx) minx = p[0];
        if (p[0] > maxx) maxx = p[0];
        if (p[1] < miny) miny = p[1];
        if (p[1] > maxy) maxy = p[1];
      }
      return [(minx + maxx) / 2, (miny + maxy) / 2];
    } catch (e) { return null; }
  }
  GEO.centroid = centroid;

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
       valuesByName: { "Israel": 12, ... }  opts: { label }
       BubbleMap needs explicit longitude/latitude per point (it does not derive
       them from a feature), so we place each bubble at the country centroid. */
    bubbleMap: function (target, valuesByName, opts) {
      var el = ctxOf(target);
      if (!el || !GEO.ready) return null;
      opts = opts || {};
      var rtl = isRTL();
      var prim = cssVar('--c-primary', '#2563EB');
      var data = [], labels = [];
      for (var key in valuesByName) {
        var f = GEO.feature(key);
        if (!f) continue;
        var c = centroid(f);
        if (!c) continue;
        labels.push(f.properties.name);
        data.push({ longitude: c[0], latitude: c[1], value: +valuesByName[key] });
      }
      return new W.Chart(el, {
        type: 'bubbleMap',
        data: { labels: labels,
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

  /* Waterfall — cumulative build-up of relative steps to a total, drawn as
     Chart.js floating bars (offline, canvas; no Plotly needed).
     steps: [{label, value, total?}]. Each non-total step adds `value` to the
     running cumulative; a {total:true} step draws a full bar from 0 (to its
     value, or to the running cumulative if value is omitted). */
  IDG_CHARTS.waterfall = function (target, steps, opts) {
    var el = ctxOf(target);
    if (!el || !steps || !steps.length) return null;
    opts = opts || {};
    var rtl = isRTL();
    var inc = cssVar('--c-primary', '#2563EB');
    var dec = cssVar('--c-accent', '#F43F5E');
    var tot = cssVar('--c-secondary', '#1E40AF');
    var labels = [], data = [], colors = [], running = 0;
    steps.forEach(function (s) {
      var v = +s.value || 0;
      labels.push(s.label);
      if (s.total) {
        data.push([0, s.value != null ? v : running]);
        colors.push(tot);
      } else {
        data.push([running, running + v]);
        colors.push(v >= 0 ? inc : dec);
        running += v;
      }
    });
    return new W.Chart(el, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: opts.label || '', data: data, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            rtl: rtl, textDirection: rtl ? 'rtl' : 'ltr',
            callbacks: { label: function (c) { var r = c.raw || [0, 0]; return (opts.prefix || '') + (Math.round(Math.abs(r[1] - r[0]) * 100) / 100); } },
          },
        },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
      },
    });
  };

  W.IDG_CHARTS = IDG_CHARTS;

  /* ---------- IDG_FMT: number / currency / percent / label-wrap ---------- */
  W.IDG_FMT = {
    usd: function (n) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n); } catch (e) { return '$' + Math.round(n || 0); } },
    currency: function (n, cur) { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n); } catch (e) { return '' + Math.round(n || 0); } },
    num: function (n) { try { return new Intl.NumberFormat().format(n); } catch (e) { return '' + n; } },
    pct: function (n, d) { var f = Math.pow(10, d == null ? 1 : d); return (Math.round((n || 0) * f) / f) + '%'; },
    // Wrap a long chart label onto multiple lines (Chart.js accepts an array
    // of strings as a multi-line label). Returns the string unchanged if short.
    wrap: function (label, max) {
      max = max || 16;
      var s = String(label == null ? '' : label);
      if (s.length <= max) return s;
      var words = s.split(' '), lines = [], cur = '';
      words.forEach(function (w) {
        if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur.trim()); cur = w; }
        else cur += ' ' + w;
      });
      if (cur.trim()) lines.push(cur.trim());
      return lines;
    },
  };

  /* ---------- IDG_NOTICE: sandbox-safe replacement for alert()/confirm() ----
     (native dialogs throw / are blocked inside sandboxed iframes). */
  W.IDG_NOTICE = function (title, body) {
    try {
      var m = document.getElementById('idg-notice');
      if (!m) {
        m = document.createElement('div');
        m.id = 'idg-notice';
        m.className = 'idg-modal';
        m.innerHTML = '<div class="idg-modal-box"><h3></h3><p></p><div style="text-align:end"><button>OK</button></div></div>';
        document.body.appendChild(m);
        m.querySelector('button').addEventListener('click', function () { m.classList.remove('open'); });
      }
      m.querySelector('h3').textContent = title || '';
      m.querySelector('p').textContent = body || '';
      m.classList.add('open');
    } catch (e) { /* noop */ }
  };

  /* ---------- IDG_TABS: auto-wire tab dashboards + chart reflow ----------
     Markup convention (no per-chart script needed):
       <div class="tabs" data-tab-group="g"><button class="tab-btn" data-tab="a">…</button>…</div>
       <div class="tab-content" data-tab-group="g" data-tab="a">…</div> …
     The first pane of each group is shown; switching reveals the target pane
     and resizes any charts inside it (charts created in hidden panes render at
     0px until first shown). */
  var raf = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : function (cb) { return setTimeout(cb, 16); };
  var IDG_TABS = {
    // Resize charts after layout has flushed. Charts created in a display:none
    // (or 0-width grid) container have a 0-size canvas; we wait two animation
    // frames so the revealed container has real dimensions, then resize+redraw.
    reflow: function (root) {
      if (!W.Chart) return;
      raf(function () { raf(function () {
        (root || document).querySelectorAll('canvas').forEach(function (c) {
          var ch = W.Chart.getChart(c);
          if (ch) { try { ch.resize(); ch.update('none'); } catch (e) { /* noop */ } }
        });
      }); });
    },
    activate: function (group, tab) {
      document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) {
        b.classList.toggle('tab-active', b.getAttribute('data-tab') === tab);
      });
      document.querySelectorAll('.tab-content[data-tab-group="' + group + '"]').forEach(function (p) {
        var on = p.getAttribute('data-tab') === tab;
        p.classList.toggle('active', on);
        if (on) IDG_TABS.reflow(p);
      });
    },
    init: function () {
      var groups = {};
      document.querySelectorAll('.tabs[data-tab-group]').forEach(function (nav) {
        var g = nav.getAttribute('data-tab-group');
        nav.querySelectorAll('.tab-btn').forEach(function (btn) {
          if (groups[g] == null) groups[g] = btn.getAttribute('data-tab');
          btn.addEventListener('click', function () { IDG_TABS.activate(g, btn.getAttribute('data-tab')); });
        });
      });
      // Ensure exactly one active pane per group on load.
      Object.keys(groups).forEach(function (g) {
        var any = document.querySelector('.tab-content[data-tab-group="' + g + '"].active');
        IDG_TABS.activate(g, any ? any.getAttribute('data-tab') : groups[g]);
      });
    },
  };
  W.IDG_TABS = IDG_TABS;

  /* On load: make charts theme-aware (light text on the dark palette) and wire
     up any tab dashboards. Registered here (before the model's own
     DOMContentLoaded chart script) so it runs first. */
  function onReady() {
    try {
      if (W.Chart) {
        var cs = getComputedStyle(document.documentElement);
        var txt = (cs.getPropertyValue('--c-text') || '').trim();
        var bdr = (cs.getPropertyValue('--c-border') || '').trim();
        if (txt) W.Chart.defaults.color = txt;
        if (bdr) W.Chart.defaults.borderColor = bdr;
      }
    } catch (e) { /* noop */ }
    try { IDG_TABS.init(); } catch (e) { /* noop */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
