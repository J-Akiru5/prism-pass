"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatRail } from "@/components/platform/stat-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReasonDialog } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import {
  formatDate,
  formatDateTime,
  orgStatusLabel,
  orgStatusTone,
  relativeAge,
  resultTone,
} from "@/lib/platform-format";
import {
  ENTITLEMENT_KEYS,
  PLATFORM_PLANS,
  PLATFORM_PLAN_LABELS,
  type EntitlementKey,
  type EntitlementMap,
  type OrganizationCounts,
  type OrganizationMemberRow,
  type PlatformAuditRow,
  type PlatformPlan,
} from "@/modules/platform/console";
import { LAST_ADMIN_SUSPEND_RULE, type OrgStatusValue } from "@/modules/platform/ledger";

type Detail = {
  organization: { id: string; name: string; slug: string; status: OrgStatusValue; timezone: string; createdAt: string };
  subscription: { exists: boolean; plan: string; entitlements: EntitlementMap };
  counts: OrganizationCounts;
  members: OrganizationMemberRow[];
  membersTruncated: boolean;
  audit: PlatformAuditRow[];
};

const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  passes: "Passes",
  attendance: "Attendance",
  geofence: "Geofence",
  documents: "Documents",
  reports: "Reports",
  offline: "Offline sync",
};

function sameEntitlements(a: EntitlementMap, b: EntitlementMap): boolean {
  return ENTITLEMENT_KEYS.every((key) => a[key] === b[key]);
}

