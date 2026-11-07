"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, BadgeCheck, Fingerprint, ScanLine, ShieldCheck } from "lucide-react";
import { SyntaxureCredit } from "@/components/brand/syntaxure-credit";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  // Parallax layers: backdrop drifts slowest, mock floats up, copy fades.
  const glowY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const gridY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const mockY = useTransform(scrollYProgress, [0, 1], [0, 110]);
  const chipAY = useTransform(scrollYProgress, [0, 1], [0, 170]);
  const chipBY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  return (
    <section ref={ref} className="relative overflow-hidden bg-navy-deep text-white">
      {/* gradient mesh backdrop */}
      <motion.div aria-hidden="true" style={{ y: glowY }} className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-deep to-[#070F22]" />
        <div className="absolute -left-40 top-[-10%] h-[34rem] w-[34rem] rounded-full bg-[#1B3A6B]/70 blur-[130px]" />
        <div className="absolute right-[-12%] top-[8%] h-[28rem] w-[28rem] rounded-full bg-[#C9A24B]/25 blur-[130px]" />
        <div className="absolute bottom-[-30%] left-[30%] h-[26rem] w-[30rem] rounded-full bg-[#2E5CB8]/30 blur-[140px]" />
      </motion.div>
      {/* perspective grid */}
      <motion.div
        aria-hidden="true"
        style={{ y: gridY }}
        className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black,transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-32 sm:px-6 md:pb-28 md:pt-40">
        <motion.div style={{ opacity: fade }} className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="inline-flex items-center gap-2 rounded-full border border-gold-soft/30 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-gold-soft backdrop-blur"
          >
            <Fingerprint className="size-3.5" aria-hidden="true" />
            Digital Identity Pass · One attendance engine
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl md:text-7xl"
          >
            Attendance you can{" "}
            <span className="bg-gradient-to-r from-gold-soft via-[#F3D98B] to-gold-dark bg-clip-text text-transparent">
              prove
            </span>
            , not just record.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg"
          >
            Prism Pass unifies your people directory, verifiable QR identity passes,
            and a canonical attendance engine — scoped to your organization and
            verified on the server.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-gold-soft via-[#D9B45B] to-gold-dark px-7 text-[15px] font-bold text-navy-deep shadow-[0_8px_30px_rgba(201,162,75,0.35)] transition hover:brightness-105 sm:w-auto"
            >
              Get a demo <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-7 text-[15px] font-semibold text-white backdrop-blur transition hover:bg-white/10 sm:w-auto"
            >
              <ScanLine className="size-4" aria-hidden="true" /> Sign in to your org
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-8 flex items-center justify-center"
          >
            <SyntaxureCredit onDark />
          </motion.div>
        </motion.div>

        {/* product mock with parallax float */}
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.45, ease }}
          style={{ y: mockY }}
          className="relative mx-auto mt-16 max-w-4xl md:mt-20"
        >
          <div aria-hidden="true" className="absolute -inset-8 rounded-[2rem] bg-gradient-to-r from-[#C9A24B]/20 via-transparent to-[#2E5CB8]/20 blur-2xl" />
          <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0D1C38]/90 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <span className="h-2.5 w-2.5 rounded-full bg-gold-soft/70" />
              <span className="ml-3 hidden rounded-md bg-white/5 px-3 py-1 font-mono text-[11px] text-white/50 sm:block">
                app.prismpass.dev/org/acme/attendance
              </span>
            </div>
            <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[180px_1fr]">
              {/* mini sidebar */}
              <div className="hidden flex-col gap-1 border-r border-white/10 p-3 sm:flex">
                {["Dashboard", "People", "Passes", "Attendance", "Scanner"].map((item, i) => (
                  <div
                    key={item}
                    className={
                      i === 3
                        ? "rounded-lg bg-gold-soft/15 px-3 py-2 text-[11px] font-semibold text-gold-soft"
                        : "rounded-lg px-3 py-2 text-[11px] text-white/50"
                    }
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-1 border-r border-white/10 py-4 sm:hidden">
                <ShieldCheck className="size-4 text-gold-soft" aria-hidden="true" />
              </div>
              {/* mini dashboard */}
              <div className="space-y-3 p-4 sm:p-5">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { k: "Present today", v: "1,284" },
                    { k: "Check-ins", v: "2,431" },
                    { k: "Late arrivals", v: "37" },
                  ].map((s) => (
                    <div key={s.k} className="rounded-xl border border-white/10 bg-white/[0.04] p-2.5 sm:p-3">
                      <p className="font-display text-sm font-bold text-white sm:text-xl">{s.v}</p>
                      <p className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-white/45 sm:text-[10px]">{s.k}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-300/25 bg-emerald-400/10 px-3 py-2.5">
                  <BadgeCheck className="size-4 shrink-0 text-emerald-300" aria-hidden="true" />
                  <p className="text-[11px] font-medium text-emerald-100 sm:text-xs">
                    Verified check-in · Maria Santos · BSIT 3-A · 08:02:14
                  </p>
                </div>
                <div className="flex h-16 items-end gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:h-20">
                  {[35, 55, 42, 70, 58, 88, 64, 95, 72, 82, 60, 90, 76, 98, 84, 68, 92, 78, 86, 96].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className={i % 5 === 4 ? "flex-1 rounded-sm bg-gold-soft/80" : "flex-1 rounded-sm bg-[#2E5CB8]/60"}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* floating chips */}
          <motion.div
            style={{ y: chipAY }}
            className="absolute -left-3 top-10 hidden items-center gap-2 rounded-xl border border-white/15 bg-[#0D1C38]/95 px-3.5 py-2.5 shadow-xl backdrop-blur md:flex lg:-left-12"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
              <BadgeCheck className="size-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-white">QR verified<span className="block text-[10px] font-normal text-white/55">server-side · audited</span></span>
          </motion.div>
          <motion.div
            style={{ y: chipBY }}
            className="absolute -right-3 bottom-12 hidden items-center gap-2 rounded-xl border border-white/15 bg-[#0D1C38]/95 px-3.5 py-2.5 shadow-xl backdrop-blur md:flex lg:-right-12"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold-soft/15 text-gold-soft">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </span>
            <span className="text-xs font-semibold text-white">Tenant isolated<span className="block text-[10px] font-normal text-white/55">never a demo workspace</span></span>
          </motion.div>
        </motion.div>
      </div>

      {/* fade into page background */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" />
    </section>
  );
}
