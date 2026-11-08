"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ReasonDialog } from "@/components/ui/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui-states";
import { errorMessage, platformRequest } from "@/lib/platform-client";
import { formatDate } from "@/lib/platform-format";
import {
  ADMIN_REASON_MIN,
  LAST_PLATFORM_ADMIN_RULE,
  SELF_REVOKE_RULE,
  type PlatformAdminRow,
} from "@/modules/platform/console";

export function AdminsConsole() {
  const [rows, setRows] = useState<PlatformAdminRow[]>([]);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<PlatformAdminRow | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const envelope = await platformRequest<PlatformAdminRow[]>("/api/v1/platform/admins");
      setRows(Array.isArray(envelope.data) ? envelope.data : []);
      setSelfUserId(typeof envelope.meta?.selfUserId === "string" ? envelope.meta.selfUserId : null);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmRevoke(reason: string) {
    if (!revokeTarget || revoking) return;
    setRevoking(true);
    setRevokeError(null);
    try {
      await platformRequest<{ userId: string; revoked: boolean }>(
        `/api/v1/platform/admins/${encodeURIComponent(revokeTarget.userId)}/revoke`,
        { method: "POST", body: JSON.stringify({ reason }) },
      );
      setNotice(`${revokeTarget.email ?? revokeTarget.userId} no longer has platform admin access.`);
      setRevokeTarget(null);
      void load(true);
    } catch (e) {
      setRevokeError(errorMessage(e));
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform · Access control"
        title="Platform admins"
        description="The platform_admins row is the only source of platform authority. An organization OWNER never inherits it (ADR-11). Every grant and revoke requires a recorded reason."
        actions={
          <Button className="h-11" onClick={() => setGrantOpen(true)}>
            <UserPlus aria-hidden="true" /> Grant access
          </Button>
        }
      />

      {error && (
        <div className="mt-6">
          <ErrorState message={error} retry={() => void load()} />
        </div>
      )}
      {notice && (
        <p role="status" aria-live="polite" className="mt-4 border-l-4 border-success bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Current grants</h2>
          <span aria-live="polite" className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {rows.length} {rows.length === 1 ? "admin" : "admins"}
          </span>
        </div>

        {rows.length === 1 && (
          <p className="mt-3 border-l-4 border-gold bg-accent/10 px-4 py-3 text-sm text-gold-dark">
            Only one platform admin remains. {LAST_PLATFORM_ADMIN_RULE}
          </p>
        )}

        {loading ? (
          <div className="mt-4">
            <LoadingState label="Loading platform admins…" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No platform admins"
              description="The console is unreachable without a grant. Seed one through the bootstrap path before relying on this screen."
            />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <caption className="sr-only">
                Platform administrators: e-mail, internal user id, grant date, and the revoke control. Self-revoke is
                disabled; the last remaining admin cannot be revoked.
              </caption>
              <thead>
                <tr className="border-b border-border text-left">
                  {["Admin", "Granted", "Scope", "Actions"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="py-2 pr-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground last:pr-0 last:text-right"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.userId} className="align-top transition-colors hover:bg-muted/40">
                    <th scope="row" className="py-3 pr-4 text-left font-normal">
                      <span className="block text-sm font-medium">
                        {row.email ?? "No e-mail on file"}
                        {row.isSelf && (
                          <Badge variant="info" className="ml-2 align-middle">
                            You
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">{row.userId}</span>
                    </th>
                    <td className="py-3 pr-4 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatDate(row.grantedAt)}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-success" aria-hidden="true" /> Platform
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10"
                        disabled={row.isSelf || rows.length <= 1}
                        title={
                          row.isSelf
                            ? SELF_REVOKE_RULE
                            : rows.length <= 1
                              ? LAST_PLATFORM_ADMIN_RULE
                              : undefined
                        }
                        onClick={() => {
                          setRevokeError(null);
                          setRevokeTarget(row);
                        }}
                      >
                        <ShieldOff aria-hidden="true" /> Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>
            Revoking removes the console grant only; it does not remove the user, their organization membership or
            any tenant data.
          </p>
          <p>
            Self-revoke is refused and the last remaining admin cannot be revoked — grant a peer first. Both rules are
            enforced by the API, not by disabled buttons.
          </p>
        </div>
      </section>

      {grantOpen && (
        <GrantDialog
          onClose={() => setGrantOpen(false)}
          onGranted={(row) => {
            setGrantOpen(false);
            setNotice(`${row.email ?? row.userId} now has platform admin access.`);
            void load(true);
          }}
        />
      )}

      {revokeTarget && (
        <ReasonDialog
          title={`Revoke platform access from ${revokeTarget.email ?? revokeTarget.userId}?`}
          description="The account keeps its organization memberships, but immediately loses every platform console route and API. The reason is recorded in the platform audit log."
          confirmLabel="Revoke access"
          tone="destructive"
          minLength={ADMIN_REASON_MIN}
          busy={revoking}
          error={revokeError}
          placeholder="e.g. Offboarding, role changed to organization admin"
          onConfirm={(reason) => void confirmRevoke(reason)}
          onClose={() => {
            if (!revoking) setRevokeTarget(null);
          }}
        />
      )}
    </>
  );
}

function GrantDialog({
  onClose,
  onGranted,
}: {
  onClose: () => void;
  onGranted: (row: PlatformAdminRow) => void;
}) {
  const formId = useId();
  const identifierId = useId();
  const reasonId = useId();
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const looksLikeEmail = identifier.includes("@");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedIdentifier = identifier.trim();
    const trimmedReason = reason.trim();
    if (!trimmedIdentifier) {
      setError("Enter the user's e-mail or internal user id.");
      return;
    }
    if (trimmedReason.length < ADMIN_REASON_MIN) {
      setError(`A reason of at least ${ADMIN_REASON_MIN} characters is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const envelope = await platformRequest<PlatformAdminRow>("/api/v1/platform/admins", {
        method: "POST",
        body: JSON.stringify({
          ...(looksLikeEmail ? { email: trimmedIdentifier } : { userId: trimmedIdentifier }),
          reason: trimmedReason,
        }),
      });
      onGranted(envelope.data);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Grant platform admin access"
      description="Platform authority is separate from organization membership (ADR-11). The grant is audited with your identity and the reason."
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button variant="ghost" type="button" className="h-11" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} className="h-11" disabled={busy}>
            {busy ? "Granting…" : "Grant access"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={identifierId} className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            User e-mail or user id
          </label>
          <Input
            id={identifierId}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="ops@example.com or ckxyz…"
            className="mt-1 h-11"
            autoComplete="off"
            aria-describedby={`${identifierId}-hint`}
          />
          <p id={`${identifierId}-hint`} className="mt-1 text-xs text-muted-foreground">
            An e-mail is resolved to the internal user server-side. The user must already have an internal account.
          </p>
        </div>

        <div>
          <label htmlFor={reasonId} className="block font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Reason (required)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={280}
            placeholder="e.g. Platform operations rotation, March"
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Recorded in the platform audit log. At least {ADMIN_REASON_MIN} characters.
          </p>
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
