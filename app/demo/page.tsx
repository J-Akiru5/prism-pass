"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarCheck2, Mail, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input, Select } from "@/components/ui/input";

const SIZES = ["1–50 people", "51–200 people", "201–1,000 people", "1,000+ people"];

const NEXT_STEPS = [
  { Icon: Mail, text: "We reply within one business day with a plan for your demo." },
  { Icon: Building2, text: "You get your own space, so your data is never mixed into a shared demo." },
  { Icon: CalendarCheck2, text: "We add a sample list of people and try a live scan with your team." },
];

interface Errors {
  name?: string;
  email?: string;
  org?: string;
  message?: string;
}

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
      `Name: ${name}\nWork email: ${email}\nOrganization: ${org}\nSize: ${size}\n\nNeeds:\n${message || "(not specified)"}`,
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
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <BrandLogo size={32} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden h-11 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 sm:inline-flex"
            >
              <ArrowLeft className="size-4 text-slate-500" aria-hidden="true" />
              Back to site
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-[10px] bg-blue-600 px-4 text-[14px] font-semibold text-white shadow-sm shadow-blue-600/25 transition-colors hover:bg-blue-700"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-6 sm:px-6 md:pt-10 lg:grid-cols-2 lg:gap-6">
        {/* the pitch, on the same ink surface as the product headers */}
        <div className="pp-hero relative overflow-hidden rounded-2xl px-6 py-8 sm:px-8 sm:py-10">
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Guided walkthrough</p>
            <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.08] tracking-[-0.022em] text-white sm:text-[38px]">
              Book a guided demo
            </h1>
            <p className="mt-3 max-w-md text-pretty text-[15.5px] leading-relaxed text-white/70">
              Thirty minutes on how you take attendance today — your people, your ID cards, scanning
              and reports — then your own space to try it with real people.
            </p>

            <ul className="mt-8 space-y-5">
              {NEXT_STEPS.map(({ Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-pretty text-[14.5px] leading-relaxed text-white/85">{text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3">
              <ShieldCheck className="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
              <p className="text-[13.5px] leading-relaxed text-white/70">
                Your records stay yours. Nothing is shared with other organizations, from day one.
              </p>
            </div>

            <div className="mt-7">
              <SyntaxureCredit onDark />
            </div>
          </div>
        </div>

        {/* the form */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
          {sent ? (
            <div className="flex flex-col items-center py-8 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <BadgeCheck className="size-7" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-slate-900">Request ready to send</h2>
              <p className="mt-2 max-w-sm text-pretty text-[14.5px] leading-relaxed text-slate-600">
                Thanks, {name.trim().split(" ")[0] || "there"} — your demo request for{" "}
                <strong className="font-semibold text-slate-900">{org.trim()}</strong> is composed. Send it
                with one click and we&apos;ll take it from there.
              </p>
              <div className="mt-6 flex w-full flex-col gap-2">
                <a href={mailto} className="w-full">
                  <Button size="lg" className="w-full">
                    Send via email <ArrowRight aria-hidden="true" />
                  </Button>
                </a>
                <Button variant="outline" size="lg" className="w-full" onClick={() => setSent(false)}>
                  Edit details
                </Button>
              </div>
              <p className="mt-4 text-[13px] text-slate-500">
                Prefer to write directly? Email{" "}
                <a href="mailto:hello@syntaxure.dev" className="font-semibold text-blue-700 underline underline-offset-2">
                  hello@syntaxure.dev
                </a>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-slate-900">Request a demo</h2>
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">4 fields</span>
              </div>
              <p className="mt-1 text-[14px] leading-relaxed text-slate-500">
                We reply within one business day. No spam, no newsletter — just the demo.
              </p>

              <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Full name" htmlFor="demo-name" required error={errors.name ?? null}>
                    <Input id="demo-name" placeholder="e.g. Alex Cruz" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </FormField>
                  <FormField label="Work email" htmlFor="demo-email" required error={errors.email ?? null}>
                    <Input id="demo-email" placeholder="you@agency.gov.ph" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                  </FormField>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Organization" htmlFor="demo-org" required error={errors.org ?? null}>
                    <Input id="demo-org" placeholder="Agency or university" value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" />
                  </FormField>
                  <FormField label="Team size" htmlFor="demo-size">
                    <Select id="demo-size" value={size} onChange={(e) => setSize(e.target.value)}>
                      {SIZES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <FormField
                  label="What are you running?"
                  htmlFor="demo-message"
                  hint="Programs, headcount, current pain — anything useful."
                  error={errors.message ?? null}
                >
                  <textarea
                    id="demo-message"
                    rows={4}
                    placeholder="e.g. 2,000 students across 4 programs; class attendance is still on paper…"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="min-h-24 w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[15px] leading-relaxed text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                  />
                </FormField>

                <Button type="submit" size="lg" className="mt-1 w-full">
                  Continue <ArrowRight aria-hidden="true" />
                </Button>
                <p className="text-center text-[12.5px] leading-relaxed text-slate-500">
                  By continuing you agree to be contacted about this request. See{" "}
                  <Link href="/privacy" className="font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-900">
                    Privacy &amp; your rights
                  </Link>
                  .
                </p>
              </form>
            </>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
