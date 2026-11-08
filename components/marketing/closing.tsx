"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Minus, Plus } from "lucide-react";
import { Reveal } from "./reveal";

const ACCOUNTABILITY = [
  {
    k: "Data Privacy Act",
    v: "RA 10173",
    body: "Attendance is personal data. Access is scoped per agency, retention is set by the agency, and the privacy page states plainly what is recorded and why.",
  },
  {
    k: "Audit trail",
    v: "Every write",
    body: "Scans, corrections and approvals record who acted and when. A corrected record keeps its original, so a reviewer can see the change, not just the result.",
  },
  {
    k: "No signal, no problem",
    v: "Offline queue",
    body: "Gates and field offices queue check-ins on the device and sync when the connection returns. Queued records are signed, so they cannot be forged later.",
  },
  {
    k: "Ready for review",
    v: "Exports",
    body: "Attendance exports as a spreadsheet, passes print as ID cards, and role-based access decides who sees a name and who sees a count.",
  },
];

/** What an office actually has to answer for — replaces the old vanity metrics. */
export function Accountability() {
  return (
    <section id="accountability" className="scroll-mt-20 border-y border-slate-200 bg-slate-50 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-16">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">Accountability</p>
            <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Built for the way public offices answer for attendance.
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[16px] leading-relaxed text-slate-600">
              Attendance in a government office is not a dashboard. It is a record that a
              supervisor, an auditor, or a complainant can ask you to produce years later.
            </p>
            <p className="mt-3 max-w-md text-pretty text-[16px] leading-relaxed text-slate-600">
              Every design decision here follows from that: keep the original, record the actor,
              and make the record readable without the software that produced it.
            </p>
            <Link
              href="/privacy"
              className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 text-[14.5px] font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 transition hover:decoration-slate-900"
            >
              Read the privacy notice <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <dl className="grid border-l border-t border-slate-200 sm:grid-cols-2">
            {ACCOUNTABILITY.map((item) => (
              <div key={item.k} className="border-b border-r border-slate-200 bg-white p-5">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">{item.k}</dt>
                <dd className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em] text-slate-900">{item.v}</dd>
                <dd className="mt-2 text-pretty text-[14px] leading-relaxed text-slate-600">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "How is our data kept separate from other agencies?",
    a: "Every record carries your organization id and every request is verified server-side against your membership. Consoles only ever resolve real tenant data — there are no shared demo workspaces to leak across.",
  },
  {
    q: "What happens when someone forgets to scan?",
    a: "Missed scans do not become spreadsheet edits. Staff file an adjustment through the attendance console, a supervisor approves it, and both the original record and the correction stay in the audit trail.",
  },
  {
    q: "Can we produce records without the app?",
    a: "Yes. Attendance exports to a spreadsheet per session or date range, passes print as ID cards, and the audit log exports as well. Nothing you need for a review should only exist inside our interface.",
  },
  {
    q: "What if the gate loses its connection?",
    a: "The scanner queues check-ins locally and syncs when the network returns. Queued records are signed on the device, so an offline record cannot be back-dated or invented later.",
  },
  {
    q: "Who can see a person's attendance?",
    a: "Access is role-based: a person sees their own pass and history, supervisors see the programs they run, and administrators get agency-wide reporting with exports. Viewers receive masked personal data.",
  },
  {
    q: "Do you train anything on our records?",
    a: "No. Your attendance data runs your tenant and nothing else. The privacy page documents what the platform records and how a person exercises their rights under RA 10173.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="scroll-mt-20 bg-white py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">Questions</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            The ones that come up in a briefing.
          </h2>
        </Reveal>

        <div className="mt-10 border-t border-slate-200">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            const panelId = `faq-panel-${i}`;
            return (
              <div key={f.q} className="border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex min-h-[60px] w-full items-start justify-between gap-6 py-5 text-left"
                >
                  <span className="text-pretty text-[16.5px] font-semibold leading-snug tracking-[-0.01em] text-slate-900">
                    {f.q}
                  </span>
                  <span className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true">
                    {isOpen ? <Minus className="size-4" /> : <Plus className="size-4" />}
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
                      transition={{ duration: reduce ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <p className="max-w-2xl pb-6 text-pretty text-[15px] leading-relaxed text-slate-600">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
      <Reveal className="pp-hero relative mx-auto max-w-6xl overflow-hidden rounded-2xl px-6 py-14 sm:px-12 md:py-16">
        <div className="relative">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-white/55">Next step</p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-bold leading-[1.1] tracking-tight text-white sm:text-4xl">
            Bring one office, one roster, one scanning day.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-[16px] leading-relaxed text-white/70">
            We provision a private tenant, import your roster, and run the first session with your
            staff. You keep the records either way.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-white px-7 text-[15px] font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 sm:w-auto"
            >
              Book a walkthrough <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-white/25 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Sign in to your org
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
