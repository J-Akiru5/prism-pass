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
    body: "Attendance is personal information. Only your office can see it, you decide how long to keep it, and the privacy page says plainly what is saved and why.",
  },
  {
    k: "Record of changes",
    v: "Who, what, when",
    body: "Scans, corrections and approvals save who did it and when. A corrected entry keeps the original, so a reviewer sees the change, not just the result.",
  },
  {
    k: "No signal, no problem",
    v: "Works offline",
    body: "If the internet drops, the scanner keeps the check-ins on the device and sends them when it is back. They are locked when saved, so nobody can add one later by hand.",
  },
  {
    k: "Ready for review",
    v: "Downloads",
    body: "Attendance can be downloaded as a spreadsheet, passes printed as ID cards, and each role sees only what it should.",
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
              Built for offices that must answer for attendance.
            </h2>
            <p className="mt-4 max-w-md text-pretty text-[16px] leading-relaxed text-slate-600">
              In a government office, attendance is not just a screen. It is a record that a
              supervisor, an auditor or a complainant may ask for years later.
            </p>
            <p className="mt-3 max-w-md text-pretty text-[16px] leading-relaxed text-slate-600">
              So we built it that way: keep the original entry, save who changed it, and make
              the record readable even without this system.
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
    q: "Can another office see our records?",
    a: "No. Every record belongs to your office. When someone signs in, the system checks which office they belong to and only shows that office’s data. There is no shared demo space where records can mix.",
  },
  {
    q: "What if someone forgets to scan?",
    a: "It does not become a silent edit in a spreadsheet. Staff add the entry with a reason, a supervisor approves it, and both the original and the correction stay in the record.",
  },
  {
    q: "Can we still get the records out?",
    a: "Yes. You can download attendance as a spreadsheet, print passes as ID cards, and download the record of changes. Nothing you need for a review lives only inside this system.",
  },
  {
    q: "What if the internet goes down at the door?",
    a: "The scanner keeps the check-ins on the device and sends them when the connection is back. They are locked when saved, so they cannot be changed later.",
  },
  {
    q: "Who can see a person's attendance?",
    a: "Only the people allowed to. A person sees their own pass and history, a supervisor sees the sessions they run, and the office admin sees everything for the office. Some accounts see counts without names.",
  },
  {
    q: "Do you use our records for anything else?",
    a: "No. Your records are used to run your office’s attendance and nothing else. The privacy page explains what is saved and how a person can ask to see or correct it.",
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
            Common questions.
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
            Start with one office and one scanning day.
          </h2>
          <p className="mt-4 max-w-xl text-pretty text-[16px] leading-relaxed text-white/70">
            We set up a private space, add your list of people, and run the first session with
            your staff. The records stay yours.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-white px-7 text-[15px] font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100 sm:w-auto"
            >
              Book a demo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center rounded-[10px] border border-white/25 px-7 text-[15px] font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Sign in to your office
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
