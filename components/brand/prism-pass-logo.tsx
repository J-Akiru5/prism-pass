import { cn } from "@/lib/cn";

interface PrismPassLogoProps {
  /** "full" renders mark + wordmark; "mark" renders the emblem only. */
  variant?: "full" | "mark";
  /** Height of the emblem in px. Wordmark scales with it. */
  size?: number;
  /** Set for use on dark / navy backgrounds. */
  onDark?: boolean;
  className?: string;
}

/**
 * Prism Pass brand lockup.
 * Emblem: a faceted prism — a navy tile with a gold triangular facet
 * splitting a beam into a spectrum bar. Pure inline SVG, no assets.
 */
export function PrismPassLogo({ variant = "full", size = 36, onDark = false, className }: PrismPassLogoProps) {
  const id = `pp-${variant}-${size}-${onDark ? "d" : "l"}`;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Prism Pass logo" className="shrink-0 drop-shadow-sm">
        <defs>
          <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1B3A6B" />
            <stop offset="1" stopColor="#0C1B36" />
          </linearGradient>
          <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#E4CD8E" />
            <stop offset="0.55" stopColor="#C9A24B" />
            <stop offset="1" stopColor="#8A6D2F" />
          </linearGradient>
          <linearGradient id={`${id}-beam`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5B8DEF" />
            <stop offset="0.5" stopColor="#C9A24B" />
            <stop offset="1" stopColor="#E4CD8E" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${id}-tile)`} />
        <rect x="2.75" y="2.75" width="42.5" height="42.5" rx="11" fill="none" stroke="#C9A24B" strokeOpacity="0.55" strokeWidth="1.5" />
        {/* prism facet */}
        <path d="M24 10 L36 32 H12 Z" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M24 10 L24 32" stroke={`url(#${id}-gold)`} strokeWidth="1.25" strokeOpacity="0.8" />
        <path d="M18.5 21.5 L29.5 21.5" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1.25" />
        {/* refracted beam */}
        <rect x="10" y="35.5" width="28" height="3.5" rx="1.75" fill={`url(#${id}-beam)`} />
      </svg>
      {variant === "full" && (
        <span className="flex flex-col leading-none">
          <span className={cn("font-display text-[19px] font-bold tracking-tight", onDark ? "text-white" : "text-foreground")}>
            Prism Pass
          </span>
          <span className={cn("mt-1 text-[10px] font-semibold uppercase tracking-[0.22em]", onDark ? "text-gold-soft" : "text-muted-foreground")}>
            Attendance & verification
          </span>
        </span>
      )}
    </span>
  );
}
