#!/usr/bin/env python3
"""Generate outlined Inter wordmark paths for the Prism Pass brand assets.

Usage:
  python scripts/brand/build-wordmark.py \
      --font /path/to/Inter-SemiBold.ttf \
      --text "Prism Pass" --size 100 --tracking -15

Outputs JSON to stdout: { "path": "...", "width": 123.4, "capHeight": 72.7, "ascender": ... }
The path is in SVG coordinates with the baseline at y=0 and y growing downward.
Requires fontTools (pip install fonttools). Inter is licensed under the SIL OFL 1.1.
"""
import argparse
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", required=True)
    ap.add_argument("--text", default="Prism Pass")
    ap.add_argument("--size", type=float, default=100.0)
    ap.add_argument("--tracking", type=float, default=-15.0, help="per-mille of em")
    args = ap.parse_args()

    font = TTFont(args.font)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    scale = args.size / upem
    tracking = args.tracking / 1000.0 * args.size

    # Optional legacy kern table (Inter ships GPOS; this is a best-effort fallback).
    kern = {}
    if "kern" in font:
        for sub in font["kern"].kernTables:
            if hasattr(sub, "kernTable"):
                kern.update(sub.kernTable)

    parts = []
    x = 0.0
    prev = None
    for ch in args.text:
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit(f"missing glyph: {ch!r}")
        if prev is not None:
            x += kern.get((prev, name), 0) * scale
        pen = SVGPathPen(glyphs)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, 0))
        glyphs[name].draw(tpen)
        d = pen.getCommands()
        if d:
            parts.append(d)
        x += hmtx[name][0] * scale + tracking
        prev = name

    # Bounds of the composed path (for cap height / side bearings).
    bp = BoundsPen(glyphs)
    bx = 0.0
    prev = None
    for ch in args.text:
        name = cmap[ord(ch)]
        if prev is not None:
            bx += kern.get((prev, name), 0) * scale
        glyphs[name].draw(TransformPen(bp, (scale, 0, 0, -scale, bx, 0)))
        bx += hmtx[name][0] * scale + tracking
        prev = name

    print(json.dumps({
        "path": " ".join(parts),
        "width": round(x - tracking, 3),
        "xMin": round(bp.bounds[0], 3) if bp.bounds else 0,
        "yMin": round(bp.bounds[1], 3) if bp.bounds else 0,
        "xMax": round(bp.bounds[2], 3) if bp.bounds else 0,
        "yMax": round(bp.bounds[3], 3) if bp.bounds else 0,
        "capHeight": round(font["OS/2"].sCapHeight * scale, 3),
        "ascender": round(font["hhea"].ascender * scale, 3),
        "descender": round(font["hhea"].descender * scale, 3),
        "upem": upem,
    }, indent=2))


if __name__ == "__main__":
    main()
