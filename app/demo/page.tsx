"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarCheck2, Mail, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const SIZES = ["1–50 people", "51–200 people", "201–1,000 people", "1,000+ people"];

const NEXT_STEPS = [
  { Icon: Mail, text: "We reply within one business day with a plan for your demo." },
  { Icon: Building2, text: "We set up a private workspace, so your data never sits in a shared demo." },
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
          <BrandLogo size={32} />
        </Link>
        <div className="flex items-center gap-2">
          
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-muted">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:grid-cols-2 lg:gap-12">
        {/* pitch panel */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
          <div className="relative">
            <Link href="/" className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-slate-600 transition hover:text-slate-900">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back to site
            </Link>
            <h1 className="mt-2 text-[30px] font-bold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Book a guided demo
            </h1>
            <p className="mt-2 max-w-md text-[16px] leading-relaxed text-slate-600">
              Thirty minutes on your own use case: directory, passes, scanning, and reports. Then a private workspace you can pilot with real people.
            </p>
            <ul className="mt-8 space-y-4">
              {NEXT_STEPS.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 ring-1 ring-slate-200">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-[15px] leading-relaxed text-slate-700">{text}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <ShieldCheck className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-[14.5px] leading-relaxed text-slate-600">
                Nothing is shared with other organizations. Your pilot data stays separate from day one.
              </p>
            </div>
            <div className="mt-5">
              <SyntaxureCredit />
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
