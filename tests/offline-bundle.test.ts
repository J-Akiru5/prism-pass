import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_BUNDLE_GEOFENCES,
  MAX_BUNDLE_PASSES,
  MAX_BUNDLE_POLICIES,
  MAX_BUNDLE_REVOCATIONS,
  MAX_BUNDLE_ROSTER,
  MAX_BUNDLE_SESSIONS,
  SCANNER_BUNDLE_VERSION,
  bundleAuditMeta,
  capBundleList,
  emptyBundleTruncated,
  scannerBundleSchema,
  type BundleRosterEntry,
  type ScannerBundle,
} from "../modules/offline/bundle-schema";
import {
  BUNDLE_CANONICAL_VERSION,
  canonicalBundlePayload,
  type BundleSignable,
} from "../modules/offline/canonical-bundle";
import { deviceKeyHash } from "../modules/offline/crypto";

// The Dexie adapter is exercised against an in-memory fake, following the
// existing offline-hardening pattern. It implements only the bundle table
// surface (put/get/delete), plus a queue table so the tests can prove a quota
// failure never removes queued scans. The cryptography itself is real: the
// server-side HMAC uses node:crypto and the client-side verifier uses WebCrypto.

const harness = vi.hoisted(() => {
  type Row = Record<string, any>;

  const control = {
    failNextBundlePut: null as Error | null,
  };

  const instances: FakeDexie[] = [];

  class FakeTable {
    rows = new Map<unknown, Row>();
    readonly keyField: string | null;
    readonly isBundleStore: boolean;

    constructor(keyField: string | null = null, isBundleStore = false) {
      this.keyField = keyField;
      this.isBundleStore = isBundleStore;
    }

    async put(row: Row): Promise<unknown> {
      if (this.isBundleStore && control.failNextBundlePut) {
        const failure = control.failNextBundlePut;
        control.failNextBundlePut = null;
        throw failure;
      }
      const key = this.keyField ? row[this.keyField] : row.id;
      this.rows.set(key, { ...row });
      return key;
    }

    async get(key: unknown): Promise<Row | undefined> {
      const row = this.rows.get(key);
      return row ? { ...row } : undefined;
    }

    async delete(key: unknown): Promise<void> {
      this.rows.delete(key);
    }

    async count(): Promise<number> {
      return this.rows.size;
    }

    clear(): void {
      this.rows.clear();
    }
  }

  class FakeDexie {
    queue = new FakeTable("id");
    bundles = new FakeTable("organizationId", true);

    constructor(_name?: string) {
      instances.push(this);
    }

    version(_number: number) {
      return this;
    }

    stores(schema: Record<string, string>) {
      // Dexie installs every declared store; replace each table per version,
      // matching how the queue hardening test fakes its database.
      for (const name of Object.keys(schema)) {
        if (name === "queue") this.queue = new FakeTable("id");
        if (name === "bundles") this.bundles = new FakeTable("organizationId", true);
      }
      return this;
    }

    upgrade(_callback: unknown) {
      return this;
    }

    async transaction(
      _mode: string,
      _tables: unknown,
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
      control.failNextBundlePut = null;
      for (const instance of instances) {
        instance.queue.clear();
        instance.bundles.clear();
      }
    },
  };
});

vi.mock("dexie", () => ({ default: harness.FakeDexie }));

// Route tests use a tiny in-memory Prisma double. Only the query surface the
// sync-bundle route touches is implemented; every query result is seeded per
// test so no database or environment is needed.
const routeDb = vi.hoisted(() => {
  const state = {
    session: null as any,
    sessions: [] as any[],
    policies: [] as any[],
    geofences: [] as any[],
    activePasses: [] as any[],
    revocations: [] as any[],
    roster: [] as any[],
    device: null as any,
    audit: [] as any[],
  };

  const prisma = {
    attendanceSession: {
      async findUnique() {
        return state.session;
      },
      async findMany() {
        return state.sessions;
      },
    },
    attendancePolicy: {
      async findMany() {
        return state.policies;
      },
    },
    geofence: {
      async findMany() {
        return state.geofences;
      },
    },
    pass: {
      async findMany(args: { where?: { status?: string } }) {
        return args?.where?.status === "REVOKED" ? state.revocations : state.activePasses;
      },
    },
    sessionRoster: {
      async findMany() {
        return state.roster;
      },
    },
    device: {
      async findFirst() {
        return state.device;
      },
    },
    auditLog: {
      async create(args: { data: Record<string, unknown> }) {
        state.audit.push(args.data);
        return { id: `audit-${state.audit.length}` };
      },
    },
  };

  return { state, prisma };
});

