import { randomUUID } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INFLIGHT_LEASE_MS,
  MAX_QUEUE_ITEMS,
  isPeekable,
  isQuotaExceededError,
  markBlocked,
  markFailed,
  queueCounts,
  type QueueRecord,
} from "../modules/offline/queue-state";

// The Dexie adapter is exercised against a small in-memory fake. It implements
// only the query/update surface the adapter uses, including the unique
// idempotency-key index and quota/constraint failures, so no real IndexedDB or
// browser is required.

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const control = {
    failNextAdd: null as unknown as Error | null,
  };

  const instances: FakeDexie[] = [];

  class FakeQuery {
    constructor(
      private readonly table: FakeTable,
      private readonly field: string,
      private readonly values: unknown[],
      private readonly mode: "equals" | "anyOf",
    ) {}

    private matches(): Row[] {
      const rows = [...this.table.rows.values()];
      return rows.filter((row) =>
        this.mode === "equals" ? row[this.field] === this.values[0] : this.values.includes(row[this.field]),
      );
    }

    toArray(): Promise<Row[]> {
      return Promise.resolve(this.matches().map((row) => ({ ...row })));
    }

    first(): Promise<Row | undefined> {
      const row = this.matches()[0];
      return Promise.resolve(row ? { ...row } : undefined);
    }

    count(): Promise<number> {
      return Promise.resolve(this.matches().length);
    }
  }

  class FakeTable {
    rows = new Map<number, Row>();
    nextId = 1;

    async add(row: Row): Promise<number> {
      if (control.failNextAdd) {
        const failure = control.failNextAdd;
        control.failNextAdd = null;
        throw failure;
      }
      for (const existing of this.rows.values()) {
        if (existing.idempotencyKey === row.idempotencyKey) {
          throw new DOMException("Duplicate idempotencyKey", "ConstraintError");
        }
      }
      const id = typeof row.id === "number" ? row.id : this.nextId++;
      this.nextId = Math.max(this.nextId, id + 1);
      this.rows.set(id, { ...row, id });
      return id;
    }

    async bulkDelete(ids: number[]): Promise<void> {
      for (const id of ids) this.rows.delete(id);
    }

    async count(): Promise<number> {
      return this.rows.size;
    }

    async get(id: number): Promise<Row | undefined> {
      const row = this.rows.get(id);
      return row ? { ...row } : undefined;
    }

    async update(id: number, patch: Row): Promise<number> {
      const row = this.rows.get(id);
      if (!row) return 0;
      this.rows.set(id, { ...row, ...patch });
      return 1;
    }

    where(field: string) {
      return {
        equals: (value: unknown) => new FakeQuery(this, field, [value], "equals"),
        anyOf: (...values: unknown[]) => new FakeQuery(this, field, values, "anyOf"),
      };
    }

    orderBy(field: string) {
      return {
        toArray: async (): Promise<Row[]> =>
          [...this.rows.values()]
            .sort((left, right) => Number(left[field]) - Number(right[field]))
            .map((row) => ({ ...row })),
      };
    }

    clear(): void {
      this.rows.clear();
      this.nextId = 1;
    }
  }

  class FakeDexie {
    queue = new FakeTable();

    constructor(_name?: string) {
      instances.push(this);
    }

    version(_number: number) {
      return this;
    }

    stores(_schema: Record<string, string>) {
      // Real Dexie installs table properties here; the subclass field
      // declaration means the base constructor's table may have been shadowed.
      this.queue = new FakeTable();
      return this;
    }

    upgrade(_callback: (transaction: unknown) => Promise<void>) {
      return this;
    }

    async transaction(
      _mode: string,
      _table: unknown,
      callback: () => Promise<unknown>,
    ): Promise<unknown> {
      return callback();
    }
  }

  return {
    FakeDexie,
    instances,
    control,
    reset() {
      control.failNextAdd = null;
      for (const instance of instances) instance.queue.clear();
    },
  };
});

vi.mock("dexie", () => ({ default: harness.FakeDexie }));

// Queue-level tests use identity protection; the real AES-GCM helpers are
// round-tripped separately through vi.importActual below.
vi.mock("@/modules/offline/at-rest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../modules/offline/at-rest")>();
  return {
    ...actual,
    loadOrCreateQueueKey: vi.fn(async () => ({}) as CryptoKey),
    loadQueueKey: vi.fn(async () => ({}) as CryptoKey),
    sealCredential: vi.fn(async (plain: string) => plain),
    openCredential: vi.fn(async (sealed: string) => sealed),
  };
});

