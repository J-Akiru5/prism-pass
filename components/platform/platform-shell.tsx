"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, Building2, LayoutDashboard, ScrollText, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/sign-out-button";

/**
 * Platform console shell — separate from the organization portal.
 * White surface, one blue action, and 48px mobile targets.
 */
const NAV = [
  { href: "/platform", label: "Overview", short: "Home", icon: LayoutDashboard },
  { href: "/platform/orgs", label: "Organizations", short: "Orgs", icon: Building2 },
  { href: "/platform/admins", label: "Platform admins", short: "Admins", icon: ShieldCheck },
  { href: "/platform/audit", label: "Audit log", short: "Audit", icon: ScrollText },
  { href: "/platform/health", label: "System health", short: "Health", icon: Activity },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const current = NAV.find((item) => isActive(pathname, item.href))?.label ?? "Platform";

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col self-start border-r border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950 md:flex">
        <div className="border-b border-slate-100 p-5 dark:border-white/10">
          <Link href="/platform" className="flex items-center gap-3 rounded-xl" aria-label="Platform console home">
            <BrandLogo variant="mark" size={34} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-tight">Prism Pass</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Platform</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Platform sections" className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                  active
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-slate-100 p-4 dark:border-white/10">
          <Link
            href="/consoles"
            className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-[14px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <ArrowUpRight className="size-4" aria-hidden="true" /> All consoles
          </Link>
          <p className="px-2 text-[12px] text-slate-400">Syntaxure Labs</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="md:hidden">
              <BrandLogo variant="mark" size={30} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-tight tracking-tight">{current}</span>
              <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                Platform console
              </span>
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            
            <Link
              href="/consoles"
              className="hidden h-11 items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 sm:inline-flex"
            >
              Consoles
            </Link>
            <SignOutButton variant="icon" />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-12 md:pt-8"
        >
          {children}
        </main>

        <nav
          aria-label="Platform navigation"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom,0px)] pt-1.5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 md:hidden"
        >
          <ul className="grid grid-cols-5 gap-1">
            {NAV.map(({ href, short, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[66px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[12.5px] font-bold transition-colors",
                      active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300",
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" />
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
