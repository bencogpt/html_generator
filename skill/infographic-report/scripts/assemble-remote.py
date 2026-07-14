#!/usr/bin/env python3
"""Infographic assembler — single-file variant (python3 stdlib only).

Same behavior as assemble.py, but instead of reading assets from a local
folder it fetches them ONCE from an internal assets URL (then caches them in
./infographic_assets/), so the whole skill can travel as one markdown file.

    python3 assemble_infographic.py report.html [-o out.html]
        [--palette <id>] [--assets-url http://server/infographic-assets]
    python3 assemble_infographic.py --list-palettes

Assets URL priority: --assets-url > INFOGRAPHIC_ASSETS_URL env var > the
ASSETS_BASE_URL constant below (set it once when installing the skill).
The URL must serve: chart-lib.js, base.css, fonts.css
(the contents of the skill's assets/ folder)."""
import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

# ── set once by the admin installing this skill ──────────────────────────
ASSETS_BASE_URL = "http://CHANGE-ME.internal/infographic-assets"
# ──────────────────────────────────────────────────────────────────────────

CACHE = Path('./infographic_assets')
ASSET_FILES = ['chart-lib.js', 'base.css', 'fonts.css']

# Palette definitions are inlined at build time so no fetch is needed.
PALETTES_JSON = r'''__PALETTES_JSON__'''

SURFACE_MAP = {
    'surface': '--c-surface', 'surface2': '--c-surface-2', 'text': '--c-text',
    'muted': '--c-muted', 'border': '--c-border', 'page': '--c-page',
    'heroText': '--c-hero-text', 'onPrimary': '--c-on-primary',
    'shadow': '--c-shadow', 'blur': '--c-blur',
}

EXTERNAL_RES = [
    (re.compile(r'\s(?:src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']', re.I), 'external attribute'),
    (re.compile(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', re.I), 'external url()'),
    (re.compile(r'@import\s+(?:url\()?\s*["\']?https?:', re.I), '@import'),
]


def load_palettes():
    if PALETTES_JSON.startswith('__'):
        # Running from the repo (placeholder not substituted): use the local assets folder.
        local = Path(__file__).resolve().parent.parent / 'assets' / 'palettes.json'
        return json.loads(local.read_text(encoding='utf-8'))
    return json.loads(PALETTES_JSON)


def get_asset(name, base_url):
    """Return asset text, downloading to the cache once."""
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / name
    if cached.exists() and cached.stat().st_size > 0:
        return cached.read_text(encoding='utf-8')
    url = base_url.rstrip('/') + '/' + name
    try:
        # Connect DIRECTLY to the internal assets server — ignore any
        # http_proxy/https_proxy env vars (a corporate proxy usually cannot
        # reach an internal/localhost assets host and would time out).
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url, timeout=30) as r:
            data = r.read().decode('utf-8')
    except Exception as e:  # noqa: BLE001 - single clear failure path
        sys.exit(f'✗ cannot fetch {url} ({e}).\n'
                 f'  Host the skill assets (chart-lib.js, base.css, fonts.css) on an\n'
                 f'  internal static server and pass --assets-url (or set the\n'
                 f'  INFOGRAPHIC_ASSETS_URL env var / ASSETS_BASE_URL constant).')
    cached.write_text(data, encoding='utf-8')
    return data


def palette_css(pal):
    vars_ = (f"--c-primary:{pal['primary']};--c-secondary:{pal['secondary']};"
             f"--c-accent:{pal['accent']};--c-bg:{pal['bg']};"
             f"--c-grad-a:{pal['gradA']};--c-grad-b:{pal['gradB']};")
    for key, var in SURFACE_MAP.items():
        if pal.get(key):
            vars_ += f"{var}:{pal[key]};"
    return ':root{' + vars_ + '}'


def lint_external(s):
    hits = []
    for rx, kind in EXTERNAL_RES:
        hits += [f'{kind}: {m.group(0).strip()[:120]}' for m in rx.finditer(s)]
    return hits


def strip_external(s):
    s = re.sub(r'\s(src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']',
               ' data-removed-external=""', s, flags=re.I)
    s = re.sub(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', 'none', s, flags=re.I)
    s = re.sub(r'@import\s+(?:url\()?\s*["\']?https?:[^;]+;?', '', s, flags=re.I)
    return s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out')
    ap.add_argument('-p', '--palette', default='colorful')
    ap.add_argument('--assets-url', default=os.environ.get('INFOGRAPHIC_ASSETS_URL') or ASSETS_BASE_URL)
    ap.add_argument('--list-palettes', action='store_true')
    args = ap.parse_args()

    palettes = load_palettes()
    if args.list_palettes:
        for pid, p in palettes.items():
            dark = '[dark] ' if p.get('dark') else ''
            print(f"{pid:<20} {dark}{p['label']} — {p['desc']}")
        return
    if not args.input:
        ap.error('input file required (or --list-palettes)')
    pal = palettes.get(args.palette)
    if not pal:
        sys.exit(f'Unknown palette "{args.palette}". Available: {", ".join(palettes)}')

    html = Path(args.input).read_text(encoding='utf-8')
    # Tolerate a model that wrapped the document in markdown fences. (The
    # fence chars are built with chr() so this script itself can be embedded
    # inside a markdown code block.)
    tick3 = chr(96) * 3
    fence = re.match(r'^\s*' + tick3 + r'(?:html)?\s*\n([\s\S]*?)\n' + tick3 + r'\s*$', html)
    if fence:
        html = fence.group(1)

    css_block = ('<style>\n' + get_asset('fonts.css', args.assets_url) + '\n'
                 + get_asset('base.css', args.assets_url) + '\n</style>'
                 + '<style>' + palette_css(pal) + '</style>')
    lib = re.sub(r'</script', r'<\\/script', get_asset('chart-lib.js', args.assets_url), flags=re.I)
    lib_block = '<script>\n' + lib + '\n</script>'

    css_in = '{{BASE_CSS}}' in html
    lib_in = '{{CHART_LIB}}' in html
    html = html.replace('{{BASE_CSS}}', css_block).replace('{{CHART_LIB}}', lib_block)
    if not css_in or not lib_in:
        inject = ('' if css_in else css_block + '\n') + ('' if lib_in else lib_block + '\n')
        if re.search(r'</head>', html, re.I):
            html = re.sub(r'</head>', lambda m: inject + m.group(0), html, count=1, flags=re.I)
        elif re.search(r'<body[^>]*>', html, re.I):
            html = re.sub(r'<body[^>]*>', lambda m: m.group(0) + '\n' + inject, html, count=1, flags=re.I)
        else:
            html = inject + html
        missing = ('' if css_in else '{{BASE_CSS}} ') + ('' if lib_in else '{{CHART_LIB}}')
        print(f'⚠ token(s) missing ({missing.strip()}) — injected into <head> instead.', file=sys.stderr)

    html = re.sub(r'\{\{[A-Z_]+\}\}', '', html)

    violations = lint_external(html)
    if violations:
        print(f'⚠ {len(violations)} forbidden external reference(s) removed:', file=sys.stderr)
        for v in violations[:10]:
            print('  - ' + v, file=sys.stderr)
        html = strip_external(html)

    out = args.out or re.sub(r'\.html?$', '', args.input, flags=re.I) + '-final.html'
    Path(out).write_text(html, encoding='utf-8')
    dark = ' [dark]' if pal.get('dark') else ''
    print(f'✓ {out} ({len(html) / 1024 / 1024:.2f} MB, palette: {args.palette}{dark}, offline self-contained)')


if __name__ == '__main__':
    main()
