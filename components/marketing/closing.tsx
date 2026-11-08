"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Reveal } from "./reveal";

const METRICS = [
  { v: "1", k: "attendance engine", d: "for employees, interns & participants", tone: "text-blue-600", dot: "bg-blue-500" },
  { v: "100%", k: "server-verified", d: "every scan checked against live membership", tone: "text-violet-600", dot: "bg-violet-500" },
  { v: "0", k: "demo workspaces", d: "tenant consoles resolve real data only", tone: "text-teal-600", dot: "bg-teal-500" },
  { v: "∞", k: "audit trail", d: "every sensitive action recorded", tone: "text-amber-600", dot: "bg-amber-500" },
];

export function MetricsBand() {
  return (
    <section className="relative border-y border-slate-100 bg-slate-50/80 py-14 md:py-16">
      <div aria-hidden="true" className="pp-dots pointer-events-none absolute inset-0 opacity-60" />
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <Reveal key={m.k} delay={i * 0.08} className="text-center">
            <p className={`tnum text-5xl font-bold tracking-tight ${m.tone}`}>{m.v}</p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-slate-900">
              <span className={`size-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
              {m.k}
            </p>
            <p className="mt-1 text-sm text-slate-500">{m.d}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "How is our data kept separate from other organizations?",
    a: "Every record carries your organization id and every request is verified server-side against your membership. Consoles only ever resolve real tenant data — there are no shared demo workspaces to leak across.",
  },
  {
    q: "What happens when someone forgets to scan?",
    a: "Missed scans don't become spreadsheet edits. Staff file an adjustment through the attendance console, a manager approves it, and the original record plus the correction both stay in the audit trail.",
  },
  {
    q: "How do members receive their passes?",
    a: "Each member gets a digital identity pass with a QR code bound to their live membership. Passes can be shown on a phone or printed as ID cards directly from the passes console.",
  },
  {
    q: "Who can see attendance records?",
    a: "Role-based access: members see their own pass and history, managers see their programs, and admins get organization-wide reporting with exports. Viewers get masked personal data on export.",
  },
  {
    q: "Do you train AI models on our data?",
    a: "No. Your attendance data is yours — used only to run your tenant. Our privacy page documents exactly what the platform records and how to exercise your rights.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">FAQ</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Questions, answered.
          </h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            return (
              <Reveal key={f.q} delay={i * 0.05}>
                <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${isOpen ? "border-blue-600/40" : "border-slate-200"}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex min-h-[56px] w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-pretty text-[15px] font-bold tracking-tight sm:text-base">{f.q}</span>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${isOpen ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>
                      {isOpen ? <Minus className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={panelId}
                        role="region"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduce ? { opacity: 1 } : { height: 0, opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.25 }}
                      >
                        <p className="text-pretty px-5 pb-5 text-sm leading-relaxed text-slate-500">{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl border border-blue-700/30 bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700 px-6 py-14 text-center text-white shadow-xl shadow-blue-900/20 sm:px-12 md:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-white/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full border border-white/15" />
        <p className="relative text-[12px] font-bold uppercase tracking-[0.12em] text-blue-100">Get started</p>
        <h2 className="relative mx-auto mt-3 max-w-2xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          See your organization&apos;s attendance, verified.
        </h2>
        <p className="relative mx-auto mt-4 max-w-xl text-pretty text-blue-100">
          Tell us about your programs and we&apos;ll provision a tenant,
          import your roster, and have you scanning in days — not quarters.
        </p>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/demo"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-7 text-[15px] font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 sm:w-auto"
          >
            Book a demo <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/20 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10 sm:w-auto"
          >
            Sign in
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
