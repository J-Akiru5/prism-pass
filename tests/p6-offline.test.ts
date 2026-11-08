import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  batchReplayKey,
  canonicalBatchPayload,
  deviceKeyHash,
  generateDeviceKey,
  isBatchReplay,
  secureCompareHex,
  signBatch,
  verifyBatchSignature,
} from "../modules/offline/crypto";
import {
  MAX_BATCH_EVENTS,
  MAX_SIGNATURE_SKEW_MS,
  validateBatch,
  type BatchPayload,
  type OfflineEventInput,
} from "../modules/offline/schema";
import { classifyBatchItems, summarizeDecisions } from "../modules/offline/classify";
import { backoffDelayMs, isDue, markAcked, markFailed, markInflight, newQueueRecord } from "../modules/offline/queue-state";
import { deviceSyncRejection, evaluateDeviceRevocation } from "../modules/devices/revocation";

const NOW = new Date("2026-11-08T08:00:00.000Z");
const NOW_MS = NOW.getTime();
const ORG = "org-p6";
const SESSION = "session-p6";
const BATCH_ID = "22222222-2222-4222-8222-222222222222";

const credential = `PRISM1:pass_abc:${"a".repeat(64)}`;

function event(overrides: Partial<OfflineEventInput> = {}): OfflineEventInput {
  return {
    idempotencyKey: randomUUID(),
    sessionId: SESSION,
    credential,
    clientTs: new Date(NOW_MS - 60_000).toISOString(),
    direction: "auto",
    ...overrides,
  };
}

function batch(overrides: Partial<BatchPayload> = {}): BatchPayload {
  return {
    organizationId: ORG,
    deviceId: "dev_abc123",
    batchId: BATCH_ID,
    clientVersion: "1.0.0",
    sentAt: NOW.toISOString(),
    events: [event()],
    ...overrides,
  };
}

