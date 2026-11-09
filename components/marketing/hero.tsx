"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, ScanLine, ShieldCheck } from "lucide-react";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";
import { ConsoleShot, PhonePass, QrArt } from "./product-shots";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-white pt-28 md:pt-32">
      {/* surface: hairline grid, soft light, thin geometric accents */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="pp-lines absolute inset-x-0 top-0 h-[620px] [mask-image:radial-gradient(80%_70%_at_50%_0%,#000_30%,transparent_78%)]" />
        <div className="pp-glow-blue absolute inset-x-0 top-0 h-[520px]" />
        <div className="pp-glow-violet absolute right-0 top-24 h-[380px] w-[420px]" />
        <div className="pp-glow-teal absolute bottom-0 left-0 h-[320px] w-[380px]" />
        <div className="pp-dots absolute left-0 top-24 h-[420px] w-24 [mask-image:linear-gradient(to_right,#000,transparent)] sm:w-40" />
        <div className="pp-dots absolute right-0 top-24 h-[420px] w-24 [mask-image:linear-gradient(to_left,#000,transparent)] sm:w-40" />
        <div className="absolute left-1/2 top-16 hidden h-[420px] w-[420px] -translate-x-1/2 rounded-full border border-slate-200 md:block" />
        <div className="absolute left-1/2 top-28 hidden h-[300px] w-[300px] -translate-x-1/2 rounded-full border border-blue-200 md:block" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        {/* floating artefacts: what the record looks like at the gate */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden lg:block">
          <div className="pp-breathe pp-breathe-delay-1 absolute left-0 top-[188px] w-[196px] -rotate-[5deg] rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-[0_20px_45px_-20px_rgba(15,23,42,0.35)] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <BadgeCheck className="size-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-semibold leading-tight text-slate-900">Check-in saved</p>
                <p className="truncate text-[9.5px] text-slate-500">Maria Santos · 8:02 AM</p>
              </div>
            </div>
          </div>

          <div className="pp-breathe pp-breathe-delay-2 absolute left-1 top-[338px] rotate-[4deg] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.3)]">
            <QrArt size={70} />
            <p className="mt-1 text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">Pass</p>
          </div>

          <div className="pp-breathe absolute right-0 top-[238px] w-[172px] rotate-[4deg] rounded-xl border border-amber-200 bg-amber-50/95 p-2.5 shadow-[0_20px_45px_-20px_rgba(120,53,15,0.3)] backdrop-blur-sm">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700">Late · 08:42</p>
            <p className="mt-0.5 text-[9.5px] leading-tight text-amber-900/70">10-minute grace. Marked late, not blocked.</p>
          </div>

          <div className="absolute right-2 top-[438px] grid grid-cols-6 gap-[7px] opacity-45">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="size-[3px] rounded-full bg-slate-400" />
            ))}
          </div>

          <div className="absolute right-[52px] top-[150px] text-slate-300">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div className="absolute left-4 bottom-[150px] text-slate-300">
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-[13px] font-semibold text-blue-800">
            <ShieldCheck className="size-3.5 text-blue-600" aria-hidden="true" />
            Simple attendance for offices and schools
          </div>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
            Attendance you can prove, not just record.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-slate-600 sm:text-lg">
            One list of people. One QR pass each. Every check-in is checked by the
            system, so the record is ready when someone asks to see it.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-7 text-[15px] font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 sm:w-auto"
            >
              Get a demo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-7 text-[15px] font-semibold text-slate-900 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-800 sm:w-auto"
            >
              <ScanLine className="size-4" aria-hidden="true" /> Sign in to your office
            </Link>
          </div>
          <div className="mt-7 flex items-center justify-center">
            <SyntaxureCredit />
          </div>
        </div>

        {/* product shot: the real console, with the pass a member carries */}
        <div className="mx-auto mt-12 max-w-5xl md:mt-16">
          <div className="relative rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 p-2 shadow-[0_40px_120px_-40px_rgba(37,99,235,0.35)] sm:p-3">
            <ConsoleShot />

            <div className="absolute -bottom-10 right-2 hidden lg:block">
              <PhonePass />
            </div>
          </div>

          <p className="mt-3 text-center text-[12.5px] text-slate-500 lg:mt-24">
            The staff screen and the pass your people carry — the same record in two places.
          </p>
        </div>

        <div className="mt-12 flex justify-center lg:hidden">
          <PhonePass />
        </div>
      </div>

      <div className="mt-16 border-t border-slate-100 md:mt-20" aria-hidden="true" />
    </section>
  );
}
