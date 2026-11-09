import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { BrandLogo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function CertificateNotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="border-b border-slate-200/80">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/" aria-label="Prism Pass home" className="shrink-0">
            <BrandLogo size={30} />
          </Link>
          <Link
            href="/privacy"
            className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 bg-white px-3 text-[13.5px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
          >
            Privacy &amp; your rights
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 md:px-6">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.1em] text-slate-600">
          <FileQuestion className="size-4" aria-hidden="true" />
          Certificate verification
        </span>
        <h1 className="mt-5 max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.022em] text-slate-900">
          We couldn&apos;t verify this certificate
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-slate-600">
          The link is incomplete, has expired, or does not point to a certificate issued by Prism
          Pass. Check the link with the organization that issued it, or ask them to resend the
          certificate.
        </p>
        <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-slate-500">
          A verification link only shows the certificate&apos;s seal and integrity state. It never
          reveals the recipient&apos;s personal information.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-[10px] bg-slate-900 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Go to Prism Pass
          </Link>
          <Link
            href="/privacy"
            className="inline-flex h-11 items-center rounded-[10px] border border-slate-200 px-5 text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Privacy &amp; your rights
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
