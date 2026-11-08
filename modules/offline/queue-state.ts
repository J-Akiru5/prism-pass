// P6 client queue state transitions (pure). `lib/offline-queue.ts` is the Dexie
// adapter; keeping the arithmetic here lets the retry model be unit-tested
// without IndexedDB.

export type QueueState = "pending" | "inflight" | "failed";

export type QueueRecord = {
  idempotencyKey: string;
  state: QueueState;
  attempts: number;
  /** Epoch ms. A pending/inflight item is due immediately; failed items wait. */
  nextAttemptAt: number;
  lastError: string | null;
  createdAt: number;
};

export const BASE_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 5 * 60_000;

/** 1s, 2s, 4s, 8s ... capped at 5 minutes. Deterministic (no jitter) for replayable tests. */
export function backoffDelayMs(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(safeAttempts, 20));
}

export function newQueueRecord(idempotencyKey: string, createdAt: number): QueueRecord {
  return { idempotencyKey, state: "pending", attempts: 0, nextAttemptAt: createdAt, lastError: null, createdAt };
}

export function markInflight(record: QueueRecord): QueueRecord {
  return { ...record, state: "inflight" };
}

/** A failed send goes back to `failed` with exponential backoff metadata. */
export function markFailed(record: QueueRecord, reason: string, now: number): QueueRecord {
  return {
    ...record,
    state: "failed",
    attempts: record.attempts + 1,
    // First retry waits 1s, then 2s, 4s ... based on attempts already made.
    nextAttemptAt: now + backoffDelayMs(record.attempts),
    lastError: reason,
  };
}

/** An acknowledged send leaves the queue entirely; the record is deleted by the adapter. */
export function markAcked(record: QueueRecord): QueueRecord {
  return { ...record, state: "pending", attempts: 0, nextAttemptAt: 0, lastError: null };
}

export function isDue(record: QueueRecord, now: number): boolean {
  return record.state !== "inflight" && record.nextAttemptAt <= now;
}
