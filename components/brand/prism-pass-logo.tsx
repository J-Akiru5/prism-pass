import { cn } from "@/lib/cn";

interface PrismPassLogoProps {
  /** "full" renders mark + wordmark; "mark" renders the emblem only. */
  variant?: "full" | "mark";
  /** Height of the emblem in px. Wordmark and spacing scale with it. */
  size?: number;
  /** Set for use on dark / navy backgrounds. */
  onDark?: boolean;
  className?: string;
}

/**
 * Prism Pass brand lockup.
 *
 * Emblem: a solid, faceted triangular prism. A single gold beam enters the
 * left facet, bends through the body and refracts into a spectrum on the
 * right. The triangle is a filled shape (not an outline) so the silhouette
 * survives at 16px; the spectrum is dropped below 26px, where three rays
 * would collapse into mud.
 *
 * Structure is navy/white (adapts via `onDark`), the beam is brand gold, and
 * the spectrum is the only place non-brand hues appear.
 */
export function PrismPassLogo({ variant = "full", size = 36, onDark = false, className }: PrismPassLogoProps) {
  const id = `pp-${variant}-${size}-${onDark ? "d" : "l"}`;
  const detailed = size >= 26;
  // Optical sizing: the mark is a wide, bottom-heavy triangle, so the text
  // block is set slightly tighter and slightly lower than pure centring.
  const wordSize = Math.round(size * 0.52);
  const subSize = Math.max(9, Math.round(size * 0.265));
  const gap = Math.max(7, Math.round(size * 0.22));
  const labelled = variant === "mark";

  return (
    <span className={cn("inline-flex items-center", className)} style={{ gap }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role={labelled ? "img" : undefined}
        aria-label={labelled ? "Prism Pass" : undefined}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        className="shrink-0"
      >
        <defs>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0" stopColor={onDark ? "#FFFFFF" : "#1B3A6B"} />
            <stop offset="1" stopColor={onDark ? "#C9D6EE" : "#0C1B36"} />
          </linearGradient>
          <linearGradient id={`${id}-facet`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={onDark ? "#FFFFFF" : "#2A4E86"} />
            <stop offset="1" stopColor={onDark ? "#DCE6F7" : "#142850"} />
          </linearGradient>
          <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#C9A24B" />
            <stop offset="1" stopColor="#E4CD8E" />
          </linearGradient>
        </defs>

        {/* prism body — right facet (main) */}
        <path d="M24 8 L41 36 L24 36 Z" fill={`url(#${id}-body)`} />
        {/* left facet catches the light */}
        <path d="M24 8 L7 36 L24 36 Z" fill={`url(#${id}-facet)`} />
        {/* refraction ridge */}
        <path d="M24 8 L24 36" stroke={onDark ? "#FFFFFF" : "#0C1B36"} strokeOpacity="0.28" strokeWidth="1" />
        {detailed && (
          <path d="M24 8 L7 36" stroke="#E4CD8E" strokeOpacity="0.55" strokeWidth="1.15" strokeLinejoin="round" />
        )}

        {/* incoming beam */}
        <path d="M0.6 30 H11.4" stroke={`url(#${id}-beam)`} strokeWidth={detailed ? 2.2 : 3} strokeLinecap="round" />
        {detailed ? (
          <>
            {/* bend through the prism body */}
            <path d="M11.4 30 L35.3 26.6" stroke="#C9A24B" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" />
            {/* refracted spectrum */}
            <path d="M35.3 26.6 L47.4 17.8" stroke="#4C7BE0" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M35.3 26.6 L47.4 24.1" stroke="#C9A24B" strokeWidth="1.9" strokeLinecap="round" />
            <path d="M35.3 26.6 L47.4 30.2" stroke="#E4CD8E" strokeWidth="1.9" strokeLinecap="round" />
          </>
        ) : (
          <path d="M35.3 26.6 L47 23" stroke="#C9A24B" strokeWidth="3" strokeLinecap="round" />
        )}
      </svg>

      {variant === "full" && (
        <span className="flex flex-col justify-center leading-none" style={{ marginTop: Math.round(size * 0.03) }}>
          <span
            className={cn("font-display font-bold leading-none", onDark ? "text-white" : "text-foreground")}
            style={{ fontSize: wordSize, letterSpacing: "-0.022em" }}
          >
            Prism Pass
          </span>
          <span
            className={cn(
              "mt-[0.42em] font-mono font-semibold uppercase leading-none",
              onDark ? "text-gold-soft" : "text-gold-dark",
            )}
            style={{ fontSize: subSize, letterSpacing: "0.16em" }}
          >
            Attendance &amp; verification
          </span>
        </span>
      )}
    </span>
  );
}
