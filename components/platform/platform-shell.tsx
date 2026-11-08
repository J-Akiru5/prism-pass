"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, Building2, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Platform console shell — separate from the organization portal (ADR-11).
 *
 * Deep-navy sidebar on desktop, five-item bottom nav on mobile, sticky paper
 * header, skip link. Every target is at least 44px high where it is a primary
 * control. Active state uses both `aria-current` and a gold rule, so colour is
 * never the only signal.
 */
const NAV = [
  { href: "/platform", label: "Overview", short: "Overview", icon: LayoutDashboard },
  { href: "/platform/orgs", label: "Organizations", short: "Orgs", icon: Building2 },
  { href: "/platform/admins", label: "Platform admins", short: "Admins", icon: ShieldCheck },
  { href: "/platform/audit", label: "Audit", short: "Audit", icon: ScrollText },
  { href: "/platform/health", label: "Health", short: "Health", icon: Activity },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = NAV.find((item) => isActive(pathname, item.href))?.label ?? "Platform";

  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-lg bg-card px-4 py-2.5 text-sm font-bold text-primary shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-white/10 p-5">
          <Link href="/platform" className="flex items-center gap-3 rounded-lg" aria-label="Platform console home">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-accent/70 bg-white/10">
              <PrismPassLogo variant="mark" size={22} tone="onDark" decorative />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[15px] font-bold leading-tight">Prism Pass</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft">
                Platform console
              </span>
            </span>
          </Link>
        </div>

        <nav aria-label="Platform sections" className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold-soft transition-opacity",
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  )}
                />
                <Icon className={cn("size-4", active ? "opacity-100" : "opacity-75")} aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <Link
            href="/consoles"
            className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowUpRight className="size-3.5" aria-hidden="true" /> All consoles
          </Link>
          <p className="px-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
            Syntaxure Labs · ADR-11
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur-md md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="md:hidden">
              <PrismPassLogo variant="mark" size={26} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold leading-tight md:text-base">
                {current}
              </span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground md:text-[10px]">
                Platform console · Syntaxure Labs
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle className="h-11 w-11" />
            <Link
              href="/consoles"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              All consoles <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-12 md:pt-8"
        >
          {children}
        </main>

        <nav
          aria-label="Platform sections"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom,0px)] pt-1 backdrop-blur-md md:hidden"
        >
          <ul className="grid grid-cols-5">
            {NAV.map(({ href, short, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span className="w-full truncate text-center">{short}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
