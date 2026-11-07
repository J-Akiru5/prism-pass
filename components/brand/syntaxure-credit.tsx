"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * "Powered by Syntaxure Labs" lockup.
 *
 * Drop the official logo file at `public/syntaxure-labs-logo.svg` and it
 * will be used automatically; until then a crafted "S" monogram renders.
 * Pass `onDark` on navy/dark backgrounds.
 */
export function SyntaxureCredit({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  const [imgOk, setImgOk] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  // Prerendered <img> can fail before hydration attaches onError —
  // catch that case on mount (React does not replay error events).
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) setImgOk(false);
  }, []);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src="/syntaxure-labs-logo.svg"
          alt="Syntaxure Labs"
          width={22}
          height={22}
          className="h-[22px] w-[22px] rounded-md object-contain"
          onError={() => setImgOk(false)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex h-[22px] w-[22px] items-center justify-center rounded-md font-display text-[13px] font-bold",
            onDark ? "bg-gold-soft/15 text-gold-soft ring-1 ring-gold-soft/40" : "bg-primary text-primary-foreground"
          )}
        >
          S
        </span>
      )}
      <span className={cn("text-xs", onDark ? "text-white/60" : "text-muted-foreground")}>
        Powered by <span className={cn("font-semibold", onDark ? "text-white/90" : "text-foreground")}>Syntaxure Labs</span>
      </span>
    </span>
  );
}
