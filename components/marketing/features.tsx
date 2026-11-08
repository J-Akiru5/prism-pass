"use client";

import {
  ArrowLeftRight,
  Building2,
  CalendarCheck2,
  GraduationCap,
  IdCard,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Reveal } from "./reveal";

const FEATURES = [
  {
    Icon: Users,
    title: "One people directory",
    body: "Employees, interns, and participants in a single roster with server-side membership checks. No duplicate lists across tools.",
  },
  {
    Icon: IdCard,
    title: "Verifiable digital passes",
    body: "Every member gets a printable QR identity pass bound to your organization. Passes verify against live membership — not a static image.",
  },
  {
    Icon: ScanLine,
    title: "Fast QR scanner console",
    body: "A purpose-built check-in/check-out scanner with tiered outcomes — success, warning, error — so gate staff always know what happened.",
  },
  {
    Icon: CalendarCheck2,
    title: "Canonical attendance engine",
    body: "Policies, sessions, scans, and records flow through one engine with corrections and approvals. One source of truth for every program.",
  },
  {
    Icon: ShieldCheck,
    title: "Tenant isolation + audit trail",
    body: "Every read and write is scoped to your organization and verified on the server. Sensitive actions land in an immutable audit log.",
  },
  {
    Icon: ArrowLeftRight,
    title: "Corrections without chaos",
    body: "Adjustments and approvals are first-class: fix a missed scan through review, keep the original record, and stay compliant.",
  },
];

const AUDIENCES = [
  {
    Icon: GraduationCap,
    title: "Schools & universities",
    body: "Class attendance, intern deployments, and event check-ins — one directory from enrollment to graduation.",
  },
  {
    Icon: Building2,
    title: "Companies & HR teams",
    body: "Shift check-ins, training sessions, and site access with approval-backed corrections for payroll confidence.",
  },
  {
    Icon: Users,
    title: "Events & programs",
    body: "Participant passes, gate scanning, and per-session records for orientations, seminars, and multi-day programs.",
  },
];

export function Features() {
  return (
    <section id="product" className="relative scroll-mt-20 bg-background py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">The platform</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Everything attendance needs. Nothing it doesn&apos;t.
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Three consoles — directory, identity, and scanning — running on a single
            attendance engine your auditors will love.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={(i % 3) * 0.08} className="h-full">
              <div className="group relative h-full rounded-2xl border bg-card p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg motion-reduce:hover:translate-y-0">
                <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy to-navy-light text-gold-soft shadow-sm">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { n: "01", title: "Provision your organization", body: "Syntaxure Labs sets up your tenant, roles, and programs. Your data lives in its own isolated scope from day one." },
    { n: "02", title: "Issue identity passes", body: "Import or enroll your people, then issue QR passes they can print or carry on their phones." },
    { n: "03", title: "Scan, verify, report", body: "Gate staff scan with instant server verification. Corrections flow through approvals; reports export anytime." },
  ];
  return (
    <section id="how" className="relative scroll-mt-20 overflow-hidden bg-muted/50 py-20 md:py-28">
      <div aria-hidden="true" className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-[#C9A24B]/10 blur-[110px]" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">How it works</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Live in three steps.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="relative h-full rounded-2xl border bg-card p-6 shadow-sm">
                <span className="bg-gradient-to-br from-gold-soft to-gold-dark bg-clip-text font-display text-5xl font-bold text-transparent">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                {i < 2 && (
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 hidden h-px w-6 bg-gradient-to-r from-accent to-transparent md:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Audiences() {
  return (
    <section id="audiences" className="scroll-mt-20 bg-background py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Who it&apos;s for</p>
          <h2 className="mt-3 text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Built for teams that answer for attendance.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.1}>
              <div className="h-full overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="bg-gradient-to-br from-navy-deep via-navy to-navy-light px-6 py-5">
                  <Icon className="size-6 text-gold-soft" aria-hidden="true" />
                </div>
                <div className="p-6">
                  <h3 className="font-display text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
