/* IDG.extract — file ingestion & text extraction (FR-1x).
   .docx via the vendored mammoth.js; .txt/.md/paste directly. Legacy .doc is
   detected by its OLE2 magic bytes and rejected with guidance (FR-12). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});

  const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const ZIP_MAGIC = [0x50, 0x4b]; // "PK" — docx is a zip

  function hasMagic(bytes, magic) {
    return magic.every((b, i) => bytes[i] === b);
  }

  /* Detect dominant script → language + direction (spec §2 shell row). */
  function detectLanguage(text) {
    let he = 0, ar = 0, latin = 0;
    const sample = String(text || '').slice(0, 20000);
    for (let i = 0; i < sample.length; i++) {
      const c = sample.charCodeAt(i);
      if (c >= 0x0590 && c <= 0x05ff) he++;
      else if (c >= 0x0600 && c <= 0x06ff) ar++;
      else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++;
    }
    const total = he + ar + latin || 1;
    if (he / total > 0.25) return { lang: 'he', dir: 'rtl' };
    if (ar / total > 0.25) return { lang: 'ar', dir: 'rtl' };
    return { lang: 'en', dir: 'ltr' };
  }

  function countWords(text) {
    const m = String(text || '').trim().match(/[^\s]+/g);
    return m ? m.length : 0;
  }

  /* Parse mammoth's HTML to structured doc: text, heading outline, tables as
     arrays (FR-11) — tables stay structured so the model can chart them. */
  function structureFromHtml(html) {
    const doc = new global.DOMParser().parseFromString(html, 'text/html');
    const headings = [];
    const tables = [];
    const lines = [];

    doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,table').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((c) => c.textContent.trim())
        ).filter((r) => r.length);
        if (rows.length) {
          tables.push(rows);
          lines.push(rows.map((r) => r.join(' | ')).join('\n'));
        }
        return;
      }
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (/^h[1-6]$/.test(tag)) {
        headings.push({ level: Number(tag[1]), text });
        lines.push('\n' + '#'.repeat(Number(tag[1])) + ' ' + text);
      } else if (tag === 'li') {
        lines.push('- ' + text);
      } else {
        lines.push(text);
      }
    });

    return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), headings, tables };
  }

  /* Lightweight structure pass for md/txt/paste. */
  function structureFromPlain(text, isMarkdown) {
    const headings = [];
    const tables = [];
    const src = String(text || '').replace(/\r\n?/g, '\n');
    if (isMarkdown) {
      const lines = src.split('\n');
      let tbl = null;
      for (const line of lines) {
        const h = line.match(/^(#{1,6})\s+(.+)/);
        if (h) headings.push({ level: h[1].length, text: h[2].trim() });
        if (/^\s*\|.+\|\s*$/.test(line)) {
          const cells = line.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());
          if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator row
          (tbl = tbl || []).push(cells);
        } else if (tbl) { if (tbl.length > 1) tables.push(tbl); tbl = null; }
      }
      if (tbl && tbl.length > 1) tables.push(tbl);
    }
    return { text: src.trim(), headings, tables };
  }

  function buildResult(source, structured) {
    const langInfo = detectLanguage(structured.text);
    return {
      sourceName: source,
      text: structured.text,
      headings: structured.headings,
      tables: structured.tables,
      stats: {
        words: countWords(structured.text),
        headings: structured.headings.length,
        tables: structured.tables.length,
        chars: structured.text.length,
        lang: langInfo.lang,
        dir: langInfo.dir,
      },
    };
  }

  const extract = {
    detectLanguage,
    countWords,
    structureFromPlain,

    /* err.code: 'legacy-doc' | 'too-big' | 'unsupported' | 'empty' | 'extract' */
    async fromFile(file, capMB) {
      const cap = (capMB || 10) * 1024 * 1024;
      if (file.size > cap) {
        const e = new Error('too big'); e.code = 'too-big'; throw e;
      }
      const name = file.name || 'document';
      const ext = (name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase() || '';
      const buf = await file.arrayBuffer();
      const head = new Uint8Array(buf.slice(0, 8));

      if (hasMagic(head, OLE2_MAGIC)) {           // FR-12: legacy .doc
        const e = new Error('legacy doc'); e.code = 'legacy-doc'; throw e;
      }

      if (ext === 'docx' || hasMagic(head, ZIP_MAGIC)) {
        try {
          const res = await global.mammoth.convertToHtml({ arrayBuffer: buf });
          const structured = structureFromHtml(res.value || '');
          if (!structured.text) { const e = new Error('empty'); e.code = 'empty'; throw e; }
          return buildResult(name, structured);
        } catch (err) {
          if (err.code) throw err;
          const e = new Error(err.message || String(err)); e.code = 'extract'; throw e;
        }
      }

      if (ext === 'txt' || ext === 'md' || ext === 'markdown' ||
          (file.type || '').startsWith('text/')) {
        const text = new global.TextDecoder('utf-8').decode(buf);
        const structured = structureFromPlain(text, ext === 'md' || ext === 'markdown');
        if (!structured.text) { const e = new Error('empty'); e.code = 'empty'; throw e; }
        return buildResult(name, structured);
      }

      const e = new Error('unsupported'); e.code = 'unsupported'; throw e;
    },

    fromPastedText(text) {
      const structured = structureFromPlain(text, true);
      if (!structured.text) { const e = new Error('empty'); e.code = 'empty'; throw e; }
      return buildResult('pasted-text', structured);
    },
  };

  IDG.extract = extract;
})(typeof window !== 'undefined' ? window : globalThis);
