import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import {
  AGE_AGING_MS,
  AGE_FRESH_MS,
  AGE_STALE_MS,
  DRIFT_BLOCK_MS,
  DRIFT_DANGER_MS,
  DRIFT_WARN_MS,
  MAX_CLOCK_DRIFT_MS,
  ageLabel,
  ageLevel,
  canSync,
  driftLabel,
  driftLevel,
  estimateClockDrift,
} from "../modules/offline/clock";
import { decideBatchResponse, parseServerTimeMs, readResponseClock, type BatchReceipt } from "../lib/sync-client";

// M2 offline clock policy: drift math, bands, bundle age and the additive
// serverTime mapping. These helpers are pure; no clock or network is touched
// except in the response-mapping helper, which receives both timestamps.

const SERVER_ISO = "1970-01-01T00:16:40.700Z"; // 1_000_700 ms
const SERVER_MS = Date.parse(SERVER_ISO);

function receipt(overrides: Partial<BatchReceipt> = {}): BatchReceipt {
  return {
    idempotencyKey: randomUUID(),
    sessionId: "session-clock",
    status: "accept",
    reason: "ok",
    ...overrides,
  };
}

describe("offline clock drift math", () => {
  it("estimates RTT and drift from the request midpoint", () => {
    // Fetch begins at 1_000_000, response headers arrive at 1_000_400:
    // midpoint 1_000_200. Server says 1_000_700, so the device is 500ms behind.
    expect(
      estimateClockDrift({
        deviceBeforeMs: 1_000_000,
        deviceAfterMs: 1_000_400,
        serverTimeMs: 1_000_700,
      }),
    ).toEqual({ rttMs: 400, driftMs: 500 });
  });

  it("reports a device that is ahead as negative drift", () => {
    expect(
      estimateClockDrift({
        deviceBeforeMs: 2_000_000,
        deviceAfterMs: 2_000_000,
        serverTimeMs: 1_998_500,
      }),
    ).toEqual({ rttMs: 0, driftMs: -1_500 });
  });

  it("uses the midpoint rather than the request start or end", () => {
    // The same server time looks 500ms off from `before` and 500ms off the
    // other way from `after`; only the midpoint yields zero drift.
    expect(
      estimateClockDrift({
        deviceBeforeMs: 3_000_000,
        deviceAfterMs: 3_001_000,
        serverTimeMs: 3_000_500,
      }),
    ).toEqual({ rttMs: 1_000, driftMs: 0 });
  });

  it("fails closed on NaN, missing, backwards or absurd samples", () => {
    const invalid = [
      { deviceBeforeMs: Number.NaN, deviceAfterMs: 1_000, serverTimeMs: 1_000 },
      { deviceBeforeMs: 1_000, deviceAfterMs: Number.NaN, serverTimeMs: 1_000 },
      { deviceBeforeMs: 1_000, deviceAfterMs: 1_000, serverTimeMs: Number.NaN },
      { deviceBeforeMs: undefined as unknown as number, deviceAfterMs: 1_000, serverTimeMs: 1_000 },
      { deviceBeforeMs: 2_000, deviceAfterMs: 1_000, serverTimeMs: 1_000 },
      { deviceBeforeMs: 1_000, deviceAfterMs: 1_000 + MAX_CLOCK_DRIFT_MS + 1, serverTimeMs: 1_000 },
    ];

    for (const input of invalid) {
      const estimate = estimateClockDrift(input);
      expect(Number.isFinite(estimate.driftMs)).toBe(false);
      expect(driftLevel(estimate.driftMs)).toBe("blocked");
      expect(canSync(estimate.driftMs)).toBe(false);
    }
  });

  it("clamps absurd finite offsets to the trust limit", () => {
    const estimate = estimateClockDrift({
      deviceBeforeMs: 1_000,
      deviceAfterMs: 1_000,
      serverTimeMs: Number.MAX_SAFE_INTEGER,
    });
    expect(estimate.rttMs).toBe(0);
    expect(estimate.driftMs).toBe(MAX_CLOCK_DRIFT_MS);
    expect(driftLevel(estimate.driftMs)).toBe("blocked");
  });
});

