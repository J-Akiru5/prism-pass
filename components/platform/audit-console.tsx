"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, FilterX, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import { formatDateTime, resultTone } from "@/lib/platform-format";
import {
  AUDIT_PAGE_SIZE_DEFAULT,
  KNOWN_AUDIT_RESULTS,
  buildPageMeta,
  type PageMeta,
  type PlatformAuditRow,
} from "@/modules/platform/console";

type OrgOption = { id: string; name: string; status: string };
type Filters = { organizationId: string; action: string; result: string; from: string; to: string };

const EMPTY_FILTERS: Filters = { organizationId: "", action: "", result: "", from: "", to: "" };
const EMPTY_META: PageMeta = buildPageMeta({ page: 1, pageSize: AUDIT_PAGE_SIZE_DEFAULT, total: 0 });

function rangeError(filters: Filters): string | null {
  if (Boolean(filters.from) !== Boolean(filters.to)) return "Provide both dates, or neither.";
  if (filters.from && filters.to && filters.from > filters.to) return "The start date must be on or before the end date.";
  return null;
}

export function AuditConsole({ initialOrganizationId = "" }: { initialOrganizationId?: string }) {
  const [draft, setDraft] = useState<Filters>({ ...EMPTY_FILTERS, organizationId: initialOrganizationId });
  const [applied, setApplied] = useState<Filters>({ ...EMPTY_FILTERS, organizationId: initialOrganizationId });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlatformAuditRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [orgsTruncated, setOrgsTruncated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void platformRequest<OrgOption[]>("/api/v1/platform/orgs/options")
      .then((envelope) => {
        if (cancelled) return;
        setOrgs(Array.isArray(envelope.data) ? envelope.data : []);
        setOrgsTruncated(Boolean(envelope.meta?.truncated));
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const buildParams = useCallback(
    (forExport: boolean) => {
      const params = new URLSearchParams();
      if (!forExport) {
        params.set("page", String(page));
        params.set("pageSize", String(AUDIT_PAGE_SIZE_DEFAULT));
      }
      if (applied.organizationId) params.set("organizationId", applied.organizationId);
      if (applied.action.trim()) params.set("action", applied.action.trim());
      if (applied.result) params.set("result", applied.result);
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      if (forExport) params.set("format", "csv");
      return params;
    },
    [applied, page],
  );

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const envelope = await platformRequest<PlatformAuditRow[]>(
          `/api/v1/platform/audit?${buildParams(false).toString()}`,
        );
        const nextRows = Array.isArray(envelope.data) ? envelope.data : [];
        setRows(nextRows);
        setMeta(
          buildPageMeta({
            page,
            pageSize: AUDIT_PAGE_SIZE_DEFAULT,
            total: typeof envelope.meta?.total === "number" ? envelope.meta.total : 0,
          }),
        );
        setError(null);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildParams, page],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const problem = rangeError(draft);
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setApplied({ ...draft, action: draft.action.trim() });
    setPage(1);
  }

  function clear() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setFormError(null);
    setPage(1);
  }

  const csvHref = useMemo(() => {
    if (rangeError(applied)) return null;
    return `/api/v1/platform/audit?${buildParams(true).toString()}`;
  }, [applied, buildParams]);

  const filtered =
    Boolean(applied.organizationId) ||
    Boolean(applied.action) ||
    Boolean(applied.result) ||
    Boolean(applied.from);

  return (
    <>
      <PageHeader
        eyebrow="Platform · Oversight"
        title="Audit explorer"
        description="Every tenant and platform-scope audit entry, newest first. Rows carry the audit ledger itself; tenant meta (person ids, geo details, adjustment notes) is not forwarded."
        actions={
          <Button variant="outline" className="h-11" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      <form onSubmit={apply} className="mt-6 border-y border-border py-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="lg:col-span-2">
            <label htmlFor="audit-org" className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Organization
            </label>
            <select
              id="audit-org"
              value={draft.organizationId}
              onChange={(event) => setDraft((f) => ({ ...f, organizationId: event.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">All organizations</option>
              {initialOrganizationId && !orgs.some((org) => org.id === initialOrganizationId) && (
                <option value={initialOrganizationId}>
                  Organization {initialOrganizationId.slice(0, 8)}…
                </option>
              )}
              {orgs.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audit-action" className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Action contains
            </label>
            <Input
              id="audit-action"
              value={draft.action}
              onChange={(event) => setDraft((f) => ({ ...f, action: event.target.value }))}
              placeholder="e.g. pass."
              className="mt-1 h-11 font-mono"
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="audit-result" className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Result
            </label>
            <select
              id="audit-result"
              value={draft.result}
              onChange={(event) => setDraft((f) => ({ ...f, result: event.target.value }))}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">Any result</option>
              {KNOWN_AUDIT_RESULTS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="audit-from" className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              From
            </label>
            <Input
              id="audit-from"
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(event) => setDraft((f) => ({ ...f, from: event.target.value }))}
              className="mt-1 h-11 font-mono"
            />
          </div>

          <div>
            <label htmlFor="audit-to" className="block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              To
            </label>
            <Input
              id="audit-to"
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(event) => setDraft((f) => ({ ...f, to: event.target.value }))}
              className="mt-1 h-11 font-mono"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-11">
            Apply filters
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={clear}>
            <FilterX aria-hidden="true" /> Clear
          </Button>
          {csvHref ? (
            <a href={csvHref} download className={buttonVariants({ variant: "outline", className: "h-11" })}>
              <Download aria-hidden="true" /> Export current filter
            </a>
          ) : (
            <span aria-disabled="true" className={buttonVariants({ variant: "outline", className: "pointer-events-none h-11 opacity-50" })}>
              <Download aria-hidden="true" /> Export current filter
            </span>
          )}
        </div>

        <div aria-live="polite" className="mt-2 min-h-5">
          {formError && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {formError}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            CSV exports the current filter, newest first, capped at 5,000 rows. Date
            ranges are inclusive and capped at 366 days.
            {orgsTruncated && " The organization list is capped at 1,000 tenants."}
          </p>
        </div>
      </form>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Ledger</h2>
          <span aria-live="polite" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {meta.total === 0
              ? "No entries"
              : `${meta.total.toLocaleString()} ${meta.total === 1 ? "entry" : "entries"} · page ${meta.page} of ${meta.totalPages || 1}`}
          </span>
        </div>

        {loading ? (
          <div className="mt-4">
            <LoadingState label="Loading audit entries…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={filtered ? "No entries match this filter" : "No audit entries yet"}
              description={
                filtered
                  ? "Widen the date range or clear a filter. The export follows the same filter."
                  : "Platform and organization mutations appear here as they are committed."
              }
              action={
                filtered ? (
                  <Button variant="outline" className="h-11" onClick={clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <caption className="sr-only">
                Cross-tenant audit entries: time, organization, action and reason, resource, result, and actor user id.
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Time", "Organization", "Action", "Resource", "Result", "Actor"].map((heading) => (
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
                {rows.map((row) => (
                  <tr key={row.id} className="align-top transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-sm">
                      {row.organizationId ? (
                        <Link href={`/platform/orgs/${row.organizationId}`} className="hover:underline">
                          {row.organizationName ?? row.organizationId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Platform</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block font-mono text-xs">{row.action}</span>
                      {row.reason && <span className="mt-0.5 block max-w-[18rem] text-xs text-muted-foreground">{row.reason}</span>}
                    </td>
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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Newest first · audit rows are immutable
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={!meta.hasPrevious || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!meta.hasNext || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
