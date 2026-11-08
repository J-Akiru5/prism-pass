# Brand refresh — prism mark, icons and share card

Status: implemented on `feat/brand-refresh`. Design language (navy / gold /
paper, Inter + Georgia display + JetBrains Mono) is unchanged; this document
covers only what the refresh added or replaced.

## The mark

A solid, faceted triangular prism. One gold beam enters the left facet, bends
through the body, and refracts into a three-ray spectrum on the right.

Design rules that keep it coherent at every size:

| Rule | Why |
| --- | --- |
| Filled triangle, not an outline | Survives 16px rasterisation; an outlined prism disintegrates below ~24px |
| Two navy facets + ridge | Reads as a solid object, not a flat triangle; gives the mark depth without a drop shadow |
| Gold in-beam, navy structure | Gold is the accent, navy carries the form. Gold never fills the whole triangle in the logo lockup |
| Spectrum only at `size >= 26` | Three rays 1.9 units wide collapse into a smear at favicon sizes, so `size < 26` renders a single gold exit ray instead |
| No gradients on text | The wordmark is solid `foreground` / `white`; the subline is `gold-dark` (light) or `gold-soft` (dark) for 5:1+ contrast |
| No drop shadow | It muddied the 16–24px renders |

Geometry lives in a `0 0 48 48` viewBox: apex `(24, 8)`, base `(7, 36)` to
`(41, 36)`, entry at `y = 30`, exit at `(35.3, 26.6)`. Beams stay inside the
box. `currentColor` is not used for the body because the brand requires navy
structure on light and white structure on dark; `onDark` switches those fills.

Wordmark metrics scale from `size`: font `0.52 × size`, subline `0.265 × size`
(min 9px), gap `0.22 × size`, letterspacing `-0.022em`.

## Files

| File | Purpose |
| --- | --- |
| `components/brand/prism-pass-logo.tsx` | Inline SVG lockup. API unchanged: `variant`, `size`, `onDark`, `className` |
| `app/icon.svg` | Favicon / browser tab. Navy rounded tile, gold facet, the same beam geometry |
| `app/apple-icon.png` | 180×180 static PNG, full-bleed (iOS applies its own mask). Generated offline from the same geometry |
| `app/opengraph-image.tsx` | 1200×630 share card via `next/og` `ImageResponse`. No fetched fonts or images |
| `app/layout.tsx` | `metadataBase`, title template, description, Open Graph, Twitter, `viewport.themeColor` |

`app/icon.svg` and `app/apple-icon.png` are file-convention assets: Next emits
the `<link rel="icon">` / `<link rel="apple-touch-icon">` tags and merges
`opengraph-image.tsx` into the metadata of every route. Do not list them
manually in `metadata.icons` / `metadata.openGraph.images`.

### Why `next/og` is safe offline

`next/og` ships its own `noto-sans` TTF inside `next/dist/compiled/@vercel/og`,
so `ImageResponse` renders without network access. The prism is embedded as an
SVG data URI; no remote image is referenced. The card therefore uses the
bundled sans rather than Georgia — the serif is a system font on the web and
cannot be embedded for a raster asset.

## Regenerating the PNG assets

The share card regenerates itself at request time. `app/apple-icon.png` is a
committed raster. It was produced offline with the compiled renderer that Next
already bundles:

```js
const { ImageResponse } = require("next/dist/compiled/@vercel/og");
// render the 180×180 SVG variant, then write res.arrayBuffer() to
// app/apple-icon.png
```

No extra dependency, no `sharp`, no build step.

## Out-of-scope finding (not changed here)

`vercel.json` currently advertises `git.deploymentEnabled` with
`"staging": true` and no `"develop": true`. Under
`instructions/deployment-governance.md` only `main` and `develop` may deploy;
`staging` must be excluded. This is deployment configuration owned by the
integration/deployment work, so it was reported, not edited, in the brand
branch.
