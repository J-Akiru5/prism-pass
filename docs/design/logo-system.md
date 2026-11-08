# Prism Pass logo system

## The idea

**The Aperture P.** A geometric capital P whose bowl is a prism and whose counter is a
prism-shaped aperture. In the bare duotone mark the counter is the single gold facet; in product
the P itself is that gold facet, held inside a flat navy **pass tile** — the same navy-and-gold,
flat, contained language as the Syntaxure Labs monogram. Gold is not decoration: it is the pass
itself, one bright object inside a dark, precise container. At 16 px the tile gives the mark a
strong silhouette and the gold P still reads; in one colour the tile drops away and the P's
prism-shaped knockout carries the same idea. Nothing depends on a gradient, bevel or shadow.

The full exploration is in [`logo-exploration.svg`](./logo-exploration.svg) (three directions,
size runs, colourways, construction grid, production lockups).

## Why this direction

| Direction | What it is | Verdict |
|---|---|---|
| **A — Aperture P** | Solid P + prism counter, applied in the pass tile | **Chosen.** Reads at 16 px, one-colour safe, gold always sits on navy where it has 6.04:1 contrast. |
| B — Ticket Prism | The pass itself; one beam in, three ticket notches out | Strong story and strong at 64 px. Below 24 px the prism bite and three notches collapse into a dark block. |
| C — Beam Gate | Hollow P with a gold aperture slot | Elegant at display sizes, but the 4.5-unit outline goes thin at 16 px, the accent needs gold-dark on light, and it has no one-colour equivalent. |

A wins on the two tests that matter: **16 px legibility** and **one-colour survival**. Its hook —
the prism-shaped counter — is geometry, not colour, so it survives a fax machine. The gold P adds
the brand accent only where contrast is guaranteed (on navy).

## Construction grid

The mark is built on a **32 × 32 unit grid**. All geometry is filled; there are no strokes in the
production mark.

```
tile          0 … 32, corner radius 7.5
P bbox        5.5 … 26.5 × 4.5 … 27.5   (21 × 23, centred on 16,16)
stem          x 5.5 … 11                 (5.5 wide, 23 tall)
bowl          top edge 11 … 23 at y 4.5
              chamfer to the tip 26.5, 12
              bottom edge 23 … 11 at y 19.5
counter       top edge 11 … 20 at y 8.5
              point 23, 12
              bottom edge 20 … 11 at y 15.5
              walls 4 units; tip wall 3.5 units
tile glyph    scale 0.9, translate (2.2, 1.6)
              P bbox 7.15 … 26.05 × 5.65 … 26.35 (18.9 × 20.7)
              stem 4.95; counter 8.1 × 6.3; tip wall 3.15
```

The P is centred by bounding box on the bare grid. In the tile it is shifted **0.6 units right**
of a bbox-centred position (`translate 2.2` instead of `1.6`): the stem is visually heavier than
the bowl, so equal bbox margins read left-heavy. The right margin is 5.95 units and the left 7.15;
the extra 0.6 is the optical correction.

**Size behaviour.** At 16 px the tile is 16 px, the gold P is 9.45 × 10.35 px, the stem is
2.475 px, the counter is 4.05 × 3.15 px and the smallest wall (the tip) is 1.575 px. At 24 px the
same wall is 2.36 px, so no detail falls below the 1.5 px floor. At 32 px one unit is one pixel:
4.95 px stem, 8.1 × 6.3 px counter, 3.15 px tip wall; at 64 px those double. There are no
hairlines to lose.

**Rendering.** The component sets `shape-rendering="geometricPrecision"`; the diagonals are the
identity of the prism and `crispEdges` would stair-step them. No `vector-effect` is used because
there are no strokes. The favicon uses the same 32-unit drawing and maps the tile edge to the
16 px canvas; anti-aliasing handles the fractional inner edges.

## Wordmark

