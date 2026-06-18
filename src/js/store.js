/* IDG.store — settings & connection profiles, persisted in localStorage
   (FR-30..FR-35). API keys can be marked session-only: they are then kept in
   an in-memory map and never serialized (FR-34 security note). */
(function (global) {
  'use strict';
  const IDG = (global.IDG = global.IDG || {});

  const KEY = 'idg.settings.v1';

  const PALETTES = {
    'vibrant-tech-blues': {
      label: 'Vibrant Tech Blues',
      primary: '#2563EB', secondary: '#1E40AF', accent: '#60A5FA',
      bg: '#EFF6FF', gradA: '#1E3A8A', gradB: '#3B82F6',
      series: ['#2563EB', '#60A5FA', '#1E40AF', '#93C5FD', '#0EA5E9', '#38BDF8'],
    },
    'emerald-forest': {
      label: 'Emerald Forest',
      primary: '#059669', secondary: '#065F46', accent: '#34D399',
      bg: '#ECFDF5', gradA: '#064E3B', gradB: '#10B981',
      series: ['#059669', '#34D399', '#065F46', '#6EE7B7', '#0D9488', '#2DD4BF'],
    },
    'warm-sunset': {
      label: 'Warm Sunset',
      primary: '#EA580C', secondary: '#9A3412', accent: '#FB923C',
      bg: '#FFF7ED', gradA: '#7C2D12', gradB: '#F97316',
      series: ['#EA580C', '#FB923C', '#9A3412', '#FDBA74', '#DC2626', '#F87171'],
    },
    'royal-violet': {
      label: 'Royal Violet',
      primary: '#7C3AED', secondary: '#5B21B6', accent: '#A78BFA',
      bg: '#F5F3FF', gradA: '#4C1D95', gradB: '#8B5CF6',
      series: ['#7C3AED', '#A78BFA', '#5B21B6', '#C4B5FD', '#DB2777', '#F472B6'],
    },
    'slate-mono': {
      label: 'Slate Mono',
      primary: '#475569', secondary: '#1E293B', accent: '#94A3B8',
      bg: '#F8FAFC', gradA: '#0F172A', gradB: '#475569',
      series: ['#475569', '#94A3B8', '#1E293B', '#CBD5E1', '#64748B', '#A8B5C5'],
    },
  };

  /* Connection presets (FR-30) — one-click starting points for common stacks.
     They pre-fill adapter + a base-URL template + sane defaults; the user
     still supplies the model name (and token where the deployment needs one).
     Presets only set request-side config — they cannot add CORS headers or
     trust a server cert, so OpenShift's note steers to the LiteLLM path. */
  const CONN_PRESETS = {
    litellm: { nameKey: 'preset_litellm', adapter: 'openai', baseUrl: 'http://localhost:4000/v1', persistKey: false, stream: true, temperature: 0.3 },
    openshift: { nameKey: 'preset_openshift', adapter: 'openai', baseUrl: 'https://<model>-<project>.apps.<cluster-domain>/v1', persistKey: false, stream: true, temperature: 0.3 },
    vllm: { nameKey: 'preset_vllm', adapter: 'openai', baseUrl: 'http://localhost:8000/v1', persistKey: false, stream: true, temperature: 0.3 },
    ollama: { nameKey: 'preset_ollama', adapter: 'openai', baseUrl: 'http://localhost:11434/v1', persistKey: false, stream: true, temperature: 0.3 },
  };

  const DEFAULT_CUSTOM_TEMPLATE = JSON.stringify(
    {
      model: '{{MODEL}}',
      messages: [
        { role: 'system', content: '{{SYSTEM}}' },
        { role: 'user', content: '{{PROMPT}}' },
      ],
      temperature: '{{TEMPERATURE}}',
      max_tokens: '{{MAX_TOKENS}}',
    },
    null, 2
  );

  function defaultProfile() {
    return {
      id: IDG.util.uid(),
      name: 'Local LLM',
      adapter: 'openai',                 // 'openai' | 'custom'
      baseUrl: 'http://localhost:11434/v1',
      model: '',
      apiKey: '',
      persistKey: false,                 // session-only by default (FR-34)
      extraHeaders: '',                  // "Name: value" lines
      timeoutSec: 300,
      maxRetries: 1,
      temperature: 0.3,                  // spec default for strict-format HTML
      maxTokens: 8192,
      stream: true,
      contextWindow: 32768,
      priceIn: null,                     // per 1M tokens (optional, FR cost)
      priceOut: null,
      custom: {
        requestTemplate: DEFAULT_CUSTOM_TEMPLATE,
        textPath: 'choices[0].message.content',
        tokensInPath: 'usage.prompt_tokens',
        tokensOutPath: 'usage.completion_tokens',
      },
    };
  }

  function defaults() {
    return {
      ui: { lang: 'auto' },
      activeProfileId: null,
      profiles: [],
      systemPrompt: null,                // null = use built-in default
      output: {
        palette: 'vibrant-tech-blues',
        langOverride: 'auto',            // auto | he | en | ar
        detailLevel: 'balanced',         // concise | balanced | comprehensive
        maxCharts: 3,
        includeFlow: true,
        fileCapMB: 10,                   // FR-13
      },
    };
  }

  // Session-only API keys, never written to localStorage.
  const sessionKeys = Object.create(null);

  let state = null;

  function load() {
    let raw = null;
    try { raw = global.localStorage.getItem(KEY); } catch (e) { /* file:// privacy modes */ }
    const base = defaults();
    if (raw) {
      try {
        const saved = JSON.parse(raw);
        state = Object.assign(base, saved);
        state.ui = Object.assign(defaults().ui, saved.ui);
        state.output = Object.assign(defaults().output, saved.output);
        state.profiles = (saved.profiles || []).map((p) => Object.assign(defaultProfile(), p, {
          custom: Object.assign(defaultProfile().custom, p.custom || {}),
        }));
      } catch (e) { state = base; }
    } else {
      state = base;
    }
    if (!state.profiles.length) {
      const p = defaultProfile();
      state.profiles = [p];
      state.activeProfileId = p.id;
    }
    if (!state.profiles.some((p) => p.id === state.activeProfileId)) {
      state.activeProfileId = state.profiles[0].id;
    }
    return state;
  }

  function save() {
    const clone = JSON.parse(JSON.stringify(state));
    clone.profiles.forEach((p) => { if (!p.persistKey) p.apiKey = ''; });
    try { global.localStorage.setItem(KEY, JSON.stringify(clone)); } catch (e) { /* quota */ }
  }

  const store = {
    PALETTES,
    CONN_PRESETS,
    DEFAULT_CUSTOM_TEMPLATE,
    defaultProfile,
    load,
    save,
    get state() { return state || load(); },

    get activeProfile() {
      const s = store.state;
      return s.profiles.find((p) => p.id === s.activeProfileId) || s.profiles[0] || null;
    },

    setActiveProfile(id) { store.state.activeProfileId = id; save(); },

    /* Effective key: persisted value or the session-only one. */
    apiKeyFor(profile) {
      if (!profile) return '';
      return profile.apiKey || sessionKeys[profile.id] || '';
    },
    setSessionKey(profileId, key) { sessionKeys[profileId] = key || ''; },

    addProfile(p) { store.state.profiles.push(p); save(); return p; },
    removeProfile(id) {
      const s = store.state;
      s.profiles = s.profiles.filter((p) => p.id !== id);
      if (!s.profiles.length) s.profiles.push(defaultProfile());
      if (s.activeProfileId === id) s.activeProfileId = s.profiles[0].id;
      save();
    },

    /* Profiles import/export (FR-32). Keys excluded unless includeSecrets. */
    exportProfiles(includeSecrets) {
      const s = store.state;
      const profiles = JSON.parse(JSON.stringify(s.profiles));
      if (!includeSecrets) profiles.forEach((p) => { p.apiKey = ''; });
      return JSON.stringify({ idgProfiles: 1, profiles }, null, 2);
    },
    importProfiles(json) {
      const data = JSON.parse(json);
      const list = Array.isArray(data) ? data : data.profiles;
      if (!Array.isArray(list)) throw new Error('Not a profiles export');
      let added = 0;
      for (const raw of list) {
        const p = Object.assign(defaultProfile(), raw, {
          id: IDG.util.uid(),
          custom: Object.assign(defaultProfile().custom, raw.custom || {}),
        });
        store.state.profiles.push(p);
        added++;
      }
      save();
      return added;
    },

    parseHeaders(text) {
      const out = {};
      String(text || '').split('\n').forEach((line) => {
        const i = line.indexOf(':');
        if (i > 0) {
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim();
          if (k) out[k] = v;
        }
      });
      return out;
    },

    clearAll() {
      try {
        global.localStorage.removeItem(KEY);
        global.localStorage.removeItem('idg.metrics.v1');
      } catch (e) { /* noop */ }
      state = null;
      load();
    },
  };

  IDG.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
