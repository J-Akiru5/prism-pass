import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SCANNER_BUNDLE_VERSION,
  emptyBundleTruncated,
  type BundleRevocation,
  type BundleRosterEntry,
  type ScannerBundle,
} from "../modules/offline/bundle-schema";
import {
  canonicalBundlePayload,
  type BundleSignable,
} from "../modules/offline/canonical-bundle";
import { AGE_STALE_MS } from "../modules/offline/clock";
import { deviceKeyHash } from "../modules/offline/crypto";
import {
  verifyOffline,
  type OfflineCachedBundle,
  type OfflineVerdict,
  type VerifyOfflineInput,
} from "../modules/offline/verify-offline";

// The bundle fixture is signed with real Node crypto, mirroring the server
// signer. The verifier under test uses WebCrypto, so the test proves both
// implementations produce the same HMAC and credential hash.
//
// The scanner's own bundle client test covers download/cache; this file is the
// pure on-device decision table.

const NOW_MS = Date.parse("2026-11-09T08:00:00.000Z");
const NOW_MONO_MS = 5_000_000;
const RECEIVED_MONO_MS = NOW_MONO_MS - 60_000;

const SECRET = "a".repeat(64);
const OTHER_DEVICE_SECRET = "f".repeat(64);
const ORG = "org-verify";
const SESSION = "session-verify";
const OTHER_SESSION = "session-verify-other";
const DEVICE = "dev_verify";
const PASS_ID = "pass_public_1";
const PASS_SECRET = "b".repeat(64);
const CREDENTIAL = `PRISM1:${PASS_ID}:${PASS_SECRET}`;
const PASS_SECRET_V2 = "d".repeat(64);
const CREDENTIAL_V2 = `PRISM1:${PASS_ID}:${PASS_SECRET_V2}`;

const LIMITS = {
  maxBatchEvents: 500,
  maxClientFutureSkewMs: 300_000,
  maxOfflineAgeMs: 30 * 24 * 60 * 60_000,
  signatureSkewMs: 600_000,
  maxSessions: 500,
  maxRosterEntries: 5_000,
  maxPasses: 5_000,
  maxPolicies: 500,
  maxGeofences: 500,
  maxRevocations: 5_000,
} as const;

function hashCredential(passPublicId: string, secret: string): string {
  return createHash("sha256").update(`${passPublicId}:${secret}`).digest("hex");
}

function rosterEntry(overrides: Partial<BundleRosterEntry> = {}): BundleRosterEntry {
  return {
    sessionId: SESSION,
    personId: "person-1",
    displayName: "Ada Lovelace",
    passPublicId: PASS_ID,
    passVersion: 1,
    credentialHash: hashCredential(PASS_ID, PASS_SECRET),
    expiresAt: "2027-01-01T00:00:00.000Z",
    personStatus: "active",
    rosterState: "listed",
    ...overrides,
  };
}

function revocation(passPublicId: string, passVersion: number): BundleRevocation {
  return {
    passPublicId,
    passVersion,
    revokedAt: new Date(NOW_MS - 3_600_000).toISOString(),
  };
}

function baseUnsigned(): BundleSignable {
  return {
    bundleVersion: SCANNER_BUNDLE_VERSION,
    generatedAt: new Date(NOW_MS - 60_000).toISOString(),
    serverTime: new Date(NOW_MS - 59_800).toISOString(),
    organizationId: ORG,
    sessionIds: [SESSION],
    sessions: [
      {
        id: SESSION,
        title: "Doors",
        type: "EVENT",
        startsAt: new Date(NOW_MS - 3_600_000).toISOString(),
        endsAt: new Date(NOW_MS + 7_200_000).toISOString(),
        timezone: "Asia/Manila",
        policyId: "policy-1",
        status: "OPEN",
        closedAt: null,
        rosterEnforced: true,
        walkInAllowed: false,
      },
    ],
    policies: [
      {
        id: "policy-1",
        name: "Default",
        graceMin: 10,
        lateThresholdMin: 15,
        duplicateWindowSec: 120,
        geoMode: "flag",
      },
    ],
    geofences: [
      { id: "geo-1", label: "Main hall", centerLat: 14.5, centerLng: 121, radiusM: 100 },
    ],
    roster: [rosterEntry()],
    revocations: [],
    passCache: [],
    truncated: emptyBundleTruncated(),
    limits: LIMITS,
    deviceId: DEVICE,
  };
}

function signUnsigned(unsigned: BundleSignable, secret = SECRET): string {
  return createHmac("sha256", deviceKeyHash(secret))
    .update(canonicalBundlePayload(unsigned), "utf8")
    .digest("hex");
}