import {
  block,
  clear,
  enqueue,
  fail,
  list,
  peek,
  rebindDevice,
  reject,
  release,
  releaseInflight,
  retry,
  size,
} from "../lib/offline-queue";
import { decideBatchResponse, isDeviceBlockCode, postBatch, syncQueuedScans } from "../lib/sync-client";
import { loadQueueKey } from "../modules/offline/at-rest";

const ORG = "org-hardening";
const DEVICE = "dev_hardening";
const SESSION = "session-hardening";
const NOW_MS = Date.UTC(2026, 10, 9, 8, 0, 0);
const CREDENTIAL = `PRISM1:pass_hardening:${"c".repeat(64)}`;

type SeedOverrides = Record<string, unknown> & { event?: Record<string, unknown> };

async function table() {
  await size();
  const instance = harness.instances[0];
  if (!instance) throw new Error("fake Dexie was not constructed");
  return instance.queue;
}

async function seed(overrides: SeedOverrides = {}): Promise<number> {
  const fake = await table();
  const id = fake.nextId++;
  const idempotencyKey = (overrides.idempotencyKey as string | undefined) ?? randomUUID();
  fake.rows.set(id, {
    id,
    idempotencyKey,
    state: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: NOW_MS + id,
    inflightAt: null,
    organizationId: ORG,
    deviceId: DEVICE,
    ...overrides,
    event: {
      idempotencyKey,
      sessionId: SESSION,
      credential: CREDENTIAL,
      clientTs: new Date(NOW_MS).toISOString(),
      direction: "auto",
      ...(overrides.event ?? {}),
    },
  });
  return id;
}

function eventFor(idempotencyKey: string) {
  return {
    idempotencyKey,
    sessionId: SESSION,
    credential: CREDENTIAL,
    clientTs: new Date(NOW_MS).toISOString(),
    direction: "auto" as const,
  };
}

beforeEach(() => {
  // Dexie itself is faked; the adapter only needs IndexedDB to exist in the
  // environment so its availability guard passes.
  Object.defineProperty(globalThis, "indexedDB", { value: {}, configurable: true, writable: true });
  harness.reset();
});

describe("offline queue adapter: idempotent enqueue", () => {
  it("returns the existing row id instead of creating a duplicate", async () => {
    const idempotencyKey = randomUUID();
    const first = await enqueue({
      organizationId: ORG,
      deviceId: DEVICE,
      event: eventFor(idempotencyKey),
    });
    const second = await enqueue({
      organizationId: ORG,
      deviceId: DEVICE,
      event: { ...eventFor(idempotencyKey), credential: `${CREDENTIAL}:changed` },
    });

    expect(second).toBe(first);
    const rows = await list();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first);
    expect(rows[0].event.idempotencyKey).toBe(idempotencyKey);
    expect(rows[0].event.credential).toBe(CREDENTIAL);
    expect(await size()).toBe(1);
  });
});

describe("offline queue adapter: capacity and quota", () => {
  it("refuses a new scan at capacity and keeps every existing row", async () => {
    const fake = await table();
    for (let index = 1; index <= MAX_QUEUE_ITEMS; index += 1) {
      const idempotencyKey = randomUUID();
      fake.rows.set(index, {
        id: index,
        idempotencyKey,
        state: "pending",
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        createdAt: NOW_MS + index,
        inflightAt: null,
        organizationId: ORG,
        deviceId: DEVICE,
        event: eventFor(idempotencyKey),
      });
    }
    fake.nextId = MAX_QUEUE_ITEMS + 1;

    await expect(
      enqueue({ organizationId: ORG, deviceId: DEVICE, event: eventFor(randomUUID()) }),
    ).rejects.toMatchObject({ code: "capacity" });

    expect(fake.rows.size).toBe(MAX_QUEUE_ITEMS);
    expect(await size()).toBe(MAX_QUEUE_ITEMS);
  });

  it("maps IndexedDB quota exhaustion to a typed error without dropping rows", async () => {
    await table();
    harness.control.failNextAdd = new DOMException("Storage is full", "QuotaExceededError");

    const failure = enqueue({ organizationId: ORG, deviceId: DEVICE, event: eventFor(randomUUID()) });
    await expect(failure).rejects.toMatchObject({ code: "quota" });
    await expect(failure).rejects.toThrow(/quota exceeded/i);
    expect((await table()).rows.size).toBe(0);
    expect(await size()).toBe(0);
  });

  it("recognises wrapped and legacy quota errors", () => {
    expect(isQuotaExceededError(new DOMException("full", "QuotaExceededError"))).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ message: "The storage is full" })).toBe(true);
    expect(isQuotaExceededError({ name: "ConstraintError" })).toBe(false);
  });
});

