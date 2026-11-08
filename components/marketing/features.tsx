"use client";

import {
  ArrowLeftRight,
  ArrowRight,
  CalendarCheck2,
  IdCard,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "./reveal";

const FEATURES = [
  {
    Icon: Users,
    title: "One people directory",
    tone: "violet",
    body: "Employees, interns, and participants in a single roster with server-side membership checks. No duplicate lists across tools.",
  },
  {
    Icon: IdCard,
    title: "Verifiable digital passes",
    tone: "blue",
    body: "Every member gets a printable QR identity pass bound to your organization. Passes verify against live membership — not a static image.",
  },
  {
    Icon: ScanLine,
    title: "Fast QR scanner console",
    tone: "teal",
    body: "A purpose-built check-in/check-out scanner with clear outcomes — success, warning, error — so gate staff always know what happened.",
  },
  {
    Icon: CalendarCheck2,
    title: "Canonical attendance engine",
    tone: "amber",
    body: "Policies, sessions, scans, and records flow through one engine with corrections and approvals. One source of truth for every program.",
  },
  {
    Icon: ShieldCheck,
    title: "Tenant isolation + audit trail",
    tone: "rose",
    body: "Every read and write is scoped to your organization and verified on the server. Sensitive actions land in an audit log.",
  },
  {
    Icon: ArrowLeftRight,
    title: "Corrections without chaos",
    tone: "indigo",
    body: "Adjustments and approvals are first-class: fix a missed scan through review, keep the original record, and stay compliant.",
  },
];

const TONES: Record<string, { bar: string; chip: string; band: string; text: string }> = {
  violet: { bar: "from-violet-400 to-violet-600", chip: "bg-violet-50 text-violet-600 ring-violet-100", band: "border-violet-100 bg-violet-50/70", text: "text-violet-600" },
  blue: { bar: "from-blue-400 to-blue-600", chip: "bg-blue-50 text-blue-600 ring-blue-100", band: "border-blue-100 bg-blue-50/70", text: "text-blue-600" },
  teal: { bar: "from-teal-400 to-teal-600", chip: "bg-teal-50 text-teal-600 ring-teal-100", band: "border-teal-100 bg-teal-50/70", text: "text-teal-600" },
  amber: { bar: "from-amber-400 to-amber-600", chip: "bg-amber-50 text-amber-600 ring-amber-100", band: "border-amber-100 bg-amber-50/70", text: "text-amber-600" },
  rose: { bar: "from-rose-400 to-rose-600", chip: "bg-rose-50 text-rose-600 ring-rose-100", band: "border-rose-100 bg-rose-50/70", text: "text-rose-600" },
  indigo: { bar: "from-indigo-400 to-indigo-600", chip: "bg-indigo-50 text-indigo-600 ring-indigo-100", band: "border-indigo-100 bg-indigo-50/70", text: "text-indigo-600" },
};

const AUDIENCES = [
  {
    k: "National agencies",
    title: "Agencies and central offices",
    body: "Plantilla and contractual staff across head office and field units, with attendance that matches what the HRMO already files.",
  },
  {
    k: "State universities",
    title: "SUCs, colleges and OJT",
    body: "Class, laboratory and on-the-job attendance across colleges, exported in a form the registrar can accept.",
  },
  {
    k: "Local government",
    title: "LGUs and community programs",
    body: "Trainings, aid distribution and events checked in with a pass instead of a paper list at the door.",
  },
];

export function Features() {
  return (
    <section id="product" className="scroll-mt-20 bg-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16">
          <Reveal className="md:sticky md:top-24 md:self-start">
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">The platform</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Everything attendance needs. Nothing it doesn&apos;t.
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[16px] leading-relaxed text-slate-500">
              Three consoles — directory, identity and scanning — sitting on one attendance
              engine. Each part exists because the record has to survive review.
            </p>
            <Link
              href="#product-shots"
              className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[14.5px] font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
            >
              See it inside the product <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Reveal>

          <div>
            <ul className="border-t border-slate-200">
              {FEATURES.map(({ title, body }, i) => (
                <li key={title} className="border-b border-slate-200">
                  <div className="group grid grid-cols-[2.25rem_1fr] items-start gap-x-3 py-6 transition-colors hover:bg-slate-50/80 sm:grid-cols-[3rem_1fr] sm:gap-x-4 sm:px-2">
                    <span className="pt-1 text-[11px] font-semibold tabular-nums tracking-[0.06em] text-slate-400 transition-colors group-hover:text-blue-700">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[17.5px] font-semibold leading-snug tracking-[-0.012em] text-slate-900">
                        {title}
                      </h3>
                      <p className="mt-1.5 text-pretty text-[14.5px] leading-relaxed text-slate-600">
                        {body}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
    <section id="how" className="scroll-mt-20 border-y border-slate-100 bg-slate-50 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">How it works</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Live in three steps.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1}>
              <div className="h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-blue-50 text-[13px] font-bold text-blue-700 ring-1 ring-blue-100 tnum">
                  {s.n}
                </span>
                <h3 className="mt-2 text-[16px] font-bold tracking-tight">{s.title}</h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-slate-500">{s.body}</p>
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
    <section id="audiences" className="scroll-mt-20 bg-white py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">Who it&apos;s for</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Offices that sign for attendance.
          </h2>
          <p className="mt-4 text-pretty text-[16px] leading-relaxed text-slate-500">
            Three kinds of office, one requirement: the record has to be defensible long after
            the session ends.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <div key={a.k} className="bg-white p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {String(i + 1).padStart(2, "0")} · {a.k}
              </p>
              <h3 className="mt-2 text-[17px] font-semibold leading-snug tracking-[-0.012em] text-slate-900">
                {a.title}
              </h3>
              <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-slate-600">{a.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
