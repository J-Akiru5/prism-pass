import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildBatchFromQueue,
  decideBatchResponse,
  parseRetryAfter,
  retryDelayMs,
  routeReceipts,
  signBatchPayload,
  type BatchReceipt,
} from "../lib/sync-client";
import type { OfflineQueueItem } from "../lib/offline-queue";
import { canonicalBatchPayload } from "../modules/offline/canonical";
import { backoffDelayMs, MAX_BACKOFF_MS } from "../modules/offline/queue-state";
import { deviceKeyHash, generateDeviceKey, verifyBatchSignature } from "../modules/offline/crypto";
import { parseDeviceContext } from "../lib/device-context";

// Pure parts of the offline UI wiring: batch assembly, canonical signing,
// replay/retry decisions and the backoff schedule. Dexie/IndexedDB and fetch
// are exercised by the page at runtime, not here.

const NOW = new Date("2026-11-08T08:00:00.000Z");
const NOW_MS = NOW.getTime();
const ORG = "org-offline-ui";
const DEVICE = "dev_abc123";
const SESSION = "session-a";
const BATCH_ID = "33333333-3333-4333-8333-333333333333";
const credential = `PRISM1:pass_abc:${"b".repeat(64)}`;

let nextId = 1;

function queueItem(overrides: Partial<OfflineQueueItem> = {}): OfflineQueueItem {
  const event = overrides.event ?? {
    idempotencyKey: randomUUID(),
    sessionId: SESSION,
    credential,
    clientTs: new Date(NOW_MS).toISOString(),
    direction: "auto" as const,
  };
  return {
    id: nextId++,
    state: "pending",
    attempts: 0,
    nextAttemptAt: NOW_MS,
    lastError: null,
    createdAt: NOW_MS,
    inflightAt: null,
    organizationId: ORG,
    deviceId: DEVICE,
    ...overrides,
    idempotencyKey: overrides.idempotencyKey ?? event.idempotencyKey,
    event,
  };
}

function receipt(overrides: Partial<BatchReceipt> = {}): BatchReceipt {
  return {
    idempotencyKey: randomUUID(),
    sessionId: SESSION,
    status: "accept",
    reason: "ok",
    ...overrides,
  };
}

