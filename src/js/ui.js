/* IDG.ui — DOM wiring for modals, settings, metrics dashboard, status bar
   and common widgets. Pipeline-facing logic lives in main.js. */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const U = IDG.util;
  const t = (k, v) => IDG.i18n.t(k, v);

  /* ---------- common widgets ---------- */

  let toastTimer = null;
  function toast(msg) {
    const el = U.$('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function openModal(id) { U.$('#' + id).hidden = false; }
  function closeModal(id) { U.$('#' + id).hidden = true; }

  function wireTabs(containerSel) {
    const container = U.$(containerSel);
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      U.$$('.tab', container).forEach((b) => b.classList.toggle('tab-on', b === btn));
      const modal = container.closest('.modal');
      U.$$('.tab-pane', modal).forEach((p) => { p.hidden = p.id !== btn.dataset.tab; });
      if (btn.dataset.tab === 'tab-dash') metricsUI.renderDashboard();
    });
  }

  /* ---------- status bar (§6 item 4) ---------- */

  const statusBar = {
    dot: 'gray',
    setDot(state) { this.dot = state; this.render(); },
    render() {
      const p = IDG.store.activeProfile;
      U.$('#sb-profile').textContent = p ? p.name : t('sb_no_profile');
      U.$('#sb-model').textContent = p && p.model ? p.model : '';
      const runs = IDG.metrics.load();
      const last = runs[runs.length - 1];
      U.$('#sb-last').textContent = last && last.tokensIn != null
        ? `${t('sb_last')} ${U.fmtInt(last.tokensIn)} → ${U.fmtInt(last.tokensOut)}${last.estimated ? '*' : ''}`
        : '';
      const dotEl = U.$('#sb-dot');
      dotEl.className = 'dot dot-' + this.dot;
    },
  };

  /* ---------- main-screen pieces ---------- */

  /* Shared palette picker: labeled cards that preview the actual colors
     (hero gradient bar + the real chart-series dots) + name + short desc, so
     it's obvious what each produces. Used on the main screen and in Settings. */
  function renderPalettePicker(container, current, onPick) {
    container.innerHTML = '';
    container.classList.add('pal-grid');
    for (const [id, pal] of Object.entries(IDG.store.PALETTES)) {
      const card = global.document.createElement('button');
      card.type = 'button';
      card.className = 'pal-card' + (current === id ? ' on' : '');
      card.setAttribute('data-palette', id);
      card.setAttribute('aria-pressed', current === id ? 'true' : 'false');
      const dots = (pal.series || []).slice(0, 6)
        .map((c) => `<span class="pc-dot" style="background:${c}"></span>`).join('');
      card.innerHTML =
        `<div class="pc-bar" style="background:linear-gradient(135deg, ${pal.gradA}, ${pal.gradB})"></div>` +
        `<div class="pc-dots">${dots}</div>` +
        `<div class="pc-name">${U.esc(pal.label)}${pal.dark ? '<span class="pc-dark">DARK</span>' : ''}</div>` +
        `<div class="pc-desc">${U.esc(pal.desc || '')}</div>`;
      card.addEventListener('click', () => onPick(id));
      container.appendChild(card);
    }
  }

  function renderPaletteRow() {
    renderPalettePicker(U.$('#palette-row'), IDG.store.state.output.palette, (id) => {
      IDG.store.state.output.palette = id;
      IDG.store.save();
      renderPaletteRow();
    });
  }

  /* NFR-7: visible indicator of the endpoint that will receive the document. */
  function renderEndpoint() {
    const p = IDG.store.activeProfile;
    const el = U.$('#endpoint-url');
    if (p && p.baseUrl) {
      el.textContent = p.baseUrl + (p.adapter === 'openai' ? '/chat/completions' : '') +
        (p.model ? '  ·  ' + p.model : '');
      el.classList.remove('missing');
    } else {
      el.textContent = t('endpoint_none');
      el.classList.add('missing');
    }
  }

  function banner(type, text, details) {
    const div = global.document.createElement('div');
    div.className = 'banner ' + type;
    div.textContent = text;
    if (details) {
      const tog = global.document.createElement('div');
      tog.className = 'details-toggle';
      tog.textContent = 'details';
      const pre = global.document.createElement('pre');
      pre.textContent = details;
      pre.hidden = true;
      tog.addEventListener('click', () => { pre.hidden = !pre.hidden; });
      div.appendChild(tog);
      div.appendChild(pre);
    }
    U.$('#warnings').appendChild(div);
    return div;
  }
  function clearBanners() { U.$('#warnings').innerHTML = ''; }

  /* ============================================================
     Settings modal (FR-3x)
     ============================================================ */

  const settingsUI = {
    buffer: null,        // deep copy of state while editing
    currentId: null,     // profile being edited

    open() {
      const s = IDG.store.state;
      this.buffer = JSON.parse(JSON.stringify(s));
      // carry effective (possibly session-only) keys into the edit buffer
      this.buffer.profiles.forEach((p) => { p.apiKey = IDG.store.apiKeyFor(s.profiles.find((q) => q.id === p.id)); });
      this.currentId = this.buffer.activeProfileId;
      this.renderProfileSelect();
      this.bindProfileFields();
      this.bindGlobalFields();
      U.$('#settings-msg').textContent = '';
      U.$('#test-result').textContent = '';
      U.$('#diag-box').hidden = true;
      openModal('settings-modal');
    },

    profile() {
      return this.buffer.profiles.find((p) => p.id === this.currentId) || this.buffer.profiles[0];
    },

    renderProfileSelect() {
      const sel = U.$('#p-select');
      sel.innerHTML = '';
      for (const p of this.buffer.profiles) {
        const o = global.document.createElement('option');
        o.value = p.id;
        o.textContent = p.name + (p.id === this.buffer.activeProfileId ? ' ✓' : '');
        sel.appendChild(o);
      }
      sel.value = this.currentId;
    },

    bindProfileFields() {
      const p = this.profile();
      this.currentId = p.id;
      U.$('#p-name').value = p.name;
      U.$('#p-adapter').value = p.adapter;
      U.$('#p-baseurl').value = p.baseUrl;
      U.$('#p-model').value = p.model;
      U.$('#p-key').value = p.apiKey || '';
      U.$('#p-persist-key').checked = !!p.persistKey;
      U.$('#p-headers').value = p.extraHeaders || '';
      U.$('#p-timeout').value = p.timeoutSec;
      U.$('#p-retries').value = p.maxRetries;
      U.$('#p-temp').value = p.temperature;
      U.$('#p-maxtok').value = p.maxTokens;
      U.$('#p-ctx').value = p.contextWindow;
      U.$('#p-stream').checked = !!p.stream;
      U.$('#p-price-in').value = p.priceIn ?? '';
      U.$('#p-price-out').value = p.priceOut ?? '';
      U.$('#c-template').value = p.custom.requestTemplate;
      U.$('#c-textpath').value = p.custom.textPath;
      U.$('#c-inpath').value = p.custom.tokensInPath;
      U.$('#c-outpath').value = p.custom.tokensOutPath;
      U.$('#custom-fields').hidden = p.adapter !== 'custom';
    },

    readProfileFields() {
      const p = this.profile();
      p.name = U.$('#p-name').value.trim() || 'profile';
      p.adapter = U.$('#p-adapter').value;
      p.baseUrl = U.$('#p-baseurl').value.trim().replace(/\/+$/, '');
      p.model = U.$('#p-model').value.trim();
      p.apiKey = U.$('#p-key').value;
      p.persistKey = U.$('#p-persist-key').checked;
      p.extraHeaders = U.$('#p-headers').value;
      p.timeoutSec = Math.max(5, parseInt(U.$('#p-timeout').value, 10) || 300);
      p.maxRetries = Math.max(0, parseInt(U.$('#p-retries').value, 10) || 0);
      p.temperature = Math.max(0, parseFloat(U.$('#p-temp').value));
      if (isNaN(p.temperature)) p.temperature = 0.3;
      p.maxTokens = Math.max(256, parseInt(U.$('#p-maxtok').value, 10) || 8192);
      p.contextWindow = Math.max(2048, parseInt(U.$('#p-ctx').value, 10) || 32768);
      p.stream = U.$('#p-stream').checked;
      p.priceIn = U.$('#p-price-in').value === '' ? null : parseFloat(U.$('#p-price-in').value);
      p.priceOut = U.$('#p-price-out').value === '' ? null : parseFloat(U.$('#p-price-out').value);
      p.custom.requestTemplate = U.$('#c-template').value;
      p.custom.textPath = U.$('#c-textpath').value.trim();
      p.custom.tokensInPath = U.$('#c-inpath').value.trim();
      p.custom.tokensOutPath = U.$('#c-outpath').value.trim();
      return p;
    },

    bindGlobalFields() {
      U.$('#sp-editor').value = this.buffer.systemPrompt || IDG.prompt.DEFAULT_SYSTEM_PROMPT;
      // palette card picker (value held in the hidden #o-palette input)
      const onPickPalette = (id) => {
        this.buffer.output.palette = id;
        U.$('#o-palette').value = id;
        renderPalettePicker(U.$('#o-palette-cards'), id, onPickPalette);
      };
      U.$('#o-palette').value = this.buffer.output.palette;
      renderPalettePicker(U.$('#o-palette-cards'), this.buffer.output.palette, onPickPalette);
      U.$('#o-lang').value = this.buffer.output.langOverride;
      U.$('#o-detail').value = this.buffer.output.detailLevel || 'balanced';
      U.$('#o-maxcharts').value = this.buffer.output.maxCharts;
      U.$('#o-flow').checked = !!this.buffer.output.includeFlow;
      U.$('#o-cap').value = this.buffer.output.fileCapMB;
    },

    readGlobalFields() {
      const ed = U.$('#sp-editor').value;
      this.buffer.systemPrompt = ed.trim() && ed !== IDG.prompt.DEFAULT_SYSTEM_PROMPT ? ed : null;
      this.buffer.output.palette = U.$('#o-palette').value;
      this.buffer.output.langOverride = U.$('#o-lang').value;
      this.buffer.output.detailLevel = U.$('#o-detail').value;
      this.buffer.output.maxCharts = Math.max(0, parseInt(U.$('#o-maxcharts').value, 10) || 3);
      this.buffer.output.includeFlow = U.$('#o-flow').checked;
      this.buffer.output.fileCapMB = Math.max(1, parseInt(U.$('#o-cap').value, 10) || 10);
    },

    save() {
      this.readProfileFields();
      this.readGlobalFields();
      const s = IDG.store.state;
      s.activeProfileId = this.buffer.activeProfileId;
      s.systemPrompt = this.buffer.systemPrompt;
      s.output = this.buffer.output;
      s.profiles = this.buffer.profiles.map((p) => {
        const copy = JSON.parse(JSON.stringify(p));
        if (!copy.persistKey) {
          IDG.store.setSessionKey(copy.id, copy.apiKey);  // FR-34 session-only
          copy.apiKey = '';
        }
        return copy;
      });
      IDG.store.save();
      U.$('#settings-msg').textContent = t('saved');
      statusBar.render();
      renderEndpoint();
      renderPaletteRow();
      IDG.main.refreshDropSub();
    },

    /* FR-31 — test connection with verbatim diagnostics + stack hints. */
    async test() {
      const p = JSON.parse(JSON.stringify(this.readProfileFields()));
      const out = U.$('#test-result');
      const diag = U.$('#diag-box');
      out.className = '';
      out.textContent = t('testing');
      diag.hidden = true;
      try {
        const r = await IDG.llm.testConnection(p);
        out.textContent = t('test_ok', {
          ms: U.fmtMs(r.latencyMs),
          in: U.fmtInt(r.tokensIn), out: U.fmtInt(r.tokensOut),
          est: r.estimated ? t('test_est') : '',
        });
        statusBar.setDot('green');
      } catch (err) {
        out.className = 'err';
        out.textContent = err.status ? t('err_http', { status: err.status }) : t('err_network');
        statusBar.setDot('red');
        U.$('#diag-text').textContent = (err.message || String(err)) + (err.detail ? '\n' + err.detail : '');
        const hints = IDG.llm.hintsFor(err.code, p);
        const ul = U.$('#diag-hints');
        ul.innerHTML = '';
        hints.forEach((h) => {
          const li = global.document.createElement('li');
          li.textContent = h;
          ul.appendChild(li);
        });
        diag.hidden = false;
      }
    },

    async fetchModels() {
      const p = JSON.parse(JSON.stringify(this.readProfileFields()));
      const dl = U.$('#model-list');
      try {
        const models = await IDG.llm.fetchModels(p);
        dl.innerHTML = '';
        models.forEach((m) => {
          const o = global.document.createElement('option');
          o.value = m;
          dl.appendChild(o);
        });
        toast(models.length + ' models');
        if (models.length && !U.$('#p-model').value) U.$('#p-model').value = models[0];
      } catch (err) {
        toast((err.status ? 'HTTP ' + err.status : t('err_network')));
      }
    },

    wire() {
      U.$('#p-select').addEventListener('change', (e) => {
        this.readProfileFields();
        this.currentId = e.target.value;
        this.buffer.activeProfileId = e.target.value; // selecting = activating
        this.bindProfileFields();
        this.renderProfileSelect();
      });
      U.$('#btn-new-profile').addEventListener('click', () => {
        this.readProfileFields();
        const p = IDG.store.defaultProfile();
        p.name = 'Profile ' + (this.buffer.profiles.length + 1);
        this.buffer.profiles.push(p);
        this.currentId = p.id;
        this.buffer.activeProfileId = p.id;
        this.renderProfileSelect();
        this.bindProfileFields();
      });
      U.$('#btn-dup-profile').addEventListener('click', () => {
        const src = this.readProfileFields();
        const p = JSON.parse(JSON.stringify(src));
        p.id = U.uid();
        p.name = src.name + ' (copy)';
        this.buffer.profiles.push(p);
        this.currentId = p.id;
        this.renderProfileSelect();
        this.bindProfileFields();
      });
      U.$('#btn-del-profile').addEventListener('click', () => {
        this.buffer.profiles = this.buffer.profiles.filter((p) => p.id !== this.currentId);
        if (!this.buffer.profiles.length) this.buffer.profiles.push(IDG.store.defaultProfile());
        this.currentId = this.buffer.profiles[0].id;
        if (!this.buffer.profiles.some((p) => p.id === this.buffer.activeProfileId)) {
          this.buffer.activeProfileId = this.currentId;
        }
        this.renderProfileSelect();
        this.bindProfileFields();
      });
      U.$('#p-adapter').addEventListener('change', (e) => {
        U.$('#custom-fields').hidden = e.target.value !== 'custom';
      });
      U.$('#p-preset').addEventListener('change', (e) => {
        const preset = IDG.store.CONN_PRESETS[e.target.value];
        e.target.value = '';
        if (!preset) return;
        const p = this.readProfileFields();
        // Only name a profile from the preset if it still has a default-ish name.
        if (!p.name || /^(Local LLM|profile|Profile \d+)$/i.test(p.name)) p.name = t(preset.nameKey);
        p.adapter = preset.adapter;
        p.baseUrl = preset.baseUrl;
        p.persistKey = preset.persistKey;
        p.stream = preset.stream;
        p.temperature = preset.temperature;
        this.bindProfileFields();
        this.renderProfileSelect();
        U.$('#settings-msg').textContent = t('preset_applied');
      });
      U.$('#btn-key-vis').addEventListener('click', () => {
        const k = U.$('#p-key');
        k.type = k.type === 'password' ? 'text' : 'password';
      });
      U.$('#btn-fetch-models').addEventListener('click', () => this.fetchModels());
      U.$('#btn-test').addEventListener('click', () => this.test());
      U.$('#btn-restore-prompt').addEventListener('click', () => {
        U.$('#sp-editor').value = IDG.prompt.DEFAULT_SYSTEM_PROMPT;
        U.$('#prompt-msg').textContent = t('prompt_restored');
      });
      U.$('#btn-export-profiles').addEventListener('click', () => {
        this.readProfileFields();
        const include = U.$('#export-secrets').checked;
        const tmp = this.buffer.profiles;
        const json = JSON.stringify({ idgProfiles: 1, profiles: tmp.map((p) => {
          const c = JSON.parse(JSON.stringify(p));
          if (!include) c.apiKey = '';
          return c;
        }) }, null, 2);
        U.downloadBlob('idg-profiles.json', 'application/json', json);
      });
      U.$('#btn-import-profiles').addEventListener('click', () => U.$('#import-file').click());
      U.$('#import-file').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          const list = Array.isArray(data) ? data : data.profiles;
          if (!Array.isArray(list)) throw new Error('bad format');
          for (const raw of list) {
            const p = Object.assign(IDG.store.defaultProfile(), raw, { id: U.uid() });
            p.custom = Object.assign(IDG.store.defaultProfile().custom, raw.custom || {});
            this.buffer.profiles.push(p);
          }
          this.renderProfileSelect();
          toast('+' + list.length);
        } catch (err) { toast('import failed: ' + err.message); }
        e.target.value = '';
      });
      U.$('#btn-clear-all').addEventListener('click', () => {
        if (!global.confirm(t('confirm_clear_all'))) return;
        IDG.store.clearAll();
        IDG.metrics.clear();
        closeModal('settings-modal');
        statusBar.render();
        renderEndpoint();
        renderPaletteRow();
        toast('✓');
      });
      U.$('#btn-settings-save').addEventListener('click', () => this.save());
    },
  };

  /* ============================================================
     Performance modal (FR-4x)
     ============================================================ */

  const metricsUI = {
    sortKey: 'ts',
    sortDir: -1,
    charts: { tokens: null, latency: null },

    open() {
      this.renderRuns();
      openModal('metrics-modal');
      if (!U.$('#tab-dash').hidden) this.renderDashboard();
    },

    windowMs() { return parseInt(U.$('#m-window').value, 10) || 0; },

    sortedRuns() {
      const w = this.windowMs();
      const runs = IDG.metrics.load()
        .filter((r) => !w || r.ts >= Date.now() - w)
        .map((r) => Object.assign({ passesN: (r.passes || []).length }, r));
      const k = this.sortKey, d = this.sortDir;
      runs.sort((a, b) => {
        const av = a[k], bv = b[k];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : av > bv ? 1 : 0) * d;
      });
      return runs;
    },

    renderRuns() {
      const runs = this.sortedRuns();
      U.$('#runs-empty').hidden = runs.length > 0;
      U.$('#runs-table').hidden = runs.length === 0;
      U.$$('#runs-table th').forEach((th) => {
        th.classList.toggle('sorted-asc', th.dataset.sort === this.sortKey && this.sortDir === 1);
        th.classList.toggle('sorted-desc', th.dataset.sort === this.sortKey && this.sortDir === -1);
      });
      const tbody = U.$('#runs-tbody');
      tbody.innerHTML = '';
      for (const r of runs) {
        const tr = global.document.createElement('tr');
        const est = r.estimated ? '<span class="est-flag" title="estimated">*</span>' : '';
        tr.innerHTML =
          `<td>${U.esc(U.fmtDate(r.ts))}</td>` +
          `<td title="${U.esc(r.source)}">${U.esc(String(r.source || '').slice(0, 28))}</td>` +
          `<td>${U.esc(r.model || '')}</td>` +
          `<td><span class="status-pill status-${U.esc(r.status)}">${U.esc(t('status_' + r.status))}</span></td>` +
          `<td class="num">${U.fmtInt(r.tokensIn)}${est}</td>` +
          `<td class="num">${U.fmtInt(r.tokensOut)}${est}</td>` +
          `<td class="num">${r.ttftMs != null ? U.fmtMs(r.ttftMs) : '—'}</td>` +
          `<td class="num">${U.fmtMs(r.latencyMs)}</td>` +
          `<td class="num">${r.tokPerSec != null ? r.tokPerSec.toFixed(1) : '—'}</td>` +
          `<td class="num">${r.passesN}</td>` +
          `<td class="num">${r.costEst != null ? r.costEst.toFixed(4) : '—'}</td>`;
        tr.addEventListener('click', () => this.toggleDetails(tr, r));
        tbody.appendChild(tr);
      }
    },

    toggleDetails(tr, r) {
      const next = tr.nextElementSibling;
      if (next && next.classList.contains('run-details-row')) { next.remove(); return; }
      U.$$('.run-details-row', tr.parentElement).forEach((x) => x.remove());
      const dr = global.document.createElement('tr');
      dr.className = 'run-details-row';
      const passes = (r.passes || []).map((p) =>
        `${p.type}: in ${U.fmtInt(p.tokensIn)} / out ${U.fmtInt(p.tokensOut)}${p.estimated ? '*' : ''}, ${U.fmtMs(p.latencyMs)}${p.ttftMs != null ? ', TTFT ' + U.fmtMs(p.ttftMs) : ''}`
      ).join('  ·  ');
      const sizes = r.outputBytes
        ? `${U.fmtBytes(r.outputBytes)} (model ${U.fmtBytes(r.modelBytes)} + injected ${U.fmtBytes(r.injectedBytes)})`
        : '—';
      dr.innerHTML = `<td colspan="11"><b>${U.esc(t('run_details'))}</b> — ` +
        `${U.esc(passes || '—')}<br>` +
        `output: ${U.esc(sizes)} · lint: ${r.lintFound || 0}/${r.lintFixed || 0} · retries: ${r.retries || 0}` +
        `${r.errorCode ? ' · error: ' + U.esc(r.errorCode) : ''}` +
        `${r.extract ? ' · source: ' + U.fmtInt(r.extract.words) + ' words, ' + (r.extract.tables || 0) + ' tables, ' + U.esc(r.extract.lang || '') : ''}` +
        `</td>`;
      tr.after(dr);
    },

    renderDashboard() {
      if (!global.Chart) return;
      const agg = IDG.metrics.aggregates(this.windowMs());
      const cards = [
        [t('agg_runs'), U.fmtInt(agg.count)],
        [t('agg_success'), agg.successRate != null ? Math.round(agg.successRate * 100) + '%' : '—'],
        [t('agg_tokens'), `${U.fmtInt(agg.tokensIn)} / ${U.fmtInt(agg.tokensOut)}${agg.anyEstimated ? '*' : ''}`],
        [t('agg_latency'), `${U.fmtMs(agg.latMean)} / ${U.fmtMs(agg.latMedian)} / ${U.fmtMs(agg.latP95)}`],
        [t('agg_tps'), agg.tpsMean != null ? agg.tpsMean.toFixed(1) + ' tok/s' : '—'],
        [t('agg_cost'), agg.costTotal != null ? agg.costTotal.toFixed(4) : '—'],
      ];
      const grid = U.$('#agg-cards');
      grid.innerHTML = '';
      for (const [l, v] of cards) {
        const d = global.document.createElement('div');
        d.className = 'agg-card';
        d.innerHTML = `<div class="v">${U.esc(v)}</div><div class="l">${U.esc(l)}</div>`;
        grid.appendChild(d);
      }

      const runs = agg.runs.slice().sort((a, b) => a.ts - b.ts);
      const rtl = IDG.i18n.dir === 'rtl';
      const common = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { rtl, textDirection: IDG.i18n.dir, labels: { font: { family: 'Heebo' } } } },
      };

      if (this.charts.tokens) this.charts.tokens.destroy();
      this.charts.tokens = new global.Chart(U.$('#dash-tokens'), {
        type: 'bar',
        data: {
          labels: runs.map((r) => U.fmtDate(r.ts).slice(5)),
          datasets: [
            { label: 'in', data: runs.map((r) => r.tokensIn || 0), backgroundColor: '#93C5FD', stack: 's' },
            { label: 'out', data: runs.map((r) => r.tokensOut || 0), backgroundColor: '#2563EB', stack: 's' },
          ],
        },
        options: Object.assign({}, common, { scales: { x: { stacked: true }, y: { stacked: true } } }),
      });

      const lats = agg.runs.map((r) => r.latencyMs).filter((v) => v != null);
      const max = Math.max(1, ...lats);
      const bins = 8;
      const step = Math.ceil(max / bins / 1000) * 1000 || 1000;
      const counts = new Array(bins).fill(0);
      lats.forEach((v) => { counts[Math.min(bins - 1, Math.floor(v / step))]++; });
      if (this.charts.latency) this.charts.latency.destroy();
      this.charts.latency = new global.Chart(U.$('#dash-latency'), {
        type: 'bar',
        data: {
          labels: counts.map((_, i) => `${(i * step / 1000)}–${((i + 1) * step / 1000)}s`),
          datasets: [{ label: 'runs', data: counts, backgroundColor: '#60A5FA' }],
        },
        options: common,
      });
    },

    wire() {
      U.$$('#runs-table th').forEach((th) => {
        th.addEventListener('click', () => {
          const k = th.dataset.sort;
          if (this.sortKey === k) this.sortDir *= -1;
          else { this.sortKey = k; this.sortDir = -1; }
          this.renderRuns();
        });
      });
      U.$('#m-window').addEventListener('change', () => { this.renderRuns(); this.renderDashboard(); });
      U.$('#btn-export-csv').addEventListener('click', () => {
        U.downloadBlob('idg-metrics-' + U.fileStamp() + '.csv', 'text/csv;charset=utf-8', IDG.metrics.toCSV());
      });
      U.$('#btn-export-json').addEventListener('click', () => {
        U.downloadBlob('idg-metrics-' + U.fileStamp() + '.json', 'application/json', IDG.metrics.toJSON());
      });
      U.$('#btn-clear-hist').addEventListener('click', () => {
        if (!global.confirm(t('confirm_clear_hist'))) return;
        IDG.metrics.clear();
        this.renderRuns();
        this.renderDashboard();
        statusBar.render();
      });
    },
  };

  /* ---------- global wiring shared by modals ---------- */

  function wireCommon() {
    U.$$('.modal-close').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
    U.$$('.modal-overlay').forEach((ov) => ov.addEventListener('mousedown', (e) => {
      if (e.target === ov) ov.hidden = true;
    }));
    global.document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') U.$$('.modal-overlay').forEach((ov) => { ov.hidden = true; });
    });
    wireTabs('#settings-tabs');
    wireTabs('#metrics-tabs');
    settingsUI.wire();
    metricsUI.wire();
    U.$('#btn-settings').addEventListener('click', () => settingsUI.open());
    U.$('#btn-metrics').addEventListener('click', () => metricsUI.open());
  }

  IDG.ui = {
    toast, openModal, closeModal, banner, clearBanners,
    statusBar, renderPaletteRow, renderEndpoint,
    settingsUI, metricsUI, wireCommon,
  };
})(typeof window !== 'undefined' ? window : globalThis);
