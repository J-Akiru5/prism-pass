// P6 client queue state transitions (pure). `lib/offline-queue.ts` is the Dexie
// adapter; keeping the arithmetic and the terminal-state rules here lets the
// retry model be unit-tested without IndexedDB.
//
// States:
//   pending  -> waiting for the next sync attempt (due immediately)
//   inflight -> claimed by one tab for sending; protected by a bounded lease
//   failed   -> transient failure; retry after exponential backoff + jitter
//   rejected -> terminal server rejection; never re-peeked automatically, but
//               the user can explicitly retry or clear it

export type QueueState = "pending" | "inflight" | "failed" | "rejected";

export type QueueRecord = {
  idempotencyKey: string;
  state: QueueState;
  attempts: number;
  /** Epoch ms. A pending/failed item is due immediately; failed items wait. */
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
  /**
   * Epoch ms when the row became `inflight`; null in every other state.
   * Legacy rows upgraded from schema v1 may carry undefined until touched.
   */
  inflightAt: number | null;
};

export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;
/** Bound on how long a row may stay `inflight` before another tab may reclaim it. */
export const INFLIGHT_LEASE_MS = 2 * 60_000;
/** Hard bound on queued rows. Reaching it refuses new scans; nothing is dropped. */
export const MAX_QUEUE_ITEMS = 2_000;
/** Jitter spread as a fraction of the exponential base. */
export const BACKOFF_JITTER_RATIO = 0.25;

export type OfflineQueueErrorCode =
  | "capacity"
  | "quota"
  | "unavailable"
  | "encryption_unavailable"
  | "credential_unreadable";

/** Typed, user-visible queue failure. Callers may surface `message` verbatim. */
export class OfflineQueueError extends Error {
  readonly code: OfflineQueueErrorCode;

  constructor(code: OfflineQueueErrorCode, message: string) {
    super(message);
    this.name = "OfflineQueueError";
    this.code = code;
  }
}

/** Stable, user-facing text for each queue failure mode. */
export function queueErrorMessage(code: OfflineQueueErrorCode): string {
  switch (code) {
    case "capacity":
      return (
        `The offline queue is full (${MAX_QUEUE_ITEMS} scans). ` +
        "Sync or clear queued scans before capturing more. This scan was not saved."
      );
    case "quota":
      return (
        "This device has no storage left for queued scans (IndexedDB quota exceeded). " +
        "This scan was not saved; free space or clear the queue."
      );
    case "unavailable":
      return "The offline queue is unavailable in this browser. This scan was not saved.";
    case "encryption_unavailable":
      return (
        "Secure storage for queued scans is unavailable in this browser. " +
        "This scan was not saved rather than stored without protection."
      );
    case "credential_unreadable":
      return (
        "A queued scan could not be decrypted because its local key is missing. " +
        "Clear it to remove the unreadable copy."
      );
  }
}

function normalizeAttempts(attempts: number): number {
  return Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
}

function baseBackoffDelayMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(normalizeAttempts(attempts), 20));
}

/** FNV-1a, used only to spread retries; not a security primitive. */
function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic jitter for one (key, attempt) pair. The same key always gets
 * the same offset, so tests and replays are stable, while two devices can no
 * longer retry in lockstep. Jitter is strictly below `base * 25%`.
 */
export function backoffJitterMs(attempts: number, seed: string): number {
  const base = baseBackoffDelayMs(attempts);
  const window = Math.floor(base * BACKOFF_JITTER_RATIO);
  if (!seed || window <= 0) return 0;
  return stableHash(`${seed}:${normalizeAttempts(attempts)}`) % window;
}

/**
 * 1s, 2s, 4s, 8s ... capped at 5 minutes. With a seed (the idempotency key) a
 * bounded deterministic jitter is added. Without a seed the value is the plain
 * exponential schedule, which keeps response-policy tests exact.
 */
export function backoffDelayMs(attempts: number, seed?: string): number {
  const base = baseBackoffDelayMs(attempts);
  if (!seed) return base;
  return Math.min(MAX_BACKOFF_MS, base + backoffJitterMs(attempts, seed));
}

export function newQueueRecord(idempotencyKey: string, createdAt: number): QueueRecord {
  return {
    idempotencyKey,
    state: "pending",
    attempts: 0,
    nextAttemptAt: createdAt,
    lastError: null,
    createdAt,
    inflightAt: null,
  };
}