describe("offline UI batch assembly", () => {
  it("maps queued rows to the signed batch event shape", () => {
    const item = queueItem();
    const built = buildBatchFromQueue([item], {
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
    });

    expect(built.batch).toMatchObject({
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      clientVersion: "1.0.0",
      sentAt: NOW.toISOString(),
    });
    expect(built.batch.events).toHaveLength(1);
    expect(built.batch.events[0]).toEqual({
      idempotencyKey: item.event.idempotencyKey,
      sessionId: SESSION,
      credential,
      clientTs: item.event.clientTs,
      direction: "auto",
    });
    expect(built.items).toEqual([item]);
    expect(built.excluded).toEqual([]);
  });

  it("orders events by clientTs so the server never sees a backwards clock", () => {
    const late = queueItem({
      event: {
        idempotencyKey: randomUUID(),
        sessionId: SESSION,
        credential,
        clientTs: new Date(NOW_MS + 2_000).toISOString(),
        direction: "auto",
      },
    });
    const early = queueItem({
      event: {
        idempotencyKey: randomUUID(),
        sessionId: SESSION,
        credential,
        clientTs: new Date(NOW_MS - 2_000).toISOString(),
        direction: "auto",
      },
    });
    const middle = queueItem({
      event: {
        idempotencyKey: randomUUID(),
        sessionId: SESSION,
        credential,
        clientTs: new Date(NOW_MS).toISOString(),
        direction: "auto",
      },
    });

    const built = buildBatchFromQueue([late, middle, early], {
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
    });

    expect(built.batch.events.map((event) => event.idempotencyKey)).toEqual([
      early.event.idempotencyKey,
      middle.event.idempotencyKey,
      late.event.idempotencyKey,
    ]);
    expect(built.batch.events.map((event) => event.clientTs)).toEqual(
      built.batch.events.map((event) => event.clientTs).slice().sort(),
    );
  });

  it("keeps rows for other orgs/devices out and adopts unprovisioned rows", () => {
    const mine = queueItem();
    const otherOrg = queueItem({ organizationId: "org-other", deviceId: "" });
    const otherDevice = queueItem({ deviceId: "dev_other" });
    const unprovisioned = queueItem({ deviceId: "" });

    const built = buildBatchFromQueue([mine, otherOrg, otherDevice, unprovisioned], {
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
    });

    expect(built.items.map((item) => item.id)).toEqual([mine.id, unprovisioned.id]);
    expect(built.excluded.map((item) => item.id).sort()).toEqual([otherOrg.id, otherDevice.id].sort());
  });

  it("caps a batch at the contract size", () => {
    const rows = [queueItem(), queueItem(), queueItem()];
    const built = buildBatchFromQueue(rows, {
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
      maxEvents: 2,
    });
    expect(built.items).toHaveLength(2);
    expect(built.batch.events).toHaveLength(2);
  });

  it("generates a fresh UUID for the batch id when the caller omits one", () => {
    const built = buildBatchFromQueue([queueItem()], { organizationId: ORG, deviceId: DEVICE });
    expect(built.batch.batchId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});

describe("offline UI canonical signing", () => {
  it("binds the org, device, batch id and event count in the canonical payload", () => {
    const built = buildBatchFromQueue([queueItem(), queueItem()], {
      organizationId: ORG,
      deviceId: DEVICE,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
    });
    const canonical = canonicalBatchPayload(built.batch);

    expect(canonical).toBe(canonicalBatchPayload({ ...built.batch }));
    expect(canonical).toContain("prism-sync-v1");
    expect(canonical).toContain(`org:${ORG}`);
    expect(canonical).toContain(`device:${DEVICE}`);
    expect(canonical).toContain(`batch:${BATCH_ID}`);
    expect(canonical).toContain("count:2");
    expect(canonical).toContain(built.batch.events[0].idempotencyKey);
    expect(canonicalBatchPayload({ ...built.batch, organizationId: "org-other" })).not.toBe(canonical);
    expect(canonicalBatchPayload({ ...built.batch, deviceId: "dev_other" })).not.toBe(canonical);
    expect(canonicalBatchPayload({ ...built.batch, batchId: "44444444-4444-4444-8444-444444444444" })).not.toBe(canonical);
  });

  it("renders geo and direction explicitly so optional fields cannot drift", () => {
    const withGeo = buildBatchFromQueue(
      [
        queueItem({
          event: {
            idempotencyKey: randomUUID(),
            sessionId: SESSION,
            credential,
            clientTs: NOW.toISOString(),
            direction: "in",
            geo: { lat: 14.5, lng: 121.25, accuracyM: 8 },
          },
        }),
      ],
      { organizationId: ORG, deviceId: DEVICE, batchId: BATCH_ID, sentAt: NOW.toISOString() },
    );
    const canonical = canonicalBatchPayload(withGeo.batch);
    expect(canonical).toContain("14.5,121.25,8");
    expect(canonical).toContain("|in|");
    expect(canonical).not.toContain("|auto|");
  });

  it("signs with WebCrypto in a form the server verifier accepts", async () => {
    const device = generateDeviceKey();
    const built = buildBatchFromQueue([queueItem()], {
      organizationId: ORG,
      deviceId: device.devicePublicId,
      batchId: BATCH_ID,
      sentAt: NOW.toISOString(),
    });

    const signature = await signBatchPayload(built.batch, device.secret);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyBatchSignature({ batch: built.batch, secretHash: deviceKeyHash(device.secret), signature })).toBe(true);

    const tampered = {
      ...built.batch,
      events: [{ ...built.batch.events[0], credential: credential.replace("bbbb", "cccc") }],
    };
    expect(verifyBatchSignature({ batch: tampered, secretHash: deviceKeyHash(device.secret), signature })).toBe(false);
    expect(
      verifyBatchSignature({ batch: built.batch, secretHash: deviceKeyHash(generateDeviceKey().secret), signature }),
    ).toBe(false);
  });
});

describe("offline UI response decision table", () => {
  it("acknowledges a 200 with usable receipts", () => {
    const accept = receipt({ status: "accept" });
    const duplicate = receipt({ status: "duplicate", reason: "idempotency_key_seen" });
    const decision = decideBatchResponse({
      status: 200,
      body: { data: { batch: { accepted: 1, rejected: 0 }, receipts: [accept, duplicate] } },
    });
    expect(decision).toEqual({ kind: "ack", receipts: [accept, duplicate] });
  });

  it("treats a 200 without parseable receipts as transient instead of deleting rows", () => {
    expect(decideBatchResponse({ status: 200, body: null })).toMatchObject({ kind: "retry" });
    expect(decideBatchResponse({ status: 200, body: { data: { receipts: [{ status: "accept" }] } } })).toMatchObject({
      kind: "retry",
      code: "malformed_response",
    });
  });

  it("re-enqueues on 409 with a fresh batch id, reusing the original keys", () => {
    const replay = decideBatchResponse({
      status: 409,
      body: { error: { code: "CONFLICT", message: "Batch has already been processed", details: { batchId: BATCH_ID } } },
    });
    expect(replay).toEqual({ kind: "replay", batchId: BATCH_ID });
    expect(decideBatchResponse({ status: 409, body: {} })).toEqual({ kind: "replay", batchId: null });
  });

  it("classifies 400 as a non-retryable rejection and auth/device failures as fatal", () => {
    expect(
      decideBatchResponse({ status: 400, body: { error: { code: "INVALID_INPUT", message: "Batch validation failed" } } }),
    ).toMatchObject({ kind: "reject", code: "INVALID_INPUT" });
    expect(decideBatchResponse({ status: 401, body: { error: { code: "UNAUTHORIZED" } } })).toMatchObject({
      kind: "fatal",
      status: 401,
    });
    expect(decideBatchResponse({ status: 403, body: { error: { code: "FORBIDDEN", message: "Device is revoked" } } })).toMatchObject({
      kind: "fatal",
      status: 403,
    });
    expect(decideBatchResponse({ status: 404, body: { error: { message: "Unknown device" } } })).toMatchObject({
      kind: "fatal",
      status: 404,
    });
  });

  it("backs off on throttling, server errors and other 4xx refusals", () => {
    expect(decideBatchResponse({ status: 429, body: {}, retryAfterMs: 12_000 })).toEqual({
      kind: "retry",
      code: "HTTP_429",
      message: "The sync service is temporarily unavailable.",
      retryAfterMs: 12_000,
    });
    expect(decideBatchResponse({ status: 503, body: { error: { message: "Upstream down" } } })).toMatchObject({
      kind: "retry",
      code: "HTTP_503",
      message: "Upstream down",
    });
    expect(decideBatchResponse({ status: 422, body: { error: { code: "UNPROCESSABLE" } } })).toMatchObject({ kind: "reject" });
    expect(decideBatchResponse({ status: 500, body: null })).toMatchObject({ kind: "retry", code: "HTTP_500" });
  });
});

describe("offline UI receipt routing", () => {
  it("routes reject receipts to terminal rows and keeps unmentioned rows retryable", () => {
    const accepted = queueItem({
      event: { idempotencyKey: randomUUID(), sessionId: SESSION, credential, clientTs: NOW.toISOString(), direction: "auto" },
    });
    const duplicate = queueItem({
      event: { idempotencyKey: randomUUID(), sessionId: SESSION, credential, clientTs: NOW.toISOString(), direction: "auto" },
    });
    const rejectedItem = queueItem({
      event: { idempotencyKey: randomUUID(), sessionId: SESSION, credential, clientTs: NOW.toISOString(), direction: "auto" },
    });
    const missing = queueItem({
      event: { idempotencyKey: randomUUID(), sessionId: SESSION, credential, clientTs: NOW.toISOString(), direction: "auto" },
    });

    const routing = routeReceipts(
      [
        receipt({ idempotencyKey: accepted.event.idempotencyKey, status: "accept" }),
        receipt({ idempotencyKey: duplicate.event.idempotencyKey, status: "duplicate" }),
        receipt({
          idempotencyKey: rejectedItem.event.idempotencyKey,
          status: "reject",
          reason: "unknown_session",
          message: "Session does not belong to this organization",
        }),
      ],
      [accepted, duplicate, rejectedItem, missing],
    );

    expect(routing.acknowledgedIds.sort()).toEqual([accepted.id, duplicate.id].sort());
    expect(routing.rejected).toEqual([
      { id: rejectedItem.id, reason: "unknown_session: Session does not belong to this organization" },
    ]);
    expect(routing.missingIds).toEqual([missing.id]);
  });
});

describe("offline UI backoff schedule", () => {
  it("matches the queue adapter's exponential schedule", () => {
    expect(retryDelayMs(0)).toBe(1_000);
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(4)).toBe(16_000);
    expect(retryDelayMs(5)).toBe(backoffDelayMs(5));
    expect(retryDelayMs(100)).toBe(MAX_BACKOFF_MS);
    expect(retryDelayMs(0.9)).toBe(1_000);
    expect(retryDelayMs(Number.NaN)).toBe(1_000);
  });

  it("adds bounded deterministic jitter from a stable per-item seed", () => {
    const first = retryDelayMs(0, undefined, "item-key-a");
    expect(first).toBe(retryDelayMs(0, undefined, "item-key-a"));
    expect(first).toBeGreaterThanOrEqual(1_000);
    expect(first).toBeLessThan(1_250);
    expect(retryDelayMs(100, undefined, "item-key-a")).toBe(MAX_BACKOFF_MS);

    const offsets = new Set(
      ["item-key-a", "item-key-b", "item-key-c", "item-key-d"].map((seed) =>
        retryDelayMs(0, undefined, seed),
      ),
    );
    expect(offsets.size).toBeGreaterThan(1);
  });

  it("honours Retry-After without exceeding the five-minute cap", () => {
    expect(retryDelayMs(0, 12_000)).toBe(12_000);
    expect(retryDelayMs(3, 1_000)).toBe(8_000);
    expect(retryDelayMs(0, 600_000)).toBe(MAX_BACKOFF_MS);
    expect(retryDelayMs(0, -5_000)).toBe(1_000);
    expect(retryDelayMs(0, Number.NaN)).toBe(1_000);
  });

  it("parses delta-seconds and HTTP-date Retry-After values", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter(" 0 ")).toBe(0);
    expect(parseRetryAfter("Sun, 08 Nov 2026 08:00:30 GMT", NOW_MS)).toBe(30_000);
    expect(parseRetryAfter("Sun, 08 Nov 2026 07:59:00 GMT", NOW_MS)).toBe(0);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe("offline UI device context validation", () => {
  it("accepts the 64-hex secret and trims pasted whitespace", () => {
    const parsed = parseDeviceContext(" dev_abc123 ", ` ${"a".repeat(64)} `);
    expect(parsed).toEqual({ ok: true, value: { deviceId: "dev_abc123", deviceSecret: "a".repeat(64) } });
  });

  it("rejects missing, short or non-hex secrets and oversized device ids", () => {
    expect(parseDeviceContext("", "a".repeat(64)).ok).toBe(false);
    expect(parseDeviceContext("dev_abc", "").ok).toBe(false);
    expect(parseDeviceContext("dev_abc", "abc123").ok).toBe(false);
    expect(parseDeviceContext("dev_abc", "z".repeat(64)).ok).toBe(false);
    expect(parseDeviceContext("x".repeat(121), "a".repeat(64)).ok).toBe(false);
  });
});
