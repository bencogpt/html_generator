#!/usr/bin/env python3
"""Infographic assembler — npm/Artifactory variant (python3 stdlib only).

Produces the SAME fully interactive Chart.js infographic as the main
generator, with the chart libraries fetched ONCE from an npm-compatible
registry (your internal Artifactory npm remote/virtual repo, or any npm
mirror) and cached locally. The design-system stylesheet, the IDG_CHARTS/
IDG_FMT helper runtime and the color palettes are embedded in this file, so
the whole skill travels as one markdown file — nothing to host.

    python3 build_infographic.py report.html [-o out.html] [--palette <id>]
        [--registry https://artifactory.company/artifactory/api/npm/npm]
    python3 build_infographic.py --list-palettes

Registry priority: --registry > INFOGRAPHIC_NPM_REGISTRY env var > the
NPM_REGISTRY constant below (set it once when installing the skill).
Downloads ~0.7 MB on first run (chart.js + heatmap/geo plugins + world map),
cached in ./infographic_assets/ afterwards."""
import argparse
import io
import json
import os
import re
import sys
import tarfile
import urllib.request
from pathlib import Path

# ── set once by whoever installs this skill (Artifactory npm repo URL) ────
NPM_REGISTRY = "https://registry.npmjs.org"
# e.g. "https://artifactory.company/artifactory/api/npm/npm-virtual"
# ──────────────────────────────────────────────────────────────────────────

CACHE = Path('./infographic_assets')

# (package, version, file-pattern candidates in the tarball — first match wins)
PACKAGES = [
    ('chart.js', '4.4.0', [r'dist/chart\.umd\.min\.js$', r'dist/chart\.umd\.js$']),
    ('chartjs-chart-matrix', '2.0.1', [r'dist/.*matrix\.min\.js$', r'dist/.*matrix\.js$']),
    ('topojson-client', '3.1.0', [r'dist/topojson-client\.min\.js$', r'dist/topojson-client\.js$']),
    ('chartjs-chart-geo', '4.3.4', [r'build/index\.umd\.min\.js$', r'dist/.*geo\.umd\.min\.js$',
                                    r'build/index\.umd\.js$', r'dist/.*geo\.umd\.js$']),
    ('world-atlas', '2.0.2', [r'countries-110m\.json$']),
]

# Build-time-injected constants (fallback: read from the repo checkout).
PALETTES_JSON = r'''__PALETTES_JSON__'''
BASE_CSS_SRC = r'''__BASE_CSS__'''
CHART_EXTRAS_SRC = r'''__CHART_EXTRAS__'''

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


def _embedded(src, repo_rel):
    if not src.startswith('__'):
        return src
    p = Path(__file__).resolve().parent.parent.parent.parent / repo_rel
    return p.read_text(encoding='utf-8')


def load_palettes():
    if PALETTES_JSON.startswith('__'):
        local = Path(__file__).resolve().parent.parent / 'assets' / 'palettes.json'
        return json.loads(local.read_text(encoding='utf-8'))
    return json.loads(PALETTES_JSON)


def http_get(url):
    """GET bytes; try the environment's proxy config first, then a direct
    connection (internal registries are often not reachable via a corporate
    proxy)."""
    last = None
    for handlers in ([], [urllib.request.ProxyHandler({})]):
        try:
            opener = urllib.request.build_opener(*handlers)
            with opener.open(url, timeout=60) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — fall through to next strategy
            last = e
    raise RuntimeError(f'{url}: {last}')


def fetch_asset(name, version, patterns, registry):
    """Return the wanted file's text from an npm package, cached locally."""
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / f"{name.replace('/', '_')}-{version}.asset"
    if cached.exists() and cached.stat().st_size > 0:
        return cached.read_text(encoding='utf-8')
    base = registry.rstrip('/')
    try:
        meta = json.loads(http_get(f'{base}/{name}/{version}').decode('utf-8'))
        tarball_url = meta['dist']['tarball']
    except Exception:
        # Some registries block metadata routes — fall back to the standard tarball path.
        tarball_url = f"{base}/{name}/-/{name.split('/')[-1]}-{version}.tgz"
    try:
        data = http_get(tarball_url)
        tf = tarfile.open(fileobj=io.BytesIO(data), mode='r:gz')
        names = tf.getnames()
        for pat in patterns:
            for member in names:
                if re.search(pat, member):
                    text = tf.extractfile(member).read().decode('utf-8')
                    cached.write_text(text, encoding='utf-8')
                    return text
        raise RuntimeError(f'no file matching {patterns} in {tarball_url} (members: {names[:8]}…)')
    except Exception as e:  # noqa: BLE001 — single clear failure path
        sys.exit(f'✗ cannot fetch {name}@{version} from {base} ({e}).\n'
                 f'  Point --registry / INFOGRAPHIC_NPM_REGISTRY / the NPM_REGISTRY\n'
                 f'  constant at your internal Artifactory npm repo, e.g.\n'
                 f'  https://artifactory.company/artifactory/api/npm/npm-virtual')


