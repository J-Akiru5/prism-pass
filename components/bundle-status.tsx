"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { clsx } from "clsx";
import type { CachedBundle } from "@/modules/offline/bundle-schema";
import {
  AGE_LEVEL_TEXT,
  DRIFT_LEVEL_TEXT,
  bundleStatusText,
  type LastSyncTone,
} from "@/modules/scanner/offline-presentation";

// Compact offline-data status for the scanner (M2).
//
// Shows the age of the downloaded bundle, when it was generated and downloaded,
// the measured device-clock drift and the last sync outcome. Every level is
// rendered as a word ("Fresh", "Stale", "Blocked", ...) as well as a tone, so
// the meaning never depends on colour alone.

export type BundleStatusSync = {
  at: number;
  outcome: string;
  message: string;
  driftMs: number | null;
};

export type BundleStatusProps = {
  bundle: CachedBundle | null;
  loading: boolean;
  online: boolean;
  sessionSelected: boolean;
  deviceReady: boolean;
  /** The cached bundle was downloaded for a different session than the selected one. */
  sessionBundleMatches?: boolean;
  notice?: string | null;
  lastSync?: BundleStatusSync | null;
};

const TONE_TEXT: Record<LastSyncTone, string> = {
  ok: "text-slate-700",
  warn: "text-amber-800",
  danger: "text-red-700",
  muted: "text-slate-600",
};

const TONE_BORDER: Record<LastSyncTone, string> = {
  ok: "border-slate-200",
  warn: "border-amber-200/80",
  danger: "border-red-200/80",
  muted: "border-slate-200",
};

function formatTime(value: string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function ageTone(level: ReturnType<typeof bundleStatusText>["ageLevel"]): string {
  switch (level) {
    case "fresh":
      return "text-emerald-700";
    case "aging":
      return "text-amber-800";
    case "stale":
      return "text-orange-800";
    case "expired":
      return "text-red-700";
  }
}

function driftTone(level: ReturnType<typeof bundleStatusText>["driftLevel"]): string {
  switch (level) {
    case "ok":
      return "text-emerald-700";
    case "warn":
      return "text-amber-800";
    case "danger":
      return "text-orange-800";
    case "blocked":
      return "text-red-700";
  }
}

export function BundleStatus({
  bundle,
  loading,
  online,
  sessionSelected,
  deviceReady,
  sessionBundleMatches = true,
  notice,
  lastSync,
}: BundleStatusProps) {
  // The cached age is stamped at load; keep it honest while the tab stays open
  // by adding elapsed time once a minute. Prefer the monotonic receipt stamp
  // (the same clock `verifyOffline` uses) so moving the device wall clock does
  // not make a stale snapshot look fresh.
  const [tick, setTick] = useState<{ mono: number; wall: number }>({ mono: 0, wall: 0 });
  useEffect(() => {
    const update = () => setTick({ mono: performance.now(), wall: Date.now() });
    update();
    const id = window.setInterval(update, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const monotonicAge =
    bundle &&
    typeof bundle.receivedAtMonoMs === "number" &&
    Number.isFinite(bundle.receivedAtMonoMs) &&
    tick.mono > 0
      ? bundle.ageMs + Math.max(0, tick.mono - bundle.receivedAtMonoMs)
      : null;
  const wallAge = bundle
    ? bundle.ageMs + (tick.wall > 0 ? Math.max(0, tick.wall - bundle.receivedAt) : 0)
    : Number.NaN;
  const ageMs = bundle ? Math.max(0, monotonicAge ?? wallAge) : Number.NaN;
  const driftMs = lastSync?.driftMs ?? bundle?.driftMs ?? null;
  const labels = bundleStatusText({
    ageMs,
    driftMs,
    lastSyncAt: lastSync?.at ?? null,
    lastSyncOutcome: lastSync?.message ?? null,
  });

  const unavailableCopy = loading
    ? "Checking for a downloaded offline bundle…"
    : !online
      ? "No offline bundle is cached for this organization. Scanning offline is unavailable until this event is downloaded while online."
      : !sessionSelected
        ? "No offline bundle cached. Select a session to download it for offline scanning."
        : !deviceReady
          ? "Set the device signing key, then the event bundle downloads automatically while you are online."
          : "No offline bundle cached yet. It downloads automatically while this session is selected and you are online.";

  return (
    <section
      aria-label="Offline data status"
      className={clsx(
        "mt-5 rounded-xl border bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        TONE_BORDER[labels.lastSyncTone],
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.09em] text-slate-700">
          <CloudOff className="size-4 text-slate-500" aria-hidden="true" /> Offline data
        </h2>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-500">
          {online ? "Online" : "Offline — using downloaded data"}
        </span>
      </div>

      {bundle ? (
        <>
          <dl className="mt-2.5 grid gap-x-6 gap-y-2 text-[13.5px] leading-snug sm:grid-cols-2">
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Data age</dt>
              <dd className="mt-0.5 text-slate-700">
                <span className={clsx("font-semibold", ageTone(labels.ageLevel))}>
                  {AGE_LEVEL_TEXT[labels.ageLevel]}
                </span>{" "}
                — {labels.ageText}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Device clock</dt>
              <dd className="mt-0.5 text-slate-700">
                <span className={clsx("font-semibold", driftTone(labels.driftLevel))}>
                  {DRIFT_LEVEL_TEXT[labels.driftLevel]}
                </span>{" "}
                — {labels.driftText}
              </dd>
            </div>
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Generated</dt>
              <dd className="mt-0.5 text-slate-700">{formatTime(bundle.generatedAt)}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Downloaded</dt>
              <dd className="mt-0.5 text-slate-700">{formatTime(bundle.receivedAt)}</dd>
            </div>
          </dl>

          {sessionSelected && !sessionBundleMatches && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200/80">
              This downloaded bundle belongs to another session. Download this event while online before
              scanning offline.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-[13.5px] leading-snug text-slate-700">{unavailableCopy}</p>
      )}

      <p className={clsx("mt-2 text-[13px] leading-snug", TONE_TEXT[labels.lastSyncTone])}>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-slate-500">Last sync</span>{" "}
        {labels.lastSyncText}
      </p>

      {notice && (
        <p role="status" aria-live="polite" className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200/80">
          {notice}
        </p>
      )}
    </section>
  );
}
