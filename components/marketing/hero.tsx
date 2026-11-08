"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, ScanLine, ShieldCheck } from "lucide-react";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-white pt-28 md:pt-36">
      {/* surface: hairline grid, soft light, thin geometric accents */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* faint graph paper under the headline */}
        <div className="pp-lines absolute inset-x-0 top-0 h-[620px] [mask-image:radial-gradient(80%_70%_at_50%_0%,#000_30%,transparent_78%)]" />
        {/* colour wash */}
        <div className="pp-glow-blue absolute inset-x-0 top-0 h-[520px]" />
        <div className="pp-glow-violet absolute right-0 top-24 h-[380px] w-[420px]" />
        <div className="pp-glow-teal absolute bottom-0 left-0 h-[320px] w-[380px]" />
        {/* dot fields hugging the margins */}
        <div className="pp-dots absolute left-0 top-24 h-[420px] w-24 [mask-image:linear-gradient(to_right,#000,transparent)] sm:w-40" />
        <div className="pp-dots absolute right-0 top-24 h-[420px] w-24 [mask-image:linear-gradient(to_left,#000,transparent)] sm:w-40" />
        {/* geometry: rings + refracted prism facets */}
        <div className="absolute left-1/2 top-16 hidden h-[420px] w-[420px] -translate-x-1/2 rounded-full border border-slate-200 md:block" />
        <div className="absolute left-1/2 top-28 hidden h-[300px] w-[300px] -translate-x-1/2 rounded-full border border-blue-200 md:block" />
        <div className="absolute -right-10 top-52 hidden h-40 w-40 rotate-12 rounded-3xl border border-violet-200/80 md:block" />
        <div className="absolute -left-8 bottom-24 hidden h-32 w-32 -rotate-12 rounded-2xl border border-teal-200 md:block" />
        <svg className="absolute right-10 top-40 hidden md:block" width="160" height="160" viewBox="0 0 32 32" fill="none">
          <path d="M16 4.9 25.4 10.45v11.1L16 27.1 6.6 21.55v-11.1z" stroke="#2563EB" strokeOpacity="0.5" strokeWidth="0.5" strokeLinejoin="round" />
          <path d="M16 4.9 16 27.1" stroke="#7C3AED" strokeOpacity="0.35" strokeWidth="0.4" />
        </svg>
        <svg className="absolute left-10 top-56 hidden md:block" width="92" height="92" viewBox="0 0 32 32" fill="none">
          <path d="M16 4.9 25.4 10.45v11.1L16 27.1 6.6 21.55v-11.1z" stroke="#7C3AED" strokeOpacity="0.4" strokeWidth="0.6" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-[13px] font-semibold text-blue-800">
            <ShieldCheck className="size-3.5 text-blue-600" aria-hidden="true" />
            Verified attendance for offices and schools
          </div>
          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
            Attendance you can prove, not just record.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-slate-600 sm:text-lg">
            One list of people. One QR pass each. Every check-in verified, so your
            attendance record holds up when it is reviewed.
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
              <ScanLine className="size-4" aria-hidden="true" /> Sign in to your org
            </Link>
          </div>
          <div className="mt-8 flex items-center justify-center">
            <SyntaxureCredit />
          </div>
        </div>

        <div className="relative mx-auto mt-14 max-w-4xl md:mt-16">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              <span className="ml-3 hidden rounded-lg bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-500 sm:block">
                prismpass.app/org/syntaxure/attendance
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
              <div className="hidden flex-col gap-1 border-r border-slate-100 p-3 sm:flex">
                {["Dashboard", "People", "Passes", "Attendance", "Scanner"].map((item, i) => (
                  <div
                    key={item}
                    className={
                      i === 3
                        ? "rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm shadow-blue-600/25"
                        : "rounded-lg px-3 py-2 text-[12px] font-medium text-slate-500"
                    }
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div className="space-y-3 p-4 sm:p-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { k: "Present today", v: "1,284" },
                    { k: "Check-ins", v: "2,431" },
                    { k: "Late arrivals", v: "37" },
                  ].map((s) => (
                    <div key={s.k} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2 sm:p-3">
                      <p className="tnum text-[15px] font-bold leading-none text-slate-900 sm:text-xl">{s.v}</p>
                      <p className="mt-1 text-[11px] font-medium leading-tight text-slate-500 sm:text-[12px]">{s.k}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
                  <p className="text-[12.5px] font-medium leading-snug text-emerald-800 sm:text-[13px]">
                    Verified check-in · Maria Santos · 8:02 AM
                  </p>
                </div>
                <div className="flex h-16 items-end gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:h-20">
                  {[35, 55, 42, 70, 58, 88, 64, 95, 72, 82, 60, 90, 76, 98, 84, 68].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className={i % 5 === 4 ? "min-w-0 flex-1 rounded-sm bg-slate-900" : "min-w-0 flex-1 rounded-sm bg-slate-300"}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-16 border-t border-slate-100 md:mt-20" aria-hidden="true" />
    </section>
  );
}