**Prism Pass** is set in **Inter SemiBold 600**, tracking **−0.015 em**, sentence case. Semibold
keeps the counters open and the wordmark calm next to the heavier tile. The wordmark's cap height
is **0.378 × the mark size** (font size 0.52 × mark), matching the current lockup's optical ratio
while making it scale consistently instead of using fixed 19 px type at every emblem size.

The descriptor **ATTENDANCE & VERIFICATION** is uppercase Inter Semibold, **0.18 em** tracking,
**0.234 × mark** (with an **8.5 px floor** in the React component so it survives the 30 px logo on
the login screen). It is muted on paper and gold-soft on dark.

| Relationship | Value |
|---|---|
| wordmark font | `0.52 × mark` |
| wordmark cap | `0.378 × mark` |
| descriptor font | `0.234 × mark`, min 8.5 px |
| descriptor tracking | `0.18 em` |
| mark → type gap | `0.28 × mark` (horizontal) |
| mark → type gap | `0.30 × mark` (stacked) |
| descriptor gap | `0.32 × descriptor font` |
| wordmark baseline | `0.60 × mark` from the mark top — the P's bowl bottom |

Exports use **outlined Inter 4.1 SemiBold** paths (`wordmark-geometry.ts`), so print, OG and
email never depend on an installed font. The React component uses live Inter via `next/font`; the
proportions are shared. The outlined paths were generated at em 100 with −15/1000 tracking for the
wordmark, +180/1000 for the descriptor and −20/1000 for the OG value proposition.

### Horizontal lockup

Mark, 0.28 × mark gap, then wordmark over descriptor. The wordmark baseline sits on the P's bowl
bottom; the descriptor baseline falls near the P's leg. Canonical source: `lockup-horizontal.svg`
(mark 72, 459 × 112 units).

### Stacked lockup

Mark centred above the wordmark + descriptor, all centred on a common axis; 0.30 × mark gap.
Canonical source: `lockup-stacked.svg` (mark 96, 490 × 241 units). Use this where the horizontal
lockup would be too wide for the container.

## Clear space and minimum sizes

- **Clear space:** 0.25 × mark height on every side of any lockup. The exported lockups use 0.28 ×
  (20.16 units on the 72-unit horizontal, 26.88 on the 96-unit stacked) so the rule is met by the
  file itself.
- **Mark alone:** 16 px minimum (favicon); 24 px is the comfortable product size.
- **Horizontal full lockup:** 30 px mark minimum in the React component (wordmark 15.6 px,
  descriptor 8.5 px floor). Use the exported 72-unit lockup at 36 px or larger (wordmark 18.7 px,
  descriptor 8.4 px). 36 px is the recommended product size; below 30 px use the mark alone.
- **Stacked full lockup:** 40 px mark minimum in the component; use the exported 96-unit stacked
  lockup at 48 px or larger (descriptor 11.2 px). 64 px recommended.
- **Wordmark only:** 18 px font minimum; 24 px recommended.
- **One-colour mark:** 16 px minimum; the bare P's counter is 4.5 × 3.5 px at 16.

## Colour rules

| Token | Hex | Role |
|---|---|---|
| Navy | `#142850` | Tile, wordmark on light, primary ink |
| Deep navy | `#0C1B36` | Dark surfaces, OG background |
| Gold | `#C9A24B` | The P on the navy tile (light) |
| Gold-soft | `#E4CD8E` | The P on the navy tile (dark), descriptor on dark |
| Gold-dark | `#7E6226` | The only gold allowed on paper/white (`--gold-dark`) |
| Paper | `#F7F5F0` | Warm light surface, inverse ink |
| Muted | `#5C6773` | Descriptor on light |

**On light:** navy tile, gold P, navy wordmark, muted descriptor.
**On dark:** navy tile, gold-soft P, paper wordmark, gold-soft descriptor.
**Auto:** follows the app's `.dark` class — gold on light, gold-soft on dark, navy/foreground
wordmark, muted/gold-soft descriptor.
**One colour:** the bare P in `currentColor` with a true even-odd knockout counter; the tile is
dropped so the P keeps its full silhouette at small sizes. The wordmark and descriptor are
`currentColor` (descriptor at 70% opacity for hierarchy).