describe("offline queue adapter: inflight leases", () => {
  it("releases only stale or legacy inflight rows and keeps a fresh one", async () => {
    const stale = await seed({ state: "inflight", inflightAt: NOW_MS - INFLIGHT_LEASE_MS - 1 });
    const fresh = await seed({ state: "inflight", inflightAt: NOW_MS - 1_000 });
    const legacy = await seed({ state: "inflight", inflightAt: null });

    const released = await releaseInflight(NOW_MS, INFLIGHT_LEASE_MS);
    expect(released).toBe(2);

    const rows = (await table()).rows;
    expect(rows.get(stale)?.state).toBe("pending");
    expect(rows.get(stale)?.inflightAt).toBeNull();
    expect(rows.get(legacy)?.state).toBe("pending");
    expect(rows.get(fresh)?.state).toBe("inflight");
    expect(rows.get(fresh)?.inflightAt).toBe(NOW_MS - 1_000);
  });
});

describe("offline queue adapter: terminal rejections", () => {
  it("does not reselect a rejected row, keeps it visible and requeues only on explicit retry", async () => {
    const rejectedId = await seed({ state: "rejected", attempts: 1, lastError: "unknown_session" });
    const pendingId = await seed();

    const firstPeek = await peek(10);
    expect(firstPeek.map((item) => item.id)).toEqual([pendingId]);
    expect((await table()).rows.get(rejectedId)?.state).toBe("rejected");
    expect(await size()).toBe(1);

    const visible = await list();
    expect(visible.map((item) => item.id).sort()).toEqual([pendingId, rejectedId].sort());
    expect(visible.find((item) => item.id === rejectedId)?.lastError).toBe("unknown_session");

    await release([pendingId]);
    await retry(rejectedId);

    const secondPeek = await peek(10);
    expect(secondPeek.map((item) => item.id).sort()).toEqual([pendingId, rejectedId].sort());
    expect((await table()).rows.get(rejectedId)?.attempts).toBe(0);
  });

  it("stamps a terminal reason and refuses fail/release to resurrect it", async () => {
    const id = await seed();
    await peek(1);
    await reject(id, "clock_too_old");

    let row = (await table()).rows.get(id);
    expect(row).toMatchObject({
      state: "rejected",
      attempts: 1,
      nextAttemptAt: 0,
      lastError: "clock_too_old",
      inflightAt: null,
    });

    await fail(id, "network");
    await release([id]);
    await releaseInflight(Date.now() + INFLIGHT_LEASE_MS + 1);
    row = (await table()).rows.get(id);
    expect(row?.state).toBe("rejected");

    await retry(id);
    row = (await table()).rows.get(id);
    expect(row).toMatchObject({ state: "pending", attempts: 0, lastError: null, nextAttemptAt: expect.any(Number) });
  });

  it("marks a sealed row terminal when its key is confirmed missing, but keeps it queued on key-store error", async () => {
    const missingKeyId = await seed({
      event: { credential: "ppenc:v1:aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb" },
    });
    vi.mocked(loadQueueKey).mockResolvedValueOnce(null);

    expect(await peek(10)).toHaveLength(0);
    let row = (await table()).rows.get(missingKeyId);
    expect(row?.state).toBe("rejected");
    expect(row?.lastError).toMatch(/key is missing/i);

    harness.reset();
    const storeErrorId = await seed({
      event: { credential: "ppenc:v1:aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb" },
    });
    vi.mocked(loadQueueKey).mockRejectedValueOnce(new Error("key store unavailable"));

    await expect(peek(10)).rejects.toMatchObject({ code: "encryption_unavailable" });
    row = (await table()).rows.get(storeErrorId);
    expect(row?.state).toBe("pending");
  });

  it("clears a rejected row only when explicitly asked", async () => {
    const id = await seed({ state: "rejected", attempts: 1, lastError: "unknown_session" });
    await clear([id]);
    expect(await size()).toBe(0);
    expect(await list()).toHaveLength(0);
  });
});