type Fixture = {
  /** Signed bundle fields; values are not narrowed so version/org tests can override. */
  bundle?: Record<string, unknown>;
  cache?: Partial<OfflineCachedBundle>;
  signWith?: string;
  /** `null` produces a legacy unsigned bundle. */
  signature?: string | null;
};

function makeCachedBundle(fixture: Fixture = {}): OfflineCachedBundle {
  const unsigned = {
    ...baseUnsigned(),
    ...(fixture.bundle ?? {}),
  } as unknown as BundleSignable;
  const bundleSignature =
    fixture.signature === null
      ? null
      : (fixture.signature ?? signUnsigned(unsigned, fixture.signWith ?? SECRET));
  const bundle = { ...unsigned, bundleSignature } as unknown as ScannerBundle;

  return {
    bundle,
    generatedAt: unsigned.generatedAt,
    receivedAt: NOW_MS - 60_000,
    receivedAtMonoMs: RECEIVED_MONO_MS,
    serverTime: unsigned.serverTime,
    sessionId: SESSION,
    ...(fixture.cache ?? {}),
  };
}

function verifyFixture(overrides: Partial<VerifyOfflineInput> = {}): Promise<OfflineVerdict> {
  return verifyOffline({
    credential: CREDENTIAL,
    cachedBundle: makeCachedBundle(),
    expectedOrganizationId: ORG,
    deviceSecret: SECRET,
    nowMs: NOW_MS,
    nowMonoMs: NOW_MONO_MS,
    ...overrides,
  });
}

describe("verifyOffline bundle and signature gates", () => {
  it("admits an active roster pass from a correctly signed bundle", async () => {
    const verdict = await verifyFixture();

    expect(verdict).toEqual({
      verdict: "VALID",
      personId: "person-1",
      displayName: "Ada Lovelace",
      expiresAt: "2027-01-01T00:00:00.000Z",
      bundleAgeMs: 60_000,
      stale: false,
      provisional: true,
    });
    expect(Object.keys(verdict).sort()).toEqual([
      "bundleAgeMs",
      "displayName",
      "expiresAt",
      "personId",
      "provisional",
      "stale",
      "verdict",
    ]);
  });

  it("refuses a bundle whose signed roster changed after signing", async () => {
    const cached = makeCachedBundle();
    const tampered: OfflineCachedBundle = {
      ...cached,
      bundle: {
        ...cached.bundle,
        roster: [{ ...cached.bundle.roster[0], displayName: "Mallory" }],
      },
    };

    expect(await verifyFixture({ cachedBundle: tampered })).toEqual({
      verdict: "BUNDLE_TAMPERED",
    });
  });

  it("refuses a bundle signed by another device", async () => {
    const cached = makeCachedBundle({ signWith: OTHER_DEVICE_SECRET });
    expect(await verifyFixture({ cachedBundle: cached })).toEqual({
      verdict: "BUNDLE_TAMPERED",
    });
  });

  it("refuses a missing device secret and a legacy unsigned bundle", async () => {
    expect(await verifyFixture({ deviceSecret: "" })).toEqual({ verdict: "BUNDLE_TAMPERED" });
    expect(await verifyFixture({ deviceSecret: "   " })).toEqual({
      verdict: "BUNDLE_TAMPERED",
    });
    expect(await verifyFixture({ cachedBundle: makeCachedBundle({ signature: null }) })).toEqual({
      verdict: "BUNDLE_TAMPERED",
    });
  });

  it("returns BUNDLE_MISSING when no cached bundle is available", async () => {
    expect(await verifyFixture({ cachedBundle: null })).toEqual({ verdict: "BUNDLE_MISSING" });
    expect(await verifyFixture({ cachedBundle: undefined })).toEqual({
      verdict: "BUNDLE_MISSING",
    });
  });

  it("returns BUNDLE_UNSUPPORTED for an unknown bundle version", async () => {
    const cached = makeCachedBundle({ bundle: { bundleVersion: 3 } });
    expect(await verifyFixture({ cachedBundle: cached })).toEqual({
      verdict: "BUNDLE_UNSUPPORTED",
    });
  });

  it("refuses a signed bundle from another organization", async () => {
    const cached = makeCachedBundle({ bundle: { organizationId: "org-other" } });
    expect(await verifyFixture({ cachedBundle: cached })).toEqual({
      verdict: "BUNDLE_UNSUPPORTED",
    });
  });

  it("refuses a bundle not scoped to the cached session", async () => {
    expect(
      await verifyFixture({ cachedBundle: makeCachedBundle({ cache: { sessionId: OTHER_SESSION } }) }),
    ).toEqual({ verdict: "BUNDLE_UNSUPPORTED" });
    expect(
      await verifyFixture({ cachedBundle: makeCachedBundle({ cache: { sessionId: null } }) }),
    ).toEqual({ verdict: "BUNDLE_UNSUPPORTED" });
  });

  it("returns INVALID_FORMAT for malformed credentials after the bundle verifies", async () => {
    for (const credential of ["", "not-a-credential", `PRISM1:${PASS_ID}:short`, `${CREDENTIAL}\n`]) {
      expect(await verifyFixture({ credential })).toEqual({ verdict: "INVALID_FORMAT" });
    }
  });
});