describe("offline clock drift bands", () => {
  it("applies the 30s, 5min and 10min thresholds to both directions", () => {
    expect(driftLevel(0)).toBe("ok");
    expect(driftLevel(-(DRIFT_WARN_MS - 1))).toBe("ok");
    expect(driftLevel(DRIFT_WARN_MS)).toBe("warn");
    expect(driftLevel(-DRIFT_WARN_MS)).toBe("warn");
    expect(driftLevel(DRIFT_DANGER_MS - 1)).toBe("warn");
    expect(driftLevel(DRIFT_DANGER_MS)).toBe("danger");
    expect(driftLevel(-DRIFT_DANGER_MS)).toBe("danger");
    expect(driftLevel(DRIFT_BLOCK_MS)).toBe("danger");
    expect(driftLevel(-DRIFT_BLOCK_MS)).toBe("danger");
    expect(driftLevel(DRIFT_BLOCK_MS + 1)).toBe("blocked");
    expect(driftLevel(-(DRIFT_BLOCK_MS + 1))).toBe("blocked");
    expect(driftLevel(Number.NaN)).toBe("blocked");
    expect(driftLevel(Number.POSITIVE_INFINITY)).toBe("blocked");
  });

  it("blocks sync only beyond the 10-minute server window", () => {
    expect(canSync(0)).toBe(true);
    expect(canSync(DRIFT_WARN_MS)).toBe(true);
    expect(canSync(DRIFT_DANGER_MS)).toBe(true);
    expect(canSync(DRIFT_BLOCK_MS)).toBe(true);
    expect(canSync(-DRIFT_BLOCK_MS)).toBe(true);
    expect(canSync(DRIFT_BLOCK_MS + 1)).toBe(false);
    expect(canSync(-(DRIFT_BLOCK_MS + 1))).toBe(false);
    expect(canSync(Number.NaN)).toBe(false);
  });

  it("labels the direction and the block state", () => {
    expect(driftLabel(0)).toBe("Device clock matches the server.");
    expect(driftLabel(DRIFT_WARN_MS)).toBe("Device clock is 30s behind the server.");
    expect(driftLabel(-DRIFT_DANGER_MS)).toBe("Device clock is 5m ahead of the server.");
    expect(driftLabel(DRIFT_BLOCK_MS + 1)).toBe(
      "Device clock is 10m 1s behind the server; drift over 10 minutes blocks syncing.",
    );
    expect(driftLabel(Number.NaN)).toContain("could not be verified");
    expect(driftLabel(Number.NaN)).toContain("blocked");
  });
});

describe("offline bundle age bands", () => {
  it("splits fresh, aging, stale and expired at 1h, 12h and 24h", () => {
    expect(ageLevel(0)).toBe("fresh");
    expect(ageLevel(AGE_FRESH_MS - 1)).toBe("fresh");
    expect(ageLevel(AGE_FRESH_MS)).toBe("aging");
    expect(ageLevel(AGE_AGING_MS - 1)).toBe("aging");
    expect(ageLevel(AGE_AGING_MS)).toBe("stale");
    expect(ageLevel(AGE_STALE_MS - 1)).toBe("stale");
    expect(ageLevel(AGE_STALE_MS)).toBe("expired");
    expect(ageLevel(AGE_STALE_MS * 2)).toBe("expired");
    expect(ageLevel(Number.NaN)).toBe("expired");
    expect(ageLevel(Number.POSITIVE_INFINITY)).toBe("expired");
  });

  it("clamps a future bundle timestamp to fresh", () => {
    expect(ageLevel(-5_000)).toBe("fresh");
    expect(ageLabel(-5_000)).toBe("Offline data was downloaded just now.");
  });

  it("labels the age and the action it implies", () => {
    expect(ageLabel(0)).toBe("Offline data was downloaded just now.");
    expect(ageLabel(AGE_FRESH_MS)).toBe("Offline data is 1h old; download a fresh bundle soon.");
    expect(ageLabel(AGE_AGING_MS)).toBe("Offline data is 12h old; verify it is still valid for this event.");
    expect(ageLabel(AGE_STALE_MS)).toBe("Offline data is 1d old; it is past the 24-hour limit.");
    expect(ageLabel(Number.NaN)).toContain("could not be verified");
    expect(ageLabel(Number.NaN)).toContain("expired");
  });
});

