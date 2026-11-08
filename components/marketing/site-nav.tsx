"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#audiences", label: "Who it's for" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 bg-white/90 backdrop-blur-xl transition-shadow",
        scrolled ? "border-b border-slate-200 shadow-sm" : "border-b border-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Prism Pass home" className="rounded-lg">
          <BrandLogo size={34} />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          
          <Link
            href="/login"
            className="hidden rounded-[10px] px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-100 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="hidden h-10 items-center gap-1.5 rounded-[10px] bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex"
          >
            Get a demo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-slate-200 text-slate-900 transition-colors hover:bg-slate-50 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 shadow-md md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="flex min-h-[52px] items-center rounded-xl px-3 text-[16px] font-medium text-slate-900 transition-colors hover:bg-slate-100"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="flex min-h-[52px] items-center rounded-xl px-3 text-[16px] font-semibold text-blue-700 transition-colors hover:bg-slate-100"
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-[16px] font-semibold text-white sm:hidden"
          >
            Get a demo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </header>
  );
}
