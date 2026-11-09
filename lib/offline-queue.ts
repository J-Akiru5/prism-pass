import Dexie, { type Table } from "dexie";
import {
  INFLIGHT_LEASE_MS,
  MAX_QUEUE_ITEMS,
  OfflineQueueError,
  isConstraintError,
  isPeekable,
  isQuotaExceededError,
  markFailed,
  markRejected,
  markRetry,
  migrateLegacyQueueRecord,
  newQueueRecord,
  queueErrorMessage,
  shouldReleaseInflight,
  type QueueRecord,
} from "@/modules/offline/queue-state";
import {
  isSealedCredential,
  loadOrCreateQueueKey,
  loadQueueKey,
  openCredential,
  sealCredential,
} from "@/modules/offline/at-rest";
import type { OfflineEventInput } from "@/modules/offline/schema";

// P6 offline capture queue (client-side). Dexie/IndexedDB is only touched when a
// function is called, so importing this module in tests or SSR is safe.
//
// No service-role key and no raw device secret live here: the queue holds the
// signed scan intent and its stable idempotency key. The credential is sealed
// with a non-extractable device-local AES-GCM key before it reaches IndexedDB
// (see modules/offline/at-rest.ts).

export type OfflineQueueItem = QueueRecord & {
  id?: number;
  organizationId: string;
  deviceId: string;
  event: OfflineEventInput;
  /** True when a sealed row exists but its local key is unavailable. */
  credentialUnreadable?: boolean;
};

class OfflineQueueDatabase extends Dexie {
  queue!: Table<OfflineQueueItem, number>;

  constructor() {
    super("prism-pass-offline");
    this.version(1).stores({
      queue: "++id,&idempotencyKey,state,nextAttemptAt,createdAt",
    });
    // v2 adds the inflight lease timestamp without rewriting or dropping rows.
    // Legacy `inflight` rows are treated as immediately stale (0): a reload
    // cannot leave a live writer behind.
    this.version(2)
      .stores({
        queue: "++id,&idempotencyKey,state,nextAttemptAt,createdAt,inflightAt",
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("queue")
          .toCollection()
          .modify((row: OfflineQueueItem) => {
            row.inflightAt = migrateLegacyQueueRecord(row).inflightAt;
          });
      });
  }
}

let database: OfflineQueueDatabase | null = null;

function getDatabase(): OfflineQueueDatabase {
  if (typeof indexedDB === "undefined") {
    throw new OfflineQueueError("unavailable", queueErrorMessage("unavailable"));
  }
  database ??= new OfflineQueueDatabase();
  return database;
}

async function findIdByKey(db: OfflineQueueDatabase, idempotencyKey: string): Promise<number | null> {
  const existing = await db.queue.where("idempotencyKey").equals(idempotencyKey).first();
  return existing?.id ?? null;
}

async function sealForQueue(credential: string): Promise<string> {
  try {
    const key = await loadOrCreateQueueKey();
    return await sealCredential(credential, key);
  } catch (error) {
    if (error instanceof OfflineQueueError) throw error;
    throw new OfflineQueueError("encryption_unavailable", queueErrorMessage("encryption_unavailable"));
  }
}

async function openQueueItem(item: OfflineQueueItem, key: CryptoKey | null): Promise<OfflineQueueItem> {
  if (!isSealedCredential(item.event.credential)) return item;
  if (!key) return { ...item, credentialUnreadable: true };
  try {
    const credential = await openCredential(item.event.credential, key);
    return { ...item, event: { ...item.event, credential } };
  } catch {
    return { ...item, credentialUnreadable: true };
  }
}

/**
 * Add a queued scan. Idempotent by `idempotencyKey`: re-enqueueing the same key
 * returns the existing row id and never creates a duplicate. Refuses new rows
 * at `MAX_QUEUE_ITEMS` and maps IndexedDB quota exhaustion to a typed error;
 * neither path silently drops an existing scan.
 */
