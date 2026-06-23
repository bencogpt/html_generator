/* IDG.post — post-processing of the model response (FR-23): strip accidental
   markdown fences, inject vendored assets at the placeholder tokens, lint for
   external resources, build the repair-pass instruction. */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});

  /* Strip markdown fences and any prose before/after the HTML document. */
  function stripFences(text) {
    let s = String(text || '').trim();
    // ```html ... ``` (possibly with chatter around it)
    const fence = s.match(/```(?:html|HTML)?\s*\n([\s\S]*?)\n?\s*```/);
    if (fence && /<html[\s>]|<!doctype/i.test(fence[1])) s = fence[1].trim();
    else s = s.replace(/^```(?:html|HTML|json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    // Drop leading commentary before the doctype/<html>.
    const start = s.search(/<!doctype\s+html|<html[\s>]/i);
    if (start > 0) s = s.slice(start);
    // Drop trailing chatter after </html>.
    const end = s.toLowerCase().lastIndexOf('</html>');
    if (end >= 0) s = s.slice(0, end + 7);
    return s;
  }

  function looksLikeFences(text) {
    return /```/.test(String(text || ''));
  }

  /* Find external resource references (NFR/FR-23 lint). Returns matches. */
  function lintExternal(html) {
    const violations = [];
    const s = String(html || '');
    const patterns = [
      { re: /\s(?:src|href|srcset|poster|data)\s*=\s*["'](?:https?:)?\/\/[^"']*["']/gi, kind: 'attribute' },
      { re: /url\(\s*["']?(?:https?:)?\/\/[^)"']+["']?\s*\)/gi, kind: 'css-url' },
      { re: /@import\s+(?:url\()?\s*["']?https?:[^;)]+/gi, kind: 'css-import' },
      { re: /\bfetch\(\s*["'`]https?:/gi, kind: 'js-fetch' },
      { re: /new\s+XMLHttpRequest|\.open\(\s*["'](?:GET|POST)["']\s*,\s*["']https?:/gi, kind: 'js-xhr' },
    ];
    for (const { re, kind } of patterns) {
      let m;
      while ((m = re.exec(s))) violations.push({ kind, match: m[0].slice(0, 160), index: m.index });
    }
    return violations;
  }

  /* Hard removal of external references (last resort after a failed repair). */
  function stripExternal(html) {
    return String(html || '')
      .replace(/\s(src|href|srcset|poster)\s*=\s*["'](?:https?:)?\/\/[^"']*["']/gi, ' data-removed-external=""')
      .replace(/url\(\s*["']?(?:https?:)?\/\/[^)"']+["']?\s*\)/gi, 'none')
      .replace(/@import\s+(?:url\()?\s*["']?https?:[^;]+;?/gi, '');
  }

  /* Inject vendored chart lib + base CSS + embedded font at the placeholder
     tokens, or before </head> when the model omitted them (FR-23). */
  function injectAssets(html, assets) {
    let s = String(html || '');
    const cssBlock = '<style>\n' + (assets.FONT_CSS ? assets.FONT_CSS + '\n' : '') + assets.BASE_CSS + '\n</style>';
    const palBlock = assets.PALETTE_CSS ? '<style>' + assets.PALETTE_CSS + '</style>' : '';
    // Escape any literal </script in the bundle so it can't close the tag early.
    const libBlock = '<script>\n' + String(assets.CHART_SRC).replace(/<\/script/gi, '<\\/script') + '\n</script>';

    let cssInjected = false, libInjected = false;
    if (s.includes('{{BASE_CSS}}')) { s = s.split('{{BASE_CSS}}').join(cssBlock + palBlock); cssInjected = true; }
    if (s.includes('{{CHART_LIB}}')) { s = s.split('{{CHART_LIB}}').join(libBlock); libInjected = true; }
    const usedTokens = cssInjected || libInjected;

    const missingCss = !cssInjected;
    const missingLib = !libInjected;
    if (missingCss || missingLib) {
      const inject = (missingCss ? cssBlock + palBlock + '\n' : '') + (missingLib ? libBlock + '\n' : '');
      if (/<\/head>/i.test(s)) s = s.replace(/<\/head>/i, inject + '</head>');
      else if (/<body[^>]*>/i.test(s)) s = s.replace(/<body[^>]*>/i, (m) => m + '\n' + inject);
      else s = inject + s;
    }
    // Remove any leftover unknown tokens the model may have invented.
    s = s.replace(/\{\{[A-Z_]+\}\}/g, '');
    return { html: s, usedTokens };
  }

  /* Validation summary for the lint step. */
  function validate(html) {
    const out = { parses: true, hasCanvas: /<canvas[\s>]/i.test(html), hasChartInit: /new\s+Chart\s*\(/.test(html), parseErrors: 0 };
    try {
      if (global.DOMParser) {
        const doc = new global.DOMParser().parseFromString(html, 'text/html');
        out.parses = !!(doc && doc.documentElement);
      }
    } catch (e) { out.parses = false; }
    return out;
  }

  function repairInstruction(violations, validation) {
    const issues = [];
    if (violations.length) {
      issues.push('It references external resources, which are FORBIDDEN. Remove or replace every one of these:\n' +
        violations.slice(0, 10).map((v) => '- ' + v.match).join('\n'));
    }
    if (validation && validation.hasChartInit && !validation.hasCanvas) {
      issues.push('It calls new Chart(...) but contains no <canvas> element. Add the matching <canvas> elements inside <div class="chart-box">.');
    }
    if (validation && !validation.parses) {
      issues.push('It is not well-formed HTML. Output a single valid HTML document.');
    }
    return 'Your previous HTML output has problems:\n\n' + issues.join('\n\n') +
      '\n\nOutput the FULL corrected HTML document again, following every rule of the original instructions. Output ONLY the HTML document — no fences, no commentary. Keep the {{BASE_CSS}} and {{CHART_LIB}} placeholder tokens in <head>.';
  }

  IDG.post = { stripFences, looksLikeFences, lintExternal, stripExternal, injectAssets, validate, repairInstruction };
})(typeof window !== 'undefined' ? window : globalThis);