export function OrgDetailConsole({ orgId }: { orgId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [plan, setPlan] = useState<PlatformPlan>("pilot");
  const [entitlements, setEntitlements] = useState<EntitlementMap | null>(null);
  const [planReason, setPlanReason] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false, syncDraft = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const envelope = await platformRequest<Detail>(`/api/v1/platform/orgs/${orgId}`);
        const payload = envelope.data;
        setData(payload);
        if (!silent || syncDraft) {
          setPlan(payload.subscription.plan as PlatformPlan);
          setEntitlements(payload.subscription.entitlements);
        }
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmStatus(reason: string) {
    if (!data || statusBusy) return;
    const nextStatus: "ACTIVE" | "SUSPENDED" = data.organization.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setStatusBusy(true);
    setStatusError(null);
    try {
      const envelope = await platformRequest<{ status: OrgStatusValue; changed: boolean }>(
        `/api/v1/platform/orgs/${orgId}/status`,
        { method: "POST", body: JSON.stringify({ status: nextStatus, ...(reason ? { reason } : {}) }) },
      );
      setData((prev) => (prev ? { ...prev, organization: { ...prev.organization, status: envelope.data.status } } : prev));
      setStatusOpen(false);
      setNotice(
        envelope.data.status === "ACTIVE"
          ? "Tenant reactivated. Access resumes on the next request."
          : "Tenant suspended. Members and scanners are refused until reactivation.",
      );
    } catch (e) {
      setStatusError(errorMessage(e));
    } finally {
      setStatusBusy(false);
    }
  }

  async function savePlan(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !entitlements || savingPlan) return;
    const trimmedReason = planReason.trim();
    if (trimmedReason && trimmedReason.length < 3) {
      setPlanError("Leave the note empty, or use at least 3 characters.");
      return;
    }
    setSavingPlan(true);
    setPlanError(null);
    setPlanNotice(null);
    try {
      const envelope = await platformRequest<{ plan: string; entitlements: EntitlementMap; changed: boolean }>(
        `/api/v1/platform/orgs/${orgId}/plan`,
        {
          method: "PATCH",
          body: JSON.stringify({
            plan,
            entitlements,
            ...(trimmedReason ? { reason: trimmedReason } : {}),
          }),
        },
      );
      setPlan(envelope.data.plan as PlatformPlan);
      setEntitlements(envelope.data.entitlements);
      setPlanReason("");
      setPlanNotice(
        envelope.data.changed ? "Plan saved. The change is in the platform audit ledger." : "No change to save.",
      );
      setData((prev) =>
        prev
          ? {
              ...prev,
              subscription: {
                exists: true,
                plan: envelope.data.plan,
                entitlements: envelope.data.entitlements,
              },
            }
          : prev,
      );
      void load(true, true);
    } catch (e) {
      setPlanError(errorMessage(e));
    } finally {
      setSavingPlan(false);
    }
  }

  if (loading && !data) {
    return (
      <>
        <BackLink />
        <div className="mt-6">
          <LoadingState label="Loading organization…" />
        </div>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        <BackLink />
        <div className="mt-6">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      </>
    );
  }

  if (!data) return null;

  const org = data.organization;
  const dirty =
    plan !== (data.subscription.plan as PlatformPlan) ||
    (entitlements ? !sameEntitlements(entitlements, data.subscription.entitlements) : false);
  const canEditPlan = org.status !== "PENDING_DELETION";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Organizations", href: "/platform/orgs" }, { label: org.name }]}
        eyebrow="Platform · Tenant detail"
        title={org.name}
        description={`Slug ${org.slug} · Timezone ${org.timezone} · Provisioned ${formatDate(org.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={orgStatusTone(org.status)}>{orgStatusLabel(org.status)}</Badge>
            <Button variant="outline" className="h-11" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              className={
                org.status === "ACTIVE"
                  ? "h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                  : "h-11"
              }
              onClick={() => {
                setStatusError(null);
                setStatusOpen(true);
              }}
            >
              {org.status === "ACTIVE" ? "Suspend tenant" : "Reactivate tenant"}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mt-4">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="mt-4 border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}

      <section aria-labelledby="counts-heading" className="mt-8">
        <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 id="counts-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Tenant at a glance
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Aggregates · read-only
          </span>
        </div>
        <div className="mt-4">
          <StatRail
            columns={6}
            label="Tenant aggregates"
            items={[
              { label: "Plan", value: PLATFORM_PLAN_LABELS[data.subscription.plan as PlatformPlan] ?? data.subscription.plan },
              { label: "Active members", value: data.counts.members },
              { label: "Active passes", value: data.counts.activePasses },
              { label: "Sessions", value: data.counts.sessions },
              { label: "Records", value: data.counts.records },
              { label: "Documents", value: data.counts.documents },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="plan-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 id="plan-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Plan &amp; entitlements
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            PATCH /platform/orgs/{org.id.slice(0, 6)}…/plan
          </span>
        </div>

        {!data.subscription.exists && (
          <p className="mt-3 text-sm text-muted-foreground">
            No subscription row exists yet. Saving writes one with the plan and entitlements below.
          </p>
        )}
        {!canEditPlan && (
          <p className="mt-3 border-l-4 border-gold bg-accent/10 px-4 py-3 text-sm text-gold-dark">
            This tenant is pending deletion. Reactivate it before changing its plan.
          </p>
        )}

        <form onSubmit={savePlan} className="mt-4 max-w-3xl">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <div>
              <label
                htmlFor="org-plan"
                className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                Plan
              </label>
              <select
                id="org-plan"
                value={plan}
                onChange={(event) => setPlan(event.target.value as PlatformPlan)}
                disabled={!canEditPlan || savingPlan}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
              >
                {PLATFORM_PLANS.map((value) => (
                  <option key={value} value={value}>
                    {PLATFORM_PLAN_LABELS[value]}
                  </option>
                ))}
                {!PLATFORM_PLANS.includes(plan) && (
                  <option value={plan} disabled>
                    {plan} (legacy — choose a supported plan)
                  </option>
                )}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                The plan is a label here; entitlement toggles are the effective switch until enforcement ships.
              </p>
            </div>

            <fieldset>
              <legend className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Entitlements
              </legend>
              <div className="mt-1 grid grid-cols-1 gap-px border-y border-border bg-border sm:grid-cols-2">
                {ENTITLEMENT_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex min-h-11 cursor-pointer items-center justify-between gap-3 bg-background px-3 py-2 text-sm"
                  >
                    <span>{ENTITLEMENT_LABELS[key]}</span>
                    <input
                      type="checkbox"
                      checked={entitlements?.[key] ?? false}
                      onChange={(event) =>
                        setEntitlements((prev) => ({
                          ...(prev ?? data.subscription.entitlements),
                          [key]: event.target.checked,
                        }))
                      }
                      disabled={!canEditPlan || savingPlan || !entitlements}
                      className="size-5 rounded border-input text-primary focus:ring-2 focus:ring-accent/40"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="mt-4 max-w-md">
            <label
              htmlFor="plan-reason"
              className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
            >
              Change note (optional)
            </label>
            <Input
              id="plan-reason"
              value={planReason}
              onChange={(event) => setPlanReason(event.target.value)}
              placeholder="e.g. Contract renewal, documents enabled"
              className="mt-1 h-11"
              maxLength={280}
              disabled={!canEditPlan || savingPlan}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" className="h-11" disabled={!canEditPlan || !dirty || savingPlan}>
              {savingPlan ? "Saving…" : "Save plan"}
            </Button>
            {dirty && <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-gold-dark">Unsaved changes</span>}
          </div>

          <div aria-live="polite" className="mt-3 min-h-5">
            {planError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {planError}
              </p>
            )}
            {!planError && planNotice && <p className="text-sm font-medium text-success">{planNotice}</p>}
          </div>
        </form>
      </section>

      <section aria-labelledby="members-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 id="members-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Members
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Read-only · roles &amp; status
          </span>
        </div>

        {data.members.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No memberships" description="This tenant has no members, active or revoked." />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <caption className="sr-only">
                Members of {org.name}: e-mail, role, membership status and revocation time. Read-only.
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Member", "Role", "Status", "Revoked"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground last:pr-0"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.members.map((member) => (
                  <tr key={member.id} className="align-top transition-colors hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <span className="block text-sm">{member.email ?? <span className="text-muted-foreground">No e-mail on file</span>}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{member.id}</span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{member.role}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={member.status === "ACTIVE" ? "success" : "muted"}>{member.status}</Badge>
                    </td>
                    <td className="py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {member.revokedAt ? formatDate(member.revokedAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.membersTruncated && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing the first {data.members.length} memberships. This list is capped; no other tenant row is exposed.
          </p>
        )}
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          Member editing stays inside the organization console. Platform admins have no membership mutation endpoint.
        </p>
      </section>

      <section aria-labelledby="audit-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 id="audit-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Recent audit
          </h2>
          <Link href={`/platform/audit?organizationId=${org.id}`} className="text-xs text-muted-foreground hover:text-foreground">
            Open in audit explorer →
          </Link>
        </div>

        {data.audit.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No audit entries for this tenant yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">The last 20 audit entries for {org.name}, newest first.</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Time", "Action", "Resource", "Result", "Actor"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground last:pr-0"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.audit.map((row) => (
                  <tr key={row.id} className="align-top transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-[11px] tabular-nums text-muted-foreground" title={formatDateTime(row.createdAt)}>
                      {relativeAge(row.createdAt)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{row.action}</td>
                    <td className="max-w-[16rem] truncate py-3 pr-4 font-mono text-xs text-muted-foreground" title={row.resource}>
                      {row.resource}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={resultTone(row.result)}>{row.result}</Badge>
                    </td>
                    <td className="max-w-[10rem] truncate py-3 font-mono text-xs text-muted-foreground" title={row.actorUserId ?? "system"}>
                      {row.actorUserId ? `${row.actorUserId.slice(0, 8)}…` : "system"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {statusOpen && (
        <ReasonDialog
          title={org.status === "ACTIVE" ? `Suspend ${org.name}?` : `Reactivate ${org.name}?`}
          description={
            org.status === "ACTIVE"
              ? `Members and scanners are refused immediately, including pass verification, until reactivation. ${LAST_ADMIN_SUSPEND_RULE}`
              : "Access resumes on the next request. The reactivation is recorded in the platform audit log."
          }
          confirmLabel={org.status === "ACTIVE" ? "Suspend tenant" : "Reactivate tenant"}
          tone={org.status === "ACTIVE" ? "destructive" : "default"}
          minLength={3}
          requireReason={false}
          placeholder={org.status === "ACTIVE" ? "e.g. Contract dispute" : "e.g. Payment reconciled"}
          busy={statusBusy}
          error={statusError}
          onConfirm={(reason) => void confirmStatus(reason)}
          onClose={() => {
            if (!statusBusy) setStatusOpen(false);
          }}
        />
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link href="/platform/orgs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden="true" /> Organizations
    </Link>
  );
}
