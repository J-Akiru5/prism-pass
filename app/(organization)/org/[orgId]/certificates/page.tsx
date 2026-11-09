"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Award, CheckCircle2, Loader2, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FormField } from "@/components/ui/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleGrants, type Role } from "@/packages/authorization/permissions";

type SessionOption = {
  id: string;
  title: string;
  startsAt: string;
  status?: string;
};

type SessionListPayload = {
  data?: SessionOption[];
  error?: { message?: string };
};

type MembershipOption = {
  id: string;
  userId: string;
  role: Role;
  status: string;
  email: string | null;
  personDisplayName: string | null;
  isSelf: boolean;
};

type MembershipListPayload = {
  data?: MembershipOption[];
  error?: { message?: string };
};

type PreviewCounts = {
  records: number;
  eligible: number;
  skipped: number;
  alreadyGenerated: number;
  duplicates: number;
};

type PreviewRecipient = { personId: string; displayName: string };
type PreviewSkipped = PreviewRecipient & { reason: string; message: string };
type PreviewGenerated = PreviewRecipient & {
  documentId: string | null;
  batchId: string | null;
  status: string | null;
  createdAt: string | null;
};

type PreviewPayload = {
  data?: {
    session: { id: string; title: string; timezone: string; status: string };
    issuedOn: string;
    requireCheckOut: boolean;
    requireApproval: boolean;
    maxBatch: number;
    exceedsBatchLimit: boolean;
    counts: PreviewCounts;
    eligible: PreviewRecipient[];
    skipped: PreviewSkipped[];
    alreadyGenerated: PreviewGenerated[];
  };
  error?: { message?: string };
};

type GeneratePayload = {
  data?: {
    batchId: string;
    sessionId: string;
    issuedOn: string;
    counts: PreviewCounts & { generated: number };
  };
  error?: { message?: string };
};

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function generatedBatchLabel(batchId: string): string {
  return batchId === "ungrouped" ? "Earlier run" : `Batch ${batchId.slice(0, 8)}`;
}

