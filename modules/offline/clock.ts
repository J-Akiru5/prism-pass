// Offline clock and bundle-age policy (pure).
//
// At sync time the scanner samples the server clock and compares it with the
// device clock (NTP-style: the server time is assumed to be read halfway
// through the request). It also shows how old the downloaded event bundle is.
// Both are advisory UI policy in M2: they never rewrite receipts or reject a
// batch by themselves. The blocked threshold mirrors the server's 10-minute
// signature window (`MAX_SIGNATURE_SKEW_MS` in schema.ts); warning earlier
// gives staff time to correct a device clock before sync stops working.

/** Drift at or above this is worth showing as a warning. */
export const DRIFT_WARN_MS = 30_000;
/** Drift at or above this is dangerous; sync still works but is close to the server window. */
export const DRIFT_DANGER_MS = 5 * 60_000;
/** Drift above this blocks sync policy; the server would reject a stale/future batch. */
export const DRIFT_BLOCK_MS = 10 * 60_000;

/** Finite estimates are clamped here; beyond this the clock is not trustworthy. */
export const MAX_CLOCK_DRIFT_MS = 24 * 60 * 60_000;

/** Bundle younger than this is fresh. */
export const AGE_FRESH_MS = 60 * 60_000;
/** Bundle at or above this is stale (12 hours). */
export const AGE_AGING_MS = 12 * 60 * 60_000;
/** Bundle at or above this is expired (24 hours). */
export const AGE_STALE_MS = 24 * 60 * 60_000;

export type DriftLevel = "ok" | "warn" | "danger" | "blocked";
export type AgeLevel = "fresh" | "aging" | "stale" | "expired";

export type ClockDriftInput = {
  /** Device clock immediately before the request was sent. */
  deviceBeforeMs: number;
  /** Device clock immediately after the response headers arrived. */
  deviceAfterMs: number;
  /** Server clock reported by that response. */
  serverTimeMs: number;
};

export type ClockDriftEstimate = {
  /** Measured request round trip, clamped to a non-negative value. */
  rttMs: number;
  /**
   * `serverTimeMs - device midpoint`. Positive means the device clock is
   * behind the server; negative means it is ahead.
   */
  driftMs: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * NTP-style drift estimate using the request midpoint. An unmeasurable sample
 * (missing/NaN values, a device clock that jumped backwards, or a request that
 * appears to have spanned more than a day) returns `Infinity` for `driftMs` so
 * every caller fails closed: `driftLevel` is `blocked` and `canSync` is false.
 * Finite but absurd offsets are clamped to +/- `MAX_CLOCK_DRIFT_MS`.
 */
export function estimateClockDrift(input: ClockDriftInput): ClockDriftEstimate {
  const { deviceBeforeMs, deviceAfterMs, serverTimeMs } = input;
  const timingsValid =
    isFiniteNumber(deviceBeforeMs) &&
    isFiniteNumber(deviceAfterMs) &&
    deviceAfterMs >= deviceBeforeMs &&
    deviceAfterMs - deviceBeforeMs <= MAX_CLOCK_DRIFT_MS;
  const rttMs = timingsValid ? deviceAfterMs - deviceBeforeMs : 0;

  if (!timingsValid || !isFiniteNumber(serverTimeMs)) {
    return { rttMs, driftMs: Number.POSITIVE_INFINITY };
  }

  const midpointMs = deviceBeforeMs + rttMs / 2;
  const rawDriftMs = serverTimeMs - midpointMs;
  if (!Number.isFinite(rawDriftMs)) {
    return { rttMs, driftMs: Number.POSITIVE_INFINITY };
  }

  return {
    rttMs,
    driftMs: Math.max(-MAX_CLOCK_DRIFT_MS, Math.min(MAX_CLOCK_DRIFT_MS, rawDriftMs)),
  };
}

/**
 * Drift bands. Exactly 30s is a warning, exactly 5 minutes is dangerous, and
 * exactly 10 minutes is still dangerous: sync is blocked only when the drift
 * is *greater* than the 10-minute server window.
 */
export function driftLevel(driftMs: number): DriftLevel {
  if (!Number.isFinite(driftMs)) return "blocked";
  const magnitude = Math.abs(driftMs);
  if (magnitude > DRIFT_BLOCK_MS) return "blocked";
  if (magnitude >= DRIFT_DANGER_MS) return "danger";
  if (magnitude >= DRIFT_WARN_MS) return "warn";
  return "ok";
}

/** Human text for the scanner banner; the level controls its styling. */
export function driftLabel(driftMs: number): string {
  if (!Number.isFinite(driftMs)) {
    return "Device clock could not be verified against the server; syncing is blocked.";
  }
  const magnitude = Math.abs(driftMs);
  if (magnitude < 1_000) return "Device clock matches the server.";

  const posture = driftMs > 0 ? "behind" : "ahead of";
  // Round up so a drift just over a limit is not displayed as the limit itself.
  const amount = formatDuration(magnitude, true);
  if (magnitude > DRIFT_BLOCK_MS) {
    return `Device clock is ${amount} ${posture} the server; drift over 10 minutes blocks syncing.`;
  }
  return `Device clock is ${amount} ${posture} the server.`;
}

/** Clock drift policy gate for the scanner. Unknown drift fails closed. */
export function canSync(driftMs: number): boolean {
  return driftLevel(driftMs) !== "blocked";
}

/**
 * Bundle-age bands. Negative ages (a bundle timestamp slightly in the future)
 * are clamped to zero; NaN/infinite ages are treated as expired because an
 * unmeasurable age must not be presented as fresh.
 */
export function ageLevel(ageMs: number): AgeLevel {
  if (!Number.isFinite(ageMs)) return "expired";
  const age = Math.max(0, ageMs);
  if (age >= AGE_STALE_MS) return "expired";
  if (age >= AGE_AGING_MS) return "stale";
  if (age >= AGE_FRESH_MS) return "aging";
  return "fresh";
}

/** Human text for the bundle-age indicator; the level controls its styling. */
export function ageLabel(ageMs: number): string {
  if (!Number.isFinite(ageMs)) {
    return "Offline data age could not be verified; treat it as expired.";
  }
  const level = ageLevel(ageMs);
  const age = formatDuration(Math.max(0, ageMs));
  if (level === "expired") return `Offline data is ${age} old; it is past the 24-hour limit.`;
  if (level === "stale") return `Offline data is ${age} old; verify it is still valid for this event.`;
  if (level === "aging") return `Offline data is ${age} old; download a fresh bundle soon.`;
  return ageMs < 60_000 ? "Offline data was downloaded just now." : `Offline data is ${age} old.`;
}

/** Compact duration for banners. Ages round down; drift rounds up when asked. */
function formatDuration(ms: number, roundUp = false): string {
  const seconds = Math.max(0, ms) / 1_000;
  const totalSeconds = roundUp ? Math.ceil(seconds) : Math.floor(seconds);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainderSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return remainderSeconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${remainderSeconds}s`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}