export async function enqueue(input: {
  organizationId: string;
  deviceId: string;
  event: OfflineEventInput;
}): Promise<number> {
  const db = getDatabase();
  const idempotencyKey = input.event.idempotencyKey;

  const existingId = await findIdByKey(db, idempotencyKey);
  if (existingId !== null) return existingId;

  // Cheap capacity pre-check before touching WebCrypto; the transaction below
  // repeats it so a concurrent tab cannot slip past the bound.
  if ((await db.queue.count()) >= MAX_QUEUE_ITEMS) {
    throw new OfflineQueueError("capacity", queueErrorMessage("capacity"));
  }

  // Seal outside the Dexie transaction: awaiting WebCrypto inside one can let
  // the transaction auto-commit before the write.
  const sealedCredential = await sealForQueue(input.event.credential);

  try {
    return await db.transaction("rw", db.queue, async () => {
      // Re-check inside the transaction: another tab may have won the race.
      const racedId = await findIdByKey(db, idempotencyKey);
      if (racedId !== null) return racedId;

      const total = await db.queue.count();
      if (total >= MAX_QUEUE_ITEMS) {
        throw new OfflineQueueError("capacity", queueErrorMessage("capacity"));
      }

      const record = newQueueRecord(idempotencyKey, Date.now());
      return await db.queue.add({
        ...record,
        organizationId: input.organizationId,
        deviceId: input.deviceId,
        event: { ...input.event, credential: sealedCredential },
      });
    });
  } catch (error) {
    if (error instanceof OfflineQueueError) throw error;
    if (isQuotaExceededError(error)) {
      throw new OfflineQueueError("quota", queueErrorMessage("quota"));
    }
    if (isConstraintError(error)) {
      // Unique index collision from a concurrent enqueue in another tab.
      const racedId = await findIdByKey(db, idempotencyKey);
      if (racedId !== null) return racedId;
    }
    throw error;
  }
}

/**
 * Return up to `limit` items and mark them `inflight` with a lease timestamp.
 * Rejected rows are never selected. Rows another tab claimed first are skipped
 * by re-checking state inside the write transaction.
 */
export async function peek(limit = 25, options: { dueOnly?: boolean } = {}): Promise<OfflineQueueItem[]> {
  const db = getDatabase();
  const now = Date.now();
  const dueOnly = options.dueOnly ?? true;

  const candidates = await db.queue.where("state").anyOf("pending", "failed").toArray();
  const selected = candidates
    .filter((item) => isPeekable(item, now, dueOnly))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, limit));
  if (selected.length === 0) return [];

  const hasSealed = selected.some((item) => isSealedCredential(item.event.credential));
  let key: CryptoKey | null = null;
  let keyStoreError: unknown = null;
  if (hasSealed) {
    try {
      key = await loadQueueKey();
    } catch (error) {
      keyStoreError = error;
    }
  }
  // A key-store failure is not proof the key is gone. Leave rows queued and
  // surface the typed error; only a confirmed missing key (null) is terminal.
  if (keyStoreError) {
    throw keyStoreError instanceof OfflineQueueError
      ? keyStoreError
      : new OfflineQueueError("encryption_unavailable", queueErrorMessage("encryption_unavailable"));
  }

  const sendable: OfflineQueueItem[] = [];
  const unreadable: OfflineQueueItem[] = [];
  for (const item of selected) {
    if (!isSealedCredential(item.event.credential)) {
      sendable.push(item);
      continue;
    }
    if (!key) {
      unreadable.push(item);
      continue;
    }
    try {
      const credential = await openCredential(item.event.credential, key);
      sendable.push({ ...item, event: { ...item.event, credential } });
    } catch {
      unreadable.push(item);
    }
  }

  return db.transaction("rw", db.queue, async () => {
    const claimed: OfflineQueueItem[] = [];

    for (const item of sendable) {
      if (item.id === undefined) continue;
      const current = await db.queue.get(item.id);
      if (!current || !isPeekable(current, now, dueOnly)) continue;
      await db.queue.update(item.id, { state: "inflight", inflightAt: now });
      claimed.push({ ...item, state: "inflight", inflightAt: now });
    }

    // A sealed row whose key was cleared can never be sent. Make it a visible
    // terminal rejection instead of silently skipping or storing plaintext.
    for (const item of unreadable) {
      if (item.id === undefined) continue;
      const current = await db.queue.get(item.id);
      if (!current || !isPeekable(current, now, dueOnly)) continue;
      const next = markRejected(current, queueErrorMessage("credential_unreadable"));
      await db.queue.update(item.id, {
        state: next.state,
        attempts: next.attempts,
        nextAttemptAt: next.nextAttemptAt,
        lastError: next.lastError,
        inflightAt: next.inflightAt,
      });
    }

    return claimed;
  });
}

