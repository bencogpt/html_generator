/* IDG.pipeline — generation orchestration (FR-2x): prompt build → optional
   two-pass chunked summarization (FR-22) → main LLM call → post-process →
   lint → optional single repair round-trip (FR-23) → metrics record (FR-40). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const { estimateTokens } = IDG.util;

  function passFromResult(type, r) {
    return {
      type,
      tokensIn: r.tokensIn || 0,
      tokensOut: r.tokensOut || 0,
      estimated: !!r.usageEstimated,
      ttftMs: r.ttftMs ?? null,
      latencyMs: r.latencyMs || 0,
    };
  }

  function paletteCss(state) {
    const pal = IDG.store.PALETTES[state.output.palette];
    if (!pal) return '';
    let vars = `--c-primary:${pal.primary};--c-secondary:${pal.secondary};--c-accent:${pal.accent};` +
      `--c-bg:${pal.bg};--c-grad-a:${pal.gradA};--c-grad-b:${pal.gradB};`;
    // Optional surface tokens (a dark palette sets these; light palettes inherit
    // the defaults baked into base.css).
    const map = {
      surface: '--c-surface', surface2: '--c-surface-2', text: '--c-text', muted: '--c-muted',
      border: '--c-border', page: '--c-page', heroText: '--c-hero-text', onPrimary: '--c-on-primary',
      shadow: '--c-shadow', blur: '--c-blur',
    };
    for (const k in map) if (pal[k]) vars += `${map[k]}:${pal[k]};`;
    return `:root{${vars}}`;
  }

  /* opts: { signal, onProgress(stage, info), feedback, prevRawHtml }
     Resolves { html, rawHtml, run, warnings:[{key,vars}] }.
     Rejects Error with .run attached (already recorded). */
  async function run(extraction, opts) {
    opts = opts || {};
    const state = IDG.store.state;
    const profile = IDG.store.activeProfile;
    const warnings = [];
    const passes = [];
    let retries = 0;

    const runRec = {
      id: IDG.util.uid(),
      ts: Date.now(),
      source: extraction.sourceName,
      model: profile ? profile.model : '',
      profileName: profile ? profile.name : '',
      status: 'failed',
      passes,
      extract: {
        words: extraction.stats.words,
        tables: extraction.stats.tables,
        headings: extraction.stats.headings,
        lang: extraction.stats.lang,
      },
    };

    const finalize = (status, extra) => {
      const totals = IDG.metrics.totalsFromPasses(passes);
      Object.assign(runRec, totals, extra || {});
      runRec.status = status;
      const main = passes.filter((p) => p.type === 'main' || p.type === 'repair').pop();
      runRec.ttftMs = main ? main.ttftMs : null;
      const genMs = main ? main.latencyMs : totals.latencyMs;
      runRec.tokPerSec = genMs > 0 && totals.tokensOut ? totals.tokensOut / (genMs / 1000) : null;
      runRec.retries = retries;
      runRec.costEst = IDG.metrics.costFor(profile, totals.tokensIn, totals.tokensOut);
      IDG.metrics.record(runRec);
      return runRec;
    };

    if (!profile || !profile.baseUrl) {
      const e = new Error('no profile'); e.code = 'no-profile';
      e.run = finalize('failed', { errorCode: 'no-profile' });
      throw e;
    }

    const systemPrompt = IDG.prompt.renderSystemPrompt(state);
    let userMsg = IDG.prompt.buildUserMessage(extraction, { model: profile.model });

    try {
      /* ---- FR-22: two-pass chunking when over the context budget ---- */
      const budget = IDG.prompt.docBudget(profile, systemPrompt);
      if (estimateTokens(userMsg) > budget) {
        const sumBudget = Math.max(
          1500,
          (profile.contextWindow || 32768) - estimateTokens(IDG.prompt.SUMMARIZE_PROMPT) - 2500
        );
        const chunks = IDG.prompt.chunkText(extraction.text, sumBudget);
        const briefs = [];
        for (let i = 0; i < chunks.length; i++) {
          if (opts.onProgress) opts.onProgress('summarize', { n: i + 1, total: chunks.length + 1 });
          const r = await IDG.llm.chat(profile, [
            { role: 'system', content: IDG.prompt.SUMMARIZE_PROMPT },
            { role: 'user', content: chunks[i] },
          ], { stream: false, signal: opts.signal });
          passes.push(passFromResult('summarize', r));
          briefs.push(r.text);
        }
        const brief = IDG.prompt.mergeBriefs(briefs);
        const briefExtraction = Object.assign({}, extraction, {
          text: 'STRUCTURED BRIEF OF THE FULL DOCUMENT (JSON):\n' + JSON.stringify(brief, null, 1),
        });
        userMsg = IDG.prompt.buildUserMessage(briefExtraction, { model: profile.model });
      }

      /* ---- conversation (regenerate appends a follow-up turn, FR-27) ---- */
      let messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ];
      if (opts.feedback && opts.prevRawHtml) {
        const followUp = [
          { role: 'assistant', content: opts.prevRawHtml },
          { role: 'user', content: 'USER FEEDBACK: ' + opts.feedback + '\n\nApply this feedback and output the FULL revised HTML document again, following every rule of the original instructions (placeholders, no external URLs, no fences).' },
        ];
        const total = estimateTokens(messages.concat(followUp).map((m) => m.content).join(''));
        if (total < (profile.contextWindow || 32768) - (profile.maxTokens || 8192) - 500) {
          messages = messages.concat(followUp);
        } else {
          // Context too small to carry the previous turn — fold feedback in.
          messages[1].content += '\n\nADDITIONAL USER REQUIREMENTS: ' + opts.feedback;
        }
      }

      /* ---- main pass ---- */
      if (opts.onProgress) opts.onProgress('main', {});
      const mainRes = await IDG.llm.chat(profile, messages, {
        signal: opts.signal,
        onToken: (n, text) => opts.onProgress && opts.onProgress('stream', { tokens: n, chars: text.length }),
      });
      passes.push(passFromResult('main', mainRes));

      let raw = mainRes.text;
      let repairedByFences = IDG.post.looksLikeFences(raw);
      raw = IDG.post.stripFences(raw);

      /* Truncated output: the model hit the max-token ceiling mid-document.
         A repair round-trip would truncate again at the same ceiling, so skip
         it, salvage what rendered, and tell the user to raise Max output
         tokens (Settings → Connection). */
      const truncated = mainRes.finishReason === 'length';
      if (truncated) {
        runRec.truncated = true;
        warnings.push({ key: 'warn_truncated' });
      }

      /* ---- lint + single repair round-trip (FR-23) ---- */
      let violations = IDG.post.lintExternal(raw);
      let validation = IDG.post.validate(raw);
      let repaired = false;
      const needsRepair = !truncated && (violations.length > 0 || !validation.parses ||
        (validation.hasChartInit && !validation.hasCanvas) ||
        !/<html[\s>]|<!doctype/i.test(raw));

      if (needsRepair) {
        if (opts.onProgress) opts.onProgress('repair', {});
        const repairMessages = messages.concat([
          { role: 'assistant', content: raw },
          { role: 'user', content: IDG.post.repairInstruction(violations, validation) },
        ]);
        try {
          const repRes = await IDG.llm.chat(profile, repairMessages, {
            signal: opts.signal,
            onToken: (n) => opts.onProgress && opts.onProgress('stream', { tokens: n }),
          });
          passes.push(passFromResult('repair', repRes));
          const fixedRaw = IDG.post.stripFences(repRes.text);
          const fixedViol = IDG.post.lintExternal(fixedRaw);
          if (fixedRaw && fixedViol.length <= violations.length) {
            raw = fixedRaw;
            violations = fixedViol;
            validation = IDG.post.validate(raw);
          }
          repaired = true;
        } catch (err) {
          if (err.code === 'cancelled') throw err;
          warnings.push({ key: 'banner_repaired' }); // repair attempt failed; continue with original
        }
      }

      /* Last resort: hard-strip any remaining external references. */
      let lintFixed = 0;
      if (violations.length) {
        raw = IDG.post.stripExternal(raw);
        lintFixed = violations.length;
        warnings.push({ key: 'warn_lint', vars: { n: violations.length } });
      }

      /* ---- inject vendored assets (FR-23) ---- */
      const assets = Object.assign({}, IDG.assets, { PALETTE_CSS: paletteCss(state) });
      const injected = IDG.post.injectAssets(raw, assets);
      const finalHtml = injected.html;

      const totals = IDG.metrics.totalsFromPasses(passes);
      if (totals.estimated) warnings.push({ key: 'warn_estimated' });
      if (repairedByFences || repaired) warnings.push({ key: 'banner_repaired' });

      const status = (repairedByFences || repaired || lintFixed) ? 'repaired' : 'success';
      const runDone = finalize(status, {
        outputBytes: new global.TextEncoder().encode(finalHtml).length,
        modelBytes: new global.TextEncoder().encode(raw).length,
        injectedBytes: new global.TextEncoder().encode(finalHtml).length - new global.TextEncoder().encode(raw).length,
        lintFound: violations.length + lintFixed,
        lintFixed,
        errorCode: '',
      });

      return { html: finalHtml, rawHtml: raw, run: runDone, warnings };
    } catch (err) {
      const status = err.code === 'cancelled' ? 'cancelled' : 'failed';
      err.run = finalize(status, { errorCode: err.code || 'error' });
      throw err;
    }
  }

  IDG.pipeline = { run, paletteCss };
})(typeof window !== 'undefined' ? window : globalThis);
