import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  CalendarDays,
  FileQuestion,
  Fingerprint,
  Link2Off,
  PenLine,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/marketing/site-footer";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/cn";
import {
  buildPublicVerification,
  isCertificateVerification,
  isVerificationTokenCandidate,
} from "@/modules/certificates/public";
import { CERTIFICATE_HASH_PREFIX_LENGTH } from "@/modules/certificates/verify";

export const dynamic = "force-dynamic";

// A verification link is a capability, not public content. Keep it out of
// search indexes and social previews.
export const metadata: Metadata = {
  title: "Certificate verification",
  description: "Check whether a Prism Pass attendance certificate is genuine.",
  robots: { index: false, follow: false },
};

type P = { params: Promise<{ token: string }> };

type State = "verified" | "not_sealed" | "hash_mismatch" | "chain_broken" | "revoked" | "unknown";

const STATE_COPY: Record<
  State,
  {
    label: string;
    heading: string;
    statement: string;
    icon: LucideIcon;
    badge: string;
  }
> = {
  verified: {
    label: "Integrity verified",
    heading: "Certificate verified",
    statement:
      "The sealed certificate matches its recorded SHA-256 fingerprint and its signature history is intact.",
    icon: ShieldCheck,
    badge: "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/30",
  },
  not_sealed: {
    label: "Not sealed",
    heading: "Certificate not sealed",
    statement:
      "This certificate is still a draft or has been superseded. It is not a final, signed certificate and should not be treated as proof.",
    icon: ShieldAlert,
    badge: "bg-amber-400/15 text-amber-200 ring-1 ring-amber-400/30",
  },
  hash_mismatch: {
    label: "Integrity check failed",
    heading: "Content does not match",
    statement:
      "The certificate content no longer matches the fingerprint recorded when it was sealed. Treat it as altered.",
    icon: ShieldX,
    badge: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/30",
  },
  chain_broken: {
    label: "Signature chain broken",
    heading: "Signature history failed",
    statement:
      "The signature history for this certificate failed its integrity check. The signing record cannot be trusted.",
    icon: Link2Off,
    badge: "bg-rose-400/15 text-rose-200 ring-1 ring-rose-400/30",
  },
  revoked: {
    label: "Revoked",
    heading: "Certificate revoked",
    statement:
      "The issuing organization has revoked this certificate. It is no longer valid, even if the sealed file still exists.",
    icon: XCircle,
    badge: "bg-red-400/15 text-red-200 ring-1 ring-red-400/30",
  },
  unknown: {
    label: "Not recognized",
    heading: "Not an attendance certificate",
    statement:
      "This verification link resolves to a document that is not an attendance certificate. Only its minimal record status is shown.",
    icon: FileQuestion,
    badge: "bg-slate-400/15 text-slate-200 ring-1 ring-slate-400/30",
  },
};

type DetailRow = { label: string; value: string | null; mono?: boolean };

function formatSealedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date);
  return `${formatted} UTC`;
}

export default async function PublicVerifyPage({ params }: P) {
  const { token } = await params;
  if (!isVerificationTokenCandidate(token)) notFound();

  const document = await prisma.document.findUnique({
    where: { verifyToken: token },
    select: {
      template: true,
      title: true,
      version: true,
      sha256: true,
      payload: true,
      status: true,
      sealedAt: true,
      verifyToken: true,
      createdAt: true,
      signatures: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          events: {
            orderBy: { sequence: "asc" },
            select: {
              requestId: true,
              signerUserId: true,
              signerPersonId: true,
              docHash: true,
              consentVersion: true,
              serverTs: true,
              prevHash: true,
              currHash: true,
            },
          },
        },
      },
    },
  });

  const projection = buildPublicVerification(document, document?.signatures ?? []);
  if (!projection) notFound();

  const certificate = isCertificateVerification(projection) ? projection : null;
  const state: State = certificate?.integrity ?? "unknown";
  const copy = STATE_COPY[state];
  const Icon = copy.icon;

  const rows: DetailRow[] = certificate
    ? [
        { label: "Certificate number", value: certificate.certificateNumber, mono: true },
        { label: "Organization", value: certificate.organizationName },
        { label: "Event", value: certificate.eventTitle },
        { label: "Event date", value: certificate.eventDateLabel },
        { label: "Signed by", value: certificate.signatoryRoleLabel },
        { label: "Sealed", value: formatSealedAt(certificate.sealedAt) },
      ]
    : [
        { label: "Document", value: "Not an attendance certificate" },
        { label: "Record status", value: projection.sealed ? "Sealed" : "Not sealed" },
        { label: "Sealed", value: formatSealedAt(projection.sealedAt) },
      ];

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <BrandLogo size={30} />
          </Link>
          <Link
            href="/privacy"
            className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            <span className="sm:hidden">Privacy</span>
            <span className="hidden sm:inline">Privacy &amp; your rights</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 md:px-6">
        <div className="pp-hero -mx-4 mt-0 px-4 py-10 md:-mx-6 md:px-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">
            Public certificate verification
          </p>
          <span
            className={cn(
              "mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-semibold",
              copy.badge,
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {copy.label}
          </span>
          <h1 className="mt-3 text-[30px] font-semibold leading-[1.1] tracking-[-0.022em] text-white md:text-[38px]">
            {copy.heading}
          </h1>
          <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-white/70">{copy.statement}</p>
        </div>

        <section
          aria-labelledby="record-heading"
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                {certificate ? (
                  <ShieldCheck className="size-4" aria-hidden="true" />
                ) : (
                  <FileQuestion className="size-4" aria-hidden="true" />
                )}
              </span>
              <div>
                <h2 id="record-heading" className="text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
                  {certificate ? "Certificate record" : "Document record"}
                </h2>
                <p className="text-[13px] text-slate-500">
                  {certificate ? certificate.title ?? "Attendance certificate" : "Minimal public record"}
                </p>
              </div>
            </div>
            <span className="hidden shrink-0 rounded-full bg-slate-100 px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:inline-flex">
              {state.replaceAll("_", " ")}
            </span>
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {row.label}
                </dt>
                <dd
                  className={cn(
                    "mt-1 break-words text-[15.5px] font-medium text-slate-900",
                    row.mono && "font-mono text-[14px] tracking-[-0.01em]",
                  )}
                >
                  {row.value ?? "Not available"}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2">
              <Fingerprint className="size-4 text-slate-500" aria-hidden="true" />
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Content fingerprint
              </p>
            </div>
            <code className="mt-2 block break-all font-mono text-[13.5px] text-slate-800">
              {projection.hashPrefix || "Not available"}
            </code>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
              First {CERTIFICATE_HASH_PREFIX_LENGTH} characters of the sealed SHA-256 hash.
            </p>
          </div>
        </section>

        <section aria-labelledby="scope-heading" className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-4 md:px-5">
          <h2 id="scope-heading" className="flex items-center gap-2 text-[15px] font-semibold text-slate-900">
            <PenLine className="size-4 text-slate-500" aria-hidden="true" />
            What this check covers
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600">
            This page confirms whether the certificate was sealed by the issuing organization and whether its
            content and signature history still match. It deliberately does not show the recipient&apos;s name,
            attendance record, or any other personal data. Questions about a certificate should go to the
            organization that issued it.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" aria-hidden="true" />
              Issued by the organization
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Sealed on the recorded date
            </span>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
