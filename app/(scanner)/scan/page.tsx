"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Keyboard, ScanLine } from "lucide-react";
import { ScannerViewport } from "@/components/scanner-viewport";
import { ScanResult, type ScanTone } from "@/components/scan-result";
import { OfflineQueuePanel } from "@/components/offline-queue-panel";
import { ConsoleBar } from "@/components/console-bar";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { useOrgs } from "@/lib/use-orgs";
import { enqueue, list, rebindDevice, releaseInflight, retry as retryQueuedScans, clear as clearQueuedScans, type OfflineQueueItem } from "@/lib/offline-queue";
import { OfflineQueueError, INFLIGHT_LEASE_MS } from "@/modules/offline/queue-state";
import { newUuid, syncQueuedScans } from "@/lib/sync-client";
import {
  clearDeviceContext,
  loadDeviceContext,
  parseDeviceContext,
  saveDeviceContext,
  type DeviceContext,
} from "@/lib/device-context";

type SessionOption = { id: string; title: string; type: string; startsAt: string };
type Outcome = { tone: ScanTone; title: string; message: string; at: string };

function classify(code: number, message: string): ScanTone {
  if (code === 200) return "success";
  if (message.includes("duplicate") || message.includes("DUPLICATE")) return "warning";
  if (code === 401 || code === 403) return "danger";
  if (code === 404 || code === 400) return "info";
  if (code === 410) return "warning";
  return "muted";
}

/** A response that proves nothing was decided (retry is safe under the idempotency key). */
function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 425 || status === 429;
}