describe("verifyOffline roster and credential decisions", () => {
  it("returns NOT_LISTED for a pass that is not in the bundle", async () => {
    const verdict = await verifyFixture({
      credential: `PRISM1:pass_unknown:${"c".repeat(64)}`,
    });

    expect(verdict).toEqual({ verdict: "NOT_LISTED", reason: "unknown_pass" });
  });

  it("keeps an unlisted revoked pass indistinguishable from an unknown pass", async () => {
    const cached = makeCachedBundle({
      bundle: { revocations: [revocation("pass_unknown", 1)] },
    });
    const verdict = await verifyFixture({
      cachedBundle: cached,
      credential: `PRISM1:pass_unknown:${"c".repeat(64)}`,
    });

    expect(verdict).toEqual({ verdict: "NOT_LISTED", reason: "unknown_pass" });
  });

  it("distinguishes a pass listed for another session as not_on_roster", async () => {
    const cached = makeCachedBundle({
      bundle: {
        sessionIds: [SESSION, OTHER_SESSION],
        roster: [rosterEntry({ sessionId: OTHER_SESSION })],
      },
    });

    expect(await verifyFixture({ cachedBundle: cached })).toEqual({
      verdict: "NOT_LISTED",
      reason: "not_on_roster",
    });
  });

  it("refuses a wrong credential secret under a listed pass id", async () => {
    const verdict = await verifyFixture({
      credential: `PRISM1:${PASS_ID}:${"e".repeat(64)}`,
    });

    expect(verdict).toEqual({ verdict: "INVALID_CREDENTIAL" });
  });

  it("refuses a revocation entry for the roster version", async () => {
    const cached = makeCachedBundle({
      bundle: { revocations: [revocation(PASS_ID, 1)] },
    });

    expect(await verifyFixture({ cachedBundle: cached })).toEqual({ verdict: "REVOKED" });
  });

  it("does not let an older version's revocation block a rotated pass", async () => {
    const cached = makeCachedBundle({
      bundle: {
        roster: [
          rosterEntry({
            passVersion: 2,
            credentialHash: hashCredential(PASS_ID, PASS_SECRET_V2),
          }),
        ],
        revocations: [revocation(PASS_ID, 1)],
      },
    });

    const verdict = await verifyFixture({
      cachedBundle: cached,
      credential: CREDENTIAL_V2,
    });

    expect(verdict.verdict).toBe("VALID");
  });

  it("refuses a pass whose person is not active", async () => {
    const cached = makeCachedBundle({
      bundle: { roster: [rosterEntry({ personStatus: "suspended" })] },
    });

    expect(await verifyFixture({ cachedBundle: cached })).toEqual({
      verdict: "INACTIVE_PERSON",
    });
  });

  it("refuses a past expiry", async () => {
    const cached = makeCachedBundle({
      bundle: {
        roster: [
          rosterEntry({ expiresAt: new Date(NOW_MS - 1_000).toISOString() }),
        ],
      },
    });

    expect(await verifyFixture({ cachedBundle: cached })).toEqual({ verdict: "EXPIRED" });
  });

  it("fails closed when the expiry cannot be parsed", async () => {
    const cached = makeCachedBundle({
      bundle: { roster: [rosterEntry({ expiresAt: "not-a-date" })] },
    });

    expect(await verifyFixture({ cachedBundle: cached })).toEqual({ verdict: "EXPIRED" });
  });

  it("admits a pass with no expiry", async () => {
    const cached = makeCachedBundle({
      bundle: { roster: [rosterEntry({ expiresAt: null })] },
    });
    const verdict = await verifyFixture({ cachedBundle: cached });

    expect(verdict.verdict).toBe("VALID");
  });
});

