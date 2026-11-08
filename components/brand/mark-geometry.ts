/**
 * Prism Pass mark geometry — the single source of truth for the Aperture P.
 *
 * Construction grid: 32 × 32 units.
 *   tile        0 … 32, corner radius 7.5
 *   P bbox      5.5 … 26.5 × 4.5 … 27.5
 *   stem        x 5.5 … 11   (5.5 wide)
 *   bowl tip    x 26.5 at y 12
 *   counter     x 11 … 23, y 8.5 … 15.5 (4-unit walls)
 *   tile glyph  scale 0.9, translate (2.2, 1.6)
 *
 * The counter is the prism; the accent is gold in the counter (bare mark) or
 * in the P (pass tile). Filled shapes only: no strokes, gradients, filters or
 * shadows. Keep this file free of React so scripts and the OG route can import
 * it safely.
 */

export const BRAND = {
  /** Brand navy — tile and primary ink. */
  navy: "#142850",
  /** Deep navy — dark surfaces. */
  deep: "#0C1B36",
  /** Brand gold — the single accent, only on navy. */
  gold: "#C9A24B",
  /** Gold-soft — the accent on dark navy. */
  goldSoft: "#E4CD8E",
  /** Gold-dark (`--gold-dark`, 41 54% 32%) — the accessible gold on paper. */
  goldDark: "#7E6226",
  /** Warm paper. */
  paper: "#F7F5F0",
  /** Muted slate for the descriptor. */
  muted: "#5C6773",
} as const;

export const MARK_GRID = 32;
export const TILE_RADIUS = 7.5;

/** Bare mark: stem + bowl as one outline. */
export const P_OUTER = "M5.5 4.5H23L26.5 12L23 19.5H11V27.5H5.5Z";
/** Prism-shaped counter (a hole in mono, gold in duotone). */
export const P_COUNTER = "M11 8.5H20L23 12L20 15.5H11Z";
/** Outer + counter for a single even-odd path (one-colour). */
export const P_COMBINED = `${P_OUTER} ${P_COUNTER}`;

/** Rounded tile as a path (for one-colour even-odd compositions). */
export const TILE_PATH =
  "M7.5 0H24.5A7.5 7.5 0 0 1 32 7.5V24.5A7.5 7.5 0 0 1 24.5 32H7.5A7.5 7.5 0 0 1 0 24.5V7.5A7.5 7.5 0 0 1 7.5 0Z";

/** P transformed into the tile: scale 0.9, translate (2.2, 1.6). */
export const P_TILE_OUTER = "M7.15 5.65H22.9L26.05 12.4L22.9 19.15H12.1V26.35H7.15Z";
export const P_TILE_COUNTER = "M12.1 9.25H20.2L22.9 12.4L20.2 15.55H12.1Z";
export const P_TILE = `${P_TILE_OUTER} ${P_TILE_COUNTER}`;

/** Proportions used by both the React component and the outlined exports. */
export const PROPORTIONS = {
  /** Wordmark font size ÷ mark size. */
  wordmark: 0.52,
  /** Descriptor font size ÷ mark size. */
  descriptor: 0.234,
  /** Gap between mark and wordmark ÷ mark size. */
  gap: 0.28,
  /** Descriptor margin above ÷ mark size. */
  descriptorGap: 0.075,
  /** Stacked gap between mark and wordmark ÷ mark size. */
  stackedGap: 0.3,
} as const;

export type BrandTone = "onLight" | "onDark" | "mono";