// Scanner: the organization comes from your verified membership, not a pasted
// UUID. Verification works without a session; recording check-in/out needs one.
//
// Online behaviour is unchanged (verify → record). When the browser is offline
// or the request never reaches the server, the scan is queued locally with a
// client-generated idempotency key and labelled provisional (ADR-09). It is
// never presented as recorded; the sync batch is the authoritative outcome.
export default function ScanPage() {
  const { orgs, loading: orgsLoading, error: orgsError } = useOrgs();
  const [orgId, setOrgId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [cred, setCred] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<Outcome[]>([]);

  // Offline queue state. Items are Dexie rows scoped to the selected org; the
  // signing key lives in session storage via lib/device-context (never here).
  const [online, setOnline] = useState(true);
  const [queueItems, setQueueItems] = useState<OfflineQueueItem[]>([]);
  const [device, setDevice] = useState<DeviceContext | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [leaseAt, setLeaseAt] = useState<number | null>(null);

  // Preselect: ?org= from the URL, else the only/first organization.
  useEffect(() => {
    if (orgId || orgs.length === 0) return;
    const fromUrl = new URLSearchParams(window.location.search).get("org");
    const match = fromUrl ? orgs.find((o) => o.id === fromUrl) : undefined;
    setOrgId(match?.id ?? orgs[0].id);
  }, [orgs, orgId]);

  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    setSessionsLoading(true);
    setSessionId("");
    fetch(`/api/v1/orgs/${orgId}/sessions?page=1&pageSize=50`, { credentials: "include" })
      .then(async (r) => (r.ok ? (await r.json()).data ?? [] : []))
      .then((list) => {
        if (alive) setSessions(list as SessionOption[]);
      })
      .catch(() => {
        if (alive) setSessions([]);
      })
      .finally(() => {
        if (alive) setSessionsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [orgId]);

  const org = useMemo(() => orgs.find((o) => o.id === orgId), [orgs, orgId]);
  const activeSession = sessions.find((s) => s.id === sessionId);

  const pushHistory = useCallback((outcome: Outcome) => {
    setHistory((h) => [outcome, ...h].slice(0, 5));
  }, []);

  const refreshQueue = useCallback(async (): Promise<OfflineQueueItem[]> => {
    if (!orgId) {
      setQueueItems([]);
      return [];
    }
    try {
      const all = await list();
      const scoped = all.filter((item) => item.organizationId === orgId);
      setQueueItems(scoped);
      // A row left inflight by a crash is protected for the lease window. Wake
      // at the earliest expiry so it is recovered without waiting for a click.
      const nextLease = scoped.reduce((earliest, item) => {
        if (item.state !== "inflight" || typeof item.inflightAt !== "number") return earliest;
        return Math.min(earliest, item.inflightAt + INFLIGHT_LEASE_MS);
      }, Number.POSITIVE_INFINITY);
      setLeaseAt(Number.isFinite(nextLease) ? nextLease : null);
      return scoped;
    } catch {
      setQueueItems([]);
      setLeaseAt(null);
      setQueueNotice("The offline queue is unavailable in this browser (IndexedDB blocked or unsupported).");
      return [];
    }
  }, [orgId]);

  // Load this tab's signing context and the existing queue when the org changes.
  useEffect(() => {
    if (!orgId) {
      setDevice(null);
      setQueueItems([]);
      setLeaseAt(null);
      return;
    }
    setDevice(loadDeviceContext(orgId));
    // A reload during a sync can leave rows `inflight`; put them back so they
    // are visible and retryable. Duplicate sends are safe (idempotency keys).
    void (async () => {
      try {
        await releaseInflight();
      } catch {
        // IndexedDB unavailable: refreshQueue reports it below.
      }
      await refreshQueue();
    })();
  }, [orgId, refreshQueue]);

  // Connectivity: only label the UI; the actual attempt still decides.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const syncNow = useCallback(
    async (source: "manual" | "online" = "manual") => {
      if (!orgId) return;
      if (!device) {
        if (source === "manual") setQueueNotice("Set the device signing key before syncing.");
        return;
      }
      setSyncing(true);
      setQueueNotice(null);
      setRetryAt(null);
      let refreshed: OfflineQueueItem[] | null = null;
      try {
        // Recover a crashed tab's stale lease before selecting work. Fresh rows
        // owned by a live tab are left alone.
        try {
          await releaseInflight();
        } catch {
          // syncQueuedScans reports an unavailable IndexedDB below.
        }
        const summary = await syncQueuedScans(
          {
            organizationId: orgId,
            deviceId: device.deviceId,
            deviceSecret: device.deviceSecret,
          },
          { includeDeferred: true }
        );
        refreshed = await refreshQueue();
        // Reconnecting with an empty queue should stay quiet.
        if (!(source === "online" && summary.outcome === "idle")) setQueueNotice(summary.message);
        if (summary.outcome === "acked" && summary.attempted > 0) {
          const outcome: Outcome = {
            tone: summary.rejected > 0 ? "warning" : "success",
            title: "Queue synced — server authoritative",
            message:
              `${summary.accepted} recorded · ${summary.duplicates} duplicate · ${summary.rejected} rejected.` +
              (summary.rejected > 0
                ? " Rejected scans are not recorded; retry or clear them in the queue panel."
                : ""),
            at: new Date().toISOString(),
          };
          setResult(outcome);
          pushHistory(outcome);
        }
        if (summary.outcome === "retry") {
          // `fail()` already set nextAttemptAt; wake up when the earliest one
          // is due instead of polling. Offline blocks the timer effect.
          const earliest = refreshed
            .filter((item) => item.state === "failed")
            .reduce((min, item) => Math.min(min, item.nextAttemptAt), Number.POSITIVE_INFINITY);
          setRetryAt(Number.isFinite(earliest) ? earliest : null);
        }
      } catch (e) {
        setQueueNotice(`Sync failed: ${(e as Error).message}`);
      } finally {
        setSyncing(false);
        if (!refreshed) void refreshQueue();
      }
    },
    [orgId, device, pushHistory, refreshQueue]
  );

  // The online event is the reconnect trigger. A ref keeps the listener stable
  // while still calling the latest context/dependencies.
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void syncRef.current("online");
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // Transient failures: `fail()` owns the exponential schedule; this timer is
  // only the wake-up. It stays disarmed while offline.
  useEffect(() => {
    if (!online || !device || retryAt === null) return;
    const delay = Math.min(Math.max(0, retryAt - Date.now()), 2_147_483_647);
    const id = window.setTimeout(() => {
      void syncRef.current("online");
    }, delay);
    return () => window.clearTimeout(id);
  }, [online, device, retryAt]);

  // Crash recovery: once another tab's inflight lease expires, reclaim the row
  // and retry. Fresh rows are left untouched by `releaseInflight`.
  useEffect(() => {
    if (!online || !device || leaseAt === null) return;
    const delay = Math.min(Math.max(0, leaseAt - Date.now()), 2_147_483_647);
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          await releaseInflight();
        } catch {
          // refreshQueue reports an unavailable IndexedDB below.
        }
        void syncRef.current("online");
      })();
    }, delay);
    return () => window.clearTimeout(id);
  }, [online, device, leaseAt]);

  // A tab that crashes while another tab stays open has no mount/reload event
  // to trigger recovery. Sweep the lease once a minute so a stale row cannot
  // stay invisible for the rest of the session.
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const released = await releaseInflight();
          if (released > 0) {
            await refreshQueue();
            if (device) void syncRef.current("online");
          }
        } catch {
          // A later sync or refresh will surface the storage failure.
        }
      })();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [online, device, refreshQueue]);

  const queueOffline = useCallback(
    async (credential: string, idempotencyKey: string, clientTs: string) => {
      if (!orgId) return;
      const at = new Date().toISOString();
      if (!sessionId) {
        const outcome: Outcome = {
          tone: "info",
          title: "Offline — session required",
          message: "Pick a session before queueing a scan. The server needs to know which attendance session it belongs to.",
          at,
        };
        setResult(outcome);
        pushHistory(outcome);
        return;
      }
      try {
        await enqueue({
          organizationId: orgId,
          // An empty id is adopted by the first device key configured for this
          // org; rows are never silently signed by a different device.
          deviceId: device?.deviceId ?? "",
          event: {
            idempotencyKey,
            sessionId,
            credential,
            clientTs,
            direction: "auto",
          },
        });
        const waiting = (await refreshQueue()).length;
        const short = idempotencyKey.slice(0, 8);
        const outcome: Outcome = {
          tone: "queued",
          title: "Queued offline — provisional",
          message:
            `Saved on this device as ${short}… It is NOT recorded yet. ` +
            (device
              ? "The server revalidates the pass when you sync."
              : "Set a device signing key in the queue panel, then sync; the server revalidates the pass."),
          at,
        };
        setResult(outcome);
        pushHistory(outcome);
        setQueueNotice(`${waiting} ${waiting === 1 ? "scan" : "scans"} waiting on this device.`);
      } catch (e) {
        const message = e instanceof OfflineQueueError ? e.message : (e as Error).message;
        const outcome: Outcome = {
          tone: "danger",
          title: "Could not queue offline",
          message: `${message} Do not treat this scan as captured.`,
          at,
        };
        setResult(outcome);
        pushHistory(outcome);
      }
    },
    [orgId, sessionId, device, refreshQueue, pushHistory]
  );

  const submit = useCallback(
    async (raw?: string) => {
      const credential = (raw ?? cred).trim();
      if (!credential || !orgId) {
        const outcome: Outcome = {
          tone: "info",
          title: "Nothing to verify",
          message: "Enter a credential, or scan a pass with the camera.",
          at: new Date().toISOString(),
        };
        setResult(outcome);
        return;
      }

      // A key is minted before any network call so a lost response can be
      // replayed safely: the server dedupes on it instead of double-counting.
      const idempotencyKey = newUuid();
      const clientTs = new Date().toISOString();

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        await queueOffline(credential, idempotencyKey, clientTs);
        return;
      }

      setBusy(true);
      setResult({ tone: "muted", title: "Verifying", message: "Checking credential against the server…", at: new Date().toISOString() });
      try {
        const v = await fetch(`/api/v1/orgs/${orgId}/passes/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential }),
        });
        const vj = await v.json();
        if (!v.ok) {
          // A 5xx/429 may mean the server never evaluated the pass; queue it as
          // provisional rather than losing the scan. Definitive refusals stay
          // visible and are never queued.
          if (isTransientStatus(v.status) && sessionId) {
            await queueOffline(credential, idempotencyKey, clientTs);
            return;
          }
          const outcome: Outcome = {
            tone: classify(v.status, vj?.error?.code ?? ""),
            title: vj?.error?.code ?? `Error ${v.status}`,
            message: vj?.error?.message ?? "Credential rejected.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          pushHistory(outcome);
          return;
        }
        if (!sessionId) {
          const outcome: Outcome = {
            tone: "success",
            title: vj.data.reason ?? "VALID",
            message: "Pass is valid. Pick a session to record check-in or check-out.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          pushHistory(outcome);
          return;
        }
        const s = await fetch(`/api/v1/orgs/${orgId}/sessions/${sessionId}/scans`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ credential, clientTs, idempotencyKey }),
        });
        const sj = await s.json();
        if (!s.ok) {
          if (isTransientStatus(s.status)) {
            await queueOffline(credential, idempotencyKey, clientTs);
            return;
          }
          const outcome: Outcome = {
            tone: classify(s.status, sj?.error?.code ?? ""),
            title: sj?.error?.code ?? `Error ${s.status}`,
            message: sj?.error?.message ?? "Scan rejected.",
            at: new Date().toISOString(),
          };
          setResult(outcome);
          pushHistory(outcome);
          return;
        }
        const outcome: Outcome = {
          tone: sj.data.duplicate ? "warning" : "success",
          title: sj.data.duplicate ? "Duplicate scan" : sj.data.event.type === "CHECK_IN" ? "Checked in" : "Checked out",
          message: `${sj.data.record?.status ?? "Recorded"}${
            sj.data.duplicate ? " — already counted, not recorded twice." : `. Geo: ${sj.data.geoResult ?? "not captured"}.`
          }`,
          at: new Date().toISOString(),
        };
        setResult(outcome);
        pushHistory(outcome);
      } catch {
        // The request never produced an authoritative receipt: keep the scan
        // locally under the same idempotency key and say so plainly.
        await queueOffline(credential, idempotencyKey, clientTs);
      } finally {
        setBusy(false);
      }
    },
    [cred, orgId, sessionId, queueOffline, pushHistory]
  );

  const handleSaveKey = useCallback(
    (deviceIdInput: string, secret: string): string | null => {
      if (!orgId) return "No organization selected.";
      const parsed = parseDeviceContext(deviceIdInput, secret);
      if (!parsed.ok) return parsed.error;
      try {
        saveDeviceContext(orgId, parsed.value);
      } catch (e) {
        return (e as Error).message;
      }
      setDevice(parsed.value);
      setQueueNotice("Device signing key saved for this tab.");
      return null;
    },
    [orgId]
  );

  const handleForgetKey = useCallback(() => {
    if (!orgId) return;
    clearDeviceContext(orgId);
    setDevice(null);
    setQueueNotice("Device signing key removed. Queued scans are kept.");
  }, [orgId]);

  const handleClearQueue = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      try {
        await clearQueuedScans(ids);
        const remaining = (await refreshQueue()).length;
        setQueueNotice(`Cleared ${ids.length} queued ${ids.length === 1 ? "scan" : "scans"}. ${remaining} remaining.`);
      } catch (e) {
        setQueueNotice(`Could not clear the queue: ${(e as Error).message}`);
      }
    },
    [refreshQueue]
  );

  const handleRetryQueue = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      try {
        // A row can only be retried under a usable key. If the device was
        // re-registered, adopt the explicitly retried rows first.
        if (device) await rebindDevice(ids, device.deviceId);
        for (const id of ids) await retryQueuedScans(id);
        const refreshed = await refreshQueue();
        const waiting = refreshed.filter((item) => item.state !== "rejected" && item.state !== "blocked").length;
        setQueueNotice(
          `Requeued ${ids.length} ${ids.length === 1 ? "scan" : "scans"} for another attempt. ` +
            `${waiting} ${waiting === 1 ? "scan is" : "scans are"} waiting; nothing is recorded until the server accepts it.`
        );
      } catch (e) {
        setQueueNotice(`Could not retry queued scans: ${(e as Error).message}`);
      }
    },
    [device, refreshQueue]
  );

  const handleRebindQueue = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      if (!orgId || !device) {
        setQueueNotice("Set the device signing key before rebinding queued scans.");
        return;
      }
      try {
        const moved = await rebindDevice(ids, device.deviceId);
        const refreshed = await refreshQueue();
        setQueueNotice(
          `Moved ${moved} ${moved === 1 ? "scan" : "scans"} to this device key. ` +
            `${refreshed.filter((item) => item.state === "pending" || item.state === "failed").length} ready to sync.`
        );
      } catch (e) {
        setQueueNotice(`Could not rebind queued scans: ${(e as Error).message}`);
      }
    },
    [orgId, device, refreshQueue]
  );

  const sessionLabel = useCallback(
    (id: string) => sessions.find((s) => s.id === id)?.title ?? `Session ${id.slice(0, 8)}…`,
    [sessions]
  );

  return (
    <div className="min-h-dvh bg-slate-50">
      <ConsoleBar label="Scanner" orgHref={orgId ? `/org/${orgId}` : undefined} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 md:px-6 md:pb-16 md:pt-8">
        <PageHeader
          title="Scanner"
          description="Scan a pass with the camera, or paste the scan code. Every check is verified on the server."
        />

        {orgsLoading && <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Loading organizations…</p>}

        {!orgsLoading && orgsError && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">Could not load your organizations</p>
            <p className="mt-1 text-muted-foreground">{orgsError}</p>
            <Link href="/login?next=/scan" className="mt-2 inline-block underline underline-offset-4">Sign in again</Link>
          </div>
        )}

        {!orgsLoading && !orgsError && orgs.length === 0 && (
          <div className="mt-6 border-y py-4 text-sm">
            <p className="font-medium">No organization yet</p>
            <p className="mt-1 text-muted-foreground">Your account has no active membership, so there is nothing to scan into.</p>
          </div>
        )}

        {orgs.length > 0 && (
          <>
            <section className="mt-6 space-y-4">
              <div>
                <p className="mb-1.5 text-[15px] font-semibold text-slate-700">Organization</p>
                {orgs.length === 1 ? (
                  <p className="text-[17px] font-semibold text-slate-900">{orgs[0].name}</p>
                ) : (
                  <select
                    aria-label="Organization"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    className="pp-select h-12 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-[16px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)_inset] transition-[border-color,box-shadow] hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/12"
                  >
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label htmlFor="scan-session" className="mb-1.5 block text-[15px] font-semibold text-slate-700">Session</label>
                <select
                  id="scan-session"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  disabled={sessionsLoading}
                  className="pp-select h-12 w-full rounded-[10px] border border-slate-200 bg-white px-3.5 text-[16px] font-medium text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)_inset] transition-[border-color,box-shadow] hover:border-slate-300 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/12 disabled:opacity-60"
                >
                  <option value="">Check only — do not record</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
                <p className="mt-1.5 text-[14.5px] text-slate-600">
                  {activeSession
                    ? `Recording into “${activeSession.title}”.`
                    : "Choose a session to save attendance. Otherwise this only checks the pass."}
                </p>
              </div>
            </section>

            <div className="mt-6">
              <ScannerViewport
                onDecode={(d) => {
                  setCred(d);
                  submit(d);
                }}
              />
            </div>

            <section className="mt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-2 text-[17px] font-bold text-slate-900">
                  <Keyboard className="size-4 text-slate-500" aria-hidden="true" /> Type a code
                </h2>
                <span className="text-[14px] text-slate-500">No camera needed</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
              >
                <Input
                  value={cred}
                  onChange={(e) => setCred(e.target.value)}
                  placeholder="Paste the full scan code"
                  aria-label="Credential payload"
                  className="font-mono text-[15px]"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" className="h-12" disabled={busy}>
                  <ScanLine aria-hidden="true" /> {busy ? "Checking…" : "Check pass"}
                </Button>
              </form>
            </section>

            {result && (
              <div className="mt-6">
                <ScanResult tone={result.tone} title={result.title} message={result.message} assertive={result.tone === "danger"} />
              </div>
            )}

            <OfflineQueuePanel
              items={queueItems}
              online={online}
              syncing={syncing}
              notice={queueNotice}
              device={device}
              sessionLabel={sessionLabel}
              onSync={() => void syncNow("manual")}
              onClear={(ids) => void handleClearQueue(ids)}
              onRetry={(ids) => void handleRetryQueue(ids)}
              onRebind={(ids) => void handleRebindQueue(ids)}
              onSaveKey={handleSaveKey}
              onForgetKey={handleForgetKey}
            />

            {history.length > 1 && (
              <section className="mt-8">
                <h2 className="border-b pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">This session</h2>
                <ul className="mt-1">
                  {history.slice(1).map((h, i) => (
                    <li key={`${h.at}-${i}`} className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
                      <span className="truncate">{h.title}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {new Date(h.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
