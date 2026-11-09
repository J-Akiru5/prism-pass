import { BadgeCheck, CalendarCheck, IdCard, LayoutDashboard, ScanLine, Settings, Users, BarChart3, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";

/**
 * Product mockups for the marketing page.
 *
 * These are recreations of the real consoles rendered in markup rather than
 * screenshots: they stay sharp at any density, never go stale, and can be read
 * by a screen reader as plain structure instead of an unlabelled image.
 */

const NAV = [
  { label: "Dashboard", Icon: LayoutDashboard, colour: "text-blue-600", tint: "bg-blue-50 ring-blue-100", active: true },
  { label: "People", Icon: Users, colour: "text-violet-600", tint: "bg-violet-50 ring-violet-100", active: false },
  { label: "Passes", Icon: IdCard, colour: "text-amber-600", tint: "bg-amber-50 ring-amber-100", active: false },
  { label: "Attendance", Icon: CalendarCheck, colour: "text-teal-600", tint: "bg-teal-50 ring-teal-100", active: false },
  { label: "Reports", Icon: BarChart3, colour: "text-rose-600", tint: "bg-rose-50 ring-rose-100", active: false },
  { label: "Settings", Icon: Settings, colour: "text-slate-600", tint: "bg-slate-100 ring-slate-200", active: false },
];

const AGENDA = [
  { title: "OJT morning block", time: "08:00 – 12:00", count: "12 checked in", status: "Live", tone: "text-emerald-700 bg-emerald-50 ring-emerald-200" },
  { title: "Front desk shift", time: "13:00 – 17:00", count: "4 checked in", status: "Next", tone: "text-slate-600 bg-slate-50 ring-slate-200" },
  { title: "Graduate seminar", time: "18:00 – 20:00", count: "Not started", status: "Later", tone: "text-slate-600 bg-slate-50 ring-slate-200" },
];

export function QrArt({ size = 132 }: { size?: number }) {
  const cells = 21;
  const unit = size / cells;
  const filled = (x: number, y: number) => {
    const finder =
      (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    if (finder) {
      const fx = x < 7 ? x : x - 14;
      const fy = y < 7 ? y : y - 14;
      const ring = fx === 0 || fx === 6 || fy === 0 || fy === 6;
      const core = fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4;
      return ring || core;
    }
    return (x * 3 + y * 5 + ((x * y) % 7)) % 3 !== 0;
  };

  return (
    <div
      className="relative bg-white"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {Array.from({ length: cells * cells }).map((_, i) => {
        const x = i % cells;
        const y = Math.floor(i / cells);
        if (!filled(x, y)) return null;
        return (
          <span
            key={i}
            className="absolute rounded-[1px] bg-slate-900"
            style={{ left: x * unit, top: y * unit, width: unit, height: unit }}
          />
        );
      })}
    </div>
  );
}

/** The organisation console, in a browser frame. */
export function ConsoleShot({ compact = false }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] ring-1 ring-slate-900/5">
      {/* browser chrome */}
      <div className="flex items-center gap-1.5 border-b border-slate-200/80 bg-slate-50/80 px-3 py-2">
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="size-2 rounded-full bg-slate-300" />
        <span className="ml-2 hidden min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[9px] text-slate-500 sm:block">
          prismpass.ph/org/syntaxure-labs
        </span>
      </div>

      <div className="flex">
        {/* sidebar */}
        <div className="hidden w-[124px] shrink-0 flex-col border-r border-slate-100 bg-white p-2.5 sm:flex">
          <div className="flex items-center gap-1.5">
            <BrandLogo variant="mark" size={18} />
            <span className="min-w-0">
              <span className="block truncate text-[9.5px] font-semibold leading-tight text-slate-900">Syntaxure Labs</span>
              <span className="block text-[7px] font-semibold uppercase tracking-[0.06em] text-slate-400">Officer</span>
            </span>
          </div>
          <div className="mt-3 space-y-0.5">
            {NAV.map(({ label, Icon, colour, tint, active }) => (
              <div
                key={label}
                className={[
                  "flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[9px] font-medium",
                  active ? "bg-blue-50/80 text-blue-900 ring-1 ring-blue-100" : "text-slate-500",
                ].join(" ")}
              >
                <span className={["flex size-4 items-center justify-center rounded ring-1", active ? tint : "bg-white ring-slate-200"].join(" ")}>
                  <Icon className={["size-2.5", active ? colour : "text-slate-400"].join(" ")} aria-hidden="true" />
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* content */}
        <div className="min-w-0 flex-1 bg-slate-50">
          {/* hero band */}
          <div className="pp-hero px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold leading-tight text-white">Dashboard</p>
                <p className="mt-0.5 truncate text-[8.5px] text-white/65">9 people · 3 sessions today</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[8.5px] font-semibold text-white ring-1 ring-white/15">
                <ScanLine className="size-2.5" aria-hidden="true" /> Scan a pass
              </span>
            </div>
          </div>

          <div className="space-y-2.5 p-3">
            {/* stat strip */}
            <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {[
                { k: "Present today", v: "7", tone: "text-slate-900" },
                { k: "Late", v: "2", tone: "text-amber-700" },
                { k: "To approve", v: "1", tone: "text-slate-900" },
              ].map((s) => (
                <div key={s.k} className="px-2.5 py-2">
                  <p className={["text-[15px] font-semibold leading-none tracking-tight", s.tone].join(" ")}>{s.v}</p>
                  <p className="mt-1 text-[7.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{s.k}</p>
                </div>
              ))}
            </div>

            {/* today bar */}
            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
              <div className="flex items-center justify-between">
                <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">Today · 08:00</p>
                <p className="text-[8px] font-medium text-slate-400">9 of 9 accounted for</p>
              </div>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span className="h-full w-[70%] bg-emerald-500" />
                <span className="h-full w-[20%] bg-amber-400" />
                <span className="h-full w-[10%] bg-slate-300" />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                {[
                  { c: "bg-emerald-500", t: "On time 7" },
                  { c: "bg-amber-400", t: "Late 2" },
                  { c: "bg-slate-300", t: "Pending 0" },
                ].map((l) => (
                  <span key={l.t} className="inline-flex items-center gap-1 text-[7.5px] font-medium text-slate-500">
                    <span className={["size-1.5 rounded-full", l.c].join(" ")} /> {l.t}
                  </span>
                ))}
              </div>
            </div>

            {/* agenda */}
            {!compact && (
              <div className="rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-2.5 py-1.5">
                  <p className="text-[8.5px] font-semibold text-slate-900">Recent sessions</p>
                  <p className="text-[7.5px] text-slate-400">Today</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {AGENDA.map((s) => (
                    <div key={s.title} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[8.5px] font-semibold text-slate-900">{s.title}</p>
                        <p className="truncate text-[7.5px] text-slate-500">
                          {s.time} · {s.count}
                        </p>
                      </div>
                      <span className={["shrink-0 rounded px-1 py-0.5 text-[7px] font-semibold ring-1", s.tone].join(" ")}>{s.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The member's pass on the phone they actually carry. */
export function PhonePass() {
  return (
    <div className="w-[188px] rounded-[28px] border-[6px] border-slate-900 bg-slate-900 p-0 shadow-[0_30px_70px_-20px_rgba(15,23,42,0.55)]">
      <div className="relative overflow-hidden rounded-[22px] bg-slate-50">
        <div className="absolute left-1/2 top-1.5 z-10 h-1 w-12 -translate-x-1/2 rounded-full bg-slate-900/80" />
        <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[7px] font-semibold text-slate-500">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1 w-3 rounded-sm bg-slate-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          </span>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-[-0.01em] text-slate-900">My pass</p>
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[7px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <BadgeCheck className="size-2" aria-hidden="true" /> Active
            </span>
          </div>

          <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="flex justify-center rounded-lg bg-white p-1.5">
              <QrArt size={116} />
            </div>
            <div className="mt-2 text-center">
              <p className="text-[9.5px] font-semibold leading-tight text-slate-900">Sample member</p>
              <p className="mt-0.5 text-[7px] text-slate-500">Organization pass</p>
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5">
            <ShieldCheck className="size-2.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <p className="text-[7px] font-medium leading-tight text-emerald-800">Checked in · 8:02 AM · verified</p>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2 py-1.5">
            {["Home", "Scan", "Pass", "History"].map((t, i) => (
              <span key={t} className={["text-[6.5px] font-semibold", i === 2 ? "text-blue-700" : "text-slate-400"].join(" ")}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Full-width section pairing the desktop console with the phone. */
export function ProductShowcase() {
  return (
    <section id="product-shots" className="scroll-mt-20 border-y border-slate-100 bg-slate-50 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-blue-600">What it looks like</p>
          <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            The same record, on the desk and at the door.
          </h2>
          <p className="mt-4 text-pretty text-slate-500">
            Staff work from one screen. Each person carries a pass. The scanner saves to the
            same record, so what the office sees is what really happened.
          </p>
        </div>

        <div className="relative mt-12">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:p-3">
            <ConsoleShot />
          </div>
          <div className="absolute -bottom-8 right-4 hidden lg:block">
            <PhonePass />
          </div>
        </div>

        <div className="mt-16 flex justify-center lg:hidden">
          <PhonePass />
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-3 sm:grid-cols-3 lg:mt-10">
          {[
            { k: "Staff screen", v: "Your people, their passes, the sessions and the reports, all in one place." },
            { k: "Pass", v: "A QR code that is checked against the real list, not just a picture." },
            { k: "Scanner", v: "Answers at the door you can trust, even when the internet drops." },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-slate-400">{c.k}</p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-slate-600">{c.v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