vi.mock("@/lib/db", () => ({ prisma: routeDb.prisma }));
vi.mock("@/lib/tenant", () => ({
  requireOrganizationPermission: async () => ({
    organizationId: "org-bundle",
    internalUserId: "user-internal",
  }),
}));

// Identity sealing keeps the adapter tests independent of real IndexedDB key
// storage. Real AES-GCM seal/open is covered by offline-hardening.test.ts; here
// the cache tests only assert that the bundle goes through that API.
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
  clearCachedBundle,
  fetchAndCacheBundle,
  loadCachedBundle,
  signBundlePayload,
  verifyBundleSignature,
} from "../lib/bundle-client";
import { GET as getSyncBundle } from "../app/api/v1/orgs/[orgId]/sync-bundle/route";

const NOW = Date.parse("2026-11-09T08:00:00.000Z");
const SECRET = "a".repeat(64);
const ORG = "org-bundle";
const DEVICE = "dev_bundle_test";
const SESSION = "session-bundle";

function bundleLimits(overrides: Partial<Record<string, number>> = {}) {
  return {
    maxBatchEvents: 500,
    maxClientFutureSkewMs: 300_000,
    maxOfflineAgeMs: 30 * 24 * 60 * 60_000,
    signatureSkewMs: 600_000,
    maxSessions: MAX_BUNDLE_SESSIONS,
    maxRosterEntries: MAX_BUNDLE_ROSTER,
    maxPasses: MAX_BUNDLE_PASSES,
    maxPolicies: MAX_BUNDLE_POLICIES,
    maxGeofences: MAX_BUNDLE_GEOFENCES,
    maxRevocations: MAX_BUNDLE_REVOCATIONS,
    ...overrides,
  };
}

function rosterEntry(overrides: Partial<BundleRosterEntry> = {}): BundleRosterEntry {
  return {
    sessionId: SESSION,
    personId: "person-1",
    displayName: "Ada Lovelace",
    passPublicId: "pass_public_1",
    passVersion: 1,
    credentialHash: "c".repeat(64),
    expiresAt: "2027-01-01T00:00:00.000Z",
    personStatus: "active",
    rosterState: "listed",
    ...overrides,
  };
}

