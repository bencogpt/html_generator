#!/usr/bin/env python3
"""Infographic skill assembler (Python, stdlib only) — turns the model's
token-form report into a final self-contained offline HTML file.

    python3 scripts/assemble.py report.html [-o out.html] [--palette <id>]
    python3 scripts/assemble.py --list-palettes

Replaces {{BASE_CSS}} with the stylesheet + embedded font + palette CSS
variables, and {{CHART_LIB}} with the bundled Chart.js (+ heatmap/geo
plugins, world atlas, IDG_* helpers, tabs runtime). Falls back to injecting
before </head> if the tokens were omitted. Lints for forbidden external
references and strips them (with a warning). Identical behavior to
scripts/assemble.js — use whichever runtime the environment has."""
import argparse
import json
import re
import sys
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / 'assets'

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
    ap.add_argument('--list-palettes', action='store_true')
    args = ap.parse_args()

    palettes = json.loads((ASSETS / 'palettes.json').read_text(encoding='utf-8'))

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

    # Tolerate a model that wrapped the document in markdown fences.
    fence = re.match(r'^\s*```(?:html)?\s*\n([\s\S]*?)\n```\s*$', html)
    if fence:
        html = fence.group(1)

    css_block = ('<style>\n' + (ASSETS / 'fonts.css').read_text(encoding='utf-8') + '\n'
                 + (ASSETS / 'base.css').read_text(encoding='utf-8') + '\n</style>'
                 + '<style>' + palette_css(pal) + '</style>')
    # Escape any literal </script so the bundle can't close its tag early.
    lib = re.sub(r'</script', r'<\\/script', (ASSETS / 'chart-lib.js').read_text(encoding='utf-8'), flags=re.I)
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

    # Remove leftover invented tokens.
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
