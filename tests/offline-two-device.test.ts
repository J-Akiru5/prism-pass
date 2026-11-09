import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  decideScanTransition,
  type RecordSnapshot,
  type ScanEventType,
} from "../modules/attendance/scan-policy";
import { canSync, DRIFT_BLOCK_MS, estimateClockDrift } from "../modules/offline/clock";
import { classifyBatchItems } from "../modules/offline/classify";
import {
  batchReplayKey,
  deviceKeyHash,
  isBatchReplay,
  signBatch,
  verifyBatchSignature,
} from "../modules/offline/crypto";
import {
  MAX_BATCH_EVENTS,
  MAX_CLIENT_FUTURE_MS,
  MAX_OFFLINE_AGE_MS,
  MAX_SIGNATURE_SKEW_MS,
  validateBatch,
  type BatchPayload,
  type OfflineEventInput,
} from "../modules/offline/schema";
import { verifyCredentialHash } from "../modules/passes/credential";
import { hashCredential } from "../modules/passes/service";

// M2 two-device offline proof (M2-WS5).
//
// This branch has the server sync bundle route but no client-side bundle
// verifier module, so this test proves the M2 exit condition on the primitives
// that do exist: a bundle-shaped fixture (person-1 / pass-1 / two device
// secrets), cached-pass verification, batch signatures, `classifyBatchItems`,
// `decideScanTransition`, and an in-memory stand-in for the single
// `(organizationId, sessionId, personId)` attendance record. No database, no
// Next.js runtime, no clock reads.

const NOW_MS = Date.parse("2026-11-09T08:00:00.000Z");
const ORG = "org-two-device";
const SESSION = "session-offline-m2";
const POLICY = "policy-default";
const PERSON = "person-1";
const PASS_PUBLIC_ID = "pp_0000000000000001";
const PASS_SECRET = "c".repeat(64);
const CREDENTIAL = `PRISM1:${PASS_PUBLIC_ID}:${PASS_SECRET}`;
const DUPLICATE_WINDOW_MS = 120_000;
const DUPLICATE_WINDOW_SEC = DUPLICATE_WINDOW_MS / 1_000;
const RECORD_KEY = `${ORG}:${SESSION}:${PERSON}`;

type DeviceFixture = { devicePublicId: string; secret: string };

/**
 * A bundle in the shape returned by `GET /orgs/:orgId/sync-bundle` (verifier
 * hashes only, never QR secrets) plus the two registered device secrets. The
 * secrets stay on the "devices" side; only their hashes would be stored.
 */
function twoDeviceFixture() {
  return {
    bundle: {
      bundleVersion: 1,
      generatedAt: new Date(NOW_MS).toISOString(),
      organizationId: ORG,
      sessions: [
        {
          id: SESSION,
          title: "M2 two-device offline proof",
          type: "EVENT",
          startsAt: new Date(NOW_MS - 3_600_000).toISOString(),
          endsAt: new Date(NOW_MS + 3_600_000).toISOString(),
          timezone: "Asia/Manila",
          policyId: POLICY,
        },
      ],
      policies: [
        {
          id: POLICY,
          name: "Default",
          graceMin: 10,
          lateThresholdMin: 15,
          duplicateWindowSec: DUPLICATE_WINDOW_SEC,
          geoMode: "off",
        },
      ],
      geofences: [],
      passCache: [
        {
          passPublicId: PASS_PUBLIC_ID,
          passVersion: 1,
          statusAtSync: "ACTIVE" as const,
          expiresAt: null,
          personId: PERSON,
          credentialHash: hashCredential(PASS_PUBLIC_ID, PASS_SECRET),
        },
      ],
      limits: {
        maxBatchEvents: MAX_BATCH_EVENTS,
        maxClientFutureSkewMs: MAX_CLIENT_FUTURE_MS,
        maxOfflineAgeMs: MAX_OFFLINE_AGE_MS,
        signatureSkewMs: MAX_SIGNATURE_SKEW_MS,
      },
    },
    devices: [
      { devicePublicId: "dev_two_device_a", secret: "a1".repeat(32) },
      { devicePublicId: "dev_two_device_b", secret: "b2".repeat(32) },
    ] as DeviceFixture[],
  };
}

function offlineEvent(overrides: Partial<OfflineEventInput> = {}): OfflineEventInput {
  return {
    idempotencyKey: randomUUID(),
    sessionId: SESSION,
    credential: CREDENTIAL,
    clientTs: new Date(NOW_MS).toISOString(),
    direction: "auto",
    ...overrides,
  };
}