describe("P6 device keys and HMAC signing", () => {
  it("generates an identity and stores only a deterministic hash of the secret", () => {
    const key = generateDeviceKey();
    expect(key.devicePublicId).toMatch(/^dev_[a-f0-9]{24}$/);
    expect(key.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(deviceKeyHash(key.secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(deviceKeyHash(key.secret)).not.toBe(key.secret);
    expect(deviceKeyHash(key.secret)).toBe(deviceKeyHash(key.secret));
  });

  it("accepts a signature over the canonical payload", () => {
    const key = generateDeviceKey();
    const payload = batch();
    const signature = signBatch(payload, key.secret);
    expect(verifyBatchSignature({ batch: payload, secretHash: deviceKeyHash(key.secret), signature })).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const key = generateDeviceKey();
    const payload = batch();
    const signature = signBatch(payload, key.secret);
    const tampered: BatchPayload = {
      ...payload,
      events: [{ ...payload.events[0], credential: credential.replace("aaaa", "bbbb") }],
    };
    expect(verifyBatchSignature({ batch: tampered, secretHash: deviceKeyHash(key.secret), signature })).toBe(false);
  });

  it("rejects a signature made with a different device key", () => {
    const registered = generateDeviceKey();
    const attacker = generateDeviceKey();
    const payload = batch();
    const attackerSignature = signBatch(payload, attacker.secret);
    expect(
      verifyBatchSignature({ batch: payload, secretHash: deviceKeyHash(registered.secret), signature: attackerSignature }),
    ).toBe(false);
  });

  it("compares signatures in constant time and refuses malformed hex", () => {
    const key = generateDeviceKey();
    const signature = signBatch(batch(), key.secret);
    expect(secureCompareHex(signature, signature)).toBe(true);
    expect(secureCompareHex(signature, signature.slice(0, -2) + "00")).toBe(false);
    expect(secureCompareHex("ab", "abcd")).toBe(false);
    expect(secureCompareHex("zz", "zz")).toBe(false);
  });

  it("canonicalizes deterministically and binds org, device and batch id", () => {
    const payload = batch();
    expect(canonicalBatchPayload(payload)).toBe(canonicalBatchPayload({ ...payload }));
    expect(canonicalBatchPayload(payload)).toContain(`org:${ORG}`);
    expect(canonicalBatchPayload(payload)).not.toBe(canonicalBatchPayload({ ...payload, organizationId: "org-other" }));
    expect(canonicalBatchPayload(payload)).not.toBe(canonicalBatchPayload({ ...payload, deviceId: "dev_other" }));
  });
});

describe("P6 batch validation", () => {
  it("accepts a fresh, ordered batch", () => {
    const result = validateBatch(batch(), { now: NOW });
    expect(result.ok).toBe(true);
  });

  it("rejects a stale sentAt and a future sentAt", () => {
    const stale = validateBatch(
      batch({ sentAt: new Date(NOW_MS - MAX_SIGNATURE_SKEW_MS - 1_000).toISOString() }),
      { now: NOW },
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.issues[0].code).toBe("timestamp_stale");

    const future = validateBatch(
      batch({ sentAt: new Date(NOW_MS + MAX_SIGNATURE_SKEW_MS + 1_000).toISOString() }),
      { now: NOW },
    );
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.issues[0].code).toBe("timestamp_future");
  });

  it("rejects an empty batch and an oversized batch", () => {
    const empty = validateBatch(batch({ events: [] }), { now: NOW });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.issues[0].code).toBe("empty_batch");

    const oversized = validateBatch(
      batch({ events: Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => event()) }),
      { now: NOW },
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.issues[0].code).toBe("batch_too_large");
  });

  it("rejects a backwards clientTs inside one batch", () => {
    const result = validateBatch(
      batch({
        events: [
          event({ clientTs: new Date(NOW_MS - 10_000).toISOString() }),
          event({ clientTs: new Date(NOW_MS - 20_000).toISOString() }),
        ],
      }),
      { now: NOW },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].code).toBe("clock_out_of_order");
      expect(result.issues[0].index).toBe(1);
    }
  });

  it("rejects malformed item shapes", () => {
    const result = validateBatch(batch({ events: [{ ...event(), idempotencyKey: "not-a-uuid" }] }), { now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].code).toBe("invalid_shape");
  });
});

describe("P6 replay and idempotency", () => {
  it("detects a replayed batch id per organisation", () => {
    const seen = new Set<string>();
    expect(isBatchReplay(seen, ORG, BATCH_ID)).toBe(false);
    seen.add(batchReplayKey(ORG, BATCH_ID));
    expect(isBatchReplay(seen, ORG, BATCH_ID)).toBe(true);
    expect(isBatchReplay(seen, "org-other", BATCH_ID)).toBe(false);
  });

  it("classifies an already-recorded idempotency key as duplicate", () => {
    const item = event();
    const [decision] = classifyBatchItems({
      events: [item],
      existingKeys: new Set([item.idempotencyKey]),
      knownSessionIds: new Set([SESSION]),
      now: NOW,
    });
    expect(decision.status).toBe("duplicate");
    expect(decision.reason).toBe("idempotency_key_seen");
  });

  it("applies only the first occurrence of a repeated key in one batch", () => {
    const first = event();
    const second = { ...event(), idempotencyKey: first.idempotencyKey };
    const decisions = classifyBatchItems({
      events: [first, second],
      existingKeys: new Set(),
      knownSessionIds: new Set([SESSION]),
      now: NOW,
    });
    expect(decisions.map((d) => d.status)).toEqual(["accept", "duplicate"]);
    expect(decisions[1].reason).toBe("duplicate_in_batch");
    expect(summarizeDecisions(decisions)).toEqual({ accepted: 1, duplicates: 1, rejected: 0 });
  });

  it("reports explicit per-item rejection reasons without Prisma", () => {
    const decisions = classifyBatchItems({
      events: [
        event(),
        event({ sessionId: "session-other" }),
        event({ clientTs: new Date(NOW_MS + 10 * 60_000).toISOString() }),
        event({ clientTs: new Date(NOW_MS - 31 * 24 * 60 * 60_000).toISOString() }),
      ],
      existingKeys: new Set(),
      knownSessionIds: new Set([SESSION]),
      now: NOW,
    });
    expect(decisions[0]).toMatchObject({ status: "accept", reason: "ok" });
    expect(decisions[1]).toMatchObject({ status: "reject", reason: "unknown_session" });
    expect(decisions[2]).toMatchObject({ status: "reject", reason: "clock_future" });
    expect(decisions[3]).toMatchObject({ status: "reject", reason: "clock_too_old" });
    expect(summarizeDecisions(decisions)).toEqual({ accepted: 1, duplicates: 0, rejected: 3 });
  });

  it("rejects an item whose clientTs moves backwards", () => {
    const decisions = classifyBatchItems({
      events: [
        event({ clientTs: new Date(NOW_MS - 10_000).toISOString() }),
        event({ clientTs: new Date(NOW_MS - 20_000).toISOString() }),
      ],
      existingKeys: new Set(),
      knownSessionIds: new Set([SESSION]),
      now: NOW,
    });
    expect(decisions.map((d) => d.reason)).toEqual(["ok", "clock_out_of_order"]);
  });
});

