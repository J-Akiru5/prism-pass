import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Clock, Database, FileText, Mail, ShieldCheck, UserCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/marketing/site-footer";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Pilot terms for Prism Pass: accounts, acceptable use, attendance records, availability and contact.",
};

const SECTIONS = [
  {
    icon: FileText,
    title: "The pilot service",
    body: [
      "Prism Pass is an attendance and pass-verification platform provided to participating organizations during a pilot. Features, limits and integrations may change as the pilot develops.",
      "Where a signed pilot agreement or order form exists, that agreement prevails over this summary. This page is a plain-language overview, not legal advice.",
    ],
  },
  {
    icon: UserCheck,
    title: "Accounts and access",
    body: [
      "You must provide accurate account details and keep your credentials private. You are responsible for activity performed with your account.",
      "Creating an account does not grant access to an organization. An administrator of your organization must add you and assign a role before you can view directories, passes or attendance records.",
      "Organization administrators control membership, roles and revocation. Access ends when your membership is revoked or the organization stops using the service.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Acceptable use",
    body: [
      "Do not attempt to access another organization's data, bypass authorization, interfere with the service, or use it to conduct unlawful surveillance.",
      "Attendance data must be handled in line with the Data Privacy Act of 2012 (RA 10173) and your organization's own policies. See the Privacy Policy for what the platform records and how rights are exercised.",
    ],
  },
  {
    icon: Database,
    title: "Attendance records",
    body: [
      "Your organization is the personal information controller for the attendance records it creates; Prism Pass processes that data on the organization's instruction.",
      "A scan captured while offline is provisional until the server accepts it. Do not treat a queued scan as recorded evidence until the queue confirms it.",
    ],
  },
  {
    icon: Clock,
    title: "Availability and changes",
    body: [
      "The pilot is provided on an as-is basis while it is being evaluated. We aim to keep it available and may perform maintenance or deploy changes without notice.",
      "No service-level commitment applies unless one is set out in a signed agreement.",
    ],
  },
  {
    icon: Mail,
    title: "Contact",
    body: [
      "Questions about these terms, a pilot agreement, or account access should go to hello@syntaxure.dev or your organization administrator.",
    ],
  },
];

export default function TermsPage() {
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
            Pilot terms
          </p>
          <h1 className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-[-0.022em] text-white md:text-[38px]">
            Terms of Service
          </h1>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/70">
            The ground rules for using Prism Pass during the pilot, in plain language.
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

          <p className="border-t border-slate-200 pt-6 text-[13.5px] leading-relaxed text-slate-500">
            This pilot summary is reviewed alongside the signed agreement. It is not legal advice and
            does not replace the executed agreement between Syntaxure Labs and your organization.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link href="/privacy" className="text-[14.5px] font-semibold text-blue-700 underline underline-offset-2">
            Privacy &amp; your rights
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