def build_chart_lib(registry):
    """Compose the same offline chart bundle the main generator ships."""
    parts = []
    topo = None
    for name, version, patterns in PACKAGES:
        text = fetch_asset(name, version, patterns, registry)
        if name == 'world-atlas':
            topo = text.strip()
        else:
            parts.append(text)
    parts.append(';window.__IDG_WORLD_TOPO__=' + topo + ';')
    parts.append(_embedded(CHART_EXTRAS_SRC, 'src/output/chart-extras.js'))
    bundle = '\n;\n'.join(parts)
    # sourceMappingURL pragmas point at files we don't ship
    return re.sub(r'^[ \t]*//[#@]\s*sourceMappingURL=.*$', '', bundle, flags=re.M)


def palette_css(pal):
    vars_ = (f"--c-primary:{pal['primary']};--c-secondary:{pal['secondary']};"
             f"--c-accent:{pal['accent']};--c-bg:{pal['bg']};"
             f"--c-grad-a:{pal['gradA']};--c-grad-b:{pal['gradB']};")
    for key, var in SURFACE_MAP.items():
        if pal.get(key):
            vars_ += f"{var}:{pal[key]};"
    return ':root{' + vars_ + '}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input', nargs='?')
    ap.add_argument('-o', '--out')
    ap.add_argument('-p', '--palette', default='colorful')
    ap.add_argument('--registry', default=os.environ.get('INFOGRAPHIC_NPM_REGISTRY') or NPM_REGISTRY)
    ap.add_argument('--list-palettes', action='store_true')
    args = ap.parse_args()

    palettes = load_palettes()
    if args.list_palettes:
        for pid, p in palettes.items():
            print(f"{pid:<20} {'[dark] ' if p.get('dark') else ''}{p['label']} — {p['desc']}")
        return
    if not args.input:
        ap.error('report.html required (or --list-palettes)')
    pal = palettes.get(args.palette)
    if not pal:
        sys.exit(f'Unknown palette "{args.palette}". Available: {", ".join(palettes)}')

    html = Path(args.input).read_text(encoding='utf-8')
    tick3 = chr(96) * 3
    fence = re.match(r'^\s*' + tick3 + r'(?:html)?\s*\n([\s\S]*?)\n' + tick3 + r'\s*$', html)
    if fence:
        html = fence.group(1)

    css_block = ('<style>\n' + _embedded(BASE_CSS_SRC, 'src/output/base.css') + '\n</style>'
                 + '<style>' + palette_css(pal) + '</style>')
    lib = re.sub(r'</script', r'<\\/script', build_chart_lib(args.registry), flags=re.I)
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

    hits = []
    for rx, kind in EXTERNAL_RES:
        hits += [f'{kind}: {m.group(0).strip()[:120]}' for m in rx.finditer(html)]
    if hits:
        print(f'⚠ {len(hits)} forbidden external reference(s) removed:', file=sys.stderr)
        for v in hits[:10]:
            print('  - ' + v, file=sys.stderr)
        html = re.sub(r'\s(src|href|srcset|poster)\s*=\s*["\'](?:https?:)?//[^"\']*["\']',
                      ' data-removed-external=""', html, flags=re.I)
        html = re.sub(r'url\(\s*["\']?(?:https?:)?//[^)"\']+["\']?\s*\)', 'none', html, flags=re.I)
        html = re.sub(r'@import\s+(?:url\()?\s*["\']?https?:[^;]+;?', '', html, flags=re.I)

    out = args.out or re.sub(r'\.html?$', '', args.input, flags=re.I) + '-final.html'
    Path(out).write_text(html, encoding='utf-8')
    print(f'✓ {out} ({len(html) / 1024 / 1024:.2f} MB, palette: {args.palette}'
          f'{" [dark]" if pal.get("dark") else ""}, interactive Chart.js, offline self-contained)')


if __name__ == '__main__':
    main()
