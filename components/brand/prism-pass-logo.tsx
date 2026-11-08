import { cn } from "@/lib/cn";
import {
  BRAND,
  P_COMBINED,
  P_TILE,
  PROPORTIONS,
  TILE_RADIUS,
  type BrandTone,
} from "./mark-geometry";

export interface PrismPassLogoProps {
  /** "full" = mark + wordmark + descriptor; "mark" = emblem; "wordmark" = type only. */
  variant?: "full" | "mark" | "wordmark";
  /**
   * Emblem height in px for "full"/"mark". For "wordmark" this is the
   * wordmark font size in px.
   */
  size?: number;
  /** @deprecated Use `tone="onDark"`. Kept for existing call sites. */
  onDark?: boolean;
  /**
   * "auto" follows the app theme (navy tile + gold / gold-soft P).
   * "onLight" and "onDark" pin the palette; "mono" prints the bare P in
   * currentColor with a knockout counter.
   */
  tone?: "auto" | BrandTone;
  /** Lockup arrangement; only affects "full". */
  layout?: "horizontal" | "stacked";
  /** Show the "Attendance & verification" descriptor (full/wordmark). */
  descriptor?: boolean;
  /** Hide the mark from assistive tech (when adjacent text already names it). */
  decorative?: boolean;
  /** Accessible name; defaults to "Prism Pass". */
  label?: string;
  className?: string;
}

/**
 * Prism Pass brand lockup — the Aperture P in its flat pass tile.
 *
 * The gold P is the only accent; its prism-shaped counter is a navy
 * knockout on the tile. In one-colour the tile drops and the bare P keeps
 * the same knockout. No gradients, shadows or external assets.
 *
 * @example
 * <PrismPassLogo size={36} />
 * <PrismPassLogo variant="mark" size={20} decorative />
 * <PrismPassLogo tone="mono" variant="full" />
 */
export function PrismPassLogo({
  variant = "full",
  size = 36,
  onDark = false,
  tone = "auto",
  layout = "horizontal",
  descriptor = true,
  decorative = false,
  label = "Prism Pass",
  className,
}: PrismPassLogoProps) {
  const resolvedTone: "auto" | BrandTone = onDark ? "onDark" : tone;
  const isAuto = resolvedTone === "auto";
  const isMono = resolvedTone === "mono";
  const isDark = resolvedTone === "onDark";

  const wordmarkFont = variant === "wordmark" ? size : size * PROPORTIONS.wordmark;
  // The descriptor has an 8.5 px floor: below that, uppercase + tracking collapses
  // at the 30 px lockup sizes used in the app. The wordmark keeps scaling.
  const descriptorFont = Math.max(variant === "wordmark" ? size * 0.45 : size * PROPORTIONS.descriptor, 8.5);
  const descriptorGap = descriptorFont * 0.32;

  const wordmarkClass = cn(
    "font-sans font-semibold whitespace-nowrap",
    isMono && "text-current",
    isDark && "text-[#F7F5F0]",
    resolvedTone === "onLight" && "text-[#142850]",
    isAuto && "text-navy dark:text-foreground"
  );
  const descriptorClass = cn(
    "font-sans font-semibold uppercase whitespace-nowrap",
    isMono && "text-current opacity-70",
    isDark && "text-[#E4CD8E]",
    resolvedTone === "onLight" && "text-[#5C6773]",
    isAuto && "text-muted-foreground dark:text-gold-soft dark:opacity-80"
  );

  const markAccent = isDark ? BRAND.goldSoft : BRAND.gold;

  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
      className="shrink-0"
    >
      {isMono ? (
        <path d={P_COMBINED} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <rect width="32" height="32" rx={TILE_RADIUS} fill={BRAND.navy} />
          <path
            d={P_TILE}
            fill={isAuto ? "currentColor" : markAccent}
            fillRule="evenodd"
            className={isAuto ? "text-gold dark:text-gold-soft" : undefined}
          />
        </>
      )}
    </svg>
  );

  const isStacked = variant === "full" && layout === "stacked";
  const type = (
    <span className={cn("flex flex-col", isStacked && "items-center")} style={{ gap: descriptorGap }}>
      <span
        className={wordmarkClass}
        style={{ fontSize: wordmarkFont, lineHeight: 1, letterSpacing: "-0.015em" }}
      >
        Prism Pass
      </span>
      {descriptor && (
        <span
          className={descriptorClass}
          style={{ fontSize: descriptorFont, lineHeight: 1.2, letterSpacing: "0.18em" }}
        >
          Attendance &amp; verification
        </span>
      )}
    </span>
  );

  const content =
    variant === "mark" ? (
      mark
    ) : variant === "wordmark" ? (
      type
    ) : layout === "stacked" ? (
      <span className="inline-flex flex-col items-center text-center" style={{ gap: size * PROPORTIONS.stackedGap }}>
        {mark}
        {type}
      </span>
    ) : (
      <span className="inline-flex items-center" style={{ gap: size * PROPORTIONS.gap }}>
        {mark}
        {type}
      </span>
    );

  return (
    <span
      className={cn("inline-flex items-center", className)}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      {content}
    </span>
  );
}