describe("verifyOffline bundle age policy", () => {
  it("computes age from the monotonic receipt stamp", async () => {
    const cached = makeCachedBundle({
      cache: { receivedAtMonoMs: NOW_MONO_MS - 12 * 60 * 60_000 },
    });
    const verdict = await verifyFixture({ cachedBundle: cached });

    expect(verdict).toMatchObject({
      verdict: "VALID",
      bundleAgeMs: 12 * 60 * 60_000,
      stale: false,
    });
  });

  it("flags a bundle at the default 24-hour threshold as stale but still usable", async () => {
    const cached = makeCachedBundle({
      cache: { receivedAtMonoMs: NOW_MONO_MS - 25 * 60 * 60_000 },
    });
    const verdict = await verifyFixture({ cachedBundle: cached });

    expect(AGE_STALE_MS).toBe(24 * 60 * 60_000);
    expect(verdict).toMatchObject({ verdict: "VALID", stale: true });
  });

  it("honours a caller-supplied stale threshold", async () => {
    const cached = makeCachedBundle({
      cache: { receivedAtMonoMs: NOW_MONO_MS - 11 * 60_000 },
    });
    const verdict = await verifyFixture({ cachedBundle: cached, maxBundleAgeMs: 10 * 60_000 });

    expect(verdict).toMatchObject({ verdict: "VALID", stale: true });
  });

  it("treats an unmeasurable age as stale instead of substituting the wall clock", async () => {
    const cached = makeCachedBundle({ cache: { receivedAtMonoMs: undefined } });
    const verdict = await verifyFixture({ cachedBundle: cached });

    if (verdict.verdict !== "VALID") throw new Error(`expected VALID, got ${verdict.verdict}`);
    expect(Number.isNaN(verdict.bundleAgeMs)).toBe(true);
    expect(verdict.stale).toBe(true);
  });

  it("does not let a forward wall-clock jump make the bundle look younger", async () => {
    const cached = makeCachedBundle({
      bundle: {
        roster: [rosterEntry({ expiresAt: "2030-01-01T00:00:00.000Z" })],
      },
    });
    const verdict = await verifyFixture({
      cachedBundle: cached,
      nowMs: NOW_MS + 20 * 60 * 60_000,
    });

    expect(verdict).toMatchObject({
      verdict: "VALID",
      bundleAgeMs: 60_000,
      stale: false,
    });
  });
});

describe("verifyOffline refusal safety", () => {
  it("never returns a name or person id on a refusal", async () => {
    const refusals = await Promise.all([
      verifyFixture({ cachedBundle: null }),
      verifyFixture({ cachedBundle: makeCachedBundle({ bundle: { bundleVersion: 3 } }) }),
      verifyFixture({ cachedBundle: makeCachedBundle({ signWith: OTHER_DEVICE_SECRET }) }),
      verifyFixture({ credential: "not-a-credential" }),
      verifyFixture({ credential: `PRISM1:pass_unknown:${"c".repeat(64)}` }),
      verifyFixture({ credential: `PRISM1:${PASS_ID}:${"e".repeat(64)}` }),
      verifyFixture({
        cachedBundle: makeCachedBundle({
          bundle: { revocations: [revocation(PASS_ID, 1)] },
        }),
      }),
      verifyFixture({
        cachedBundle: makeCachedBundle({
          bundle: { roster: [rosterEntry({ personStatus: "suspended" })] },
        }),
      }),
      verifyFixture({
        cachedBundle: makeCachedBundle({
          bundle: { roster: [rosterEntry({ expiresAt: "not-a-date" })] },
        }),
      }),
    ]);

    for (const verdict of refusals) {
      expect(verdict).not.toHaveProperty("displayName");
      expect(verdict).not.toHaveProperty("personId");
      const serialized = JSON.stringify(verdict);
      expect(serialized).not.toContain(PASS_SECRET);
      expect(serialized).not.toContain(CREDENTIAL);
      expect(serialized).not.toContain("PRISM1");
    }
  });

  it("never echoes the credential or secret in a valid verdict", async () => {
    const verdict = await verifyFixture();
    const serialized = JSON.stringify(verdict);

    expect(verdict).toHaveProperty("displayName", "Ada Lovelace");
    expect(serialized).not.toContain(PASS_SECRET);
    expect(serialized).not.toContain(CREDENTIAL);
    expect(serialized).not.toContain("PRISM1");
  });
});

describe("browser-safe module boundary", () => {
  it("imports neither node:crypto, server-only, nor the server credential helper", () => {
    const sources = ["modules/offline/verify-hash.ts", "modules/offline/verify-offline.ts"].map(
      (path) => readFileSync(path, "utf8"),
    );

    const forbidden = [
      /from\s+["'](?:node:)?crypto["']/,
      /require\(\s*["'](?:node:)?crypto["']\s*\)/,
      /from\s+["']server-only["']/,
      /require\(\s*["']server-only["']\s*\)/,
      /from\s+["'][^"']*passes\/(?:credential|service)["']/,
    ];

    for (const source of sources) {
      for (const pattern of forbidden) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
