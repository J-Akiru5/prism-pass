"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CloudOff, KeyRound, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DeviceContext } from "@/lib/device-context";
import type { OfflineQueueItem } from "@/lib/offline-queue";
import { queueCounts } from "@/modules/offline/queue-state";

// Editorial queue panel: hairline rules, mono labels, no KPI cards. Counts and
// failure reasons are text, never colour alone, and the summary is a polite
// live region so assistive tech hears queue changes.

export type OfflineQueuePanelProps = {
  items: OfflineQueueItem[];
  online: boolean;
  syncing: boolean;
  notice: string | null;
  device: DeviceContext | null;
  sessionLabel: (sessionId: string) => string;
  onSync: () => void;
  onClear: (ids: number[]) => void;
  onRetry: (ids: number[]) => void;
  onSaveKey: (deviceId: string, secret: string) => string | null;
  onForgetKey: () => void;
};

function stateLabel(item: OfflineQueueItem): string {
  if (item.state === "inflight") return "Sending";
  if (item.state === "rejected") return item.credentialUnreadable ? "Rejected · unreadable" : "Rejected — not recorded";
  if (item.state === "failed") return item.attempts > 0 ? `Failed · attempt ${item.attempts}` : "Failed";
  return "Waiting";
}

function timeLabel(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "unknown time"
    : at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function OfflineQueuePanel({
  items,
  online,
  syncing,
  notice,
  device,
  sessionLabel,
  onSync,
  onClear,
  onRetry,
  onSaveKey,
  onForgetKey,
}: OfflineQueuePanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [secret, setSecret] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);

  const counts = queueCounts(items);
  const waiting = counts.pending;
  const syncable = counts.pending + counts.inflight + counts.failed;
  const hasItems = items.length > 0;
  const removable = items.map((item) => item.id).filter((id): id is number => id !== undefined);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  // A queue that empties while the confirmation is open must not leave a stale
  // "clear 3 scans" prompt on screen.
  useEffect(() => {
    if (!hasItems) setConfirming(false);
  }, [hasItems]);

  const summary = !hasItems
    ? "No scans queued for this organization. Online scans are recorded immediately."
    : `${waiting} waiting · ${counts.inflight} sending · ${counts.failed} failed · ${counts.rejected} rejected · ${counts.total} total for this organization.`;

  const submitKey = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = onSaveKey(deviceId, secret);
    setKeyError(error);
    if (!error) {
      setDeviceId("");
      setSecret("");
    }
  };

  const cancelClear = () => {
    setConfirming(false);
    clearRef.current?.focus();
  };

  return (
    <section aria-labelledby="offline-queue-heading" className="mt-8 border-y">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b py-3">
        <h2
          id="offline-queue-heading"
          className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
        >
          <CloudOff className="size-3.5" aria-hidden="true" /> Offline queue
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onSync}
            disabled={!online || syncing || !device || syncable === 0}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            ref={clearRef}
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(true)}
            disabled={!hasItems || syncing}
          >
            <Trash2 aria-hidden="true" /> Clear queue
          </Button>
        </div>
      </div>

      <div role="status" aria-live="polite" aria-atomic="true" className="py-2">
        <p className="text-sm">
          {summary}
          {!online && " Offline — syncing resumes when the connection returns."}
        </p>
        {notice && <p className="mt-1 break-words text-xs text-muted-foreground">{notice}</p>}
        {counts.rejected > 0 && (
          <p className="mt-1 text-xs text-destructive">
            Rejected scans are not recorded. Retry after fixing the cause, or remove them from this device.
          </p>
        )}
      </div>

      {confirming && (
        <div role="group" aria-labelledby="clear-queue-prompt" className="border-t py-3">
          <p id="clear-queue-prompt" className="text-sm font-medium">
            Clear {items.length} queued {items.length === 1 ? "scan" : "scans"}? They will not be recorded.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">This removes the local copy only; it cannot be undone.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              ref={confirmRef}
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                onClear(removable);
              }}
            >
              Yes, clear {items.length === 1 ? "scan" : "queue"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancelClear}>
              Keep scans
            </Button>
          </div>
        </div>
      )}

      {hasItems && (
        <ul aria-label="Queued scans" className="border-t">
          {items
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((item) => {
              const short = item.event.idempotencyKey.slice(0, 8);
              return (
                <li key={item.id ?? item.idempotencyKey} className="border-b py-2 text-sm last:border-b-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate">{sessionLabel(item.event.sessionId)}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        {stateLabel(item)} · captured {timeLabel(item.event.clientTs)}
                      </p>
                      {item.lastError && (
                        <p className="mt-1 break-words text-xs text-destructive">
                          {item.state === "rejected" ? "Server reason" : "Last failure"}: {item.lastError}
                        </p>
                      )}
                      {item.credentialUnreadable && item.state !== "rejected" && (
                        <p className="mt-1 break-words text-xs text-destructive">
                          The encrypted copy cannot be opened because its local key is missing. Remove it to clear the
                          unreadable scan.
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{short}</span>
                  </div>
                  {item.state === "rejected" && item.id !== undefined && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onRetry([item.id as number])}
                        disabled={syncing}
                        aria-label={`Retry rejected scan ${short}`}
                      >
                        <RotateCcw aria-hidden="true" /> Retry
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onClear([item.id as number])}
                        disabled={syncing}
                        aria-label={`Remove rejected scan ${short}`}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      <div className="border-t py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <KeyRound className="size-3.5" aria-hidden="true" /> Signing key
          </p>
          {device ? (
            <p className="text-sm">
              Device <span className="font-mono text-xs">{device.deviceId}</span> · kept for this tab only
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not configured — queued scans cannot sync yet.</p>
          )}
        </div>

        {device ? (
          <Button type="button" size="sm" variant="ghost" className="mt-2 px-0" onClick={onForgetKey}>
            Forget key
          </Button>
        ) : (
          <form onSubmit={submitKey} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="grid gap-1">
              <label htmlFor="device-id" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Device id
              </label>
              <Input
                id="device-id"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                placeholder="dev_…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="device-secret" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                One-time secret
              </label>
              <Input
                id="device-secret"
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="64 hex characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Save key
            </Button>
          </form>
        )}

        {!device && (
          <p className="mt-2 text-xs text-muted-foreground">
            Paste the device id and secret returned once by the device registration endpoint. The secret stays in
            this tab&rsquo;s session storage and is never added to the offline queue.
          </p>
        )}
        {keyError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {keyError}
          </p>
        )}
      </div>
    </section>
  );
}