The gold P is only ever placed on navy. Gold on paper or white is **not** an acceptable mark
colour (see contrast), and gold-soft on paper is worse. If a gold mark must sit on a light surface,
use gold-dark `#7E6226` (the `--gold-dark` token).

## Contrast

Ratios are WCAG 2.x relative luminance, computed from the sRGB hex values. **3:1** is the
non-text/graphical-object threshold; **4.5:1** is AA normal text.

| Pair | Ratio | Verdict |
|---|---:|---|
| Navy `#142850` on paper `#F7F5F0` | **13.30:1** | Pass — wordmark / tile on light |
| White `#FFFFFF` on navy `#142850` | **14.49:1** | Pass |
| Paper `#F7F5F0` on deep `#0C1B36` | **15.73:1** | Pass — wordmark on OG |
| Gold `#C9A24B` on navy `#142850` | **6.04:1** | Pass — the gold P on the tile |
| Gold-soft `#E4CD8E` on navy `#142850` | **9.26:1** | Pass — the P on dark |
| Gold-soft `#E4CD8E` on deep `#0C1B36` | **10.95:1** | Pass — descriptor on dark / OG |
| Muted `#5C6773` on paper `#F7F5F0` | **5.29:1** | Pass — descriptor on light |
| Gold-dark `#7E6226` on paper `#F7F5F0` | **5.26:1** | Pass — the fallback gold for light |
| Gold `#C9A24B` on paper `#F7F5F0` | **2.20:1** | **Fail 3:1** — never use for the mark or text |
| Gold `#C9A24B` on white `#FFFFFF` | **2.40:1** | **Fail 3:1** |
| Gold-soft `#E4CD8E` on paper `#F7F5F0` | **1.44:1** | **Fail 3:1** |
| Navy `#142850` on deep `#0C1B36` | **1.18:1** | Decorative only — the tile edge on a dark navy surface; the P carries the mark |

**Flagged:** gold on paper/white (2.20/2.40) and gold-soft on paper (1.44) are below 3:1 and are
not used for any essential graphic. The tile edge on deep navy is 1.18:1; that edge is a container,
not a meaningful object, and the gold P remains at 9.26:1. On a surface that is exactly `#142850`
the tile disappears and the P floats — acceptable, and the reason the P is the mark and the tile is
the application.

## Do / don't

**Do**
- Keep the gold P on navy, and use gold-soft on dark.
- Use the tile at 16 px and above; use the bare P for one-colour print.
- Keep 0.25 × mark clear space; use the exported lockups for OG, print and email.
- Use `tone="onLight"` / `"onDark"` when the background is known; use `"auto"` only where the
  app theme is the background.
- Pass `decorative` when adjacent text already names Prism Pass.
- Keep the P's counter open. It is the hook.

**Don't**
- Don't add gradients, shadows, bevels, glass, inner glows or outlines.
- Don't put the gold P on paper or white; use gold-dark if a gold-on-light mark is unavoidable.
- Don't stretch, skew, rotate, or rebuild the mark from different proportions.
- Don't use the tile below 16 px or the full lockup below 30 px (horizontal) / 40 px (stacked).
- Don't put text inside the mark; the wordmark is a separate lockup.
- Don't use the gold-soft P on paper, or the gold P as body text.
- Don't add a container shadow or a second accent colour.

## File inventory

