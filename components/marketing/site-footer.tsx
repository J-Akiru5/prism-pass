import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";

const COLS = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Features" },
      { href: "#how", label: "How it works" },
      { href: "#audiences", label: "Who it's for" },
      { href: "#faq", label: "FAQ" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/member", label: "My pass" },
      { href: "/scan", label: "Scanner" },
      { href: "/consoles", label: "All screens" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/demo", label: "Book a demo" },
      { href: "/privacy", label: "Privacy & your rights" },
      { href: "/login", label: "Support" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative bg-navy-deep text-white">
      <div aria-hidden="true" className="h-px bg-gradient-to-r from-transparent via-accent/55 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <BrandLogo onDark size={38} />
            <p className="mt-4 max-w-xs text-pretty text-sm leading-relaxed text-white/65">
              One list of people, one QR pass each, and one attendance record that
              holds up when it is checked.
            </p>
            <div className="mt-5">
              <SyntaxureCredit onDark />
            </div>
          </div>
          {COLS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-gold-soft">{col.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-white/65 transition-colors hover:text-gold-soft">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-white/45">© {new Date().getFullYear()} Prism Pass. All rights reserved.</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">People · Passes · Attendance</p>
        </div>
      </div>
    </footer>
  );
}