describe("offline sync routing through the real adapter", () => {
  it("deletes accepted rows and leaves a per-item reject terminal and unpeekable", async () => {
    const acceptedKey = randomUUID();
    const rejectedKey = randomUUID();
    const acceptedId = await seed({ idempotencyKey: acceptedKey });
    const rejectedId = await seed({ idempotencyKey: rejectedKey });

    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            receipts: [
              { idempotencyKey: acceptedKey, sessionId: SESSION, status: "accept", reason: "ok" },
              {
                idempotencyKey: rejectedKey,
                sessionId: SESSION,
                status: "reject",
                reason: "unknown_session",
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const summary = await syncQueuedScans(
      {
        organizationId: ORG,
        deviceId: DEVICE,
        deviceSecret: "a".repeat(64),
        endpoint: "/api/v1/sync/batches",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      { includeDeferred: true, batchId: () => randomUUID(), limit: 10 },
    );

    expect(summary).toMatchObject({ outcome: "acked", attempted: 2, accepted: 1, rejected: 1, remaining: 0 });
    expect(summary.message).toMatch(/retry or clear/i);

    const rows = (await table()).rows;
    expect(rows.has(acceptedId)).toBe(false);
    expect(rows.get(rejectedId)?.state).toBe("rejected");
    expect(rows.get(rejectedId)?.lastError).toBe("unknown_session");

    expect(await peek(10)).toHaveLength(0);
    expect(await size()).toBe(0);
    expect((await list()).map((item) => item.id)).toEqual([rejectedId]);
  });

  it("marks a structural 400 batch rejection terminal instead of retrying forever", async () => {
    const id = await seed();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "INVALID_INPUT", message: "Batch validation failed" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    const summary = await syncQueuedScans(
      {
        organizationId: ORG,
        deviceId: DEVICE,
        deviceSecret: "a".repeat(64),
        endpoint: "/api/v1/sync/batches",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      { includeDeferred: true, batchId: () => randomUUID(), limit: 10 },
    );

    expect(summary).toMatchObject({ outcome: "rejected", attempted: 1, rejected: 1, remaining: 0 });
    expect(summary.message).toMatch(/not recorded/i);
    expect((await table()).rows.get(id)?.state).toBe("rejected");
    expect(await peek(10)).toHaveLength(0);
  });
});

describe("offline queue at-rest encryption", () => {
  it("round-trips a credential with a non-extractable AES-GCM key and rejects tampering", async () => {
    const actual = await vi.importActual<typeof import("../modules/offline/at-rest")>(
      "../modules/offline/at-rest",
    );
    const key = await actual.generateQueueKey();
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(key.usages).toEqual(expect.arrayContaining(["encrypt", "decrypt"]));

    const secret = `PRISM1:at-rest:${"d".repeat(64)}`;
    const sealed = await actual.sealCredential(secret, key);
    expect(actual.isSealedCredential(sealed)).toBe(true);
    expect(sealed).not.toContain(secret);
    expect(await actual.openCredential(sealed, key)).toBe(secret);

    const wrongKey = await actual.generateQueueKey();
    await expect(actual.openCredential(sealed, wrongKey)).rejects.toMatchObject({
      code: "credential_unreadable",
    });

    const dot = sealed.lastIndexOf(".");
    const tampered = `${sealed.slice(0, dot + 1)}${sealed[dot + 1] === "A" ? "B" : "A"}${sealed.slice(dot + 2)}`;
    await expect(actual.openCredential(tampered, key)).rejects.toMatchObject({
      code: "credential_unreadable",
    });

    // Rows captured by schema v1 were plaintext; they keep working unchanged.
    expect(await actual.openCredential("legacy-plain-credential", key)).toBe("legacy-plain-credential");
  });

  it("produces a different ciphertext for the same credential each time", async () => {
    const actual = await vi.importActual<typeof import("../modules/offline/at-rest")>(
      "../modules/offline/at-rest",
    );
    const key = await actual.generateQueueKey();
    const first = await actual.sealCredential("same-credential-value", key);
    const second = await actual.sealCredential("same-credential-value", key);
    expect(first).not.toBe(second);
    expect(await actual.openCredential(first, key)).toBe("same-credential-value");
    expect(await actual.openCredential(second, key)).toBe("same-credential-value");
  });
});

function baseRecord(overrides: Partial<QueueRecord> = {}): QueueRecord {
  return {
    idempotencyKey: "key-base",
    state: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: 0,
    inflightAt: null,
    ...overrides,
  };
}

describe("offline queue: device blocks and retry hints", () => {
  it("treats a device rejection as terminal and requeues only on explicit retry", async () => {
    const id = await seed();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "DEVICE_REVOKED", message: "Device is revoked" } }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    const summary = await syncQueuedScans(
      {
        organizationId: ORG,
        deviceId: DEVICE,
        deviceSecret: "a".repeat(64),
        endpoint: "/api/v1/sync/batches",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      { includeDeferred: true, batchId: () => randomUUID(), limit: 10 },
    );

    expect(summary).toMatchObject({ outcome: "blocked", attempted: 1, rejected: 0, remaining: 0 });
    expect(summary.message).toMatch(/re-register/i);
    expect((await table()).rows.get(id)?.state).toBe("blocked");
    expect(await peek(10)).toHaveLength(0);
    expect(await size()).toBe(0);

    await retry(id);
    expect((await table()).rows.get(id)?.state).toBe("pending");
  });

  it("honours a server Retry-After as a floor instead of the 1s backoff", async () => {
    const id = await seed();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many batches" } }),
        {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "120" },
        },
      ),
    );

    const before = Date.now();
    const summary = await syncQueuedScans(
      {
        organizationId: ORG,
        deviceId: DEVICE,
        deviceSecret: "a".repeat(64),
        endpoint: "/api/v1/sync/batches",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
      { includeDeferred: true, batchId: () => randomUUID(), limit: 10 },
    );

    expect(summary).toMatchObject({ outcome: "retry", attempted: 1, rejected: 0 });
    const row = (await table()).rows.get(id);
    expect(row?.state).toBe("failed");
    expect(row?.nextAttemptAt).toBeGreaterThanOrEqual(before + 119_000);
  });

  it("rebinds rows captured under another device key only when explicitly asked", async () => {
    const id = await seed({ deviceId: "dev_old" });
    expect(await rebindDevice([id], DEVICE)).toBe(1);
    expect((await table()).rows.get(id)?.deviceId).toBe(DEVICE);
    expect(await rebindDevice([id], "   ")).toBe(0);
  });

  it("caps absurd Retry-After hints and keeps reject/blocked rows out of counts", () => {
    const failed = markFailed(baseRecord(), "network", 1_000, 24 * 60 * 60_000);
    expect(failed.nextAttemptAt).toBeLessThanOrEqual(1_000 + 60 * 60_000);

    const blocked = markBlocked(baseRecord(), "DEVICE_REVOKED");
    expect(blocked.state).toBe("blocked");
    expect(isPeekable(blocked, 10_000)).toBe(false);
    expect(queueCounts([blocked, baseRecord({ state: "rejected" })])).toMatchObject({
      blocked: 1,
      rejected: 1,
      total: 2,
    });
  });

  it("maps device codes and sends an abort signal for a hung request", async () => {
    expect(isDeviceBlockCode("DEVICE_REVOKED")).toBe(true);
    expect(isDeviceBlockCode("DEVICE_UNREGISTERED")).toBe(true);
    expect(isDeviceBlockCode("FORBIDDEN")).toBe(false);
    expect(decideBatchResponse({ status: 403, body: { error: { code: "DEVICE_REVOKED" } } })).toMatchObject({
      kind: "fatal",
      code: "DEVICE_REVOKED",
    });

    let captured: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify({ data: { receipts: [] } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    await postBatch(
      {
        organizationId: ORG,
        deviceId: DEVICE,
        batchId: randomUUID(),
        clientVersion: "1.0.0",
        sentAt: new Date().toISOString(),
        events: [],
        signature: "a".repeat(64),
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 50 },
    );

    expect(captured?.signal).toBeInstanceOf(AbortSignal);
  });
});
