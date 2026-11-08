"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { ThemeToggle } from "@/components/theme-toggle";
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
  // The hero is deep navy, so the transparent state has to be a dark-surface
  // nav. Once it detaches onto paper it flips to the light token set.
  const onDark = !scrolled;

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
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300",
        scrolled
          ? "border-b border-border/80 bg-background/85 shadow-sm backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:h-[4.5rem]">
        <Link href="/" aria-label="Prism Pass home" className="rounded-lg">
          <PrismPassLogo size={34} onDark={onDark} />
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                onDark
                  ? "text-white/75 hover:bg-white/10 hover:text-white"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle className={onDark ? "border-white/25 text-white hover:bg-white/10" : undefined} />
          <Link
            href="/login"
            className={cn(
              "hidden rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:inline-flex",
              onDark ? "text-white/90 hover:bg-white/10 hover:text-white" : "text-foreground hover:bg-muted",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition",
              onDark
                ? "bg-gradient-to-br from-gold-soft via-accent to-gold-dark text-navy-deep shadow-[0_6px_20px_-6px_rgba(201,162,75,0.6)] hover:brightness-105"
                : "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
            )}
          >
            Get a demo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors md:hidden",
              onDark ? "border-white/25 text-white hover:bg-white/10" : "border-input text-foreground hover:bg-muted",
            )}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="border-t border-border bg-background/95 px-4 pb-4 pt-2 shadow-md backdrop-blur-xl md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
      )}
    </header>
  );
}
