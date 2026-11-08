"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ReasonDialog } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import { formatDate, formatDateTime, orgStatusLabel, orgStatusTone } from "@/lib/platform-format";
import {
  createPlatformOrgInput,
  PLATFORM_PLANS,
  PLATFORM_PLAN_LABELS,
  suggestOrgSlug,
  type PlatformPlan,
} from "@/modules/platform/console";
import {
  LAST_ADMIN_SUSPEND_RULE,
  PLATFORM_PAGE_SIZE_DEFAULT,
  buildPageMeta,
  type OrgStatusValue,
  type PageMeta,
  type PlatformOrgRow,
  type PlatformOrgStatus,
} from "@/modules/platform/ledger";

type Filters = { page: number; pageSize: number; status: "" | OrgStatusValue; q: string };

type PendingChange = { row: PlatformOrgRow; nextStatus: PlatformOrgStatus };

type CreatedOrg = { id: string; name: string };

const EMPTY_META: PageMeta = buildPageMeta({ page: 1, pageSize: PLATFORM_PAGE_SIZE_DEFAULT, total: 0 });

export function OrgLedger() {
  const [filters, setFilters] = useState<Filters>({ page: 1, pageSize: PLATFORM_PAGE_SIZE_DEFAULT, status: "", q: "" });
  const [searchDraft, setSearchDraft] = useState("");
  const [rows, setRows] = useState<PlatformOrgRow[]>([]);
  const [meta, setMeta] = useState<PageMeta>(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedOrg | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // `silent` refreshes the aggregates after a mutation without flashing the
  // loading state over an already-rendered ledger.
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize) });
        if (filters.status) params.set("status", filters.status);
        if (filters.q) params.set("q", filters.q);

        const json = await platformRequest<PlatformOrgRow[]>(`/api/v1/platform/orgs?${params.toString()}`);
        const nextRows = Array.isArray(json.data) ? json.data : [];
        const nextMeta = buildPageMeta({
          page: filters.page,
          pageSize: filters.pageSize,
          total: typeof json.meta?.total === "number" ? json.meta.total : 0,
        });
        setRows(nextRows);
        setMeta(nextMeta);
        setError(null);

        // A filter change while paging past the end lands on an empty page; fall
        // back to the first page instead of showing "no matches" for real data.
        if (nextRows.length === 0 && nextMeta.total > 0 && filters.page > 1) {
          setFilters((f) => ({ ...f, page: 1 }));
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filters],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch(event: React.FormEvent) {
    event.preventDefault();
    setFilters((f) => ({ ...f, page: 1, q: searchDraft.trim() }));
  }

  async function confirmStatusChange(reason: string) {
    if (!pendingChange || submitting) return;
    const { row, nextStatus } = pendingChange;
    setSubmitting(true);
    setStatusError(null);
    setNotice(null);
    try {
      const json = await platformRequest<{ id: string; status: OrgStatusValue; changed: boolean }>(
        `/api/v1/platform/orgs/${row.id}/status`,
        {
          method: "POST",
          body: JSON.stringify({ status: nextStatus, ...(reason ? { reason } : {}) }),
        },
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
      setStatusError(`${row.name}: ${errorMessage(e)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreated(org: CreatedOrg) {
    setCreateOpen(false);
    setCreated(org);
    setNotice(`${org.name} was provisioned. Plan defaults were applied and the action is audited.`);
    setFilters((f) => ({ ...f, page: 1 }));
    void load(true);
  }

  const filtered = Boolean(filters.q) || Boolean(filters.status);
  const dialogSuspended = pendingChange?.nextStatus === "SUSPENDED";

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organization on this installation. Suspending one is a platform admin action and is always recorded."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Platform admin
            </span>
            <Button className="h-11" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" /> New organization
            </Button>
          </div>
        }
      />

      <div className="mt-6 flex flex-col gap-3 border-y border-border py-3 sm:flex-row sm:items-end">
        <form role="search" onSubmit={applySearch} className="flex flex-1 items-end gap-2">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="org-search"
              className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              Find an organization
            </label>
            <div className="relative mt-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="org-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Name or slug"
                className="h-11 pl-9"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" className="h-11">
            Search
          </Button>
        </form>

        <div>
          <label
            htmlFor="org-status-filter"
            className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
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

        <Button variant="ghost" className="h-11" onClick={() => void load()} aria-label="Refresh organization ledger">
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
        <p role="status" aria-live="polite" className="mt-4 border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
          {created && (
            <Link href={`/platform/orgs/${created.id}`} className="ml-2 font-medium underline underline-offset-4">
              Open {created.name}
            </Link>
          )}
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
                : "Provision the first tenant with New organization. It starts on the pilot plan."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    setSearchDraft("");
                    setFilters((f) => ({ ...f, page: 1, q: "", status: "" }));
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button className="h-11" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" /> New organization
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="pp-table w-full text-[15px]">
              <caption className="sr-only">
                Organizations on this platform: name and slug, status, active members, active passes, creation date,
                last audited activity, and links to detail or the suspend/reactivate control.
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Organization
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Status
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-right text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Members
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-right text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Passes
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Created
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-3 text-[12.5px] font-bold uppercase tracking-[0.06em] text-slate-600">
                    Last activity
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const nextStatus: PlatformOrgStatus = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
                  const actionLabel = nextStatus === "SUSPENDED" ? "Suspend" : "Reactivate";
                  return (
                    <tr key={row.id} className="align-middle transition-colors hover:bg-slate-50">
                      <th scope="row" data-label="" className="px-4 py-3 text-left font-normal">
                        <Link href={`/platform/orgs/${row.id}`} className="block font-medium text-foreground hover:underline">
                          {row.name}
                        </Link>
                        <span className="mt-0.5 block font-mono text-[12.5px] text-slate-500">{row.slug}</span>
                      </th>
                      <td data-label="Status" className="px-4 py-3">
                        <Badge variant={orgStatusTone(row.status)}>{orgStatusLabel(row.status)}</Badge>
                      </td>
                      <td data-label="Members" className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-foreground">{row.memberCount}</td>
                      <td data-label="Passes" className="px-4 py-3 text-right font-mono text-[13px] tabular-nums text-foreground">{row.passCount}</td>
                      <td data-label="Created" className="px-4 py-3 font-mono text-[13px] tabular-nums text-slate-500">{formatDate(row.createdAt)}</td>
                      <td data-label="Last activity" className="px-4 py-3 font-mono text-[13px] tabular-nums text-slate-500">{formatDateTime(row.lastActivityAt)}</td>
                      <td className="px-4 py-3 pp-cell-actions">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/platform/orgs/${row.id}`}
                            className="inline-flex h-11 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Open ${row.name}`}
                          >
                            Open <ArrowUpRight className="size-3" aria-hidden="true" />
                          </Link>
                          <Button
                            size="sm"
                            variant={nextStatus === "SUSPENDED" ? "outline" : "default"}
                            className={
                              nextStatus === "SUSPENDED"
                                ? "h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                                : "h-11"
                            }
                            aria-label={`${actionLabel} ${row.name}`}
                            onClick={() => {
                              setCreated(null);
                              setStatusError(null);
                              setPendingChange({ row, nextStatus });
                            }}
                            disabled={submitting}
                          >
                            {actionLabel}
                          </Button>
                        </div>
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
        <ReasonDialog
          title={`${dialogSuspended ? "Suspend" : "Reactivate"} ${pendingChange.row.name}?`}
          description={
            dialogSuspended
              ? `Members and scanners of ${pendingChange.row.slug} are refused immediately, including pass verification, until the tenant is reactivated. ${LAST_ADMIN_SUSPEND_RULE}`
              : `Access for ${pendingChange.row.slug} resumes on the next request. The reactivation is recorded in the platform audit log.`
          }
          confirmLabel={dialogSuspended ? "Suspend tenant" : "Reactivate tenant"}
          tone={dialogSuspended ? "destructive" : "default"}
          minLength={3}
          requireReason={false}
          placeholder={dialogSuspended ? "e.g. Non-payment since 2026-02" : "e.g. Payment reconciled"}
          busy={submitting}
          error={statusError}
          onConfirm={(reason) => void confirmStatusChange(reason)}
          onClose={() => {
            if (!submitting) setPendingChange(null);
          }}
        />
      )}

      {createOpen && (
        <CreateOrgDialog
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}

function CreateOrgDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (org: CreatedOrg) => void }) {
  const formId = useId();
  const nameId = useId();
  const slugId = useId();
  const timezoneId = useId();
  const planId = useId();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Manila");
  const [plan, setPlan] = useState<PlatformPlan>("pilot");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : suggestOrgSlug(name || "org");
  const parsed = useMemo(
    () =>
      createPlatformOrgInput.safeParse({
        name,
        slug: effectiveSlug,
        timezone,
        plan,
      }),
    [name, effectiveSlug, timezone, plan],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed.success) {
      setError("Check the name and slug: lowercase letters, numbers and single hyphens.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const envelope = await platformRequest<CreatedOrg>("/api/v1/platform/orgs", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });
      onCreated({ id: envelope.data.id, name: envelope.data.name });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New organization"
      description="Creates the organization, its subscription, and the audit entry in one step. Platform admins only."
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="ghost" type="button" className="h-11" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} className="h-11" disabled={busy}>
            {busy ? "Provisioning…" : "Create organization"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={nameId} className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Display name
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. San Pablo Fish Farmers Coop"
            className="mt-1 h-11"
            maxLength={120}
          />
        </div>

        <div>
          <label htmlFor={slugId} className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Slug
          </label>
          <Input
            id={slugId}
            value={effectiveSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value.toLowerCase());
            }}
            placeholder="san-pablo-coop"
            className="mt-1 h-11 font-mono"
            maxLength={64}
            aria-describedby={`${slugId}-hint`}
          />
          <p id={`${slugId}-hint`} className="mt-1 text-xs text-muted-foreground">
            Lowercase letters, numbers and single hyphens. Unique across the platform.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={timezoneId} className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Timezone
            </label>
            <Input
              id={timezoneId}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="mt-1 h-11 font-mono"
              maxLength={64}
            />
          </div>
          <div>
            <label htmlFor={planId} className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Plan
            </label>
            <select
              id={planId}
              value={plan}
              onChange={(event) => setPlan(event.target.value as PlatformPlan)}
              className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {PLATFORM_PLANS.map((value) => (
                <option key={value} value={value}>
                  {PLATFORM_PLAN_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div aria-live="polite" className="min-h-5">
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
