import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Database, Eye, Lock, ScrollText, Trash2, UserCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Privacy & your rights",
  description:
    "What Prism Pass records, who can see it, how long it is kept, and how to exercise your rights under the Data Privacy Act of 2012 (RA 10173).",
};

const SECTIONS = [
  {
    icon: Database,
    title: "What is recorded",
    body: [
      "Your organization's directory entry: the name, identifier, and optional contact details an administrator enters for you, plus the reference photo or ID number your office chooses to keep on file.",
      "Your pass: a credential identifier and, where enabled, a rotating code. The pass is a reference into your record — it does not contain your name, so a photographed QR code alone reveals nothing about you.",
      "Attendance events: when a pass was scanned, by which device, and the resulting status (present, late, or rejected). Each event is written to an audit log that records the action, the actor, and the time.",
    ],
  },
  {
    icon: UserCheck,
    title: "Who is responsible",
    body: [
      "The organization that issues your pass is the personal information controller. It decides why your data is collected and how long it is kept. Prism Pass processes that data on the organization's instruction.",
      "Access is scoped by role: an officer at one organization cannot read another organization's directory, passes, or attendance, and platform staff see operational metadata rather than your attendance history.",
    ],
  },
  {
    icon: Eye,
    title: "Who can see it",
    body: [
      "Authorized officers of your own organization, within the permissions their role grants. A scanner operator sees only enough to confirm the check-in.",
      "Nobody else — not other organizations, not the public. A verification link shows only whether a pass is valid, never your attendance history.",
    ],
  },
  {
    icon: ScrollText,
    title: "Why it is processed",
    body: [
      "To issue and verify your pass, to record attendance for the sessions you take part in, and to produce the reports your organization is required to keep.",
      "Data is not sold, and it is not used for advertising or profiling.",
    ],
  },
  {
    icon: Trash2,
    title: "How long it is kept",
    body: [
      "Retention follows your organization's records schedule. Attendance records are typically kept for the period your office needs to substantiate attendance, then deleted or anonymized.",
      "Ask your organization's administrator for the specific retention period that applies to you.",
    ],
  },
  {
    icon: Lock,
    title: "How it is protected",
    body: [
      "Traffic is encrypted in transit, sessions are short-lived and revocable, and every write is audited. Offline scans are queued on the device and signed before they sync, so a queued record cannot be forged later.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <BrandLogo size={30} />
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <ArrowLeft className="size-4 text-slate-500" aria-hidden="true" />
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 md:px-6">
        <div className="pp-hero -mx-4 mt-0 px-4 py-10 md:-mx-6 md:px-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Data Privacy Act of 2012 · RA 10173
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-[-0.022em] text-white md:text-[38px]">
            Privacy &amp; your rights
          </h1>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/70">
            What this platform records, who is allowed to see it, and what you can ask your
            organization to do about it — in plain language.
          </p>
        </div>

        <div className="mt-10 space-y-9">
          {SECTIONS.map(({ icon: Icon, title, body }) => (
            <section key={title}>
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-slate-900">{title}</h2>
              </div>
              <div className="mt-2.5 space-y-2.5 pl-[42px]">
                {body.map((p) => (
                  <p key={p.slice(0, 24)} className="text-[15.5px] leading-relaxed text-slate-600">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}

          <section>
            <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-slate-900">Your rights</h2>
            <p className="mt-2.5 text-[15.5px] leading-relaxed text-slate-600">
              Under RA 10173 you may ask to be informed that your data was processed, to access it,
              to have errors corrected, to object to further processing, to have it erased or
              blocked, and to be told if a breach affects you. You may also complain to the National
              Privacy Commission.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
              <p className="text-[15px] leading-relaxed text-slate-700">
                Start with your organization&apos;s administrator — they hold your record and can
                correct or delete it. If that does not resolve it, write to{" "}
                <a href="mailto:hello@syntaxure.dev" className="font-semibold text-blue-700 underline underline-offset-2">
                  hello@syntaxure.dev
                </a>
                . We respond within fifteen working days.
              </p>
            </div>
          </section>

          <p className="border-t border-slate-200 pt-6 text-[13.5px] leading-relaxed text-slate-500">
            This page describes how the platform is designed to handle personal data. It is not
            legal advice, and it does not replace your organization&apos;s own privacy notice.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/demo" className="text-[14.5px] font-semibold text-blue-700 underline underline-offset-2">
            Book a demo
          </Link>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <Link href="/login" className="text-[14.5px] font-semibold text-blue-700 underline underline-offset-2">
            Sign in
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