// Certificates hub: preview one event's eligible attendees, pick a signatory,
// generate the batch, and see what already exists. The server owns eligibility,
// idempotency and the batch cap; this page only renders its answers.
export default function CertificatesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);

  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [memberships, setMemberships] = useState<MembershipOption[]>([]);
  const [signatoryUserId, setSignatoryUserId] = useState("");
  const [membershipsLoading, setMembershipsLoading] = useState(true);
  const [membershipsError, setMembershipsError] = useState<string | null>(null);

  const [requireCheckOut, setRequireCheckOut] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [issuedOn, setIssuedOn] = useState("");
  const [statement, setStatement] = useState("");

  const [preview, setPreview] = useState<PreviewPayload["data"] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratePayload["data"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadSessions() {
      try {
        const response = await fetch(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=100`);
        const payload = (await response.json().catch(() => null)) as SessionListPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? `Could not load events (${response.status})`);
        }
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setSessions(rows);
        setSessionId((current) => current || rows[0]?.id || "");
        setSessionsError(null);
      } catch (error) {
        if (!cancelled) setSessionsError((error as Error).message);
      } finally {
        if (!cancelled) setSessionsLoading(false);
      }
    }
    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // The memberships route is the existing directory read. A caller who can
  // manage certificates may still lack members.manage in a custom role, so a
  // failure is shown rather than breaking the rest of the page.
  useEffect(() => {
    let cancelled = false;
    async function loadMemberships() {
      try {
        const response = await fetch(`/api/v1/orgs/${orgId}/memberships`);
        const payload = (await response.json().catch(() => null)) as MembershipListPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? `Could not load members (${response.status})`);
        }
        if (cancelled) return;
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        setMemberships(rows);
        const signers = rows.filter(
          (row) => row.status === "ACTIVE" && roleGrants(row.role, "documents.sign"),
        );
        const preferred = signers.find((row) => row.isSelf) ?? signers[0];
        if (preferred) setSignatoryUserId((current) => current || preferred.userId);
        setMembershipsError(null);
      } catch (error) {
        if (!cancelled) setMembershipsError((error as Error).message);
      } finally {
        if (!cancelled) setMembershipsLoading(false);
      }
    }
    void loadMemberships();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!sessionId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const query = new URLSearchParams();
        if (requireCheckOut) query.set("requireCheckOut", "true");
        if (requireApproval) query.set("requireApproval", "true");
        const suffix = query.toString();
        const response = await fetch(
          `/api/v1/orgs/${orgId}/sessions/${encodeURIComponent(sessionId)}/certificates${suffix ? `?${suffix}` : ""}`,
        );
        const payload = (await response.json().catch(() => null)) as PreviewPayload | null;
        if (!response.ok) {
          throw new Error(payload?.error?.message ?? `Could not preview certificates (${response.status})`);
        }
        if (cancelled) return;
        setPreview(payload?.data ?? null);
        setPreviewError(null);
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError((error as Error).message);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [orgId, sessionId, requireCheckOut, requireApproval, previewNonce]);

  const signatoryOptions = useMemo(
    () =>
      memberships
        .filter((row) => row.status === "ACTIVE" && roleGrants(row.role, "documents.sign"))
        .map((row) => ({
          ...row,
          label: row.personDisplayName?.trim() || row.email || row.userId,
        })),
    [memberships],
  );

  const generatedBatches = useMemo(() => {
    const groups = new Map<string, PreviewGenerated[]>();
    for (const row of preview?.alreadyGenerated ?? []) {
      const key = row.batchId ?? "ungrouped";
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [preview]);

  const counts = preview?.counts ?? null;
  const batchTooLarge = Boolean(preview?.exceedsBatchLimit);
  const canGenerate =
    Boolean(sessionId) &&
    Boolean(signatoryUserId) &&
    Boolean(preview) &&
    !previewLoading &&
    !generating &&
    !batchTooLarge &&
    (counts?.eligible ?? 0) > 0;

  async function generate() {
    if (!sessionId || !signatoryUserId) return;
    setGenerating(true);
    setGenerateError(null);
    setResult(null);
    try {
      const response = await fetch(
        `/api/v1/orgs/${orgId}/sessions/${encodeURIComponent(sessionId)}/certificates`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            signatoryUserId,
            statement: statement.trim().length > 0 ? statement.trim() : undefined,
            requireCheckOut,
            requireApproval,
            issuedOn: issuedOn || undefined,
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as GeneratePayload | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? `Could not generate certificates (${response.status})`);
      }
      setResult(payload?.data ?? null);
      // Refresh counts and the generated list; the new rows are now persisted.
      setPreviewNonce((value) => value + 1);
    } catch (error) {
      setGenerateError((error as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Certificates"
        description="Generate a certificate of attendance for everyone with a complete record, then have your signatory sign it."
      />

      <Card className="mt-5 max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
              <Award className="size-5" aria-hidden="true" />
            </span>
            <CardTitle>Issue certificates</CardTitle>
          </div>
          <CardDescription>
            One draft per attendee. Nothing is public until the signatory signs and the document is sealed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormField label="Event" htmlFor="certificate-event">
            <Select
              id="certificate-event"
              name="sessionId"
              value={sessionId}
              onChange={(event) => {
                setSessionId(event.target.value);
                setResult(null);
                setGenerateError(null);
              }}
              disabled={sessionsLoading || sessions.length === 0}
            >
              {sessions.length === 0 ? (
                <option value="">{sessionsLoading ? "Loading events…" : "No events available"}</option>
              ) : (
                sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title} · {dateLabel(session.startsAt)}
                  </option>
                ))
              )}
            </Select>
          </FormField>

          {sessionsError ? (
            <p role="alert" className="mt-3 text-[14px] font-medium text-red-600">
              {sessionsError}
            </p>
          ) : null}

          <div className="mt-5" aria-live="polite">
            {previewLoading ? (
              <p className="flex items-center gap-2 text-[14px] text-slate-600">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking attendance records…
              </p>
            ) : previewError ? (
              <p role="alert" className="text-[14px] font-medium text-red-600">
                {previewError}
              </p>
            ) : counts ? (
              <>
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-emerald-700">Eligible</dt>
                    <dd className="mt-1 text-[22px] font-bold leading-none text-emerald-900">{counts.eligible}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Already generated</dt>
                    <dd className="mt-1 text-[22px] font-bold leading-none text-slate-900">{counts.alreadyGenerated}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Skipped</dt>
                    <dd className="mt-1 text-[22px] font-bold leading-none text-slate-900">{counts.skipped}</dd>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <dt className="text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-500">Records</dt>
                    <dd className="mt-1 text-[22px] font-bold leading-none text-slate-900">{counts.records}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-[13px] text-slate-500">
                  {counts.eligible === 0 && counts.alreadyGenerated > 0
                    ? "Everyone eligible for this event already has a certificate."
                    : `The batch limit is ${preview?.maxBatch ?? 100} certificates per run.`}
                </p>
                {batchTooLarge ? (
                  <p role="alert" className="mt-2 flex items-start gap-2 text-[14px] font-medium text-amber-800">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    This event has more than {preview?.maxBatch ?? 100} eligible attendees. Split the event or tighten
                    the rules before generating.
                  </p>
                ) : null}
              </>
            ) : sessionId ? (
              <p className="text-[14px] text-slate-600">Select an event to preview its certificates.</p>
            ) : (
              <p className="text-[14px] text-slate-600">No events yet. Create one on the Attendance page.</p>
            )}
          </div>

          <div className="mt-5 space-y-4">
            <FormField
              label="Signatory"
              htmlFor="certificate-signatory"
              hint="Only active members whose role grants document signing are listed."
              error={membershipsError}
            >
              <Select
                id="certificate-signatory"
                name="signatoryUserId"
                value={signatoryUserId}
                onChange={(event) => setSignatoryUserId(event.target.value)}
                disabled={membershipsLoading || signatoryOptions.length === 0}
              >
                {signatoryOptions.length === 0 ? (
                  <option value="">
                    {membershipsLoading ? "Loading members…" : "No member can sign documents"}
                  </option>
                ) : (
                  signatoryOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>
                      {option.label} · {option.role.toLowerCase()}
                    </option>
                  ))
                )}
              </Select>
            </FormField>

            <FormField
              label="Statement"
              htmlFor="certificate-statement"
              hint={`Optional. Leave blank to use "This certifies that <name> attended <event>."`}
            >
              <Textarea
                id="certificate-statement"
                name="statement"
                value={statement}
                onChange={(event) => setStatement(event.target.value)}
                maxLength={2000}
                placeholder="Use the same wording for every certificate in this batch."
              />
            </FormField>

            <FormField
              label="Issue date"
              htmlFor="certificate-issued-on"
              hint={
                preview
                  ? `Optional. Defaults to ${preview.issuedOn} in ${preview.session.timezone}.`
                  : "Optional. Defaults to today in the event timezone."
              }
            >
              <Input
                id="certificate-issued-on"
                name="issuedOn"
                type="date"
                value={issuedOn}
                onChange={(event) => setIssuedOn(event.target.value)}
              />
            </FormField>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                  checked={requireCheckOut}
                  onChange={(event) => setRequireCheckOut(event.target.checked)}
                />
                <span>
                  <span className="block text-[14px] font-semibold text-slate-900">Require check-out</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                    Only attendees who checked out get a certificate.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-300 text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40"
                  checked={requireApproval}
                  onChange={(event) => setRequireApproval(event.target.checked)}
                />
                <span>
                  <span className="block text-[14px] font-semibold text-slate-900">Require approval</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                    Only records marked approved get a certificate.
                  </span>
                </span>
              </label>
            </div>

            {generateError ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[14px] font-medium text-red-700">
                {generateError}
              </p>
            ) : null}

            {result ? (
              <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="flex items-center gap-2 text-[14.5px] font-semibold text-emerald-900">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {result.counts.generated} {result.counts.generated === 1 ? "certificate" : "certificates"} generated
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-emerald-800">
                  {result.counts.alreadyGenerated} already existed · {result.counts.skipped} skipped ·{" "}
                  {generatedBatchLabel(result.batchId)}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-emerald-700">
                  Drafts are waiting for the signatory. They become publicly verifiable after signing seals them.
                </p>
              </div>
            ) : null}

            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              onClick={() => void generate()}
              disabled={!canGenerate}
            >
              {generating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Award aria-hidden="true" />}
              {generating
                ? "Generating…"
                : counts && counts.eligible > 0
                  ? `Generate ${counts.eligible} ${counts.eligible === 1 ? "certificate" : "certificates"}`
                  : "Generate certificates"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && preview.skipped.length > 0 ? (
        <Card className="mt-5 max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <Users className="size-5" aria-hidden="true" />
              </span>
              <CardTitle>Skipped records</CardTitle>
            </div>
            <CardDescription>
              These attendees do not get a certificate with the current rules. The record itself is unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-slate-100">
              {preview.skipped.slice(0, 20).map((row, index) => (
                <li key={`${row.personId}-${row.reason}-${index}`} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">
                      {row.displayName.trim() || "Unknown attendee"}
                    </span>
                    <span className="block text-[13px] text-slate-500">{row.message}</span>
                  </span>
                  <Badge variant="warning">{row.reason.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
            {preview.skipped.length > 20 ? (
              <p className="mt-2 text-[13px] text-slate-500">+{preview.skipped.length - 20} more skipped records</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {preview ? (
        <Card className="mt-5 max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <Award className="size-5" aria-hidden="true" />
              </span>
              <CardTitle>Generated certificates</CardTitle>
            </div>
            <CardDescription>Drafts and signed certificates already issued for this event.</CardDescription>
          </CardHeader>
          <CardContent>
            {preview.alreadyGenerated.length === 0 ? (
              <p className="text-[14px] text-slate-600">No certificates generated for this event yet.</p>
            ) : (
              <div className="space-y-4">
                {generatedBatches.map(([batchId, rows]) => (
                  <section key={batchId} aria-label={generatedBatchLabel(batchId)}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[14px] font-semibold text-slate-900">{generatedBatchLabel(batchId)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] text-slate-500">
                          {rows.length} {rows.length === 1 ? "certificate" : "certificates"}
                          {rows[0]?.createdAt ? ` · ${dateLabel(rows[0].createdAt)}` : ""}
                        </p>
                        {batchId !== "ungrouped" && rows.some((row) => row.status === "DRAFT") ? (
                          <Link
                            href={`/org/${orgId}/certificates/${batchId}/sign`}
                            className={buttonVariants({ variant: "outline", size: "sm" })}
                          >
                            Sign batch
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <ul className="mt-1 divide-y divide-slate-100">
                      {rows.slice(0, 10).map((row) => (
                        <li
                          key={row.documentId ?? `${row.personId}-${batchId}`}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="truncate text-[14.5px] text-slate-800">{row.displayName}</span>
                          <Badge variant={row.status === "SEALED" ? "success" : "muted"}>
                            {row.status ? row.status.toLowerCase() : "draft"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                    {rows.length > 10 ? (
                      <p className="mt-1 text-[13px] text-slate-500">+{rows.length - 10} more in this batch</p>
                    ) : null}
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
