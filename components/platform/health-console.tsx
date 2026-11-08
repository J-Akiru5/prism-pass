"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatRail } from "@/components/platform/stat-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import { formatDateTime, relativeAge } from "@/lib/platform-format";

type PublicHealth = {
  status: string;
  service: string;
  phase: string;
  version: string;
  time: string;
};

type PlatformHealth = {
  app: PublicHealth;
  database: { configured: boolean; ok: boolean | null; latencyMs: number | null; error: string | null };
  migrations: { available: boolean; count: number; files: string[]; note?: string };
  organizations: { id: string; name: string; status: string; lastActivityAt: string | null }[];
  activityError: string | null;
  generatedAt: string;
};

export function HealthConsole() {
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [probe, setProbe] = useState<PublicHealth | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const envelope = await platformRequest<PlatformHealth>("/api/v1/platform/health");
      setHealth(envelope.data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    try {
      const envelope = await platformRequest<PublicHealth>("/api/v1/health");
      setProbe(envelope.data);
      setProbeError(null);
    } catch (e) {
      setProbe(null);
      setProbeError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latency = health?.database.latencyMs;
  const dbLabel = !health
    ? "—"
    : !health.database.configured
      ? "Not configured"
      : health.database.ok
        ? `${latency ?? "?"} ms`
        : "Unavailable";

  return (
    <>
      <PageHeader
        title="Health"
        description="Measured runtime facts for this deployment. Anything that cannot be measured is labelled unavailable — no estimated or synthetic numbers."
        actions={
          <Button variant="outline" className="h-11" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Re-measure
          </Button>
        }
      />

      {error && (
        <div className="mt-6">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}
      {loading && !health && (
        <div className="mt-8">
          <LoadingState label="Measuring this deployment…" />
        </div>
      )}

      {health && (
        <>
          <section aria-labelledby="health-rail" className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 id="health-rail" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Measured now
              </h2>
              <span aria-live="polite" className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatDateTime(health.generatedAt)}
              </span>
            </div>
            <div className="mt-4">
              <StatRail
                columns={4}
                label="Deployment health"
                items={[
                  { label: "Version", value: health.app.version },
                  { label: "Phase", value: health.app.phase },
                  {
                    label: "DB round trip",
                    value: dbLabel,
                    tone: health.database.ok === false ? "danger" : health.database.ok ? "success" : "default",
                  },
                  {
                    label: "Migrations present",
                    value: health.migrations.available ? health.migrations.count : "Unavailable",
                    tone: health.migrations.available ? "default" : "warning",
                  },
                ]}
              />
            </div>
          </section>

          <section aria-labelledby="app-heading" className="mt-12">
            <h2 id="app-heading" className="border-b border-border pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Application
            </h2>
            <dl className="divide-y divide-border">
              {[
                { label: "Service", value: health.app.service },
                { label: "Version", value: health.app.version },
                { label: "Phase", value: health.app.phase },
                {
                  label: "Public probe /api/v1/health",
                  value: probe ? (
                    <span className="inline-flex items-center gap-2">
                      <Badge variant="success">{probe.status}</Badge>
                      <span className="font-mono text-xs">{probe.version}</span>
                    </span>
                  ) : (
                    <span className="text-destructive">{probeError ?? "Unavailable"}</span>
                  ),
                },
                { label: "Probe time", value: <span className="font-mono text-xs">{formatDateTime(probe?.time ?? health.app.time)}</span> },
              ].map((row) => (
                <div key={row.label} className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
                  <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
            {probeError && (
              <p className="mt-2 text-xs text-muted-foreground">
                The console is reachable, but the public probe failed: {probeError}. This is reported as-is rather than
                hidden.
              </p>
            )}
          </section>

          <section aria-labelledby="db-heading" className="mt-12">
            <h2 id="db-heading" className="border-b border-border pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Database
            </h2>
            <dl className="divide-y divide-border">
              <div className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Configured</dt>
                <dd className="text-sm">{health.database.configured ? "Yes — DATABASE_URL is set" : "No — DATABASE_URL is unset"}</dd>
              </div>
              <div className="grid gap-1 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Round trip</dt>
                <dd className="text-sm">
                  {health.database.ok === null
                    ? "Not measured (database not configured)"
                    : health.database.ok
                      ? `${health.database.latencyMs} ms — SELECT 1 completed`
                      : health.database.error}
                </dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Latency is a single server-side <span className="font-mono">SELECT 1</span> timed with the system clock. It
              is a reachability signal, not a benchmark; connection count and query load are not inferred from it.
            </p>
          </section>

          <section aria-labelledby="migrations-heading" className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 id="migrations-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Schema migrations
              </h2>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {health.migrations.available ? `${health.migrations.count} SQL files` : "Not readable"}
              </span>
            </div>
            {health.migrations.available ? (
              <>
                <ol className="mt-2 divide-y divide-border">
                  {health.migrations.files.map((file) => (
                    <li key={file} className="py-2 font-mono text-xs">
                      {file}
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  Files present in <span className="font-mono">supabase/migrations</span> in this runtime. Presence is not
                  proof that every migration was applied; use the database migration tooling for that.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{health.migrations.note}</p>
            )}
          </section>

          <section aria-labelledby="org-activity-heading" className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
              <h2 id="org-activity-heading" className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Last activity by organization
              </h2>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Max audit time · newest 20
              </span>
            </div>

            {health.activityError ? (
              <p role="alert" className="mt-3 border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {health.activityError} The rest of this page is unaffected.
              </p>
            ) : health.organizations.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No tenant audit activity"
                  description="Either no tenant has acted yet, or the database is not configured. No placeholder activity is shown."
                />
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <caption className="sr-only">
                    Organizations ordered by their most recent audit entry, with status and relative time.
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      {["Organization", "Status", "Last activity", "Absolute"].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="py-2 pr-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground last:pr-0"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {health.organizations.map((org) => (
                      <tr key={org.id} className="transition-colors hover:bg-muted/40">
                        <th scope="row" className="py-3 pr-4 text-left font-normal">
                          <Link href={`/platform/orgs/${org.id}`} className="text-sm font-medium hover:underline">
                            {org.name}
                          </Link>
                        </th>
                        <td className="py-3 pr-4">
                          <Badge variant={org.status === "ACTIVE" ? "success" : org.status === "SUSPENDED" ? "danger" : "warning"}>
                            {org.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 font-mono text-xs tabular-nums">{relativeAge(org.lastActivityAt)}</td>
                        <td className="py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {formatDateTime(org.lastActivityAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
