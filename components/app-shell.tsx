"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, IdCard, CalendarCheck, BarChart3, Settings, ScanLine, UserRound, ArrowLeft, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/brand/logo";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { SignOutButton } from "@/components/sign-out-button";

// Each section carries its own hue so the console reads at a glance.
const NAV = [
  { href: "", label: "Dashboard", icon: LayoutDashboard, color: "text-blue-600", tint: "bg-blue-50 ring-blue-100" },
  { href: "/people", label: "People", icon: Users, color: "text-violet-600", tint: "bg-violet-50 ring-violet-100" },
  { href: "/passes", label: "Passes", icon: IdCard, color: "text-amber-600", tint: "bg-amber-50 ring-amber-100" },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, color: "text-teal-600", tint: "bg-teal-50 ring-teal-100" },
  { href: "/reports", label: "Reports", icon: BarChart3, color: "text-rose-600", tint: "bg-rose-50 ring-rose-100" },
  { href: "/settings", label: "Settings", icon: Settings, color: "text-slate-600", tint: "bg-slate-100 ring-slate-200" },
];

export function AppShell({ orgId, orgName, children }: { orgId: string; orgName?: string; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/org/${orgId}`;
  const [orgLabel, setOrgLabel] = useState(orgName ?? "Organization");
  const [moreOpen, setMoreOpen] = useState(false);

  // The shell gets the route id only; the display name is read from the API so
  // the header says which organization you are inside.
  useEffect(() => {
    if (orgName) return;
    let alive = true;
    fetch(`/api/v1/orgs/${orgId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.data?.name) setOrgLabel(j.data.name); })
      .catch(() => { /* keep fallback label */ });
    return () => { alive = false; };
  }, [orgId, orgName]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  return (
    <div className="relative flex min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-[250%] rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-transform focus-visible:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 z-10 hidden h-dvh w-64 shrink-0 flex-col self-start border-r border-slate-200 bg-white/95 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/95 md:flex">
        <div className="border-b border-slate-100 p-5 dark:border-white/10">
          <Link href={base} className="flex items-center gap-3 rounded-xl">
            <BrandLogo variant="mark" size={40} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-tight">{orgLabel}</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">Officer portal</span>
            </span>
          </Link>
        </div>
        <nav aria-label="Portal sections" className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map(({ href, label, icon: Icon, color, tint }) => {
            const to = `${base}${href}`;
            const active = href === "" ? pathname === base : pathname.startsWith(to);
            return (
              <Link
                key={href || "dash"}
                href={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-[14.5px] font-semibold transition-colors",
                  active
                    ? "bg-blue-50/80 text-blue-900 ring-1 ring-blue-100/90 shadow-[inset_2px_0_0_0_#2563eb]"
                    : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:ring-1 hover:ring-slate-200/70",
                )}
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg ring-1", active ? tint : "bg-white ring-slate-200 dark:bg-white/5 dark:ring-white/10")}>
                  <Icon className={cn("size-4", active ? color : "text-slate-500 dark:text-slate-400")} aria-hidden="true" />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <Link
            href="/consoles"
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-900 hover:ring-1 hover:ring-slate-200/70"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" /> All consoles
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/85 px-4 py-2.5 backdrop-blur-xl md:px-8 md:py-3">
          <Link href={base} className="flex min-w-0 items-center gap-2.5 md:hidden">
            <BrandLogo variant="mark" size={30} />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold leading-tight tracking-tight">{orgLabel}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Officer</span>
            </span>
          </Link>
          <span className="hidden min-w-0 truncate text-[13px] font-medium text-slate-500 md:block">
            {orgLabel}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            
            <Link
              href="/scan"
              className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-blue-600 px-4 text-[15px] font-semibold text-white shadow-sm shadow-blue-600/25 transition hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              <ScanLine className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Scan</span><span className="sm:hidden">Scan</span>
            </Link>
            <Link
              href="/member"
              aria-label="Member portal"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-white/15 dark:bg-transparent dark:text-slate-200"
            >
              <UserRound className="size-4" aria-hidden="true" />
            </Link>
            <SignOutButton variant="icon" />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-9">
          {children}
        </main>
        <MobileTabBar base={base} onMore={() => setMoreOpen(true)} />

        {moreOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More options">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMoreOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />
            <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[17px] font-bold text-slate-900 dark:text-white">More</p>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close menu"
                  className="flex size-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-white/10">
                {[
                  { href: `${base}/reports`, label: "Reports", hint: "Download attendance as a spreadsheet" },
                  { href: `${base}/settings`, label: "Settings & audit log", hint: "Organization details and recent actions" },
                  { href: "/scan", label: "Scanner", hint: "Check someone in with the camera" },
                  { href: "/member", label: "My pass", hint: "Your own pass and history" },
                  { href: "/consoles", label: "All consoles", hint: "Switch organization or portal" },
                ].map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setMoreOpen(false)} className="flex min-h-[60px] items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className="block text-[16.5px] font-semibold text-slate-900 dark:text-white">{item.label}</span>
                        <span className="block text-[14px] text-slate-500 dark:text-slate-400">{item.hint}</span>
                      </span>
                      <ArrowLeft className="size-4 shrink-0 rotate-180 text-slate-400" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
