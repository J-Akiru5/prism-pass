import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

/**
 * Top bar for the consoles that live outside the organisation shell
 * (scanner, member portal). The way back is a real button — bordered, 44px,
 * with an arrow — because plain breadcrumb text does not read as clickable.
 */
export function ConsoleBar({ label, orgHref }: { label: string; orgHref?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-2 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden shrink-0 sm:block">
            <BrandLogo variant="mark" size={26} />
          </span>

          <Link
            href="/consoles"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:translate-y-px md:h-10"
          >
            <ArrowLeft className="size-4 text-slate-500" aria-hidden="true" />
            Consoles
          </Link>

          <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 md:block" />
          <span
            aria-current="page"
            className="hidden truncate text-[15px] font-semibold tracking-[-0.01em] text-slate-900 md:block"
          >
            {label}
          </span>
        </div>

        {orgHref && (
          <Link
            href={orgHref}
            aria-label="Go to the organization dashboard"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:translate-y-px md:h-10"
          >
            <LayoutDashboard className="size-4 text-slate-500" aria-hidden="true" />
            <span>Dashboard</span>
          </Link>
        )}
      </div>
    </header>
  );
}
