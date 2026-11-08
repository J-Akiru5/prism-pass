"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, IdCard, CalendarCheck, BarChart3, Settings, ScanLine, UserRound, ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { ThemeToggle } from "./theme-toggle";

// Portal chrome adapted from the inspected dashboard layout: deep-navy
// sidebar, paper header, mobile bottom nav, skip link. No authz logic here.
const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard },
  { href: "/people", label: "People", icon: Users },
  { href: "/passes", label: "Passes", icon: IdCard },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ orgId, orgName, children }: { orgId: string; orgName?: string; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/org/${orgId}`;
  const orgLabel = orgName ?? "Organization";
  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-lg bg-card px-4 py-2.5 text-sm font-bold text-primary shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-white/10 p-5">
          <Link href={base} className="flex items-center gap-3 rounded-lg">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-accent/70 bg-white/10 font-display text-lg font-bold text-gold-soft">
              {orgLabel.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-bold leading-tight">{orgLabel}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-soft">Officer portal</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Portal sections" className="flex-1 space-y-1 overflow-y-auto p-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const to = `${base}${href}`;
            const active = href === "" ? pathname === base : pathname.startsWith(to);
            return (
              <Link
                key={href || "dash"}
                href={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/75 hover:bg-white/5 hover:text-white",
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
        <div className="border-t border-white/10 p-4">
          <Link
            href="/consoles"
            className="mb-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> All consoles
          </Link>
          <div className="mb-2 flex items-center gap-2 opacity-90">
            <PrismPassLogo variant="mark" size={18} onDark />
            <span className="font-display text-xs font-bold text-white/80">Prism Pass</span>
          </div>
          <p className="truncate font-mono text-[11px] text-white/60">{orgId.slice(0, 8)}…</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur-md md:px-6">
          <Link href={base} className="flex min-w-0 items-center gap-2.5 md:hidden">
            <PrismPassLogo variant="mark" size={26} />
            <span className="min-w-0">
              <span className="block truncate font-display text-sm font-bold leading-tight">{orgLabel}</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Officer portal</span>
            </span>
          </Link>
          <span className="hidden min-w-0 truncate font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground md:block">
            Prism Pass · {orgLabel}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link
              href="/scan"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:brightness-110"
            >
              <ScanLine className="size-4" aria-hidden="true" /> Scan
            </Link>
            <Link
              href="/member"
              aria-label="Member portal"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent/60 bg-primary text-gold-soft transition hover:brightness-110"
            >
              <UserRound className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
          {children}
        </main>
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom,0px)] pt-1 backdrop-blur-md md:hidden"
        >
          <ul className="grid grid-cols-5">
            {[
              { href: "", label: "Home", icon: LayoutDashboard },
              { href: "/people", label: "People", icon: Users },
              { href: "/attendance", label: "Attend", icon: CalendarCheck },
              { href: "/passes", label: "Passes", icon: IdCard },
              { href: "/settings", label: "More", icon: Settings },
            ].map(({ href, label, icon: Icon }) => {
              const to = `${base}${href}`;
              const active = href === "" ? pathname === base : pathname.startsWith(to);
              return (
                <li key={label}>
                  <Link
                    href={to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {label}
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