describe("offline sync clock mapping", () => {
  it("prefers the millisecond-precise body serverTime", () => {
    expect(readResponseClock({
      body: { data: { serverTime: SERVER_ISO } },
      dateHeader: "Thu, 01 Jan 1970 00:16:40 GMT",
      deviceBeforeMs: 1_000_000,
      deviceAfterMs: 1_000_400,
    })).toEqual({ serverTimeMs: SERVER_MS, driftMs: 500, rttMs: 400 });
  });

  it("falls back to the HTTP Date header when the body has no serverTime", () => {
    expect(readResponseClock({
      body: { data: { receipts: [] } },
      dateHeader: "Thu, 01 Jan 1970 00:16:40 GMT",
      deviceBeforeMs: 999_800,
      deviceAfterMs: 1_000_200,
    })).toEqual({ serverTimeMs: 1_000_000, driftMs: 0, rttMs: 400 });
  });

  it("ignores a malformed body value and still uses the header", () => {
    expect(parseServerTimeMs({ data: { serverTime: "not-a-timestamp" } }, "Thu, 01 Jan 1970 00:16:40 GMT")).toBe(
      1_000_000,
    );
  });

  it("leaves every clock field null when the response carries no server time", () => {
    expect(readResponseClock({
      body: { data: { receipts: [] } },
      dateHeader: null,
      deviceBeforeMs: 1_000_000,
      deviceAfterMs: 1_000_400,
    })).toEqual({ serverTimeMs: null, driftMs: null, rttMs: null });
    expect(parseServerTimeMs(null, undefined)).toBeNull();
    expect(parseServerTimeMs({ data: { serverTime: "" } }, "soon")).toBeNull();
  });

  it("keeps serverTimeMs but refuses to guess drift from invalid timings", () => {
    expect(readResponseClock({
      body: { data: { serverTime: SERVER_ISO } },
      dateHeader: null,
      deviceBeforeMs: Number.NaN,
      deviceAfterMs: 1_000_400,
    })).toEqual({ serverTimeMs: SERVER_MS, driftMs: null, rttMs: null });
  });
});

describe("offline sync decision table regression", () => {
  it("still acks a 200 when serverTime is added to the body", () => {
    const accept = receipt();
    const duplicate = receipt({ status: "duplicate", reason: "idempotency_key_seen" });
    const decision = decideBatchResponse({
      status: 200,
      body: {
        data: {
          batch: { accepted: 1, rejected: 0 },
          receipts: [accept, duplicate],
          serverTime: SERVER_ISO,
        },
      },
    });
    expect(decision).toEqual({ kind: "ack", receipts: [accept, duplicate] });
  });

  it("keeps the rest of the decision table unchanged", () => {
    expect(decideBatchResponse({ status: 200, body: { data: { serverTime: SERVER_ISO } } })).toMatchObject({
      kind: "retry",
      code: "malformed_response",
    });
    expect(
      decideBatchResponse({
        status: 409,
        body: { error: { code: "CONFLICT", details: { batchId: "batch-1" } } },
      }),
    ).toEqual({ kind: "replay", batchId: "batch-1" });
    expect(decideBatchResponse({ status: 400, body: { error: { code: "INVALID_INPUT" } } })).toMatchObject({
      kind: "reject",
      code: "INVALID_INPUT",
    });
    expect(decideBatchResponse({ status: 401, body: {} })).toMatchObject({ kind: "fatal", status: 401 });
    expect(decideBatchResponse({ status: 429, body: {}, retryAfterMs: 12_000 })).toEqual({
      kind: "retry",
      code: "HTTP_429",
      message: "The sync service is temporarily unavailable.",
      retryAfterMs: 12_000,
    });
  });
});
