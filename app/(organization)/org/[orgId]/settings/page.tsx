"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui-states";

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  result: string;
  actorUserId: string | null;
  createdAt: string;
};

function resultVariant(result: string): "success" | "danger" | "warning" | "muted" {
  if (["ok", "approved", "accepted", "adjusted"].includes(result)) return "success";
  if (["denied", "rejected", "revoked", "not_found"].includes(result)) return "danger";
  if (["pending", "flagged", "valid_duplicate"].includes(result)) return "warning";
  return "muted";
}

export default function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [org, setOrg] = useState<{ name: string; slug: string; status: string; timezone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState<number | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
      setOrg(j.data);
    } catch (e) { setError((e as Error).message); }
  }, [orgId]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}/audit?page=1&pageSize=12`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
      setAudit((j.data ?? []) as AuditRow[]);
      setAuditTotal(typeof j.meta?.total === "number" ? j.meta.total : null);
      setAuditError(null);
    } catch (e) {
      setAuditError((e as Error).message);
    } finally {
      setAuditLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAudit(); }, [loadAudit]);

  return (
    <>
      <PageHeader title="Settings" description="Organization profile and status. Suspension is a platform-admin action." eyebrow="Configuration" />
      <div className="mt-6 max-w-2xl">
        {error && <ErrorState message={error} retry={load} />}
        {!error && !org && <LoadingState label="Loading organization…" />}
        {org && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="size-4" aria-hidden="true" /> {org.name}</CardTitle>
              <CardDescription>Slug <span className="font-mono">{org.slug}</span> · Timezone {org.timezone}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant={org.status === "ACTIVE" ? "success" : "danger"}>{org.status}</Badge>
              <p className="mt-3 text-sm text-muted-foreground">
                Branding, retention, subscription, and scoped-role management arrive with later phases. Membership and pass controls live on their own pages.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Audit ledger{auditTotal !== null ? ` · ${auditTotal} entries` : ""}
          </h2>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            Newest first · requires organization.manage
          </span>
        </div>

        {auditLoading && <div className="mt-4"><LoadingState label="Loading recent audit entries…" /></div>}

        {!auditLoading && auditError && (
          <p role="alert" className="mt-4 text-sm text-muted-foreground">
            {auditError} Audit entries are visible to roles with <span className="font-mono text-xs">organization.manage</span>.
          </p>
        )}

        {!auditLoading && !auditError && audit.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No audit entries recorded yet.</p>
        )}

        {!auditLoading && !auditError && audit.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Recent audit log entries for this organization</caption>
              <thead>
                <tr className="border-b text-left">
                  {["Time", "Action", "Resource", "Result", "Actor"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground last:pr-0"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {audit.map((row) => (
                  <tr key={row.id} className="align-top transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs tabular-nums text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">{row.action}</td>
                    <td className="max-w-[16rem] truncate py-3 pr-4 font-mono text-xs text-muted-foreground" title={row.resource}>
                      {row.resource}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={resultVariant(row.result)}>{row.result}</Badge>
                    </td>
                    <td
                      className="max-w-[10rem] truncate py-3 font-mono text-xs text-muted-foreground"
                      title={row.actorUserId ?? "system"}
                    >
                      {row.actorUserId ? `${row.actorUserId.slice(0, 8)}…` : "system"}
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
