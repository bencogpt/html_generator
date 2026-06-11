#!/usr/bin/env python3
"""Build the embedded Heebo font subset (spec §1.2 item 4).

Takes the Heebo variable font (OFL, https://github.com/google/fonts/tree/main/ofl/heebo),
instances static weights 300/400/600/800, subsets each to Hebrew + Basic Latin +
digits + common punctuation, and emits WOFF2 files into vendor/fonts/.

Usage: python3 tools/subset_fonts.py /path/to/Heebo[wght].ttf
Requires: pip install fonttools brotli
"""
import io
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WEIGHTS = [300, 400, 600, 800]

# Basic Latin, Latin-1 punctuation/NBSP, general punctuation (quotes, dashes,
# ellipsis, LRM/RLM), Hebrew block, and the shekel sign.
UNICODES = (
    "U+0020-007E,U+00A0,U+00A9,U+00AB,U+00BB,U+00B0,U+00B7,"
    "U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+200E,U+200F,"
    "U+0590-05FF,U+20AA,U+2212,U+25CF"
)


def main(src: str) -> None:
    out_dir = Path(__file__).resolve().parent.parent / "vendor" / "fonts"
    out_dir.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        font = TTFont(src)
        instantiateVariableFont(font, {"wght": weight}, inplace=True)
        buf = io.BytesIO()
        font.save(buf)
        buf.seek(0)

        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]
        opts.name_IDs = [1, 2, 3, 4, 6, 13, 14]  # keep license name records
        sub_font = subset.load_font(buf, opts)
        subsetter = subset.Subsetter(options=opts)
        subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
        subsetter.subset(sub_font)

        out = out_dir / f"heebo-{weight}.woff2"
        subset.save_font(sub_font, str(out), opts)
        print(f"{out.name}: {out.stat().st_size} bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/Heebo.ttf")
