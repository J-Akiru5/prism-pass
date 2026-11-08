import { cn } from "@/lib/cn";

/** The single source of truth for the product name, used in copy and metadata. */
export const BRAND_NAME = "Prism Pass";
export const BRAND_TAGLINE = "Attendance you can prove";
export const BRAND_DESCRIPTOR = "Attendance & verification";

type Tone = "auto" | "onLight" | "onDark" | "mono";

export interface BrandLogoProps {
  /** "full" = mark + wordmark + descriptor; "mark" = emblem only; "wordmark" = type only. */
  variant?: "full" | "mark" | "wordmark";
  /** Emblem height in px for "full"/"mark"; wordmark font size for "wordmark". */
  size?: number;
  /** @deprecated Use `tone="onDark"`. */
  onDark?: boolean;
  tone?: Tone;
  layout?: "horizontal" | "stacked";
  descriptor?: boolean;
  decorative?: boolean;
  label?: string;
  className?: string;
}

/**
 * Prism Pass lockup — a faceted prism splitting a scan beam.
 *
 * A hexagonal prism outline with a white beam entering the left facet and
 * three refracting rays leaving the right: scanning, identity, light. No
 * letters, no checkmark, no borrowed symbols. Below 26px the rays collapse to
 * a single beam so the mark stays legible at favicon sizes.
 */
export function BrandLogo({
  variant = "full",
  size = 36,
  onDark = false,
  tone = "auto",
  layout = "horizontal",
  descriptor = true,
  decorative = false,
  label = BRAND_NAME,
  className,
}: BrandLogoProps) {
  const resolved: Tone = onDark ? "onDark" : tone;
  const isMono = resolved === "mono";
  const simple = size < 26;

  const facet = isMono ? "currentColor" : "#FFFFFF";
  const incoming = isMono ? "currentColor" : "#FFFFFF";
  const rayA = isMono ? "currentColor" : "#60A5FA";
  const rayB = isMono ? "currentColor" : "#A78BFA";
  const rayC = isMono ? "currentColor" : "#34D399";

  const wordmarkFont = variant === "wordmark" ? size : size * 0.5;
  const descriptorFont = Math.max(variant === "wordmark" ? size * 0.28 : size * 0.19, 8.5);
  const gap = descriptorFont * 0.36;
  const isStacked = variant === "full" && layout === "stacked";

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
      {!isMono && (
        <>
          <rect width="32" height="32" rx="9" fill="#0F172A" />
          <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="8.4" stroke="#FFFFFF" strokeOpacity="0.16" strokeWidth="1.2" />
        </>
      )}

      {/* faceted prism body — two internal facets catch the light */}
      {!isMono && (
        <>
          <path d="M16 4.9 6.6 10.45 16 16Z" fill="#FFFFFF" fillOpacity="0.1" />
          <path d="M16 27.1 25.4 21.55 16 16Z" fill="#FFFFFF" fillOpacity="0.05" />
        </>
      )}
      <path
        d="M16 4.9 25.4 10.45v11.1L16 27.1 6.6 21.55v-11.1z"
        stroke={facet}
        strokeWidth={simple ? 2 : 1.6}
        strokeLinejoin="round"
      />

      {simple ? (
        <>
          {/* compact: one beam straight through the prism */}
          <path d="M7.6 16h16.8" stroke={incoming} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M16 16h8.4" stroke={rayA} strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* beam entering the left facet */}
          <path d="M5.6 16h11.2" stroke={incoming} strokeWidth="2" strokeLinecap="round" />
          {/* refracted rays leaving the right facet */}
          <path d="M16 16 24.2 11.2" stroke={rayA} strokeWidth="2" strokeLinecap="round" />
          <path d="M16 16h8.8" stroke={rayB} strokeWidth="2" strokeLinecap="round" />
          <path d="M16 16 24.2 20.8" stroke={rayC} strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );

  const type = (
    <span className={cn("flex flex-col", isStacked && "items-center")} style={{ gap }}>
      <span
        className={cn(
          "whitespace-nowrap font-semibold",
          isMono && "text-current",
          resolved === "onDark" && "text-white",
          resolved === "onLight" && "text-slate-900",
          resolved === "auto" && "text-slate-900 dark:text-white",
        )}
        style={{ fontSize: wordmarkFont, lineHeight: 1, letterSpacing: "-0.03em" }}
      >
        {BRAND_NAME}
      </span>
      {descriptor && (
        <span
          className={cn(
            "whitespace-nowrap font-semibold uppercase",
            isMono && "text-current opacity-70",
            resolved === "onDark" && "text-white/55",
            !isMono && resolved !== "onDark" && "text-slate-500",
            resolved === "auto" && "text-slate-500 dark:text-slate-400",
          )}
          style={{ fontSize: descriptorFont, lineHeight: 1.2, letterSpacing: "0.2em" }}
        >
          {BRAND_DESCRIPTOR}
        </span>
      )}
    </span>
  );

  const content =
    variant === "mark" ? (
      mark
    ) : variant === "wordmark" ? (
      type
    ) : isStacked ? (
      <span className="inline-flex flex-col items-center text-center" style={{ gap: size * 0.22 }}>
        {mark}
        {type}
      </span>
    ) : (
      <span className="inline-flex items-center" style={{ gap: size * 0.34 }}>
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
