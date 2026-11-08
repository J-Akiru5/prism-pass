import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Slim chrome for the standalone consoles (scanner, member, platform). They sit
 * outside the organization shell, so every one of them must offer the same way
 * back: brand home, console chooser, and the org console when there is one.
 */
export function ConsoleBar({ label, orgHref }: { label: string; orgHref?: string }) {
  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <PrismPassLogo variant="mark" size={22} />
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <nav aria-label="Console" className="flex min-w-0 items-center gap-3 text-sm">
            <Link
              href="/consoles"
              className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" /> Consoles
            </Link>
            {orgHref && (
              <Link href={orgHref} className="hidden text-muted-foreground transition-colors hover:text-foreground sm:inline">
                Organization
              </Link>
            )}
          </nav>
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
