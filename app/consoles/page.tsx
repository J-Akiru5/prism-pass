import Link from "next/link";
import { LayoutDashboard, ScanLine, UserRound } from "lucide-react";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { ThemeToggle } from "@/components/theme-toggle";

const CONSOLES = [
  { href: "/platform", title: "Platform", desc: "Provisioning + oversight", Icon: LayoutDashboard },
  { href: "/member", title: "Member", desc: "Pass + history", Icon: UserRound },
  { href: "/scan", title: "Scanner", desc: "QR check-in/out", Icon: ScanLine },
];

export const metadata = { title: "Consoles — Prism Pass" };

/** Signed-in console chooser (previously the `/` home page). */
export default function ConsolesPage() {
  return (
    <div className="min-h-dvh bg-background">
      <div className="relative overflow-hidden bg-gradient-to-br from-navy-deep via-navy to-navy-light text-white">
        <div aria-hidden="true" className="absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/10" />
        <div aria-hidden="true" className="absolute -bottom-24 right-24 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative mx-auto flex max-w-5xl items-start justify-between gap-4 px-6 pb-14 pt-12 md:pt-16">
          <div>
            <Link href="/" aria-label="Back to site home">
              <PrismPassLogo onDark />
            </Link>
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight md:text-5xl">Choose a console</h1>
            <p className="mt-3 max-w-xl text-[15px] text-white/75">
              Organization consoles appear after sign-in, resolved through your verified membership — never a demo workspace.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONSOLES.map(({ href, title, desc, Icon }) => (
            <Link key={href} href={href} className="group rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="mt-3 block font-display text-lg font-bold group-hover:underline">{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{desc}</span>
            </Link>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <SyntaxureCredit />
        </div>
      </main>
    </div>
  );
}
