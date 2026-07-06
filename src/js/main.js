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
    U.$('#btn-edit').disabled = busy || !currentResult;
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

  /* ---------- keep-last-report (IndexedDB; a refresh no longer loses a
     multi-minute generation). Outputs are still not archived — only the most
     recent result is kept, and "Clear everything" wipes it. ---------- */

  function idb() {
    return new Promise((resolve, reject) => {
      const req = global.indexedDB.open('idg-store', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function idbGet(key) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const rq = tx.objectStore('kv').get(key);
      rq.onsuccess = () => { db.close(); resolve(rq.result); };
      rq.onerror = () => { db.close(); reject(rq.error); };
    });
  }

  async function saveLastResult(res) {
    try {
      await idbSet('lastResult', { html: res.html, rawHtml: res.rawHtml, run: res.run, ts: Date.now() });
    } catch (e) { /* file:// privacy modes / quota — feature degrades silently */ }
  }

  async function offerRestore() {
    try {
      const saved = await idbGet('lastResult');
      if (!saved || !saved.html || currentResult) return;
      const div = global.document.createElement('div');
      div.className = 'banner warn';
      div.textContent = t('restore_last', { date: U.fmtDate(saved.ts) }) + ' ';
      const btn = global.document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn small';
      btn.textContent = t('btn_restore');
      btn.addEventListener('click', () => {
        currentResult = { html: saved.html, rawHtml: saved.rawHtml, run: saved.run };
        showResult(saved.html);
        div.remove();
      });
      div.appendChild(btn);
      U.$('#warnings').appendChild(div);
    } catch (e) { /* noop */ }
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
      saveLastResult(res);
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
    U.$('#btn-pdf').disabled = false;
    U.$('#btn-static').disabled = false;
    U.$('#btn-copy').disabled = false;
    U.$('#btn-edit').disabled = false;
    U.$('#btn-regen').disabled = false;
    U.$('#regen-input').disabled = false;
  }

  /* ---------- in-preview edit mode ----------
     Lets the user make small manual changes without a full regeneration:
     click any text to edit it in place, hover an element and remove it with
     ✕ (or remove its whole section), with undo for deletions. The editor is
     a script injected into the report inside the SAME sandboxed iframe
     (allow-scripts, NO same-origin — model HTML still can't reach the
     generator's storage/keys); the edited document is handed back via
     postMessage, editor artifacts stripped. On Done the result replaces
     currentResult.html, so Download / PDF / Static HTML / Copy all export
     the edited report, and it becomes the saved last report. Deleting a
     chart is safe: chart init code is per-canvas try/catch'd with
     existence guards, so remaining charts still render on reload. */

  let editing = false;

  const EDITOR_RUNTIME =
    '<script id="idg-editor-rt">(function(){\n' +
    'var undoStack=[];\n' +
    'var SEL="section.card,.chart-box,.kpi,.entity-card,.stat,.callout,.timeline-item,.num-item,.flow-step,.flow,.table-wrap,.tabs,.tab-content,.hero,.footer,figure,h1,h2,h3,h4,p,li";\n' +
    'var TXT="h1,h2,h3,h4,h5,h6,p,li,td,th,figcaption,.value,.label,.subtitle,.sv,.sl,.rl,.t-date,.t-title,.t-body,.step-title,.tab-btn,.pill,.badge,.ct";\n' +
    'var css=document.createElement("style");css.id="idg-editor-css";\n' +
    'css.textContent=".idg-hov{outline:2px dashed #F43F5E !important;outline-offset:2px;}"+\n' +
    '"#idg-delbar{position:fixed;z-index:99999;display:none;gap:4px;}"+\n' +
    '"#idg-delbar button{background:#F43F5E;color:#fff;border:none;border-radius:6px;padding:2px 9px;font:600 12px system-ui;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);}"+\n' +
    '"#idg-delbar button.sec{background:#7C3AED;}"+\n' +
    '"[contenteditable]:focus{outline:2px solid #4F46E5 !important;outline-offset:2px;}";\n' +
    'document.head.appendChild(css);\n' +
    'document.querySelectorAll(TXT).forEach(function(el){el.setAttribute("contenteditable","true");el.setAttribute("spellcheck","false");});\n' +
    'var bar=document.createElement("div");bar.id="idg-delbar";\n' +
    'var rtl=(document.documentElement.getAttribute("dir")||"").toLowerCase()==="rtl";\n' +
    'var bEl=document.createElement("button");bEl.id="idg-del-el";bEl.type="button";bEl.textContent="\\u2715";\n' +
    'var bSec=document.createElement("button");bSec.id="idg-del-sec";bSec.type="button";bSec.className="sec";bSec.textContent="\\u2715 "+(rtl?"\\u05DE\\u05E7\\u05D8\\u05E2":"section");\n' +
    'bar.appendChild(bEl);bar.appendChild(bSec);document.body.appendChild(bar);\n' +
    'var current=null,currentSection=null;\n' +
    'function place(el){var r=el.getBoundingClientRect();bar.style.display="flex";bar.style.top=Math.max(2,r.top-10)+"px";\n' +
    'if(rtl){bar.style.left="";bar.style.right=Math.max(2,window.innerWidth-r.right)+"px";}else{bar.style.right="";bar.style.left=Math.max(2,r.left)+"px";}}\n' +
    'document.addEventListener("mouseover",function(e){if(bar.contains(e.target))return;\n' +
    'var t=e.target.closest?e.target.closest(SEL):null;\n' +
    'if(current&&current!==t)current.classList.remove("idg-hov");\n' +
    'current=t;\n' +
    'if(t){t.classList.add("idg-hov");var sec=t.closest("section.card");currentSection=(sec&&sec!==t)?sec:null;bSec.style.display=currentSection?"":"none";place(t);}\n' +
    'else{bar.style.display="none";}});\n' +
    'function del(el){if(!el)return;undoStack.push({el:el,parent:el.parentNode,next:el.nextSibling});el.remove();bar.style.display="none";\n' +
    'if(current){current.classList.remove("idg-hov");current=null;}currentSection=null;notify();}\n' +
    'bEl.addEventListener("click",function(){del(current);});\n' +
    'bSec.addEventListener("click",function(){del(currentSection);});\n' +
    'function notify(){try{parent.postMessage({__idgEdit:"state",undo:undoStack.length},"*");}catch(e){}}\n' +
    'window.addEventListener("message",function(e){var d=e.data||{};\n' +
    'if(d.__idgEdit==="undo"){var u=undoStack.pop();if(u&&u.parent){try{u.parent.insertBefore(u.el,u.next);}catch(err){}}notify();}\n' +
    'if(d.__idgEdit==="finish"){finish();}});\n' +
    'function finish(){try{\n' +
    'bar.remove();css.remove();\n' +
    'document.querySelectorAll("[contenteditable]").forEach(function(el){el.removeAttribute("contenteditable");el.removeAttribute("spellcheck");});\n' +
    'document.querySelectorAll(".idg-hov").forEach(function(el){el.classList.remove("idg-hov");});\n' +
    'var self=document.getElementById("idg-editor-rt");if(self)self.remove();\n' +
    'var html="<!DOCTYPE html>\\n"+document.documentElement.outerHTML;\n' +
    'parent.postMessage({__idgEdit:"done",html:html},"*");\n' +
    '}catch(err){parent.postMessage({__idgEdit:"error",detail:String(err&&err.message||err)},"*");}}\n' +
    'notify();\n' +
    '})();<\/script>';

  function setEditUI(on) {
    U.$('#edit-tools').hidden = !on;
    U.$('#btn-edit').hidden = on;
    // Exports/regen act on the applied report — disable them mid-edit so
    // they can't grab the un-applied version.
    ['#btn-download', '#btn-pdf', '#btn-static', '#btn-copy', '#btn-regen', '#btn-generate'].forEach((s) => {
      U.$(s).disabled = on;
    });
    U.$('#regen-input').disabled = on;
    U.$('#btn-edit-undo').disabled = true;
  }

  function enterEdit() {
    if (!currentResult || editing) return;
    editing = true;
    IDG.ui.clearBanners();
    IDG.ui.banner('warn', t('edit_hint'));
    setEditUI(true);
    let html = currentResult.html;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, EDITOR_RUNTIME + '</body>') : html + EDITOR_RUNTIME;
    U.$('#result-frame').srcdoc = html;
  }

  function exitEdit(appliedHtml) {
    editing = false;
    setEditUI(false);
    IDG.ui.clearBanners();
    if (appliedHtml) {
      currentResult.html = appliedHtml;
      saveLastResult(currentResult);
      IDG.ui.toast(t('edit_applied'));
    }
    showResult(currentResult.html);
  }

  function wireEditor() {
    const frame = U.$('#result-frame');
    U.$('#btn-edit').addEventListener('click', enterEdit);
    U.$('#btn-edit-cancel').addEventListener('click', () => { if (editing) exitEdit(null); });
    U.$('#btn-edit-done').addEventListener('click', () => {
      if (editing) frame.contentWindow.postMessage({ __idgEdit: 'finish' }, '*');
    });
    U.$('#btn-edit-undo').addEventListener('click', () => {
      if (editing) frame.contentWindow.postMessage({ __idgEdit: 'undo' }, '*');
    });
    global.addEventListener('message', (e) => {
      if (!editing || e.source !== frame.contentWindow) return;
      const d = e.data || {};
      if (d.__idgEdit === 'state') U.$('#btn-edit-undo').disabled = !d.undo;
      else if (d.__idgEdit === 'done' && d.html) exitEdit(d.html);
      else if (d.__idgEdit === 'error') { IDG.ui.toast('✗ ' + (d.detail || 'edit failed')); exitEdit(null); }
    });
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

  /* Export to PDF via the browser's print pipeline (FR-25). The report is
     rendered into a transient sandboxed iframe (allow-scripts allow-modals,
     NO allow-same-origin) so charts draw but the model output still can't
     reach the generator's localStorage/keys (NFR-6); a tiny injected trigger
     calls print() once charts have rendered. "Save as PDF" in the dialog
     yields a script-free, portable, vector report. */
  function exportPdf() {
    if (!currentResult) return;
    // Reveal all tab panes (so a tabbed report prints as one full scroll) and
    // resize charts to their now-visible size before printing.
    const printTrigger =
      '<script>window.addEventListener("load",function(){setTimeout(function(){try{' +
      'document.querySelectorAll(".tab-content").forEach(function(p){p.classList.add("active");p.style.display="block";});' +
      'document.querySelectorAll(".tabs").forEach(function(n){n.style.display="none";});' +
      'if(window.IDG_TABS)window.IDG_TABS.reflow();' +
      'setTimeout(function(){try{window.focus();window.print();}catch(e){}},500);' +
      '}catch(e){try{window.print();}catch(e2){}}},600);});<\/script>';
    let html = currentResult.html;
    if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, printTrigger + '</body>');
    else html += printTrigger;

    const frame = global.document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
    frame.srcdoc = html;
    // Clean up shortly after the print dialog has had time to open.
    frame.addEventListener('load', () => setTimeout(() => frame.remove(), 60000));
    global.document.body.appendChild(frame);
    IDG.ui.toast(t('pdf_hint'));
  }

  /* Export a script-free copy of the report (FR-25). Charts are snapshotted to
     PNG <img> data-URIs and every <script> is removed, so the file has no JS
     and no <canvas> yet looks identical and stays fully offline. The
     conversion runs inside a sandboxed iframe (allow-scripts, NO same-origin),
     so the model output still can't reach the generator's storage/keys
     (NFR-6); it posts the converted HTML back via postMessage.
     Trade-off: chart hover/tooltips become static (no scripts); CSS hover,
     collapsibles and layout are preserved. */
  const STATIC_CONVERTER =
    '<script>(function(){' +
    'function flatten(){' +  // reveal every tab pane + resize charts, so nothing is hidden
    'document.querySelectorAll(".tab-content").forEach(function(p){p.classList.add("active");p.style.display="block";});' +
    'document.querySelectorAll(".tabs").forEach(function(n){n.style.display="none";});' +
    'if(window.IDG_TABS)window.IDG_TABS.reflow();}' +
    'function run(){try{' +
    'var cs=document.querySelectorAll("canvas");' +
    'for(var i=0;i<cs.length;i++){var c=cs[i],img=document.createElement("img");' +
    'try{img.src=c.toDataURL("image/png");}catch(e){continue;}' +
    'img.style.cssText=(c.getAttribute("style")||"")+";max-width:100%;height:auto;display:block;";' +
    'if(c.className)img.className=c.className;img.alt="";' +
    'if(c.parentNode)c.parentNode.replaceChild(img,c);}' +
    'var ss=document.querySelectorAll("script");for(var j=0;j<ss.length;j++){if(ss[j].parentNode)ss[j].parentNode.removeChild(ss[j]);}' +
    'var html="<!DOCTYPE html>\\n"+document.documentElement.outerHTML;' +
    'parent.postMessage({__idgStatic:1,html:html},"*");' +
    '}catch(e){parent.postMessage({__idgStatic:1,error:String(e&&e.message||e)},"*");}}' +
    'function go(){flatten();setTimeout(run,500);}' +  // let reflow redraw before snapshot
    'if(document.readyState==="complete")setTimeout(go,1000);else window.addEventListener("load",function(){setTimeout(go,1000);});' +
    '})();<\/script>';

  function exportStaticHtml() {
    if (!currentResult) return;
    let html = currentResult.html;
    html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, STATIC_CONVERTER + '</body>') : html + STATIC_CONVERTER;

    const frame = global.document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');     // opaque origin: no key access
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1024px;height:768px;border:0;opacity:0;pointer-events:none;';

    let done = false;
    const cleanup = () => { window.removeEventListener('message', onMsg); if (frame.parentNode) frame.remove(); };
    const onMsg = (e) => {
      if (e.source !== frame.contentWindow || !e.data || !e.data.__idgStatic) return;
      if (done) return;
      done = true;
      if (e.data.error || !e.data.html) {
        IDG.ui.toast('✗ ' + (e.data.error || 'export failed'));
        cleanup();
        return;
      }
      const name = `${U.sanitizeBaseName(currentResult.run.source)}-infographic-${U.fileStamp()}-static.html`;
      U.downloadBlob(name, 'text/html;charset=utf-8', e.data.html);
      const leftover = IDG.post.lintExternal(e.data.html).length;
      IDG.ui.toast(t('static_done') + (leftover ? ' ⚠' : ''));
      cleanup();
    };
    window.addEventListener('message', onMsg);
    setTimeout(() => { if (!done) { done = true; IDG.ui.toast('✗'); cleanup(); } }, 20000);
    IDG.ui.toast(t('static_working'));
    global.document.body.appendChild(frame);
    frame.srcdoc = html;
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
    U.$('#btn-pdf').addEventListener('click', exportPdf);
    U.$('#btn-static').addEventListener('click', exportStaticHtml);
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

  function init() {
    // The chart bundle already ran as a real <script> (Chart is global for the
    // dashboard — no runtime code evaluation). We read that same element's
    // source to inject the identical, pinned library into reports (FR-23).
    IDG.assets = Object.assign({ CHART_SRC: '', BASE_CSS: '', FONT_CSS: '' }, global.IDG_ASSETS);
    const bundleEl = global.document.getElementById('idg-chart-bundle');
    if (bundleEl) IDG.assets.CHART_SRC = bundleEl.textContent;
    IDG.store.load();
    applyLanguage();
    IDG.ui.wireCommon();
    wireIngestion();
    wireResult();
    wireEditor();
    IDG.ui.renderPaletteRow();
    IDG.ui.renderEndpoint();
    IDG.ui.statusBar.render();
    U.$('#btn-lang').addEventListener('click', () => {
      IDG.store.state.ui.lang = IDG.i18n.lang === 'he' ? 'en' : 'he';
      IDG.store.save();
      applyLanguage();
    });
    offerRestore();
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