| File | What it is |
|---|---|
| `components/brand/prism-pass-logo.tsx` | React lockup; `full` / `mark` / `wordmark`, `tone`, `layout`, `decorative` |
| `components/brand/mark-geometry.ts` | 32-unit geometry, colours, proportions |
| `components/brand/wordmark-geometry.ts` | Outlined Inter runs + self-contained SVG builders |
| `app/icon.svg` | Favicon (navy pass tile, gold P) |
| `app/apple-icon.png` | 180 × 180 iOS icon, full-bleed navy |
| `app/opengraph-image.tsx` | 1200 × 630 OG card via `next/og` |
| `app/layout.tsx` | Metadata, icons, Open Graph/Twitter, theme colour (Next 15 `viewport`) |
| `public/brand/mark.svg` | Colour mark, 256 × 256 |
| `public/brand/mark-mono.svg` | One-colour bare P, `currentColor` |
| `public/brand/mark-inverse.svg` | Dark-surface tile, gold-soft P |
| `public/brand/lockup-horizontal.svg` | Horizontal lockup, outlined |
| `public/brand/lockup-stacked.svg` | Stacked lockup, outlined |
| `docs/design/logo-exploration.svg` | Three-direction comparison + construction sheet |
| `scripts/brand/build-wordmark.py` | Outlines Inter text into SVG paths |
| `scripts/brand/generate.ts` | Regenerates icons, public SVGs and the exploration sheet |
| `scripts/brand/render-og.tsx` | Renders the OG card without `next build` (optional check) |

## Regenerate

```powershell
pnpm brand:generate        # icons, public/brand/*.svg, docs/design/logo-exploration.svg
pnpm brand:og tmp/og.png   # optional: render the OG card without next build
```

The wordmark paths are already committed. They only need regenerating if the type changes; the
Inter source is [Inter 4.1](https://rsms.me/inter/) (SIL OFL 1.1) and `fontTools` is required:

```powershell
python scripts/brand/build-wordmark.py --font <Inter-SemiBold.ttf> `
  --text "Prism Pass" --size 100 --tracking -15
python scripts/brand/build-wordmark.py --font <Inter-SemiBold.ttf> `
  --text "ATTENDANCE & VERIFICATION" --size 100 --tracking 180
python scripts/brand/build-wordmark.py --font <Inter-SemiBold.ttf> `
  --text "Unified attendance + verification" --size 100 --tracking -20
```

Paste the `path` values into `components/brand/wordmark-geometry.ts`, then run
`pnpm brand:generate`. `app/apple-icon.png` is a committed 180 × 180 raster of the tile (full-bleed
navy, gold P); regenerate it with any SVG rasterizer if the mark changes.

## Verification and limits

- **Install:** `pnpm install --frozen-lockfile` then `pnpm prisma:generate` completed in the
  worktree. pnpm warns that the host runs Node 24 while `engines` asks for Node 22; that warning
  predates this work and did not block install or checks.
- **Typecheck:** `pnpm typecheck` — clean, no TypeScript errors.
- **Tests:** `pnpm test` — **10 files, 55/55 tests passed**.
- **Assets:** `pnpm brand:generate` wrote `app/icon.svg`, the five `public/brand` SVGs and
  `docs/design/logo-exploration.svg`. Every referenced file exists.
- **OG:** `pnpm brand:og <path>` rendered the route through `ImageResponse` to a 1200 × 630 PNG
  (28,194 bytes), verifying the composition and the outlined SVG data URIs. This is not a Next
  server build.
- **Raster checks:** the tile, bare P and the B/C marks were rendered with Sharp at 16, 24, 32 and
  64 px; the lockups and the sheet were rasterized at their native sizes. The 16 px tile reads;
  B collapses below 24 px; C's gold aperture is barely present at 16.
- **No browser:** the in-app browser was not connected in this session, so there was no interactive
  visual QA, no browser screenshot, and no dev server. The checks above are geometry + raster.
- **No `next build`:** the host is memory-constrained; CI owns builds. Typecheck and tests are the
  local gates; the route was exercised through `brand:og` instead.
- **Font:** the React wordmark uses the app's Inter (`next/font`); the exported/OG wordmark is
  outlined Inter 4.1 SemiBold. The two are the same typeface, not different cuts.
- **Accessibility:** the outer element is `role="img"` with `aria-label="Prism Pass"` by default;
  `decorative` removes it from the accessibility tree. The SVG itself is `aria-hidden`.
