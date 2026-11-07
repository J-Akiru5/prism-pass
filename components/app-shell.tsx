"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { LayoutDashboard, Users, IdCard, CalendarCheck, BarChart3, Settings, ScanLine, UserRound } from "lucide-react";
import type { ReactNode } from "react";
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
  return (
    <div className="flex min-h-screen bg-background">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-lg bg-card px-4 py-2.5 text-sm font-bold text-primary shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-white/10 p-5">
          <Link href={base} className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-sidebar-accent bg-white/10 font-display text-lg font-bold text-gold-soft">
              {(orgName ?? "P").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-display text-[15px] font-bold leading-tight">{orgName ?? "Prism Pass"}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-gold-soft">Officer portal</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Portal sections" className="flex-1 space-y-1 p-4">
          {NAV.map(({ href, label, icon: Icon }) => {
            const to = `${base}${href}`;
            const active = href === "" ? pathname === base : pathname.startsWith(to);
            return (
              <Link
                key={href || "dash"}
                href={to}
                aria-current={active ? "page" : undefined}
                className={twMerge(clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/5 hover:text-white",
                ))}
              >
                <Icon className="size-4 opacity-80" aria-hidden="true" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <p className="truncate font-mono text-[11px] text-white/70">{orgId.slice(0, 8)}… · Prism Pass</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-6">
          <Link href={base} className="flex items-center gap-2 md:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent bg-primary font-display text-sm font-bold text-gold-soft">
              {(orgName ?? "P").charAt(0).toUpperCase()}
            </span>
            <span className="font-mono text-xs font-medium uppercase tracking-widest text-primary">Attendance</span>
          </Link>
          <span className="hidden font-mono text-xs uppercase tracking-widest text-muted-foreground md:block">Prism Pass · {orgName ?? "Organization"}</span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/scan" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
              <ScanLine className="size-4" aria-hidden="true" /> Scan
            </Link>
            <Link href="/member" aria-label="Member portal" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-accent bg-primary text-sm font-bold text-gold-soft">
              <UserRound className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-6 md:pb-10 md:pt-8">
          {children}
        </main>
        <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card px-2 pb-[env(safe-area-inset-bottom,0px)] pt-1 md:hidden">
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
                  <Link href={to} aria-current={active ? "page" : undefined} className={twMerge(clsx("flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground"))}>
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
