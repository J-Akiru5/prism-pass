import Dexie, { type Table } from "dexie";
import { markFailed, newQueueRecord, type QueueRecord } from "@/modules/offline/queue-state";
import type { OfflineEventInput } from "@/modules/offline/schema";

// P6 offline capture queue (client-side). Dexie/IndexedDB is only touched when a
// function is called, so importing this module in tests or SSR is safe.
//
// No service-role key and no raw device secret live here: the queue holds the
// signed scan intent and its stable idempotency key. No UI wiring in this phase.

export type OfflineQueueItem = QueueRecord & {
  id?: number;
  organizationId: string;
  deviceId: string;
  event: OfflineEventInput;
};

class OfflineQueueDatabase extends Dexie {
  queue!: Table<OfflineQueueItem, number>;

  constructor() {
    super("prism-pass-offline");
    this.version(1).stores({
      queue: "++id,&idempotencyKey,state,nextAttemptAt,createdAt",
    });
  }
}

let database: OfflineQueueDatabase | null = null;

function getDatabase(): OfflineQueueDatabase {
  if (typeof indexedDB === "undefined") {
    throw new Error("Offline queue requires IndexedDB");
  }
  database ??= new OfflineQueueDatabase();
  return database;
}

export async function enqueue(input: {
  organizationId: string;
  deviceId: string;
  event: OfflineEventInput;
}): Promise<number> {
  const db = getDatabase();
  const record = newQueueRecord(input.event.idempotencyKey, Date.now());
  return db.queue.add({
    ...record,
    organizationId: input.organizationId,
    deviceId: input.deviceId,
    event: input.event,
  });
}

/**
 * Return up to `limit` due items and mark them `inflight`. `fail()` owns the
 * backoff schedule, so a failed item reappears only when `nextAttemptAt` passes.
 */
export async function peek(limit = 25): Promise<OfflineQueueItem[]> {
  const db = getDatabase();
  const now = Date.now();
  return db.transaction("rw", db.queue, async () => {
    const candidates = await db.queue.where("state").anyOf("pending", "failed").toArray();
    const due = candidates
      .filter((item) => item.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(0, limit));

    for (const item of due) {
      if (item.id !== undefined) await db.queue.update(item.id, { state: "inflight" });
    }
    return due.map((item) => ({ ...item, state: "inflight" as const }));
  });
}

/** Acknowledge a server receipt: accepted/duplicate items leave the queue for good. */
export async function ack(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await getDatabase().queue.bulkDelete(ids);
}

/** Record a failed send; the item returns to the queue after exponential backoff. */
export async function fail(id: number, reason: string): Promise<void> {
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    const item = await db.queue.get(id);
    if (!item) return;
    const next = markFailed(item, reason, Date.now());
    await db.queue.update(id, {
      state: next.state,
      attempts: next.attempts,
      nextAttemptAt: next.nextAttemptAt,
      lastError: next.lastError,
    });
  });
}

/** Items still awaiting acknowledgement (pending, inflight or failed). */
export async function size(): Promise<number> {
  return getDatabase().queue.count();
}

/** Put interrupted `inflight` items back without incrementing their attempt count. */
export async function release(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDatabase();
  await db.transaction("rw", db.queue, async () => {
    for (const id of ids) await db.queue.update(id, { state: "pending" });
  });
}
