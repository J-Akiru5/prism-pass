"use client";

import { cn } from "@/lib/cn";

/**
 * "Powered by Syntaxure Labs" lockup — an engraved "S" monogram plus the name.
 * The parent brand is credited in type only; no external asset is required.
 */
export function SyntaxureCredit({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex h-[24px] w-[24px] items-center justify-center rounded-md bg-gradient-to-br text-[13px] font-bold",
          onDark
            ? "from-white/25 to-white/10 text-white ring-1 ring-white/25"
            : "from-slate-800 to-slate-950 text-white shadow-sm shadow-slate-900/20",
        )}
      >
        S
      </span>
      <span className={cn("text-[12.5px]", onDark ? "text-white/60" : "text-slate-500")}>
        Powered by <span className={cn("font-semibold", onDark ? "text-white/90" : "text-slate-800")}>Syntaxure Labs</span>
      </span>
    </span>
  );
}