function signedBatch(
  device: DeviceFixture,
  events: OfflineEventInput[],
  overrides: Partial<Pick<BatchPayload, "batchId" | "sentAt">> = {},
) {
  const batch: BatchPayload = {
    organizationId: ORG,
    deviceId: device.devicePublicId,
    batchId: overrides.batchId ?? randomUUID(),
    clientVersion: "1.0.0",
    sentAt: overrides.sentAt ?? new Date(NOW_MS).toISOString(),
    events,
  };
  return { batch, signature: signBatch(batch, device.secret) };
}

/**
 * In-memory stand-in for the `AttendanceRecord` unique row. The real write is an
 * upsert on (organizationId, sessionId, personId), so keying a Map the same way
 * makes the "exactly one record" invariant explicit without a database.
 */
class TwoDeviceSession {
  readonly records = new Map<string, RecordSnapshot>();
  readonly events: { passId: string; eventType: ScanEventType; serverTsMs: number }[] = [];
  private latestAccepted: { passId: string; serverTsMs: number } | null = null;

  apply(input: {
    passId: string;
    requestedDirection: "auto" | "in" | "out";
    serverTsMs: number;
    duplicateWindowMs: number;
  }): ScanEventType {
    const transition = decideScanTransition({
      record: this.records.get(RECORD_KEY) ?? null,
      recentSamePassScan: this.latestAccepted,
      passId: input.passId,
      requestedDirection: input.requestedDirection,
      serverTsMs: input.serverTsMs,
      duplicateWindowMs: input.duplicateWindowMs,
    });

    if (transition.eventType !== "DUPLICATE_DETECTED") {
      this.records.set(RECORD_KEY, transition.record);
    }
    this.events.push({ passId: input.passId, eventType: transition.eventType, serverTsMs: input.serverTsMs });
    // scan-service queries the latest *accepted* event, and DUPLICATE_DETECTED
    // is accepted evidence, so a duplicate rolls the window forward too.
    this.latestAccepted = { passId: input.passId, serverTsMs: input.serverTsMs };
    return transition.eventType;
  }
}

