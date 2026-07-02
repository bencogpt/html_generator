/* IDG.llm — LLM client (FR-30/30a/31). Primary adapter: OpenAI-compatible
   /v1/chat/completions (vLLM, Ollama-compat, llama.cpp, LM Studio, TGI).
   Secondary: Custom adapter with user-mapped JSON paths. The only network
   traffic in the whole app originates here, to the user-configured endpoint. */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});
  const { getPath, estimateTokens } = IDG.util;

  function joinUrl(base, path) {
    return String(base || '').replace(/\/+$/, '') + path;
  }

  /* Map usage out of a response object — standard OpenAI `usage` first, then
     Ollama-native prompt_eval_count/eval_count (FR-30a). */
  function mapUsage(obj) {
    if (!obj) return null;
    const u = obj.usage;
    if (u && (u.prompt_tokens != null || u.completion_tokens != null)) {
      return { tokensIn: u.prompt_tokens ?? null, tokensOut: u.completion_tokens ?? null, estimated: false };
    }
    if (obj.prompt_eval_count != null || obj.eval_count != null) {
      return { tokensIn: obj.prompt_eval_count ?? null, tokensOut: obj.eval_count ?? null, estimated: false };
    }
    return null;
  }

  function classifyError(err, res) {
    if (err && err.name === 'AbortError') return err.timedOut ? 'timeout' : 'cancelled';
    if (res) {
      if (res.status === 404) return 'model-or-path-404';
      if (res.status === 401 || res.status === 403) return 'auth';
      return 'http-' + res.status;
    }
    return 'network'; // fetch TypeError — DNS, refused, or CORS block
  }

  function buildHeaders(profile, apiKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    Object.assign(headers, IDG.store.parseHeaders(profile.extraHeaders));
    return headers;
  }

  /* fetch with profile timeout + caller's abort signal; retries on network
     errors and 5xx with exponential backoff. */
  async function doFetch(url, options, profile, externalSignal, retriesOverride) {
    const maxRetries = retriesOverride != null ? retriesOverride : (profile.maxRetries ?? 1);
    let attempt = 0, lastErr = null;
    while (attempt <= maxRetries) {
      const ctl = new AbortController();
      const timer = setTimeout(() => {
        const e = new Error('timeout'); // mark so classifyError can tell apart
        ctl.abort();
        ctl.signal.timedOut = true;
      }, (profile.timeoutSec || 300) * 1000);
      const onExternalAbort = () => ctl.abort();
      if (externalSignal) {
        if (externalSignal.aborted) { clearTimeout(timer); const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
      try {
        const res = await global.fetch(url, Object.assign({}, options, { signal: ctl.signal }));
        clearTimeout(timer);
        // Retry on 5xx and on 429 (rate limit) — for 429, honor Retry-After
        // (seconds or HTTP-date), capped at 30s; else exponential backoff.
        if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
          attempt++; lastErr = Object.assign(new Error('HTTP ' + res.status), { res });
          let delayMs = 500 * Math.pow(2, attempt);
          if (res.status === 429) {
            const ra = res.headers.get('retry-after');
            if (ra) {
              const secs = /^\d+$/.test(ra.trim()) ? parseInt(ra, 10) : (Date.parse(ra) - Date.now()) / 1000;
              if (isFinite(secs) && secs >= 0) delayMs = Math.min(secs * 1000, 30000);
            }
          }
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        return res;
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          if (ctl.signal.timedOut) err.timedOut = true;
          else if (externalSignal && externalSignal.aborted) throw err; // user cancel — no retry
        }
        if (attempt < maxRetries && err.name !== 'AbortError') {
          attempt++; lastErr = err;
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
          continue;
        }
        throw err;
      } finally {
        if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
        clearTimeout(timer);
      }
    }
    throw lastErr || new Error('request failed');
  }

  /* ---------- OpenAI-compatible adapter ---------- */

  async function chatOpenAI(profile, messages, opts) {
    const apiKey = IDG.store.apiKeyFor(profile);
    const url = joinUrl(profile.baseUrl, '/chat/completions');
    const wantStream = opts.stream !== false && profile.stream !== false;

    const body = {
      model: profile.model,
      messages,
      temperature: profile.temperature ?? 0.3,
      max_tokens: profile.maxTokens || 8192,
      stream: wantStream,
    };
    if (wantStream) body.stream_options = { include_usage: true };

    const started = Date.now();
    let res = await doFetch(url, {
      method: 'POST', headers: buildHeaders(profile, apiKey), body: JSON.stringify(body),
    }, profile, opts.signal);

    // Some servers reject unknown fields like stream_options — retry once without.
    if (!res.ok && res.status === 400 && wantStream) {
      delete body.stream_options;
      res = await doFetch(url, {
        method: 'POST', headers: buildHeaders(profile, apiKey), body: JSON.stringify(body),
      }, profile, opts.signal, 0);
    }

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 2000); } catch (e) { /* noop */ }
      const err = new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
      err.code = classifyError(null, res);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }

    const ctype = res.headers.get('content-type') || '';
    if (wantStream && (ctype.includes('text/event-stream') || res.body)) {
      if (ctype.includes('application/json')) {
        // Server ignored stream=true and answered with plain JSON.
        return finishJson(await res.json(), messages, started, null);
      }
      return readSSE(res, messages, started, opts.onToken, opts.signal);
    }
    return finishJson(await res.json(), messages, started, null);
  }

  function finishJson(data, messages, started, ttftMs) {
    const text = getPath(data, 'choices.0.message.content') ?? getPath(data, 'choices.0.text') ?? '';
    const usage = mapUsage(data) || {
      tokensIn: estimateTokens(messages.map((m) => m.content).join('\n')),
      tokensOut: estimateTokens(text),
      estimated: true,
    };
    return {
      text: String(text),
      tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, usageEstimated: usage.estimated,
      // 'length' means the reply hit max_tokens and is truncated (surfaced to
      // the user instead of wasting a repair pass on an incomplete document).
      finishReason: getPath(data, 'choices.0.finish_reason') ?? null,
      ttftMs: ttftMs, latencyMs: Date.now() - started,
    };
  }

  async function readSSE(res, messages, started, onToken, signal) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', text = '', ttftMs = null, usage = null, tokens = 0, finishReason = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal && signal.aborted) {
        reader.cancel().catch(() => {});
        const e = new Error('cancelled'); e.name = 'AbortError'; throw e;
      }
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        let chunk;
        try { chunk = JSON.parse(payload); } catch (e) { continue; }
        const u = mapUsage(chunk);
        if (u) usage = u;
        const fr = getPath(chunk, 'choices.0.finish_reason');
        if (fr) finishReason = fr;
        const delta = getPath(chunk, 'choices.0.delta.content') ?? getPath(chunk, 'choices.0.text');
        if (delta) {
          if (ttftMs == null) ttftMs = Date.now() - started;
          text += delta;
          tokens++;
          if (onToken) onToken(tokens, text);
        }
      }
    }
    if (!usage) {
      usage = {
        tokensIn: estimateTokens(messages.map((m) => m.content).join('\n')),
        tokensOut: estimateTokens(text),
        estimated: true,
      };
    }
    return {
      text, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, usageEstimated: usage.estimated,
      finishReason, ttftMs, latencyMs: Date.now() - started,
    };
  }

  /* ---------- Custom adapter (FR-30 secondary) ---------- */

  function fillTemplate(template, vars) {
    // Placeholders inside JSON string values must be JSON-escaped; numeric
    // placeholders ("{{TEMPERATURE}}") may appear quoted — unquote them.
    let out = template;
    for (const k of ['MODEL', 'SYSTEM', 'PROMPT']) {
      const escaped = JSON.stringify(String(vars[k] ?? '')).slice(1, -1);
      out = out.split('{{' + k + '}}').join(escaped);
    }
    out = out.replace(/"\{\{TEMPERATURE\}\}"|\{\{TEMPERATURE\}\}/g, String(vars.TEMPERATURE));
    out = out.replace(/"\{\{MAX_TOKENS\}\}"|\{\{MAX_TOKENS\}\}/g, String(vars.MAX_TOKENS));
    return out;
  }

  async function chatCustom(profile, messages, opts) {
    const apiKey = IDG.store.apiKeyFor(profile);
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const prompt = messages.filter((m) => m.role !== 'system')
      .map((m) => (m.role === 'assistant' ? 'ASSISTANT:\n' : '') + m.content).join('\n\n');

    const body = fillTemplate(profile.custom.requestTemplate || IDG.store.DEFAULT_CUSTOM_TEMPLATE, {
      MODEL: profile.model, SYSTEM: system, PROMPT: prompt,
      TEMPERATURE: profile.temperature ?? 0.3, MAX_TOKENS: profile.maxTokens || 8192,
    });
    try { JSON.parse(body); } catch (e) {
      const err = new Error('Custom request template is not valid JSON after filling placeholders: ' + e.message);
      err.code = 'template'; throw err;
    }

    const started = Date.now();
    const res = await doFetch(joinUrl(profile.baseUrl, ''), {
      method: 'POST', headers: buildHeaders(profile, apiKey), body,
    }, profile, opts.signal);

    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 2000); } catch (e) { /* noop */ }
      const err = new Error('HTTP ' + res.status + (detail ? ': ' + detail : ''));
      err.code = classifyError(null, res); err.status = res.status; err.detail = detail;
      throw err;
    }

    const data = await res.json();
    const text = getPath(data, profile.custom.textPath);
    if (typeof text !== 'string') {
      const err = new Error('Response text path "' + profile.custom.textPath + '" yielded no string. Response keys: ' + Object.keys(data || {}).join(', '));
      err.code = 'mapping'; throw err;
    }
    const tIn = getPath(data, profile.custom.tokensInPath);
    const tOut = getPath(data, profile.custom.tokensOutPath);
    const mapped = mapUsage(data);
    const estimated = tIn == null && tOut == null && !mapped;
    return {
      text,
      tokensIn: tIn ?? (mapped ? mapped.tokensIn : estimateTokens(system + prompt)),
      tokensOut: tOut ?? (mapped ? mapped.tokensOut : estimateTokens(text)),
      usageEstimated: estimated,
      finishReason: getPath(data, 'choices.0.finish_reason') ?? null,
      ttftMs: null, latencyMs: Date.now() - started,
    };
  }

  /* ---------- public API ---------- */

  const llm = {
    mapUsage, fillTemplate, classifyError, joinUrl,

    /* messages: [{role, content}] → {text, tokensIn, tokensOut, usageEstimated,
       ttftMs, latencyMs}. Throws Error with .code on failure. */
    async chat(profile, messages, opts) {
      opts = opts || {};
      try {
        return profile.adapter === 'custom'
          ? await chatCustom(profile, messages, opts)
          : await chatOpenAI(profile, messages, opts);
      } catch (err) {
        if (!err.code) err.code = classifyError(err, null);
        throw err;
      }
    },

    /* FR-31 — minimal ping prompt; validates usage mapping for the server. */
    async testConnection(profile, signal) {
      const started = Date.now();
      const r = await llm.chat(profile, [
        { role: 'user', content: 'Reply with the single word: pong' },
      ], { stream: false, signal });
      return {
        ok: true,
        latencyMs: Date.now() - started,
        tokensIn: r.tokensIn, tokensOut: r.tokensOut, estimated: r.usageEstimated,
        sample: String(r.text || '').slice(0, 80),
      };
    },

    /* GET /v1/models when the server supports it (FR-30). */
    async fetchModels(profile, signal) {
      const apiKey = IDG.store.apiKeyFor(profile);
      const res = await doFetch(joinUrl(profile.baseUrl, '/models'), {
        method: 'GET', headers: buildHeaders(profile, apiKey),
      }, profile, signal, 0);
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status); err.status = res.status;
        err.code = classifyError(null, res); throw err;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.data || data.models || [];
      return list.map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
    },

    /* Stack-specific guidance for the diagnostics box (FR-31, §9 item 1). */
    hintsFor(errCode, profile) {
      const t = IDG.i18n.t;
      const hints = [];
      if (errCode === 'network') {
        hints.push(t('hint_cors_ollama'), t('hint_cors_vllm'), t('hint_cors_openshift'), t('hint_tls'));
        if (global.location && global.location.protocol === 'file:') hints.push(t('hint_cors_file'));
      }
      if (errCode === 'model-or-path-404') hints.push(t('hint_model_404'));
      return hints;
    },
  };

  IDG.llm = llm;
})(typeof window !== 'undefined' ? window : globalThis);