/** Acknowledge a server receipt: accepted/duplicate items leave the queue for good. */
export async function ack(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await getDatabase().queue.bulkDelete(ids);
}

/** Record a transient failed send; the item returns after backoff + jitter. */
export async function fail(id: number, reason: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    const item = await db.queue.get(id);
    if (!item || item.state === "rejected") return;
    const next = markFailed(item, reason, Date.now());
    await db.queue.update(id, {
      state: next.state,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      lastError: next.lastError,
      inflightAt: next.inflightAt,
    });
  });
}

/**
 * Record a permanent server rejection. Terminal: `peek` will not reselect the
 * row, and the reason stays attached for the queue panel.
 */
export async function reject(id: number, reason: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    const item = await db.queue.get(id);
    if (!item || item.state === "rejected") return;
    const next = markRejected(item, reason);
    await db.queue.update(id, {
      state: next.state,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      lastError: next.lastError,
      inflightAt: next.inflightAt,
    });
  });
}

/**
 * Explicit user retry for a rejected or failed row: back to pending, attempt
 * count reset, due immediately. A live `inflight` row is left alone.
 */
export async function retry(id: number): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    const item = await db.queue.get(id);
    if (!item || item.state === "inflight") return;
    const next = markRetry(item, Date.now());
    await db.queue.update(id, {
      state: next.state,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      lastError: next.lastError,
      inflightAt: next.inflightAt,
    });
  });
}

/**
 * Items still stored in capture order, for the scanner's queue panel (counts,
 * failure reasons). Reading the UI never changes queue state. A row whose key
 * is missing is returned with `credentialUnreadable` rather than being hidden.
 */
export async function list(): Promise<OfflineQueueItem[]> {
  const rows = await getDatabase().queue.orderBy("createdAt").toArray();
  if (!rows.some((row) => isSealedCredential(row.event.credential))) return rows;
  const key = await loadQueueKey().catch(() => null);
  return Promise.all(rows.map((row) => openQueueItem(row, key)));
}

/** Remove queued items outright (an explicit, confirmed user action). */
export async function clear(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await getDatabase().queue.bulkDelete(ids);
}

/**
 * Rows still awaiting a server decision (pending, inflight or failed).
 * Rejected rows stay stored but are not "remaining" sync work.
 */
export async function size(): Promise<number> {
  return getDatabase().queue.where("state").anyOf("pending", "inflight", "failed").count();
}

/** Put interrupted `inflight` items back without incrementing their attempt count. */
export async function release(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    for (const id of ids) {
      const item = await db.queue.get(id);
      // Never resurrect a terminal row or touch one another tab is sending.
      if (!item || item.state !== "inflight") continue;
      await db.queue.update(id, { state: "pending", inflightAt: null });
    }
  });
}

/**
 * Recover rows left `inflight` by a reload, crash or closed tab. A row is only
 * released after `leaseMs`, so a second tab cannot steal a live send. Legacy
 * rows without `inflightAt` are released immediately. Safe to call on mount: a
 * duplicate send is resolved by the idempotency key, never silently dropped.
 */
export async function releaseInflight(
  now: number = Date.now(),
  leaseMs: number = INFLIGHT_LEASE_MS,
): Promise<number> {
  const db = getDatabase();
  return db.transaction("rw", db.queue, async () => {
    const rows = await db.queue.where("state").equals("inflight").toArray();
    let released = 0;
    for (const row of rows) {
      if (row.id === undefined) continue;
      if (!shouldReleaseInflight(row, now, leaseMs)) continue;
      await db.queue.update(row.id, { state: "pending", inflightAt: null });
      released += 1;
    }
    return released;
  });
}
