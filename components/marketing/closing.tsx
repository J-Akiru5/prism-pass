"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Reveal } from "./reveal";

const METRICS = [
  { v: "1", k: "attendance engine", d: "for employees, interns & participants" },
  { v: "100%", k: "server-verified", d: "every scan checked against live membership" },
  { v: "0", k: "demo workspaces", d: "tenant consoles resolve real data only" },
  { v: "∞", k: "audit trail", d: "every sensitive action recorded" },
];

export function MetricsBand() {
  return (
    <section className="relative overflow-hidden bg-navy-deep py-16 text-white md:py-20">
      <div aria-hidden="true" className="absolute inset-0">
        <div className="absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[#2E5CB8]/25 blur-[120px]" />
        <div className="absolute bottom-[-40%] right-[10%] h-64 w-64 rounded-full bg-[#C9A24B]/15 blur-[100px]" />
      </div>
      <div className="relative mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {METRICS.map((m, i) => (
          <Reveal key={m.k} delay={i * 0.08} className="text-center">
            <p className="bg-gradient-to-br from-gold-soft to-gold-dark bg-clip-text font-display text-5xl font-bold text-transparent">
              {m.v}
            </p>
            <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-white">{m.k}</p>
            <p className="mt-1 text-sm text-white/60">{m.d}</p>
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
  return (
    <section id="faq" className="scroll-mt-20 bg-muted/50 py-20 md:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Questions, answered.
          </h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <Reveal key={f.q} delay={i * 0.05}>
                <div className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition ${isOpen ? "ring-1 ring-accent/50" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="font-display text-[15px] font-bold sm:text-base">{f.q}</span>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${isOpen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                      {isOpen ? <Minus className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
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
    <section className="bg-background px-4 py-20 sm:px-6 md:py-28">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-navy-deep px-6 py-16 text-center text-white shadow-2xl sm:px-12 md:py-20">
        <div aria-hidden="true" className="absolute inset-0">
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-[#2E5CB8]/40 blur-[110px]" />
          <div className="absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-[#C9A24B]/30 blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.6)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_60%_70%_at_50%_50%,black,transparent)]" />
        </div>
        <div className="relative">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-soft">Get started</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            See your organization&apos;s attendance, verified.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/70">
            Tell us about your programs and we&apos;ll provision a tenant,
            import your roster, and have you scanning in days — not quarters.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-gold-soft via-[#D9B45B] to-gold-dark px-7 text-[15px] font-bold text-navy-deep shadow-[0_8px_30px_rgba(201,162,75,0.35)] transition hover:brightness-105 sm:w-auto"
            >
              Book a demo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/20 bg-white/5 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
