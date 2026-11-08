"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatRail } from "@/components/platform/stat-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import { formatTime, resultTone } from "@/lib/platform-format";
import type { PlatformActivityRow, PlatformOverviewCounts } from "@/modules/platform/console";

type OverviewPayload = {
  counts: PlatformOverviewCounts;
  activity: PlatformActivityRow[];
  generatedAt: string;
};

export function OverviewConsole() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const envelope = await platformRequest<OverviewPayload>("/api/v1/platform/overview");
      setData(envelope.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = data?.counts;

  return (
    <>
      <PageHeader
        title="Operations overview"
        description="Totals for every organization on this installation. Only counts — no member records or credentials."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Platform admin
            </span>
            <Button variant="outline" className="h-11" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mt-6">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}

      {loading && !data && (
        <div className="mt-8">
          <LoadingState label="Loading platform aggregates…" />
        </div>
      )}

      {counts && (
        <section aria-labelledby="rail-heading" className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
            <h2 id="rail-heading" className="text-[17px] font-bold text-slate-900">
              At a glance
            </h2>
            <p aria-live="polite" className="text-[13.5px] tabular-nums text-slate-500">
              {data ? `Measured ${formatTime(data.generatedAt)}` : ""}
            </p>
          </div>

          <div className="mt-4">
            <StatRail
              label="Platform aggregates"
              items={[
                {
                  label: "Organizations",
                  value: counts.organizations.total,
                  hint: `${counts.organizations.active} active · ${counts.organizations.suspended} suspended`,
                },
                {
                  label: "Pending deletion",
                  value: counts.organizations.pendingDeletion,
                  tone: counts.organizations.pendingDeletion > 0 ? "warning" : "default",
                  hint: "Retirement queue",
                },
                { label: "Users", value: counts.users, hint: "All tenants" },
                { label: "Active passes", value: counts.activePasses, hint: "Usable credentials" },
                { label: "Sessions today", value: counts.sessionsToday, hint: "UTC calendar day" },
                { label: "Events today", value: counts.eventsToday, hint: "Server-received scans" },
                {
                  label: "Pending approvals",
                  value: counts.pendingApprovals,
                  tone: counts.pendingApprovals > 0 ? "warning" : "default",
                  hint: "Attendance records",
                },
                { label: "Platform admins", value: counts.platformAdmins, hint: "Platform access" },
              ]}
            />
          </div>

          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            Every figure is a database <span className="font-mono">count()</span>. Sessions and events use the UTC
            calendar day because a platform-wide aggregate has no single tenant timezone; organization reports stay
            local-timezone correct.
          </p>
        </section>
      )}

      <section aria-labelledby="activity-heading" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 id="activity-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Recent platform activity
          </h2>
          <Link
            href="/platform/audit"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open audit explorer <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>

        {data && data.activity.length === 0 && (
          <div className="mt-4">
            <EmptyState
              title="No platform activity recorded yet"
              description="Provisioning, suspensions, plan changes and admin grants will appear here as they happen."
            />
          </div>
        )}

        {data && data.activity.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="pp-table w-full text-[15px]">
              <caption className="sr-only">
                Recent platform-scope audit entries: time, action, tenant, and result.
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  {["Time", "Action", "Tenant", "Result"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="whitespace-nowrap px-4 py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.activity.map((row) => (
                  <tr key={row.id} className="align-middle transition-colors hover:bg-slate-50">
                    <td data-label="Time" className="whitespace-nowrap px-4 py-3 font-mono text-[13px] tabular-nums text-slate-600">
                      {formatTime(row.createdAt)}
                    </td>
                    <td data-label="Action" className="px-4 py-3 font-mono text-[13px]">{row.action}</td>
                    <td data-label="Tenant" className="px-4 py-3 text-[15px]">
                      {row.organizationId ? (
                        <Link
                          href={`/platform/orgs/${row.organizationId}`}
                          className="hover:underline"
                        >
                          {row.organizationName ?? row.organizationId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-slate-500">Platform</span>
                      )}
                    </td>
                    <td data-label="Result" className="px-4 py-3">
                      <Badge variant={resultTone(row.result)}>{row.result}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
