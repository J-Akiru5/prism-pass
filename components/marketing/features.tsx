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
    title: "One list of people",
    tone: "violet",
    body: "Staff, interns and participants in one list. No more separate spreadsheets that never match.",
  },
  {
    Icon: IdCard,
    title: "A pass for each person",
    tone: "blue",
    body: "Every person gets a pass with a QR code they can print or show on a phone. A photo of someone else’s pass will not work.",
  },
  {
    Icon: ScanLine,
    title: "Quick check-in at the door",
    tone: "teal",
    body: "Staff scan a pass and see straight away whether it worked: on time, late, or not valid.",
  },
  {
    Icon: CalendarCheck2,
    title: "One attendance record",
    tone: "amber",
    body: "Sessions, scans and corrections all go into the same record, so every report comes from the same place.",
  },
  {
    Icon: ShieldCheck,
    title: "Your office sees only its own data",
    tone: "rose",
    body: "Another office can never see your people. Every change is saved with who made it and when.",
  },
  {
    Icon: ArrowLeftRight,
    title: "Fixing mistakes is allowed",
    tone: "indigo",
    body: "If someone forgets to scan, a supervisor can add the entry with a reason. The original stays, so nothing quietly disappears.",
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
    body: "Permanent and contract staff across the head office and field offices, matching what the HR office already keeps.",
  },
  {
    k: "State universities",
    title: "SUCs, colleges and OJT",
    body: "Class, laboratory and on-the-job attendance in one place, ready to hand to the registrar.",
  },
  {
    k: "Local government",
    title: "LGUs and community programs",
    body: "Trainings, aid distribution and events, checked in with a pass instead of a paper list at the door.",
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
              Three simple screens — your people, their passes and the scanner — all feeding
              one record that has to hold up later.
            </p>
            <Link
              href="#product-shots"
              className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[14.5px] font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
            >
              See what it looks like <ArrowRight className="size-4" aria-hidden="true" />
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
    { n: "01", title: "We set up your office", body: "We make a private space for your office, with your staff list and programs. From day one, nobody else can see it." },
    { n: "02", title: "Give each person a pass", body: "Add your people, then give each one a QR pass they can print or keep on their phone." },
    { n: "03", title: "Scan and keep the record", body: "Staff scan at the door. Mistakes can be corrected with approval. Reports can be downloaded any time." },
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
            <Reveal key={s.n}>
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
            Who uses Prism Pass.
          </h2>
          <p className="mt-4 text-pretty text-[16px] leading-relaxed text-slate-500">
            Three kinds of office with the same problem: the record still has to make sense
            months later.
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
