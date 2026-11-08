"""Rasterise the Prism Pass mark into the PNG icons Next.js serves.

The mark lives in components/brand/logo.tsx and app/icon.svg; this script keeps
app/apple-icon.png (180x180, what iOS and some browsers show for a saved site)
in step with them instead of drifting into an older logo.

Run: python scripts/brand/make-icons.py
"""

import os

from PIL import Image, ImageDraw

SIZE = 180
SS = 4  # supersample, then downsample for clean edges
CANVAS = SIZE * SS
K = CANVAS / 32.0  # the mark is drawn in a 32x32 viewBox

NAVY = (15, 23, 42, 255)
WHITE = (255, 255, 255, 255)
RAY_BLUE = (96, 165, 250, 255)
RAY_VIOLET = (167, 139, 250, 255)
RAY_TEAL = (52, 211, 153, 255)

img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)


def p(x: float, y: float) -> tuple[float, float]:
    return (x * K, y * K)


draw.rounded_rectangle([0, 0, CANVAS - 1, CANVAS - 1], radius=9 * K, fill=NAVY)
draw.rounded_rectangle(
    [0.6 * K, 0.6 * K, 31.4 * K, 31.4 * K],
    radius=8.4 * K,
    outline=(255, 255, 255, 41),
    width=max(1, round(1.2 * K)),
)


def stroke(points, colour, width, caps=True):
    w = width * K
    draw.line([p(*pt) for pt in points], fill=colour, width=round(w), joint="curve")
    if caps:
        for x, y in (points[0], points[-1]):
            cx, cy = p(x, y)
            r = w / 2
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=colour)


PRISM = [(16, 4.9), (25.4, 10.45), (25.4, 21.55), (16, 27.1), (6.6, 21.55), (6.6, 10.45), (16, 4.9)]
stroke(PRISM, WHITE, 1.8, caps=False)
stroke([(5.6, 16), (16, 16)], WHITE, 2.2)
stroke([(16, 16), (24.2, 11.2)], RAY_BLUE, 2.2)
stroke([(16, 16), (24.8, 16)], RAY_VIOLET, 2.2)
stroke([(16, 16), (24.2, 20.8)], RAY_TEAL, 2.2)

icon = img.resize((SIZE, SIZE), Image.LANCZOS)
out = os.path.join("app", "apple-icon.png")
icon.save(out, optimize=True)
print(f"wrote {out} ({os.path.getsize(out)} bytes)")