function unsignedBundle(overrides: Partial<BundleSignable> = {}): BundleSignable {
  return {
    bundleVersion: SCANNER_BUNDLE_VERSION,
    generatedAt: new Date(NOW).toISOString(),
    serverTime: new Date(NOW + 200).toISOString(),
    organizationId: ORG,
    sessionIds: [SESSION],
    sessions: [
      {
        id: SESSION,
        title: "Doors",
        type: "EVENT",
        startsAt: new Date(NOW - 3_600_000).toISOString(),
        endsAt: new Date(NOW + 7_200_000).toISOString(),
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
    revocations: [
      { passPublicId: "pass_revoked", passVersion: 2, revokedAt: new Date(NOW - 86_400_000).toISOString() },
    ],
    passCache: [],
    truncated: emptyBundleTruncated(),
    limits: bundleLimits(),
    deviceId: DEVICE,
    ...overrides,
  };
}

function signServerSide(bundle: BundleSignable, secret = SECRET): string {
  return createHmac("sha256", deviceKeyHash(secret))
    .update(canonicalBundlePayload(bundle), "utf8")
    .digest("hex");
}

function signedBundle(overrides: Partial<BundleSignable> = {}, secret = SECRET): ScannerBundle {
  const unsigned = unsignedBundle(overrides);
  return { ...unsigned, bundleSignature: signServerSide(unsigned, secret) };
}

function responseWith(bundle: unknown, status = 200, error?: unknown): Response {
  const body = error === undefined ? { data: bundle } : { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function fakeDatabase() {
  // Construct the database (or reuse the singleton), then hand back the fake.
  await clearCachedBundle("__bootstrap__");
  const instance = harness.instances[0];
  if (!instance) throw new Error("fake Dexie was not constructed");
  return instance;
}

function seedRoute() {
  const now = NOW;
  routeDb.state.session = { id: SESSION, organizationId: ORG };
  routeDb.state.sessions = [
    {
      id: SESSION,
      title: "Doors",
      type: "EVENT",
      startsAt: new Date(now - 3_600_000),
      endsAt: new Date(now + 7_200_000),
      timezone: "Asia/Manila",
      policyId: "policy-1",
      status: "OPEN",
      closedAt: null,
      rosterEnforced: true,
      walkInAllowed: false,
    },
  ];
  routeDb.state.policies = [
    {
      id: "policy-1",
      name: "Default",
      graceMin: 10,
      lateThresholdMin: 15,
      duplicateWindowSec: 120,
      geoMode: "flag",
    },
  ];
  routeDb.state.geofences = [
    { id: "geo-1", label: "Main hall", centerLat: 14.5, centerLng: 121, radiusM: 100 },
  ];
  // An active pass that is not on the roster: the event bundle must not carry it.
  routeDb.state.activePasses = [
    {
      passPublicId: "pass_unlisted",
      version: 1,
      status: "ACTIVE",
      expiresAt: null,
      personId: "person-unlisted",
      credentialHash: "e".repeat(64),
    },
  ];
  routeDb.state.revocations = [
    { passPublicId: "pass_revoked", version: 2, revokedAt: new Date(now - 86_400_000) },
  ];
  routeDb.state.roster = [
    {
      personId: "person-1",
      source: "manual",
      person: {
        displayName: "Ada Lovelace",
        status: "active",
        passes: [
          {
            passPublicId: "pass_public_1",
            version: 1,
            credentialHash: "c".repeat(64),
            expiresAt: null,
          },
        ],
      },
    },
    // A roster row without an active pass cannot be verified, so it is omitted.
    {
      personId: "person-2",
      source: "walk_in",
      person: { displayName: "Grace Hopper", status: "active", passes: [] },
    },
  ];
  routeDb.state.device = { secretHash: deviceKeyHash(SECRET), revokedAt: null };
  routeDb.state.audit.length = 0;
}

function routeParams() {
  return { params: Promise.resolve({ orgId: ORG }) };
}

function bundleRequest(query = "") {
  return new Request(`http://localhost/api/v1/orgs/${ORG}/sync-bundle${query}`);
}

beforeEach(() => {
  // Dexie itself is faked; the adapter only needs IndexedDB to exist so its
  // availability guard passes.
  Object.defineProperty(globalThis, "indexedDB", {
    value: {},
    configurable: true,
    writable: true,
  });
  harness.reset();
});

describe("M2 bundle schema", () => {
  it("accepts a valid signed v2 bundle", () => {
    const parsed = scannerBundleSchema.safeParse(signedBundle());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bundleVersion).toBe(2);
      expect(parsed.data.roster[0]).toMatchObject({
        displayName: "Ada Lovelace",
        rosterState: "listed",
        personStatus: "active",
      });
    }
  });

  it("rejects a v1/v3 version and a signature-less device bundle", () => {
    const valid = signedBundle();
    expect(scannerBundleSchema.safeParse({ ...valid, bundleVersion: 1 }).success).toBe(false);
    expect(scannerBundleSchema.safeParse({ ...valid, bundleVersion: 3 }).success).toBe(false);

    const { bundleSignature, ...missingSignature } = valid;
    expect(bundleSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(scannerBundleSchema.safeParse(missingSignature).success).toBe(false);
    expect(scannerBundleSchema.safeParse({ ...valid, bundleSignature: null }).success).toBe(false);
  });

  it("accepts the explicit legacy unsigned shape only with a null device and signature", () => {
    const unsigned = unsignedBundle({ deviceId: null });
    expect(scannerBundleSchema.safeParse({ ...unsigned, bundleSignature: null }).success).toBe(true);
    expect(
      scannerBundleSchema.safeParse({ ...unsigned, bundleSignature: signServerSide(unsigned) }).success,
    ).toBe(false);
  });

  it("rejects an unknown roster state and a missing organisation", () => {
    const valid = signedBundle();
    expect(
      scannerBundleSchema.safeParse({
        ...valid,
        roster: [{ ...valid.roster[0], rosterState: "guest" }],
      }).success,
    ).toBe(false);
    expect(scannerBundleSchema.safeParse({ ...valid, organizationId: "" }).success).toBe(false);
  });

  it("defaults missing truncated flags to false but honours an explicit truncation", () => {
    const valid = signedBundle();
    const { truncated, ...withoutTruncated } = valid;
    expect(truncated).toEqual(emptyBundleTruncated());
    const parsed = scannerBundleSchema.parse(withoutTruncated);
    expect(parsed.truncated).toEqual(emptyBundleTruncated());

    const explicit = scannerBundleSchema.safeParse(
      signedBundle({ truncated: { ...emptyBundleTruncated(), roster: true } }),
    );
    expect(explicit.success).toBe(true);
    if (explicit.success) expect(explicit.data.truncated.roster).toBe(true);
  });
});

describe("M2 canonical bundle payload", () => {
  it("is independent of array and map ordering", () => {
    const bundle = unsignedBundle();
    const shuffled: BundleSignable = {
      ...bundle,
      sessionIds: [...bundle.sessionIds].reverse(),
      sessions: [...bundle.sessions].reverse(),
      policies: [...bundle.policies].reverse(),
      geofences: [...bundle.geofences].reverse(),
      roster: [...bundle.roster].reverse(),
      revocations: [...bundle.revocations].reverse(),
      passCache: [...bundle.passCache].reverse(),
      limits: Object.fromEntries(Object.entries(bundle.limits).reverse()) as BundleSignable["limits"],
      truncated: {
        revocations: false,
        roster: false,
        passes: false,
        geofences: false,
        policies: false,
        sessions: false,
      },
    };

    expect(canonicalBundlePayload(shuffled)).toBe(canonicalBundlePayload(bundle));
    expect(canonicalBundlePayload(bundle)).toContain(BUNDLE_CANONICAL_VERSION);
  });

  it("never includes bundleSignature", () => {
    const unsigned = unsignedBundle();
    const signed: ScannerBundle = { ...unsigned, bundleSignature: signServerSide(unsigned) };
    expect(canonicalBundlePayload(signed)).toBe(canonicalBundlePayload(unsigned));
  });

  it("changes when a roster field, pass version, expiry or timestamp changes", () => {
    const bundle = unsignedBundle();
    const base = canonicalBundlePayload(bundle);

    expect(
      canonicalBundlePayload({ ...bundle, roster: [rosterEntry({ displayName: "Mallory" })] }),
    ).not.toBe(base);
    expect(
      canonicalBundlePayload({ ...bundle, roster: [rosterEntry({ passVersion: 2 })] }),
    ).not.toBe(base);
    expect(
      canonicalBundlePayload({ ...bundle, roster: [rosterEntry({ expiresAt: null })] }),
    ).not.toBe(base);
    expect(
      canonicalBundlePayload({ ...bundle, roster: [rosterEntry({ credentialHash: "d".repeat(64) })] }),
    ).not.toBe(base);
    expect(
      canonicalBundlePayload({ ...bundle, generatedAt: new Date(NOW + 1_000).toISOString() }),
    ).not.toBe(base);
    expect(
      canonicalBundlePayload({ ...bundle, limits: bundleLimits({ maxRosterEntries: 4_999 }) }),
    ).not.toBe(base);
  });
});

describe("M2 bundle signatures", () => {
  it("verifies the server HMAC with the browser verifier", async () => {
    const unsigned = unsignedBundle();
    const signature = signServerSide(unsigned);
    const bundle: ScannerBundle = { ...unsigned, bundleSignature: signature };

    expect(await verifyBundleSignature(bundle, SECRET)).toBe(true);
    expect(await signBundlePayload(unsigned, SECRET)).toBe(signature);
  });

  it("rejects a tampered roster, timestamp and the wrong device secret", async () => {
    const bundle = signedBundle();

    expect(
      await verifyBundleSignature(
        { ...bundle, roster: [{ ...bundle.roster[0], displayName: "Mallory" }] },
        SECRET,
      ),
    ).toBe(false);
    expect(
      await verifyBundleSignature(
        { ...bundle, roster: [{ ...bundle.roster[0], passVersion: 99 }] },
        SECRET,
      ),
    ).toBe(false);
    expect(
      await verifyBundleSignature(
        { ...bundle, generatedAt: new Date(NOW + 1).toISOString() },
        SECRET,
      ),
    ).toBe(false);
    expect(await verifyBundleSignature(bundle, "b".repeat(64))).toBe(false);
  });
});

describe("M2 bundle caps", () => {
  it("caps the roster at 5000 and flags truncation only when the list is longer", () => {
    expect(MAX_BUNDLE_ROSTER).toBe(5_000);

    const atCap = capBundleList(Array.from({ length: MAX_BUNDLE_ROSTER }, (_, index) => index), MAX_BUNDLE_ROSTER);
    expect(atCap.truncated).toBe(false);
    expect(atCap.items).toHaveLength(MAX_BUNDLE_ROSTER);

    const overCap = capBundleList(
      Array.from({ length: MAX_BUNDLE_ROSTER + 1 }, (_, index) => index),
      MAX_BUNDLE_ROSTER,
    );
    expect(overCap.truncated).toBe(true);
    expect(overCap.items).toHaveLength(MAX_BUNDLE_ROSTER);
    expect(overCap.items[0]).toBe(0);
    expect(overCap.items.at(-1)).toBe(MAX_BUNDLE_ROSTER - 1);
  });

  it("keeps every other bundle list bounded too", () => {
    for (const cap of [
      MAX_BUNDLE_SESSIONS,
      MAX_BUNDLE_POLICIES,
      MAX_BUNDLE_GEOFENCES,
      MAX_BUNDLE_PASSES,
      MAX_BUNDLE_REVOCATIONS,
    ]) {
      expect(cap).toBeGreaterThan(0);
      expect(cap).toBeLessThanOrEqual(5_000);
    }
    expect(capBundleList([1, 2], 1)).toEqual({ items: [1], truncated: true });
    expect(capBundleList([], 0)).toEqual({ items: [], truncated: false });
  });

  it("audits counts and flags without any PII", () => {
    const meta = bundleAuditMeta({
      signed: true,
      sessions: 1,
      policies: 1,
      geofences: 1,
      roster: MAX_BUNDLE_ROSTER,
      revocations: 2,
      passes: 0,
      truncated: { ...emptyBundleTruncated(), roster: true },
    });

    expect(meta).toEqual({
      bundleVersion: 2,
      signed: true,
      sessions: 1,
      policies: 1,
      geofences: 1,
      roster: MAX_BUNDLE_ROSTER,
      revocations: 2,
      passes: 0,
      truncated: { ...emptyBundleTruncated(), roster: true },
    });

    const serialized = JSON.stringify(meta);
    for (const pii of ["Ada Lovelace", "person-1", "pass_public_1", "c".repeat(64)]) {
      expect(serialized).not.toContain(pii);
    }
  });
});

describe("M2 bundle browser cache", () => {
  it("downloads, verifies, seals and caches a signed bundle with age/drift metadata", async () => {
    const bundle = signedBundle();
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return responseWith(bundle);
    });

    const clock = [NOW, NOW + 50, NOW + 60];
    let tick = 0;

    const result = await fetchAndCacheBundle({
      organizationId: ORG,
      sessionId: SESSION,
      deviceId: DEVICE,
      secret: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => clock[Math.min(tick++, clock.length - 1)],
    });

    expect(capturedUrl).toContain(`/api/v1/orgs/${ORG}/sync-bundle?`);
    expect(capturedUrl).toContain(`sessionId=${SESSION}`);
    expect(capturedUrl).toContain(`deviceId=${DEVICE}`);
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.method).toBe("GET");

    // serverTime is NOW+200, device midpoint is NOW+25 => 175ms behind.
    expect(result).toMatchObject({
      generatedAt: bundle.generatedAt,
      receivedAt: NOW + 60,
      sessionId: SESSION,
      driftMs: 175,
      rttMs: 50,
      ageMs: 60,
    });
    expect(result.bundle.bundleSignature).toBe(bundle.bundleSignature);

    const database = await fakeDatabase();
    const row = database.bundles.rows.get(ORG);
    if (!row) throw new Error("bundle cache row was not written");
    expect(row).toMatchObject({
      organizationId: ORG,
      bundleVersion: 2,
      sessionId: SESSION,
      deviceId: DEVICE,
      generatedAt: bundle.generatedAt,
      receivedAt: NOW + 60,
      serverTime: bundle.serverTime,
      driftMs: 175,
      rttMs: 50,
      rosterCount: 1,
      revocationCount: 1,
    });
    expect(typeof row.sealed).toBe("string");
    expect(row.sealed).toBe(JSON.stringify(bundle));
    expect(database.queue.rows.size).toBe(0);
  });

  it("loads and clears the cached bundle and recomputes its age", async () => {
    const bundle = signedBundle();
    await fakeDatabase();
    const fetchImpl = vi.fn(async () => responseWith(bundle));

    await fetchAndCacheBundle({
      organizationId: ORG,
      sessionId: SESSION,
      deviceId: DEVICE,
      secret: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => NOW,
    });

    const loaded = await loadCachedBundle(ORG, { now: () => NOW + 5_000 });
    expect(loaded).not.toBeNull();
    expect(loaded?.bundle).toEqual(bundle);
    expect(loaded?.ageMs).toBe(5_000);
    expect(loaded?.driftMs).toBe(200);

    await clearCachedBundle(ORG);
    expect(await loadCachedBundle(ORG)).toBeNull();
  });

  it("refuses a tampered bundle before writing the cache", async () => {
    await fakeDatabase();
    const bundle = signedBundle();
    const tampered = {
      ...bundle,
      roster: [{ ...bundle.roster[0], displayName: "Mallory" }],
    };

    await expect(
      fetchAndCacheBundle({
        organizationId: ORG,
        sessionId: SESSION,
        deviceId: DEVICE,
        secret: SECRET,
        fetchImpl: vi.fn(async () => responseWith(tampered)) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "signature_invalid" });

    const database = await fakeDatabase();
    expect(database.bundles.rows.size).toBe(0);
  });

  it("rejects an invalid bundle shape and an HTTP refusal with typed errors", async () => {
    await fakeDatabase();
    const valid = signedBundle();

    await expect(
      fetchAndCacheBundle({
        organizationId: ORG,
        sessionId: SESSION,
        deviceId: DEVICE,
        secret: SECRET,
        fetchImpl: vi.fn(async () =>
          responseWith({ ...valid, bundleVersion: 1 }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "invalid_bundle" });

    await expect(
      fetchAndCacheBundle({
        organizationId: ORG,
        sessionId: SESSION,
        deviceId: DEVICE,
        secret: SECRET,
        fetchImpl: vi.fn(async () =>
          responseWith(null, 403, { code: "DEVICE_REVOKED", message: "Device is revoked" }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "http", status: 403 });
  });

  it("maps quota exhaustion without deleting the queue or a prior bundle", async () => {
    const database = await fakeDatabase();
    database.queue.rows.set(1, {
      id: 1,
      idempotencyKey: "queued-scan",
      state: "pending",
      organizationId: ORG,
    });
    database.bundles.rows.set(ORG, { organizationId: ORG, sealed: "previous-bundle" });
    harness.control.failNextBundlePut = new DOMException("Storage is full", "QuotaExceededError");

    await expect(
      fetchAndCacheBundle({
        organizationId: ORG,
        sessionId: SESSION,
        deviceId: DEVICE,
        secret: SECRET,
        fetchImpl: vi.fn(async () => responseWith(signedBundle())) as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "quota" });

    expect(database.queue.rows.size).toBe(1);
    expect(database.bundles.rows.get(ORG)).toMatchObject({ sealed: "previous-bundle" });
  });
});

describe("M2 sync-bundle route", () => {
  it("returns a signed event bundle with roster-only passes and no PII in the audit", async () => {
    seedRoute();

    const response = await getSyncBundle(
      bundleRequest(`?sessionId=${SESSION}&deviceId=${DEVICE}`),
      routeParams(),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown };
    const bundle = scannerBundleSchema.parse(body.data);

    expect(bundle).toMatchObject({
      bundleVersion: 2,
      organizationId: ORG,
      deviceId: DEVICE,
      sessionIds: [SESSION],
    });
    expect(bundle.sessions).toHaveLength(1);
    expect(bundle.sessions[0]).toMatchObject({ id: SESSION, status: "OPEN" });
    expect(bundle.policies.map((policy) => policy.id)).toEqual(["policy-1"]);
    expect(bundle.geofences.map((geofence) => geofence.id)).toEqual(["geo-1"]);
    // Only the roster row with an active pass; the unlisted active pass and the
    // roster row without a pass are both absent.
    expect(bundle.roster).toHaveLength(1);
    expect(bundle.roster[0]).toMatchObject({
      sessionId: SESSION,
      personId: "person-1",
      displayName: "Ada Lovelace",
      passPublicId: "pass_public_1",
      passVersion: 1,
      personStatus: "active",
      rosterState: "listed",
    });
    expect(bundle.passCache).toEqual([]);
    expect(bundle.revocations).toEqual([
      {
        passPublicId: "pass_revoked",
        passVersion: 2,
        revokedAt: expect.any(String),
      },
    ]);
    expect(await verifyBundleSignature(bundle, SECRET)).toBe(true);

    expect(routeDb.state.audit).toHaveLength(1);
    const audit = routeDb.state.audit[0];
    expect(audit).toMatchObject({
      action: "sync.bundle",
      result: "ok",
      resource: `session:${SESSION}`,
    });
    expect(audit.meta).toMatchObject({
      bundleVersion: 2,
      signed: true,
      sessions: 1,
      policies: 1,
      geofences: 1,
      roster: 1,
      revocations: 1,
      passes: 0,
    });
    const serializedMeta = JSON.stringify(audit.meta);
    for (const pii of ["Ada Lovelace", "person-1", "pass_public_1", "c".repeat(64)]) {
      expect(serializedMeta).not.toContain(pii);
    }
  });

  it("keeps the unsigned org-wide pass cache when no session is named", async () => {
    seedRoute();

    const response = await getSyncBundle(bundleRequest(""), routeParams());
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown };
    const bundle = scannerBundleSchema.parse(body.data);

    expect(bundle.deviceId).toBeNull();
    expect(bundle.bundleSignature).toBeNull();
    expect(bundle.roster).toEqual([]);
    expect(bundle.revocations).toEqual([]);
    expect(bundle.passCache).toHaveLength(1);
    expect(bundle.passCache[0]).toMatchObject({
      passPublicId: "pass_unlisted",
      passVersion: 1,
      statusAtSync: "ACTIVE",
    });
    expect(routeDb.state.audit).toHaveLength(1);
    expect(routeDb.state.audit[0].meta).toMatchObject({ signed: false, passes: 1 });
  });

  it("caps a 5001-row roster at 5000 and sets truncated.roster", async () => {
    seedRoute();
    routeDb.state.roster = Array.from({ length: MAX_BUNDLE_ROSTER + 1 }, (_, index) => ({
      personId: `person-${index}`,
      source: "manual",
      person: {
        displayName: `Person ${index}`,
        status: "active",
        passes: [
          {
            passPublicId: `pass_${index}`,
            version: 1,
            credentialHash: "c".repeat(64),
            expiresAt: null,
          },
        ],
      },
    }));

    const response = await getSyncBundle(
      bundleRequest(`?sessionId=${SESSION}&deviceId=${DEVICE}`),
      routeParams(),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { data: unknown };
    const bundle = scannerBundleSchema.parse(body.data);
    expect(bundle.roster).toHaveLength(MAX_BUNDLE_ROSTER);
    expect(bundle.roster.at(-1)?.personId).toBe(`person-${MAX_BUNDLE_ROSTER - 1}`);
    expect(bundle.truncated.roster).toBe(true);
  });

  it("returns 404 for an unknown device and 403 for a revoked one without auditing", async () => {
    seedRoute();
    routeDb.state.device = null;

    const unknown = await getSyncBundle(
      bundleRequest(`?sessionId=${SESSION}&deviceId=${DEVICE}`),
      routeParams(),
    );
    expect(unknown.status).toBe(404);
    const unknownBody = (await unknown.json()) as { error: { code: string } };
    expect(unknownBody.error.code).toBe("NOT_FOUND");

    seedRoute();
    routeDb.state.device = { secretHash: deviceKeyHash(SECRET), revokedAt: new Date() };
    const revoked = await getSyncBundle(
      bundleRequest(`?sessionId=${SESSION}&deviceId=${DEVICE}`),
      routeParams(),
    );
    expect(revoked.status).toBe(403);
    const revokedBody = (await revoked.json()) as { error: { code: string } };
    expect(revokedBody.error.code).toBe("DEVICE_REVOKED");

    expect(routeDb.state.audit).toHaveLength(0);
  });

  it("returns 404 when the session belongs to another organization", async () => {
    seedRoute();
    routeDb.state.session = { id: SESSION, organizationId: "org-other" };

    const response = await getSyncBundle(
      bundleRequest(`?sessionId=${SESSION}&deviceId=${DEVICE}`),
      routeParams(),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(routeDb.state.audit).toHaveLength(0);
  });
});
