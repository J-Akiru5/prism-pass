"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BatchDocumentStatus = {
  documentId: string;
  status: string;
  requestStatus: string | null;
};

type BatchRecipient = {
  documentId: string;
  displayName: string | null;
  status: string;
  sealedAt: string | null;
};

type CertificatePreview = {
  recipientName: string;
  eventTitle: string;
  eventDateLabel: string;
  organizationName: string;
  statement: string;
  issuedOn: string;
  signatory: { displayName: string; roleLabel: string };
};

type BatchPayload = {
  data?: {
    batchId: string;
    event: { id: string | null; title: string | null; dateLabel: string | null };
    signatory: { displayName: string; roleLabel: string; isYou: boolean } | null;
    documentCount: number;
    counts: {
      documents: number;
      draft: number;
      sealed: number;
      superseded: number;
      revoked: number;
      pending: number;
      signed: number;
    };
    statuses: BatchDocumentStatus[];
    consentVersion: string | null;
    consent: { version: string | null; text: string };
    signer: { assigned: boolean; eligible: boolean; reason: string | null };
    inspection: { documentId: string; code: string; message: string } | null;
    recipients: BatchRecipient[];
    preview: CertificatePreview | null;
  };
  error?: { code?: string; message?: string; details?: { documentIds?: string[]; pendingDocumentIds?: string[] } };
};

type SignResponse = {
  data?: {
    batchId: string;
    alreadySigned: boolean;
    signed: number;
    sealed: number;
    documentIds: string[];
    sealedAt: string | null;
    consentVersion: string;
    method: string;
  };
  error?: { code?: string; message?: string; details?: { documentIds?: string[] } };
};

const INELIGIBLE_COPY: Record<string, string> = {
  not_assigned_signer: "Only the assigned signatory can sign this batch.",
  already_signed: "Every certificate in this batch is already signed and sealed.",
  partial_batch: "Some certificates are already signed, so the batch cannot be signed again.",
  consent_mismatch: "The consent version recorded on these certificates does not match the signing screen.",
  signer_mismatch: "The certificates in this batch name different signatories, so they cannot be signed together.",
  invalid_payload: "A certificate payload could not be read. The batch is refused until the records are reviewed.",
  missing_signatory: "This batch has no readable signatory.",
  chain_broken: "A signature chain is broken. The batch is refused until the records are reviewed.",
  invalid_order: "A signing request is malformed. The batch is refused until the records are reviewed.",
  missing_request: "A certificate has no signing request.",
  multiple_requests: "A certificate has more than one signing request.",
  missing_signer: "A signature event is missing its signer identity.",
  not_pending: "This batch is not in a signable state.",
};

function dateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SignCertificateBatchPage({
  params,
}: {
  params: Promise<{ orgId: string; batchId: string }>;
}) {
  const { orgId, batchId } = use(params);

  const [batch, setBatch] = useState<BatchPayload["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [consentChecked, setConsentChecked] = useState(false);
  const [method, setMethod] = useState<"typed" | "credential">("typed");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [partialMessage, setPartialMessage] = useState<string | null>(null);
  const [result, setResult] = useState<SignResponse["data"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/v1/orgs/${orgId}/certificate-batches/${encodeURIComponent(batchId)}`,
          { credentials: "include" },
        );
        const payload = (await response.json().catch(() => null)) as BatchPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? `Could not load this batch (${response.status})`);
        }
        if (cancelled) return;
        setBatch(payload?.data ?? null);
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, batchId]);

  async function sign() {
    if (!batch || !batch.consent.version) return;
    setSigning(true);
    setSignError(null);
    setPartialMessage(null);
    try {
      const response = await fetch(
        `/api/v1/orgs/${orgId}/certificate-batches/${encodeURIComponent(batchId)}/sign`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ consentVersion: batch.consent.version, method }),
        },
      );
      const payload = (await response.json().catch(() => null)) as SignResponse | null;
      if (!response.ok) {
        if (payload?.error?.code === "PARTIAL_BATCH") {
          setPartialMessage(payload.error.message ?? "Some certificates are already signed.");
          return;
        }
        throw new Error(payload?.error?.message ?? `Could not sign this batch (${response.status})`);
      }
      setResult(payload?.data ?? null);
    } catch (e) {
      setSignError((e as Error).message);
    } finally {
      setSigning(false);
    }
  }

  const backLink = (
    <Link
      href={`/org/${orgId}/certificates`}
      className="inline-flex items-center gap-1 text-[14px] font-semibold text-slate-600 hover:text-slate-900"
    >
      <ChevronLeft className="size-4" aria-hidden="true" /> Back to certificates
    </Link>
  );

  if (loading) {
    return (
      <>
        <PageHeader title="Sign certificates" description="Review the batch before you sign." />
        <p className="mt-6 flex items-center gap-2 text-[15px] text-slate-600">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading the certificate batch…
        </p>
      </>
    );
  }

  if (error || !batch) {
    return (
      <>
        <PageHeader title="Sign certificates" description="Review the batch before you sign." />
        <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-[15px] text-red-800">
          <p className="font-bold">Could not open this batch</p>
          <p className="mt-1">{error ?? "The batch was not found."}</p>
        </div>
        <div className="mt-4">{backLink}</div>
      </>
    );
  }

  const alreadySigned = result?.alreadySigned === true || batch.signer.reason === "already_signed";
  const signedResult = result && !result.alreadySigned;
  const ineligibleCopy = batch.signer.reason ? INELIGIBLE_COPY[batch.signer.reason] ?? "You cannot sign this batch." : null;
  const canSign = batch.signer.eligible && Boolean(batch.consent.version) && consentChecked && !signing && !result;
  const sample = batch.preview;
  const recipientNames = batch.recipients
    .map((recipient) => recipient.displayName)
    .filter((name): name is string => Boolean(name && name.trim().length > 0));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {backLink}
        <Badge variant={batch.counts.draft > 0 ? "warning" : "success"}>
          {batch.counts.draft > 0 ? `${batch.counts.draft} pending` : "Signed"}
        </Badge>
      </div>

      <PageHeader
        title="Sign certificates"
        description="Review one sample, confirm the exact consent text, then sign every certificate in this batch."
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <Award className="size-5" aria-hidden="true" />
                </span>
                <CardTitle>{batch.event.title ?? "Certificate batch"}</CardTitle>
              </div>
              <CardDescription>
                {batch.event.dateLabel ? `${batch.event.dateLabel} · ` : ""}
                {batch.documentCount} {batch.documentCount === 1 ? "certificate" : "certificates"}
                {batch.signatory ? ` · signed by ${batch.signatory.displayName}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Recipients</dt>
                  <dd className="mt-1 text-[22px] font-bold leading-none text-slate-900">{batch.counts.documents}</dd>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-amber-700">Pending</dt>
                  <dd className="mt-1 text-[22px] font-bold leading-none text-amber-900">{batch.counts.draft}</dd>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-emerald-700">Sealed</dt>
                  <dd className="mt-1 text-[22px] font-bold leading-none text-emerald-900">{batch.counts.sealed}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Signatory</dt>
                  <dd className="mt-1 truncate text-[15px] font-semibold leading-tight text-slate-900">
                    {batch.signatory?.displayName ?? "—"}
                  </dd>
                </div>
              </dl>
              {recipientNames.length > 0 ? (
                <p className="mt-3 flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-600">
                  <Users className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>
                    Includes {recipientNames.slice(0, 4).join(", ")}
                    {recipientNames.length > 4 ? ` and ${recipientNames.length - 4} more` : ""}.
                  </span>
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sample certificate</CardTitle>
              <CardDescription>
                The same wording is used for every recipient. Names are shown only to the signatory and document
                managers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sample ? (
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50 p-5 text-center sm:p-7">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {sample.organizationName}
                  </p>
                  <p className="mt-3 text-[19px] font-bold tracking-tight text-slate-900">
                    Certificate of Attendance
                  </p>
                  <p className="mt-4 text-[22px] font-semibold leading-tight text-slate-900">
                    {sample.recipientName}
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-[14px] leading-relaxed text-slate-600">
                    {sample.statement}
                  </p>
                  <p className="mt-4 text-[13.5px] font-medium text-slate-700">
                    {sample.eventTitle} · {sample.eventDateLabel}
                  </p>
                  <p className="mt-5 text-[13px] text-slate-500">
                    Issued {sample.issuedOn} · {sample.signatory.displayName},{" "}
                    {sample.signatory.roleLabel}
                  </p>
                </div>
              ) : (
                <p className="text-[14px] text-slate-600">
                  The certificate payload could not be read. Do not sign until it is reviewed.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                  <ShieldCheck className="size-5" aria-hidden="true" />
                </span>
                <CardTitle>Consent</CardTitle>
              </div>
              <CardDescription>
                Consent version{" "}
                <span className="font-mono text-[12.5px] text-slate-700">{batch.consent.version ?? "unavailable"}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[13.5px] leading-relaxed text-slate-700">{batch.consent.text}</p>
              </div>

              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                  checked={consentChecked}
                  onChange={(event) => setConsentChecked(event.target.checked)}
                  disabled={!batch.signer.eligible || Boolean(result)}
                />
                <span className="text-[14px] font-semibold leading-snug text-slate-900">
                  I intend to sign this batch
                </span>
              </label>

              <fieldset className="mt-4" disabled={!batch.signer.eligible || Boolean(result)}>
                <legend className="text-[13px] font-semibold text-slate-900">Signature method</legend>
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input
                    type="radio"
                    name="method"
                    value="typed"
                    checked={method === "typed"}
                    onChange={() => setMethod("typed")}
                    className="mt-0.5 size-4 border-slate-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-slate-900">Typed signature</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                      Records your typed intent with the server timestamp.
                    </span>
                  </span>
                </label>
                <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <input
                    type="radio"
                    name="method"
                    value="credential"
                    checked={method === "credential"}
                    onChange={() => setMethod("credential")}
                    className="mt-0.5 size-4 border-slate-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-slate-900">Account credential</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                      Your signed-in session is recorded as authentication evidence.
                    </span>
                  </span>
                </label>
              </fieldset>

              {ineligibleCopy && !result ? (
                <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13.5px] font-medium leading-relaxed text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {ineligibleCopy}
                </p>
              ) : null}

              {partialMessage ? (
                <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13.5px] font-medium leading-relaxed text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {partialMessage}
                </p>
              ) : null}

              {signError ? (
                <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] font-medium text-red-700">
                  {signError}
                </p>
              ) : null}

              {alreadySigned ? (
                <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-[14.5px] font-semibold text-emerald-900">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Batch already signed
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-emerald-800">
                    Every certificate in this batch is sealed and publicly verifiable.
                  </p>
                </div>
              ) : signedResult ? (
                <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="flex items-center gap-2 text-[14.5px] font-semibold text-emerald-900">
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    {result.signed} {result.signed === 1 ? "certificate" : "certificates"} signed
                  </p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-emerald-800">
                    Sealed {dateLabel(result.sealedAt)}. The certificates are now publicly verifiable.
                  </p>
                </div>
              ) : null}

              {result || alreadySigned ? (
                <div className="mt-4 space-y-2">
                  <Link
                    href={`/member?org=${orgId}`}
                    className={buttonVariants({ variant: "default", size: "lg" }) + " w-full"}
                  >
                    View certificates in the member portal
                  </Link>
                  <Link
                    href={`/org/${orgId}/certificates`}
                    className={buttonVariants({ variant: "outline", size: "lg" }) + " w-full"}
                  >
                    Back to certificates
                  </Link>
                </div>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="mt-4 h-12 w-full"
                  onClick={() => void sign()}
                  disabled={!canSign}
                >
                  {signing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                  {signing
                    ? "Signing…"
                    : `Sign ${batch.counts.draft} ${batch.counts.draft === 1 ? "certificate" : "certificates"}`}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