describe("P6 client queue state", () => {
  it("moves a new record through pending → inflight → failed → backoff", () => {
    const record = newQueueRecord("key-1", NOW_MS);
    expect(record).toMatchObject({ state: "pending", attempts: 0, lastError: null });
    expect(isDue(record, NOW_MS)).toBe(true);

    const inflight = markInflight(record);
    expect(inflight.state).toBe("inflight");
    expect(isDue(inflight, NOW_MS)).toBe(false);

    const failed = markFailed(record, "network", NOW_MS);
    expect(failed).toMatchObject({ state: "failed", attempts: 1, lastError: "network" });
    expect(failed.nextAttemptAt).toBe(NOW_MS + 1_000);
    expect(isDue(failed, NOW_MS + 999)).toBe(false);
    expect(isDue(failed, NOW_MS + 1_000)).toBe(true);

    const retried = markFailed(failed, "timeout", NOW_MS + 1_000);
    expect(retried.attempts).toBe(2);
    expect(retried.nextAttemptAt).toBe(NOW_MS + 1_000 + 2_000);
    expect(retried.lastError).toBe("timeout");
  });

  it("caps exponential backoff and resets on acknowledgement", () => {
    expect(backoffDelayMs(0)).toBe(1_000);
    expect(backoffDelayMs(1)).toBe(2_000);
    expect(backoffDelayMs(3)).toBe(8_000);
    expect(backoffDelayMs(100)).toBe(300_000);
    const failed = markFailed(newQueueRecord("key-2", NOW_MS), "network", NOW_MS);
    expect(markAcked(failed)).toMatchObject({ state: "pending", attempts: 0, lastError: null });
  });
});

describe("P6 device revocation admission", () => {
  it("rejects a revoked device with DEVICE_REVOKED, not a generic FORBIDDEN", () => {
    const rejection = deviceSyncRejection({ revokedAt: NOW, secretHash: "a".repeat(64) });
    expect(rejection?.code).toBe("DEVICE_REVOKED");
    expect(rejection?.status).toBe(403);
    expect(rejection?.reason).toBe("device_revoked");
  });

  it("keeps revocation idempotent and preserves the first timestamp", () => {
    const first = evaluateDeviceRevocation({ revokedAt: null }, NOW);
    const again = evaluateDeviceRevocation({ revokedAt: first.revokedAt }, new Date(NOW_MS + 86_400_000));
    expect(first.already).toBe(false);
    expect(again.already).toBe(true);
    expect(again.revokedAt).toBe(NOW);
  });
});
