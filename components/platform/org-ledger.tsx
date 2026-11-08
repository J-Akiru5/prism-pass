"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import {
  LAST_ADMIN_SUSPEND_RULE,
  PLATFORM_PAGE_SIZE_DEFAULT,
  buildPageMeta,
  statusTone,
  type OrgStatusValue,
  type PageMeta,
  type PlatformOrgRow,
  type PlatformOrgStatus,
} from "@/modules/platform/ledger";

type Filters = { page: number; pageSize: number; status: "" | OrgStatusValue; q: string };

type ApiEnvelope<T> = { data: T; meta?: { total?: number; page?: number; pageSize?: number } };

type PendingChange = { row: PlatformOrgRow; nextStatus: PlatformOrgStatus };

async function request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | { error?: { message?: string } } | null;
  if (!res.ok) {
    const message = (json as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  if (!json) throw new Error("Empty response from the platform API");
  return json as ApiEnvelope<T>;
}

function statusLabel(status: OrgStatusValue): string {
  if (status === "PENDING_DELETION") return "Pending deletion";
  return status === "ACTIVE" ? "Active" : "Suspended";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const EMPTY_META: PageMeta = buildPageMeta({ page: 1, pageSize: PLATFORM_PAGE_SIZE_DEFAULT, total: 0 });

export function OrgLedger() {
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: PLATFORM_PAGE_SIZE_DEFAULT, status: "", q: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [rows, setRows] = useState<PlatformOrgRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // `silent` refreshes the aggregates after a mutation without flashing the
  // loading state over an already-rendered ledger.
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
      if (filters.status) params.set("status", filters.status);
      if (filters.q) params.set("q", filters.q);

      const json = await request<PlatformOrgRow[]>(`/api/v1/platform/orgs?${params.toString()}`);
      const nextRows = Array.isArray(json.data) ? json.data : [];
      const nextMeta = buildPageMeta({ page: filters.page, pageSize: filters.pageSize, total: json.meta?.total ?? 0 });
      setRows(nextRows);
      setMeta(nextMeta);
      setError(null);

      // A filter change while paging past the end lands on an empty page; fall
      // back to the first page instead of showing "no matches" for real data.
      if (nextRows.length === 0 && nextMeta.total > 0 && filters.page > 1) {
        setFilters((f) => ({ ...f, page: 1 }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setFilters((f) => ({ ...f, page: 1, q: searchDraft.trim() }));
  }

  async function confirmStatusChange() {
    if (!pendingChange || submitting) return;
    const { row, nextStatus } = pendingChange;
    const previousStatus = row.status;

    setSubmitting(true);
    setError(null);
    setNotice(null);
    // Optimistic: show the intended state immediately, then reconcile with the
    // server response. Any failure restores the previous status.
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: nextStatus } : r)));

    try {
      const json = await request<{ id: string; status: OrgStatusValue; changed: boolean }>(
        `/api/v1/platform/orgs/${row.id}/status`,
        { method: "POST", body: JSON.stringify({ status: nextStatus }) },
      );
      const authoritative = json.data.status;
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: authoritative } : r)));
      setPendingChange(null);
      setNotice(
        authoritative === "ACTIVE"
          ? `${row.name} is active again. Access resumes on the next request.`
          : `${row.name} is suspended. Members and scanners are refused until it is reactivated.`,
      );
      void load(true);
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: previousStatus } : r)));
      setPendingChange(null);
      setError(`${row.name}: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = Boolean(filters.q) || Boolean(filters.status);
  const dialogSuspended = pendingChange?.nextStatus === "SUSPENDED";

  return (
    <main id="platform-main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        eyebrow="Platform · Syntaxure Labs"
        title="Organization ledger"
        description="Every tenant on this deployment. Suspension is a platform action, audited with actor and previous status; an organization OWNER never inherits it (ADR-11)."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Platform admin
          </span>
        }
      />

      <div className="mt-6 flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-end">
        <form role="search" onSubmit={applySearch} className="flex flex-1 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="org-search" className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Find tenant
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                id="org-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Name or slug"
                className="h-11 pl-9"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" className="h-11">Search</Button>
        </form>

        <div>
          <label htmlFor="org-status-filter" className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Status
          </label>
          <select
            id="org-status-filter"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, page: 1, status: e.target.value as Filters["status"] }))}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus:border-accent sm:w-48"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="PENDING_DELETION">Pending deletion</option>
          </select>
        </div>

        <Button variant="ghost" className="h-11" onClick={() => void load()} aria-label="Refresh ledger">
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}

      {notice && (
        <p role="status" className="mt-4 border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <LoadingState label="Loading organizations…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No matching organizations" : "No organizations yet"}
            description={
              filtered
                ? "Clear the search or status filter to see every tenant."
                : "Tenants appear here once provisioned through the platform or bootstrap path."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => { setSearchDraft(""); setFilters((f) => ({ ...f, page: 1, q: "", status: "" })); }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div role="region" aria-label="Organization ledger" tabIndex={0} className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-sm">
              <caption className="sr-only">
                Organizations on this platform: name and slug, status, active members, active passes, creation date, last audited activity, and the suspend/reactivate control.
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Organization", "Status"].map((label) => (
                    <th key={label} scope="col" className="pb-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="pb-2.5 pr-4 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Members
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Passes
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Created
                  </th>
                  <th scope="col" className="pb-2.5 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Last activity
                  </th>
                  <th scope="col" className="pb-2.5 text-right">
                    <span className="sr-only">Status control</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const nextStatus: PlatformOrgStatus = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                  const actionLabel = nextStatus === "SUSPENDED" ? "Suspend" : "Reactivate";
                  return (
                    <tr key={row.id} className="align-top transition-colors hover:bg-muted/40">
                      <th scope="row" className="py-3 pr-4 text-left font-normal">
                        <span className="block font-medium text-foreground">{row.name}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{row.slug}</span>
                      </th>
                      <td className="py-3 pr-4">
                        <Badge variant={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums text-foreground">{row.memberCount}</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums text-foreground">{row.passCount}</td>
                      <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDate(row.createdAt)}</td>
                      <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-muted-foreground">{formatDateTime(row.lastActivityAt)}</td>
                      <td className="py-3 text-right">
                        <Button
                          size="sm"
                          variant={nextStatus === "SUSPENDED" ? "outline" : "default"}
                          className={
                            nextStatus === "SUSPENDED"
                              ? "h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                              : "h-11"
                          }
                          aria-label={`${actionLabel} ${row.name}`}
                          onClick={() => setPendingChange({ row, nextStatus })}
                          disabled={submitting}
                        >
                          {actionLabel}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p aria-live="polite" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {meta.total === 0
            ? "No organizations"
            : `Page ${meta.page} of ${meta.totalPages || 1} · ${meta.total} ${meta.total === 1 ? "organization" : "organizations"}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-11"
            disabled={!meta.hasPrevious || loading}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={!meta.hasNext || loading}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            Next
          </Button>
        </div>
      </div>

      {pendingChange && (
        <ConfirmationDialog
          title={`${dialogSuspended ? "Suspend" : "Reactivate"} ${pendingChange.row.name}?`}
          body={
            dialogSuspended
              ? `Members and scanners of ${pendingChange.row.slug} are refused immediately, including pass verification, until the tenant is reactivated. ${LAST_ADMIN_SUSPEND_RULE}`
              : `Access for ${pendingChange.row.slug} resumes on the next request. The reactivation is recorded in the platform audit log.`
          }
          confirmLabel={dialogSuspended ? "Suspend tenant" : "Reactivate tenant"}
          tone={dialogSuspended ? "destructive" : "default"}
          busy={submitting}
          onConfirm={() => void confirmStatusChange()}
          onClose={() => { if (!submitting) setPendingChange(null); }}
        />
      )}
    </main>
  );
}
