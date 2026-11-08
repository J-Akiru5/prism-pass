import { cn } from "@/lib/cn";

/**
 * "Powered by [mark] Syntaxure Labs" — the attribution reads as one sentence,
 * with the parent brand's mark sitting where the name starts. The mark is
 * decorative: the words around it already carry the brand, so it takes an
 * empty alt rather than making a screen reader repeat it.
 */
export function SyntaxureCredit({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px]",
        onDark ? "text-white/60" : "text-slate-500",
        className,
      )}
    >
      <span className="text-[12.5px]">Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element -- 7 KB static mark, no optimizer needed */}
      <img
        src="/brand/syntaxure.webp"
        alt=""
        width={20}
        height={20}
        decoding="async"
        className={cn("h-5 w-5 shrink-0 rounded-[4px] object-cover", onDark && "ring-1 ring-white/15")}
      />
      <span className={cn("text-[12.5px] font-semibold", onDark ? "text-white/90" : "text-slate-800")}>
        Syntaxure Labs
      </span>
    </span>
  );
}
