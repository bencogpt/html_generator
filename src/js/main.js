/* IDG.main — application boot and the generate/preview/export flow (§6 screen 1). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const U = IDG.util;
  const t = (k, v) => IDG.i18n.t(k, v);

  let currentExtraction = null;
  let currentResult = null;     // { html, rawHtml, run }
  let abortCtl = null;
  let elapsedTimer = null;

  /* ---------- language ---------- */

  function applyLanguage() {
    const pref = IDG.store.state.ui.lang;
    IDG.i18n.set(pref === 'auto' ? IDG.i18n.detect() : pref);
    const doc = global.document;
    doc.documentElement.lang = IDG.i18n.lang;
    doc.documentElement.dir = IDG.i18n.dir;
    IDG.i18n.apply();
    U.$('#btn-lang').textContent = t('btn_lang');
    refreshDropSub();
    IDG.ui.renderEndpoint();
    IDG.ui.statusBar.render();
  }

  function refreshDropSub() {
    U.$('#drop-sub').textContent = t('drop_sub', { cap: IDG.store.state.output.fileCapMB });
  }

  /* ---------- ingestion (FR-1x) ---------- */

  function errMessage(err) {
    switch (err.code) {
      case 'legacy-doc': return t('err_doc_legacy');         // FR-12
      case 'too-big': return t('err_too_big', { cap: IDG.store.state.output.fileCapMB });
      case 'unsupported': return t('err_unsupported');
      case 'empty': return t('err_empty_doc');
      case 'extract': return t('err_extract', { msg: err.message });
      case 'no-profile': return t('err_no_profile');
      case 'cancelled': return t('err_cancelled');
      case 'timeout': return t('err_timeout', { sec: (IDG.store.activeProfile || {}).timeoutSec || 300 });
      case 'network': return t('err_network');
      default:
        return err.status ? t('err_http', { status: err.status }) : (err.message || String(err));
    }
  }

  async function ingestFile(file) {
    IDG.ui.clearBanners();
    try {
      const ext = await IDG.extract.fromFile(file, IDG.store.state.output.fileCapMB);
      setExtraction(ext);
      U.$('#file-chip-name').textContent = `${file.name} · ${U.fmtBytes(file.size)}`;
      U.$('#file-chip').hidden = false;
    } catch (err) {
      clearExtraction();
      IDG.ui.banner('error', errMessage(err));
    }
  }

  function setExtraction(ext) {
    currentExtraction = ext;
    const chips = U.$('#stats-chips');
    chips.innerHTML = '';
    const langName = t('lang_' + ext.stats.lang) || ext.stats.lang;
    const items = [
      [t('stat_words'), U.fmtInt(ext.stats.words)],
      [t('stat_headings'), U.fmtInt(ext.stats.headings)],
      [t('stat_tables'), U.fmtInt(ext.stats.tables)],
      [t('stat_lang'), `${langName} (${ext.stats.dir})`],
    ];
    for (const [l, v] of items) {
      const c = global.document.createElement('span');
      c.className = 'chip';
      c.innerHTML = `<b>${U.esc(v)}</b> ${U.esc(l)}`;
      chips.appendChild(c);
    }
    const pv = U.$('#preview-text');
    pv.textContent = ext.text.slice(0, 6000) + (ext.text.length > 6000 ? '\n…' : '');
    pv.dir = ext.stats.dir;
    U.$('#preview-card').hidden = false;
    U.$('#btn-generate').disabled = false;
  }

  function clearExtraction() {
    currentExtraction = null;
    U.$('#preview-card').hidden = true;
    U.$('#file-chip').hidden = true;
    U.$('#btn-generate').disabled = true;
    U.$('#file-input').value = '';
  }

  function wireIngestion() {
    const dz = U.$('#dropzone');
    const fi = U.$('#file-input');
    dz.addEventListener('click', () => fi.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add('drag');
    }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove('drag');
    }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) ingestFile(f);
    });
    fi.addEventListener('change', () => { if (fi.files[0]) ingestFile(fi.files[0]); });
    U.$('#btn-clear-file').addEventListener('click', clearExtraction);
    U.$('#btn-paste-use').addEventListener('click', () => {
      IDG.ui.clearBanners();
      try {
        setExtraction(IDG.extract.fromPastedText(U.$('#paste-area').value));
        U.$('#file-chip').hidden = true;
      } catch (err) {
        IDG.ui.banner('error', errMessage(err));
      }
    });
  }

  /* ---------- generation (FR-2x) ---------- */

  function setBusy(busy) {
    U.$('#btn-generate').hidden = busy;
    U.$('#btn-cancel').hidden = !busy;
    U.$('#progress').hidden = !busy;
    U.$('#btn-regen').disabled = busy || !currentResult;
    U.$('#regen-input').disabled = busy || !currentResult;
    if (!busy) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
  }

  function progressHandler() {
    const started = Date.now();
    let stage = { key: 'pass_main', n: 1, total: 1 };
    let tokens = 0;
    const text = U.$('#progress-text');
    const render = () => {
      const sec = Math.round((Date.now() - started) / 1000);
      let s = '';
      if (stage.total > 1) s = t('progress_pass', { n: stage.n, total: stage.total, name: t(stage.key) }) + ' · ';
      s += tokens > 0 ? t('progress_streaming', { tok: U.fmtInt(tokens), sec }) : t('progress_connecting');
      text.textContent = s;
    };
    clearInterval(elapsedTimer);
    elapsedTimer = setInterval(render, 1000);
    render();
    return (kind, info) => {
      if (kind === 'summarize') { stage = { key: 'pass_summarize', n: info.n, total: info.total }; tokens = 0; }
      else if (kind === 'main') { stage = { key: 'pass_main', n: stage.total > 1 ? stage.total : 1, total: stage.total }; tokens = 0; }
      else if (kind === 'repair') { stage = { key: 'pass_repair', n: 1, total: 1 }; tokens = 0; }
      else if (kind === 'stream') tokens = info.tokens;
      render();
    };
  }

  async function generate(feedback) {
    if (!currentExtraction) return;
    IDG.ui.clearBanners();
    abortCtl = new AbortController();
    setBusy(true);
    try {
      const res = await IDG.pipeline.run(currentExtraction, {
        signal: abortCtl.signal,
        onProgress: progressHandler(),
        feedback: feedback || null,
        prevRawHtml: feedback && currentResult ? currentResult.rawHtml : null,
      });
      currentResult = res;
      showResult(res.html);
      for (const w of res.warnings) IDG.ui.banner('warn', t(w.key, w.vars));
      IDG.ui.statusBar.setDot('green');
    } catch (err) {
      if (err.code === 'cancelled') {
        IDG.ui.banner('warn', t('err_cancelled'));
      } else {
        IDG.ui.banner('error', errMessage(err), (err.detail || err.stack || '')); // NFR-8: details expander
        const hints = IDG.llm.hintsFor(err.code, IDG.store.activeProfile);
        if (hints.length) IDG.ui.banner('warn', hints.join(' '));
        IDG.ui.statusBar.setDot('red');
      }
    } finally {
      setBusy(false);
      IDG.ui.statusBar.render();
    }
  }

  function showResult(html) {
    const frame = U.$('#result-frame');
    frame.srcdoc = html;       // sandboxed: allow-scripts only (NFR-6)
    frame.hidden = false;
    U.$('#result-placeholder').hidden = true;
    U.$('#btn-download').disabled = false;
    U.$('#btn-copy').disabled = false;
    U.$('#btn-regen').disabled = false;
    U.$('#regen-input').disabled = false;
  }

  /* ---------- export (FR-25) ---------- */

  function downloadName() {
    const src = currentResult ? currentResult.run.source : 'document';
    return `${U.sanitizeBaseName(src)}-infographic-${U.fileStamp()}.html`;
  }

  async function copyResult() {
    if (!currentResult) return;
    try {
      await global.navigator.clipboard.writeText(currentResult.html);
      IDG.ui.toast(t('copied'));
    } catch (e) {
      // file:// or permission-less context — fall back to a hidden textarea.
      const ta = global.document.createElement('textarea');
      ta.value = currentResult.html;
      global.document.body.appendChild(ta);
      ta.select();
      try { global.document.execCommand('copy'); IDG.ui.toast(t('copied')); }
      catch (e2) { IDG.ui.toast('✗'); }
      ta.remove();
    }
  }

  function wireResult() {
    U.$('#btn-cancel').addEventListener('click', () => { if (abortCtl) abortCtl.abort(); });
    U.$('#btn-generate').addEventListener('click', () => generate(null));
    U.$('#btn-regen').addEventListener('click', () => {
      generate(U.$('#regen-input').value.trim() || 'Regenerate with a different layout.');
    });
    U.$('#regen-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !U.$('#btn-regen').disabled) U.$('#btn-regen').click();
    });
    U.$('#btn-download').addEventListener('click', () => {
      if (currentResult) U.downloadBlob(downloadName(), 'text/html;charset=utf-8', currentResult.html);
    });
    U.$('#btn-copy').addEventListener('click', copyResult);
    U.$('#btn-desktop').addEventListener('click', () => {
      U.$('#result-frame').classList.remove('mobile');
      U.$('#btn-desktop').classList.add('seg-on');
      U.$('#btn-mobile').classList.remove('seg-on');
    });
    U.$('#btn-mobile').addEventListener('click', () => {
      U.$('#result-frame').classList.add('mobile');
      U.$('#btn-mobile').classList.add('seg-on');
      U.$('#btn-desktop').classList.remove('seg-on');
    });
  }

  /* ---------- boot ---------- */

  function installChart() {
    // Vendored Chart.js is shipped once, as a string (it is also injected into
    // every generated artifact). Evaluate it here for the dashboard charts.
    // This evaluates our own pinned asset, never model output (NFR-6).
    try { new Function(IDG.assets.CHART_SRC)(); } catch (e) { /* dashboard charts disabled */ }
  }

  function init() {
    IDG.assets = global.IDG_ASSETS || { CHART_SRC: '', BASE_CSS: '', FONT_CSS: '' };
    installChart();
    IDG.store.load();
    applyLanguage();
    IDG.ui.wireCommon();
    wireIngestion();
    wireResult();
    IDG.ui.renderPaletteRow();
    IDG.ui.renderEndpoint();
    IDG.ui.statusBar.render();
    U.$('#btn-lang').addEventListener('click', () => {
      IDG.store.state.ui.lang = IDG.i18n.lang === 'he' ? 'en' : 'he';
      IDG.store.save();
      applyLanguage();
    });
  }

  IDG.main = { init, refreshDropSub, generate };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
