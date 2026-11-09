"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/ui-states";
import type { Role } from "@/packages/authorization/permissions";
import {
  ROLE_PRESET_ORDER,
  defaultRoleForPreset,
  presetForRole,
  presetLabel,
  rolesForPreset,
  type RolePreset,
} from "@/packages/authorization/presets";

type AuditRow = {
  id: string;
  action: string;
  resource: string;
  result: string;
  actorUserId: string | null;
  createdAt: string;
};

type MembershipRow = {
  id: string;
  userId: string;
  role: Role;
  status: "ACTIVE" | "REVOKED";
  revokedAt: string | null;
  email: string | null;
  personDisplayName: string | null;
  isSelf: boolean;
};

const STAFF_ROLES = rolesForPreset("STAFF");
const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  SCANNER: "Scanner",
  MEMBER: "Attendee",
  VIEWER: "Viewer",
};
const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-[14px] text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

function resultVariant(result: string): "success" | "danger" | "warning" | "muted" {
  if (["ok", "approved", "accepted", "adjusted"].includes(result)) return "success";
  if (["denied", "rejected", "revoked", "not_found"].includes(result)) return "danger";
  if (["pending", "flagged", "valid_duplicate"].includes(result)) return "warning";
  return "muted";
}

function MemberRow({ orgId, member, onUpdated }: { orgId: string; member: MembershipRow; onUpdated: () => void }) {
  const [preset, setPreset] = useState<RolePreset>(() => presetForRole(member.role));
  const [staffRole, setStaffRole] = useState<Role>(() =>
    STAFF_ROLES.includes(member.role) ? member.role : defaultRoleForPreset("STAFF"),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync the draft when the server returns a new raw role.
  useEffect(() => {
    setPreset(presetForRole(member.role));
    setStaffRole(STAFF_ROLES.includes(member.role) ? member.role : defaultRoleForPreset("STAFF"));
    setError(null);
  }, [member.role]);

  const nextRole = preset === "STAFF" ? staffRole : defaultRoleForPreset(preset);
  const dirty = nextRole !== member.role;
  const revoked = member.status === "REVOKED";
  const primary = member.personDisplayName ?? member.email ?? "Unnamed member";
  const secondary = member.personDisplayName && member.email ? member.email : null;

  async function save() {
    if (!dirty || revoked || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orgs/${orgId}/memberships/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? `Request failed (${response.status})`);
      onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[15.5px] font-semibold text-slate-900">
            <span className="break-words">{primary}</span>
            {member.isSelf && <Badge variant="muted">You</Badge>}
          </p>
          {secondary && <p className="mt-0.5 break-all text-[13.5px] text-slate-500">{secondary}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge variant="info">{presetLabel(presetForRole(member.role))}</Badge>
            <span className="font-mono text-[12px] text-slate-500" title="Raw role">
              {member.role}
            </span>
            <Badge variant={member.status === "ACTIVE" ? "success" : "danger"}>{member.status}</Badge>
          </div>
        </div>

        {revoked ? (
          <p className="text-[13.5px] text-slate-500 sm:max-w-[14rem] sm:text-right">
            Revoked memberships cannot be changed.
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:min-w-[15rem]">
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-600">
              Preset
              <select
                className={SELECT_CLASS}
                value={preset}
                aria-label={`Preset for ${primary}`}
                onChange={(event) => {
                  const value = event.target.value as RolePreset;
                  setPreset(value);
                  setError(null);
                  if (value === "STAFF") setStaffRole(defaultRoleForPreset("STAFF"));
                }}
              >
                {ROLE_PRESET_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {presetLabel(value)}
                  </option>
                ))}
              </select>
            </label>

            {preset === "STAFF" && (
              <label className="flex flex-col gap-1 text-[13px] font-medium text-slate-600">
                Staff role
                <select
                  className={SELECT_CLASS}
                  value={staffRole}
                  aria-label={`Staff role for ${primary}`}
                  onChange={(event) => {
                    setStaffRole(event.target.value as Role);
                    setError(null);
                  }}
                >
                  {STAFF_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-[13.5px] font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/30 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
            >
              {saving ? "Saving…" : "Save role"}
            </button>
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13.5px] text-red-700 ring-1 ring-inset ring-red-200"
        >
          {error}
        </p>
      )}
    </li>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const [org, setOrg] = useState<{ name: string; slug: string; status: string; timezone: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState<number | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);
  const [members, setMembers] = useState<MembershipRow[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersLoading, setMembersLoading] = useState(true);

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

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const r = await fetch(`/api/v1/orgs/${orgId}/memberships`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? `Request failed (${r.status})`);
      setMembers((j.data ?? []) as MembershipRow[]);
      setMembersError(null);
    } catch (e) {
      setMembersError((e as Error).message);
    } finally {
      setMembersLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAudit(); }, [loadAudit]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleMembersUpdated = useCallback(() => {
    loadMembers();
    loadAudit();
  }, [loadMembers, loadAudit]);

  return (
    <>
      <PageHeader title="Settings" description="Your organization's details, people, and a record of every action taken here." />
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
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                Only a platform administrator can suspend an organization. People and passes are managed on their own pages.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <section className="mt-10" aria-labelledby="people-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
          <h2 id="people-heading" className="text-[19px] font-bold tracking-tight text-slate-900">
            People &amp; access
          </h2>
          <span className="text-[14px] text-slate-500">Four presets · seven roles underneath</span>
        </div>

        {membersLoading && <div className="mt-4"><LoadingState label="Loading members…" /></div>}

        {!membersLoading && membersError && (
          <p role="alert" className="mt-4 text-sm text-muted-foreground">
            {membersError} Membership changes require <span className="font-mono text-xs">members.manage</span>.
          </p>
        )}

        {!membersLoading && !membersError && members.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No members yet.</p>
        )}

        {!membersLoading && !membersError && members.length > 0 && (
          <ul className="mt-3 space-y-3">
            {members.map((member) => (
              <MemberRow key={member.id} orgId={orgId} member={member} onUpdated={handleMembersUpdated} />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b pb-3">
          <h2 className="text-[19px] font-bold tracking-tight text-slate-900">
            Audit log{auditTotal !== null ? ` (${auditTotal})` : ""}
          </h2>
          <span className="text-[14px] text-slate-500">Newest first · administrators only</span>
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
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="pp-table w-full text-[15px]">
              <caption className="sr-only">Recent audit log entries for this organization</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left">
                  {["Time", "Action", "Resource", "Result", "Actor"].map((heading) => (
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
                {audit.map((row) => (
                  <tr key={row.id} className="align-middle transition-colors hover:bg-slate-50">
                    <td data-label="Time" className="whitespace-nowrap px-4 py-3 font-mono text-[13px] tabular-nums text-slate-600">
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td data-label="Action" className="px-4 py-3 font-mono text-[13px] text-slate-900">{row.action}</td>
                    <td data-label="Resource" className="max-w-[16rem] px-4 py-3 font-mono text-[13px] text-slate-600" title={row.resource}>
                      <span className="block truncate">{row.resource}</span>
                    </td>
                    <td data-label="Result" className="px-4 py-3">
                      <Badge variant={resultVariant(row.result)}>{row.result}</Badge>
                    </td>
                    <td data-label="Actor" className="max-w-[10rem] px-4 py-3 font-mono text-[13px] text-slate-600" title={row.actorUserId ?? "system"}>
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
