"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarCheck2, Mail, ShieldCheck } from "lucide-react";
import { PrismPassLogo } from "@/components/brand/prism-pass-logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";

const SIZES = ["1–50 people", "51–200 people", "201–1,000 people", "1,000+ people"];

const NEXT_STEPS = [
  { Icon: Mail, text: "We reply within one business day with a scoped demo plan." },
  { Icon: Building2, text: "We provision a private tenant — your data never touches a shared demo." },
  { Icon: CalendarCheck2, text: "We import a sample roster and run a live scanning session with your team." },
];

interface Errors { name?: string; email?: string; org?: string; message?: string }

export default function DemoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const [size, setSize] = useState(SIZES[1]);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);

  const mailto = useMemo(() => {
    const subject = encodeURIComponent(`Prism Pass demo request — ${org || "new organization"}`);
    const body = encodeURIComponent(
      `Name: ${name}\nWork email: ${email}\nOrganization: ${org}\nSize: ${size}\n\nNeeds:\n${message || "(not specified)"}`
    );
    return `mailto:hello@syntaxure.dev?subject=${subject}&body=${body}`;
  }, [name, email, org, size, message]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    if (name.trim().length < 2) next.name = "Tell us your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = "Enter a valid work email.";
    if (org.trim().length < 2) next.org = "Which organization is this for?";
    if (message.trim().length > 0 && message.trim().length < 10) next.message = "A little more detail helps (10+ characters).";
    setErrors(next);
    if (Object.keys(next).length === 0) setSent(true);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Prism Pass home">
          <PrismPassLogo size={32} />
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:grid-cols-2 lg:gap-12">
        {/* pitch panel */}
        <div className="relative overflow-hidden rounded-3xl bg-navy-deep p-8 text-white sm:p-10">
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-[#2E5CB8]/50 blur-[100px]" />
            <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-[#C9A24B]/25 blur-[100px]" />
          </div>
          <div className="relative">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-white/60 transition hover:text-white">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to site
            </Link>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl">
              Book your{" "}
              <span className="bg-gradient-to-r from-gold-soft to-gold-dark bg-clip-text text-transparent">
                guided demo
              </span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-white/70">
              A 30-minute working session on your use case — directory, passes,
              scanning, and reporting — followed by a private tenant you can
              pilot with real programs.
            </p>
            <ul className="mt-8 space-y-4">
              {NEXT_STEPS.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-soft">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-sm leading-relaxed text-white/80">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <ShieldCheck className="size-5 shrink-0 text-gold-soft" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-white/65">
                No shared demo workspace. Your pilot data lives in its own tenant scope from day one.
              </p>
            </div>
            <div className="mt-6">
              <SyntaxureCredit onDark />
            </div>
          </div>
        </div>

        {/* form panel */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Request a demo</CardTitle>
            <CardDescription>We reply within one business day. No spam, no newsletter — just the demo.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="flex flex-col items-center py-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <BadgeCheck className="size-7" aria-hidden="true" />
                </span>
                <h2 className="mt-4 font-display text-xl font-bold">Request ready to send</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Thanks, {name.trim().split(" ")[0] || "there"} — your demo request for{" "}
                  <strong className="text-foreground">{org.trim()}</strong> is composed.
                  Send it with one click and we&apos;ll take it from there.
                </p>
                <div className="mt-6 flex w-full flex-col gap-2">
                  <a href={mailto}>
                    <Button size="lg" className="w-full">
                      Send via email <ArrowRight aria-hidden="true" />
                    </Button>
                  </a>
                  <Button variant="outline" size="lg" className="w-full" onClick={() => setSent(false)}>
                    Edit details
                  </Button>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Prefer to write directly? Email <span className="font-semibold">hello@syntaxure.dev</span>.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Full name" htmlFor="demo-name" required error={errors.name ?? null}>
                    <Input id="demo-name" placeholder="Maria Santos" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </FormField>
                  <FormField label="Work email" htmlFor="demo-email" required error={errors.email ?? null}>
                    <Input id="demo-email" placeholder="you@org.edu" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </FormField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Organization" htmlFor="demo-org" required error={errors.org ?? null}>
                    <Input id="demo-org" placeholder="Acme University" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" />
                  </FormField>
                  <FormField label="Team size" htmlFor="demo-size">
                    <select
                      id="demo-size"
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
                    >
                      {SIZES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </FormField>
                </div>
                <FormField label="What are you running?" htmlFor="demo-message" hint="Programs, headcount, current pain — anything useful." error={errors.message ?? null}>
                  <textarea
                    id="demo-message"
                    rows={4}
                    placeholder="e.g. 2,000 students across 4 programs; class attendance is still on paper…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/30"
                  />
                </FormField>
                <Button type="submit" size="lg" className="w-full">
                  Continue <ArrowRight aria-hidden="true" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By continuing you agree to be contacted about this request. See{" "}
                  <Link href="/privacy" className="font-medium text-primary underline underline-offset-2">
                    Privacy & your rights
                  </Link>
                  .
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