describe("M2 two-device offline proof", () => {
  it("verifies the cached pass and both device signatures from the bundle fixture", () => {
    const { bundle, devices } = twoDeviceFixture();
    const cached = bundle.passCache[0];

    expect(verifyCredentialHash(PASS_PUBLIC_ID, PASS_SECRET, cached.credentialHash)).toBe(true);
    expect(verifyCredentialHash(PASS_PUBLIC_ID, "d".repeat(64), cached.credentialHash)).toBe(false);

    for (const device of devices) {
      const { batch, signature } = signedBatch(device, [offlineEvent()]);
      expect(validateBatch(batch, { now: new Date(NOW_MS) }).ok).toBe(true);
      expect(verifyBatchSignature({ batch, secretHash: deviceKeyHash(device.secret), signature })).toBe(true);

      const other = devices.find((candidate) => candidate.devicePublicId !== device.devicePublicId)!;
      expect(verifyBatchSignature({ batch, secretHash: deviceKeyHash(other.secret), signature })).toBe(false);
    }
  });

  it("inside the window: one CHECK_IN + one DUPLICATE_DETECTED, never a second record", () => {
    const { bundle, devices } = twoDeviceFixture();
    const [deviceA, deviceB] = devices;
    const session = new TwoDeviceSession();
    const windowMs = bundle.policies[0].duplicateWindowSec * 1_000;
    const keyA = randomUUID();
    const keyB = randomUUID();

    // Two devices, two independent queues, distinct idempotency keys, the same
    // cached credential.
    const batchA = signedBatch(deviceA, [
      offlineEvent({ idempotencyKey: keyA, clientTs: new Date(NOW_MS).toISOString() }),
    ]);
    const batchB = signedBatch(deviceB, [
      offlineEvent({ idempotencyKey: keyB, clientTs: new Date(NOW_MS + 20_000).toISOString() }),
    ], { sentAt: new Date(NOW_MS + 30_000).toISOString() });
    expect(keyA).not.toBe(keyB);

    for (const { batch } of [batchA, batchB]) {
      const decisions = classifyBatchItems({
        events: batch.events,
        existingKeys: new Set<string>(),
        knownSessionIds: new Set([SESSION]),
        now: new Date(NOW_MS + 60_000),
      });
      expect(decisions).toMatchObject([{ status: "accept", reason: "ok" }]);
    }

    // Device A reaches the server first; device B syncs 30s later.
    expect(
      session.apply({ passId: PASS_PUBLIC_ID, requestedDirection: "auto", serverTsMs: NOW_MS, duplicateWindowMs: windowMs }),
    ).toBe("CHECK_IN");
    expect(
      session.apply({
        passId: PASS_PUBLIC_ID,
        requestedDirection: "auto",
        serverTsMs: NOW_MS + 30_000,
        duplicateWindowMs: windowMs,
      }),
    ).toBe("DUPLICATE_DETECTED");

    expect(session.events.map((event) => event.eventType)).toEqual(["CHECK_IN", "DUPLICATE_DETECTED"]);
    expect(session.records.size).toBe(1);
    expect(session.records.get(RECORD_KEY)).toEqual({
      checkInAtMs: NOW_MS,
      checkOutAtMs: null,
      checkInPassId: PASS_PUBLIC_ID,
    });
  });

  it("after the window: the second scan becomes CHECK_OUT on the same record", () => {
    const { bundle } = twoDeviceFixture();
    const session = new TwoDeviceSession();
    const windowMs = bundle.policies[0].duplicateWindowSec * 1_000;

    expect(
      session.apply({ passId: PASS_PUBLIC_ID, requestedDirection: "auto", serverTsMs: NOW_MS, duplicateWindowMs: windowMs }),
    ).toBe("CHECK_IN");

    // Intended semantics: the duplicate window debounces re-scans of one person
    // at one session; it is not a new visit. Once the window lapses the same
    // pass checks out of the one record created by the first device.
    const checkoutAt = NOW_MS + windowMs + 1;
    expect(
      session.apply({
        passId: PASS_PUBLIC_ID,
        requestedDirection: "auto",
        serverTsMs: checkoutAt,
        duplicateWindowMs: windowMs,
      }),
    ).toBe("CHECK_OUT");
    expect(session.records.size).toBe(1);
    expect(session.records.get(RECORD_KEY)).toEqual({
      checkInAtMs: NOW_MS,
      checkOutAtMs: checkoutAt,
      checkInPassId: PASS_PUBLIC_ID,
    });

    // A further post-window scan is another CHECK_OUT on the same row (latest
    // check-out wins); it never creates a second attendance record.
    const laterCheckoutAt = checkoutAt + windowMs + 1;
    expect(
      session.apply({
        passId: PASS_PUBLIC_ID,
        requestedDirection: "auto",
        serverTsMs: laterCheckoutAt,
        duplicateWindowMs: windowMs,
      }),
    ).toBe("CHECK_OUT");
    expect(session.records.size).toBe(1);
    expect(session.records.get(RECORD_KEY)?.checkOutAtMs).toBe(laterCheckoutAt);
  });

  it("the duplicate window boundary is inclusive, matching the SQL gte predicate", () => {
    const record: RecordSnapshot = {
      checkInAtMs: NOW_MS,
      checkOutAtMs: null,
      checkInPassId: PASS_PUBLIC_ID,
    };
    const scan = (serverTsMs: number) =>
      decideScanTransition({
        record,
        recentSamePassScan: { passId: PASS_PUBLIC_ID, serverTsMs: NOW_MS },
        passId: PASS_PUBLIC_ID,
        requestedDirection: "auto",
        serverTsMs,
        duplicateWindowMs: DUPLICATE_WINDOW_MS,
      });

    expect(scan(NOW_MS + DUPLICATE_WINDOW_MS).eventType).toBe("DUPLICATE_DETECTED");
    expect(scan(NOW_MS + DUPLICATE_WINDOW_MS + 1).eventType).toBe("CHECK_OUT");

    // A different pass inside the window is not a duplicate: the current query
    // compares the latest accepted scan's pass id, then resolves direction.
    const otherPass = decideScanTransition({
      record,
      recentSamePassScan: { passId: "pp_0000000000000002", serverTsMs: NOW_MS + 1_000 },
      passId: PASS_PUBLIC_ID,
      requestedDirection: "auto",
      serverTsMs: NOW_MS + 2_000,
      duplicateWindowMs: DUPLICATE_WINDOW_MS,
    });
    expect(otherPass.eventType).toBe("CHECK_OUT");

    // Explicit direction still wins over the snapshot, as resolveDirection does.
    expect(
      decideScanTransition({
        record,
        recentSamePassScan: null,
        passId: PASS_PUBLIC_ID,
        requestedDirection: "in",
        serverTsMs: NOW_MS + 2_000,
        duplicateWindowMs: DUPLICATE_WINDOW_MS,
      }).eventType,
    ).toBe("CHECK_IN");

    // The helper is pure: it neither mutates the input snapshot nor fabricates
    // a check-in for an explicit check-out.
    expect(record).toEqual({ checkInAtMs: NOW_MS, checkOutAtMs: null, checkInPassId: PASS_PUBLIC_ID });
    expect(
      decideScanTransition({
        record: null,
        recentSamePassScan: null,
        passId: PASS_PUBLIC_ID,
        requestedDirection: "out",
        serverTsMs: NOW_MS,
        duplicateWindowMs: DUPLICATE_WINDOW_MS,
      }).record,
    ).toEqual({ checkInAtMs: null, checkOutAtMs: NOW_MS, checkInPassId: null });
  });

  it("dedupes a replayed batch or event with the existing classify and replay helpers", () => {
    const { devices } = twoDeviceFixture();
    const key = randomUUID();
    const { batch, signature } = signedBatch(devices[0], [offlineEvent({ idempotencyKey: key })]);

    // Event-level replay: the idempotency key is already persisted.
    expect(
      classifyBatchItems({
        events: batch.events,
        existingKeys: new Set([key]),
        knownSessionIds: new Set([SESSION]),
        now: new Date(NOW_MS),
      }),
    ).toMatchObject([{ status: "duplicate", reason: "idempotency_key_seen" }]);

    // A key repeated inside one batch applies once (the first occurrence).
    expect(
      classifyBatchItems({
        events: [offlineEvent({ idempotencyKey: key }), offlineEvent({ idempotencyKey: key })],
        existingKeys: new Set<string>(),
        knownSessionIds: new Set([SESSION]),
        now: new Date(NOW_MS),
      }).map((decision) => [decision.status, decision.reason]),
    ).toEqual([
      ["accept", "ok"],
      ["duplicate", "duplicate_in_batch"],
    ]);

    // Batch-level replay: the server keeps one receipt per (org, batchId), and
    // the same batch id under another org is a different batch.
    const replayKeys = new Set<string>();
    expect(isBatchReplay(replayKeys, ORG, batch.batchId)).toBe(false);
    replayKeys.add(batchReplayKey(ORG, batch.batchId));
    expect(isBatchReplay(replayKeys, ORG, batch.batchId)).toBe(true);
    expect(isBatchReplay(replayKeys, "org-other", batch.batchId)).toBe(false);
    expect(signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps clock-future and drift boundaries to the expected rejections", () => {
    const now = new Date(NOW_MS);
    const eventAt = (offsetMs: number) => offlineEvent({ clientTs: new Date(NOW_MS + offsetMs).toISOString() });
    const classifyOne = (offsetMs: number) =>
      classifyBatchItems({
        events: [eventAt(offsetMs)],
        existingKeys: new Set<string>(),
        knownSessionIds: new Set([SESSION]),
        now,
      })[0];

    // Per-item future skew: exactly the limit is accepted, one ms more rejects.
    expect(classifyOne(MAX_CLIENT_FUTURE_MS)).toMatchObject({ status: "accept", reason: "ok" });
    expect(classifyOne(MAX_CLIENT_FUTURE_MS + 1)).toMatchObject({ status: "reject", reason: "clock_future" });

    // Whole-batch signature window: the same boundary decides the batch.
    const device = twoDeviceFixture().devices[0];
    const atLimit = signedBatch(device, [eventAt(0)], {
      sentAt: new Date(NOW_MS + MAX_SIGNATURE_SKEW_MS).toISOString(),
    });
    const overLimit = signedBatch(device, [eventAt(0)], {
      sentAt: new Date(NOW_MS + MAX_SIGNATURE_SKEW_MS + 1).toISOString(),
    });
    expect(validateBatch(atLimit.batch, { now }).ok).toBe(true);
    expect(validateBatch(overLimit.batch, { now })).toMatchObject({
      ok: false,
      issues: [{ code: "timestamp_future" }],
    });

    // The scanner's advisory gate mirrors that window: >10 minutes is blocked,
    // exactly 10 minutes is still dangerous-but-syncable.
    expect(DRIFT_BLOCK_MS).toBe(MAX_SIGNATURE_SKEW_MS);
    expect(canSync(-DRIFT_BLOCK_MS)).toBe(true);
    expect(canSync(-(DRIFT_BLOCK_MS + 1))).toBe(false);

    const deviceAhead = estimateClockDrift({
      deviceBeforeMs: NOW_MS,
      deviceAfterMs: NOW_MS,
      serverTimeMs: NOW_MS - DRIFT_BLOCK_MS - 1,
    });
    expect(deviceAhead.driftMs).toBe(-(DRIFT_BLOCK_MS + 1));
    expect(canSync(deviceAhead.driftMs)).toBe(false);
  });
});