export function markInflight(record: QueueRecord, now: number): QueueRecord {
  return { ...record, state: "inflight", inflightAt: now };
}

/**
 * Add the schema-v2 lease timestamp to a legacy row without changing any other
 * field. Legacy `inflight` rows are immediately recoverable (0); everything
 * else gets null.
 */
export function migrateLegacyQueueRecord(record: QueueRecord): QueueRecord {
  return { ...record, inflightAt: record.state === "inflight" ? 0 : null };
}

/** A transient failure goes back to `failed` with backoff metadata + jitter. */
export function markFailed(record: QueueRecord, reason: string, now: number): QueueRecord {
  return {
    ...record,
    state: "failed",
    attempts: record.attempts + 1,
    // First retry waits 1s, then 2s, 4s ... based on attempts already made,
    // spread deterministically by this row's idempotency key.
    nextAttemptAt: now + backoffDelayMs(record.attempts, record.idempotencyKey),
    lastError: reason,
    inflightAt: null,
  };
}

/**
 * A permanent server rejection. Terminal: `peek` never selects it, and `fail`
 * must never downgrade it back to retryable. The reason stays visible so the
 * scanner can explain why the scan was not recorded.
 */
export function markRejected(record: QueueRecord, reason: string): QueueRecord {
  return {
    ...record,
    state: "rejected",
    attempts: record.attempts + 1,
    nextAttemptAt: 0,
    lastError: reason,
    inflightAt: null,
  };
}

/** Explicit user retry: requeue a rejected/failed row and reset its attempt budget. */
export function markRetry(record: QueueRecord, now: number): QueueRecord {
  return {
    ...record,
    state: "pending",
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    inflightAt: null,
  };
}

/** An acknowledged send leaves the queue entirely; the adapter deletes the row. */
export function markAcked(record: QueueRecord): QueueRecord {
  return { ...record, state: "pending", attempts: 0, nextAttemptAt: 0, lastError: null, inflightAt: null };
}

/** Only pending/failed rows can become due. Rejected is terminal. */
export function isDue(record: QueueRecord, now: number): boolean {
  return (record.state === "pending" || record.state === "failed") && record.nextAttemptAt <= now;
}

/** `peek` eligibility, shared with the adapter's re-check inside its transaction. */
export function isPeekable(record: QueueRecord, now: number, dueOnly = true): boolean {
  if (record.state !== "pending" && record.state !== "failed") return false;
  return !dueOnly || record.nextAttemptAt <= now;
}

/**
 * A lease protects a row another tab is actively sending. Missing/undefined
 * `inflightAt` means a legacy v1 row (written before the lease existed) and is
 * recoverable immediately, because no live writer can exist for it.
 */
export function shouldReleaseInflight(
  record: QueueRecord,
  now: number,
  leaseMs: number = INFLIGHT_LEASE_MS,
): boolean {
  if (record.state !== "inflight") return false;
  if (typeof record.inflightAt !== "number" || !Number.isFinite(record.inflightAt)) return true;
  return now - record.inflightAt >= Math.max(0, leaseMs);
}

export type QueueCounts = {
  pending: number;
  inflight: number;
  failed: number;
  rejected: number;
  total: number;
};

/** Accurate per-state counts for the queue panel; total includes rejected rows. */
export function queueCounts(records: readonly Pick<QueueRecord, "state">[]): QueueCounts {
  const counts: QueueCounts = { pending: 0, inflight: 0, failed: 0, rejected: 0, total: records.length };
  for (const record of records) counts[record.state] += 1;
  return counts;
}

/** Quota failures arrive as DOMException, Dexie wrappers, or legacy numeric codes. */
export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown; inner?: unknown };
  if (candidate.name === "QuotaExceededError") return true;
  if (candidate.code === 22) return true;
  if (typeof candidate.message === "string" && /quota|storage\s*(is\s*)?full/i.test(candidate.message)) return true;
  if (candidate.inner && candidate.inner !== error) return isQuotaExceededError(candidate.inner);
  return false;
}

/** Unique-index collision, including Dexie's wrapped form. */
export function isConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; inner?: unknown };
  if (candidate.name === "ConstraintError") return true;
  if (candidate.inner && candidate.inner !== error) return isConstraintError(candidate.inner);
  return false;
}
