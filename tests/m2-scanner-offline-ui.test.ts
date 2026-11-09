import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGE_LEVEL_TEXT,
  DRIFT_LEVEL_TEXT,
  bundleStatusText,
  mapOfflineVerdict,
  mergeSessionOptions,
  shouldQueueOfflineVerdict,
} from "@/modules/scanner/offline-presentation";
import {
  AGE_AGING_MS,
  AGE_FRESH_MS,
  AGE_STALE_MS,
  DRIFT_DANGER_MS,
  DRIFT_WARN_MS,
  ageLabel,
  driftLabel,
} from "@/modules/offline/clock";
import {
  verifyOffline,
  type OfflineCachedBundle,
  type OfflineVerdict,
} from "@/modules/offline/verify-offline";

// M2-WS4 scanner offline UX. The pure presentation helper is exercised directly;
// page/component wiring is checked at the source level, matching the M1 scanner
// UI test style. The verifier itself has its own decision-table suite.

const NAME = "Maria Santos";
const ORG = "org-scanner-ui";
const SESSION = "session-scanner-ui";
const SECRET = "a".repeat(64);
const CREDENTIAL = `PRISM1:pass_scanner_ui:${"b".repeat(64)}`;
const NOW_MS = Date.parse("2026-11-09T12:00:00.000Z");
const NOW_MONO_MS = 10_000_000;
const TWO_HOURS_MS = 2 * 60 * 60_000;

const VALID: OfflineVerdict = {
  verdict: "VALID",
  personId: "person-1",
  displayName: NAME,
  expiresAt: "2027-01-01T00:00:00.000Z",
  bundleAgeMs: TWO_HOURS_MS,
  stale: false,
  provisional: true,
};

const CONTEXT = {
  bundleAgeMs: TWO_HOURS_MS,
  driftMs: 0,
  sessionLabel: "Doors",
};

const REFUSALS: OfflineVerdict[] = [
  { verdict: "EXPIRED" },
  { verdict: "REVOKED" },
  { verdict: "NOT_LISTED", reason: "not_on_roster" },
  { verdict: "NOT_LISTED", reason: "unknown_pass" },
  { verdict: "NOT_LISTED", reason: "revoked_since_bundle" },
  { verdict: "INACTIVE_PERSON" },
  { verdict: "INVALID_CREDENTIAL" },
  { verdict: "INVALID_FORMAT" },
  { verdict: "BUNDLE_MISSING" },
  { verdict: "BUNDLE_UNSUPPORTED" },
  { verdict: "BUNDLE_TAMPERED" },
];

/** Minimal shape the verifier accepts before checking the device signature. */
function cachedFixture(overrides: Record<string, unknown> = {}): OfflineCachedBundle {
  const bundle: Record<string, unknown> = {
    bundleVersion: 2,
    generatedAt: new Date(NOW_MS - 60_000).toISOString(),
    serverTime: new Date(NOW_MS - 59_000).toISOString(),
    organizationId: ORG,
    sessionIds: [SESSION],
    sessions: [],
    policies: [],
    geofences: [],
    roster: [],
    revocations: [],
    passCache: [],
    truncated: {},
    limits: {},
    deviceId: "dev-scanner-ui",
    bundleSignature: "0".repeat(64),
    ...overrides,
  };
  return {
    bundle,
    generatedAt: bundle.generatedAt as string,
    receivedAt: NOW_MS - 60_000,
    receivedAtMonoMs: NOW_MONO_MS - 60_000,
    serverTime: bundle.serverTime as string,
    sessionId: SESSION,
  } as unknown as OfflineCachedBundle;
}

describe("offline VALID presentation", () => {
  it("names the attendee and labels the scan provisional", () => {
    const result = mapOfflineVerdict(VALID, CONTEXT);

    expect(result.tone).toBe("queued");
    expect(result.title).toContain("provisional");
    expect(result.personName).toBe(NAME);
    expect(result.message).toContain("Verified on device — provisional.");
    expect(result.message).toContain("Not recorded until sync.");
    expect(result.message).toContain(ageLabel(TWO_HOURS_MS));
    expect(result.message).toContain("Session: Doors.");
    expect(shouldQueueOfflineVerdict(VALID)).toBe(true);
  });

  it("keeps the name on a stale snapshot and says the server may reject it", () => {
    const stale = mapOfflineVerdict(
      { ...VALID, bundleAgeMs: AGE_STALE_MS, stale: true },
      { ...CONTEXT, bundleAgeMs: AGE_STALE_MS },
    );

    expect(stale.personName).toBe(NAME);
    expect(stale.tone).toBe("queued");
    expect(stale.title).toMatch(/stale data/i);
    expect(stale.message).toContain(ageLabel(AGE_STALE_MS));
    expect(stale.message).toMatch(/past its freshness limit/i);
    expect(shouldQueueOfflineVerdict({ ...VALID, bundleAgeMs: AGE_STALE_MS, stale: true })).toBe(true);
  });

  it("adds the drift warning only when the clock is not OK", () => {
    const ok = mapOfflineVerdict(VALID, { ...CONTEXT, driftMs: 0 });
    expect(ok.message).not.toContain(driftLabel(0));

    const drifting = mapOfflineVerdict(VALID, { ...CONTEXT, driftMs: DRIFT_DANGER_MS });
    expect(drifting.message).toContain(driftLabel(DRIFT_DANGER_MS));
  });

  it("does not print a raw credential even if it reached the display name", () => {
    const result = mapOfflineVerdict({ ...VALID, displayName: CREDENTIAL }, CONTEXT);

    expect(result).not.toHaveProperty("personName");
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    // The verdict is still accepted; only the unusable "name" is withheld.
    expect(result.tone).toBe("queued");
    expect(result.message).not.toContain(CREDENTIAL);
  });
});

describe("offline refusals stay name-free and never queue", () => {
  it("never sets personName, even when the session label looks like a name", () => {
    for (const verdict of REFUSALS) {
      const result = mapOfflineVerdict(verdict, {
        bundleAgeMs: AGE_STALE_MS,
        driftMs: DRIFT_DANGER_MS,
        // Deliberately a person-shaped session title: refusals must not echo it.
        sessionLabel: NAME,
      });

      expect(result).not.toHaveProperty("personName");
      expect(JSON.stringify(result)).not.toContain(NAME);
      expect(result.tone).not.toBe("queued");
      expect(result.tone).not.toBe("success");
      expect(result.message).toMatch(/not (recorded|queued)|nothing was (recorded|queued)/i);
      expect(shouldQueueOfflineVerdict(verdict)).toBe(false);
    }
  });

  it("uses one indistinguishable copy for every NOT_LISTED reason", () => {
    const roster = mapOfflineVerdict({ verdict: "NOT_LISTED", reason: "not_on_roster" }, CONTEXT);
    const unknown = mapOfflineVerdict({ verdict: "NOT_LISTED", reason: "unknown_pass" }, CONTEXT);
    const revoked = mapOfflineVerdict(
      { verdict: "NOT_LISTED", reason: "revoked_since_bundle" },
      CONTEXT,
    );

    expect(unknown).toEqual(roster);
    expect(revoked).toEqual(roster);
  });

  it("tells staff to download the event while online when the bundle is missing", () => {
    const result = mapOfflineVerdict({ verdict: "BUNDLE_MISSING" }, CONTEXT);
    expect(result.message).toContain("Download this event while online before scanning offline");
    expect(result.message).toContain("Nothing was queued");
  });

  it("maps real verifier refusals for missing, unsupported and tampered bundles", async () => {
    const base = {
      credential: CREDENTIAL,
      expectedOrganizationId: ORG,
      deviceSecret: SECRET,
      nowMs: NOW_MS,
      nowMonoMs: NOW_MONO_MS,
    };

    const missing = await verifyOffline({ ...base, cachedBundle: null });
    const unsupported = await verifyOffline({
      ...base,
      cachedBundle: cachedFixture({ bundleVersion: 1 }),
    });
    const tampered = await verifyOffline({ ...base, cachedBundle: cachedFixture() });

    expect(missing.verdict).toBe("BUNDLE_MISSING");
    expect(unsupported.verdict).toBe("BUNDLE_UNSUPPORTED");
    expect(tampered.verdict).toBe("BUNDLE_TAMPERED");

    for (const verdict of [missing, unsupported, tampered]) {
      expect(shouldQueueOfflineVerdict(verdict)).toBe(false);
      const result = mapOfflineVerdict(verdict, CONTEXT);
      expect(result).not.toHaveProperty("personName");
      expect(JSON.stringify(result)).not.toContain(NAME);
    }

    expect(mapOfflineVerdict(tampered, CONTEXT).tone).toBe("danger");
  });
});

describe("session picker merge", () => {
  const now = new Date("2026-11-09T10:00:00.000Z");
  const window = {
    startsAt: "2026-11-09T09:00:00.000Z",
    endsAt: "2026-11-09T11:00:00.000Z",
  };

  const live = [
    { id: "s1", title: "Live one", type: "EVENT", ...window, status: "OPEN" },
    { id: "s2", title: "Live two", type: "EVENT", ...window, status: "CLOSED" },
  ];
  const cached = [
    { id: "s2", title: "Cached two", type: "EVENT", ...window, status: "OPEN" },
    { id: "s3", title: "Cached three", type: "EVENT", ...window, status: "OPEN" },
  ];

  it("puts cached sessions first, dedupes by id and lets live values win", () => {
    const merged = mergeSessionOptions(live, cached, now);

    expect(merged.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    expect(merged).toHaveLength(3);

    const shared = merged.find((s) => s.id === "s2");
    expect(shared).toMatchObject({
      title: "Live two",
      status: "CLOSED",
      offline: true,
      live: true,
    });
    expect(shared?.label).toBe("Closed · Live two");

    const cachedOnly = merged.find((s) => s.id === "s3");
    expect(cachedOnly).toMatchObject({ offline: true, live: false });
    expect(cachedOnly?.label).toBe("Live · Cached three");

    const liveOnly = merged.find((s) => s.id === "s1");
    expect(liveOnly).toMatchObject({ offline: false, live: true });
  });

  it("still offers sessions when the live list is empty (disconnected reload)", () => {
    const merged = mergeSessionOptions([], cached, now);
    expect(merged.map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(merged.every((s) => s.offline)).toBe(true);
  });

  it("keeps a closed session in the bundle visibly closed", () => {
    const merged = mergeSessionOptions(
      [],
      [{ id: "closed-1", title: "Closed event", type: "EVENT", ...window, status: "CLOSED" }],
      now,
    );

    expect(merged[0]).toMatchObject({ id: "closed-1", status: "CLOSED", offline: true });
    expect(merged[0].label).toBe("Closed · Closed event");
  });
});

describe("bundle status labels", () => {
  it("reuses the clock policy age bands and wording", () => {
    expect(bundleStatusText({ ageMs: 0, driftMs: 0 }).ageLevel).toBe("fresh");
    expect(bundleStatusText({ ageMs: AGE_FRESH_MS, driftMs: 0 }).ageLevel).toBe("aging");
    expect(bundleStatusText({ ageMs: AGE_AGING_MS, driftMs: 0 }).ageLevel).toBe("stale");
    expect(bundleStatusText({ ageMs: AGE_STALE_MS, driftMs: 0 }).ageLevel).toBe("expired");
    expect(bundleStatusText({ ageMs: Number.NaN, driftMs: 0 }).ageLevel).toBe("expired");

    const aging = bundleStatusText({ ageMs: AGE_FRESH_MS, driftMs: 0 });
    expect(aging.ageText).toBe(ageLabel(AGE_FRESH_MS));
    expect(aging.ageText).toContain("1h old");
    expect(AGE_LEVEL_TEXT[aging.ageLevel]).toBe("Aging");
    expect(AGE_LEVEL_TEXT.expired).toBe("Expired");
  });

  it("reuses the clock policy drift bands and wording", () => {
    expect(bundleStatusText({ ageMs: 0, driftMs: 0 }).driftLevel).toBe("ok");
    expect(bundleStatusText({ ageMs: 0, driftMs: DRIFT_WARN_MS }).driftLevel).toBe("warn");
    expect(bundleStatusText({ ageMs: 0, driftMs: -DRIFT_DANGER_MS }).driftLevel).toBe("danger");
    expect(bundleStatusText({ ageMs: 0, driftMs: null }).driftLevel).toBe("blocked");

    const warn = bundleStatusText({ ageMs: 0, driftMs: DRIFT_WARN_MS });
    expect(warn.driftText).toBe(driftLabel(DRIFT_WARN_MS));
    expect(DRIFT_LEVEL_TEXT[warn.driftLevel]).toBe("Warning");
    expect(DRIFT_LEVEL_TEXT.blocked).toBe("Blocked");
  });

  it("reports the last sync time and outcome as text", () => {
    const withSync = bundleStatusText({
      ageMs: TWO_HOURS_MS,
      driftMs: 0,
      lastSyncAt: NOW_MS - 3 * 60_000,
      lastSyncOutcome: "2 recorded, 0 duplicate, 0 rejected.",
      nowMs: NOW_MS,
    });
    expect(withSync.lastSyncText).toBe(
      "Last sync 3m ago: 2 recorded, 0 duplicate, 0 rejected.",
    );
    expect(withSync.lastSyncTone).toBe("ok");

    const rejected = bundleStatusText({
      ageMs: TWO_HOURS_MS,
      driftMs: 0,
      lastSyncAt: NOW_MS - 3 * 60_000,
      lastSyncOutcome: "0 recorded, 0 duplicate, 2 rejected.",
      nowMs: NOW_MS,
    });
    expect(rejected.lastSyncTone).toBe("warn");

    const noSync = bundleStatusText({ ageMs: 0, driftMs: 0, lastSyncAt: null, nowMs: NOW_MS });
    expect(noSync.lastSyncText).toMatch(/No sync/);
    expect(noSync.lastSyncTone).toBe("muted");

    const failed = bundleStatusText({
      ageMs: 0,
      driftMs: 0,
      lastSyncAt: NOW_MS - 60_000,
      lastSyncOutcome: "Sync failed: network",
      nowMs: NOW_MS,
    });
    expect(failed.lastSyncText).toContain("Last sync 1m ago");
    expect(failed.lastSyncText).toContain("Sync failed: network");
    expect(failed.lastSyncTone).toBe("danger");
  });
});

describe("scanner offline UI wiring", () => {
  const page = readFileSync("app/(scanner)/scan/page.tsx", "utf8");
  const status = readFileSync("components/bundle-status.tsx", "utf8");

  it("loads the cached bundle and downloads the event bundle with the device key", () => {
    expect(page).toContain("loadCachedBundle(orgId)");
    expect(page).toContain("fetchAndCacheBundle({");
    expect(page).toContain("organizationId: orgId");
    expect(page).toContain("deviceId: device.deviceId");
    expect(page).toContain("secret: device.deviceSecret");
  });

  it("hydrates the session picker from the cached bundle first", () => {
    expect(page).toContain("cachedBundle?.bundle.sessions");
    expect(page).toContain("mergeSessionOptions(liveSessions, cachedSessions)");
    expect(page).toContain("sessionOptionLabel(s)");
  });

  it("verifies offline with the clock samples before queueing", () => {
    expect(page).toContain("const verdict = await verifyOffline({");
    expect(page).toContain("cachedBundle,");
    expect(page).toContain("expectedOrganizationId: orgId");
    expect(page).toContain("deviceSecret: device.deviceSecret");
    expect(page).toContain("nowMs: Date.now()");
    expect(page).toContain("nowMonoMs: performance.now()");

    const refusalGate = page.indexOf("if (!shouldQueueOfflineVerdict(verdict))");
    const queueCall = page.indexOf(
      "queueOffline(credential, idempotencyKey, clientTs, presentation)",
    );
    expect(refusalGate).toBeGreaterThan(-1);
    expect(queueCall).toBeGreaterThan(refusalGate);
  });

  it("blocks a closed session carried by the bundle before verification", () => {
    const closed = page.indexOf("isSessionClosed(bundleSession)");
    const verify = page.indexOf("const verdict = await verifyOffline({");
    expect(closed).toBeGreaterThan(-1);
    expect(verify).toBeGreaterThan(closed);
  });

  it("does not queue without a cached bundle", () => {
    expect(page).toContain("Download this event while online before scanning offline.");
    expect(page).toContain("if (!cachedBundle)");
  });

  it("renders age and drift levels as words, not colour alone", () => {
    expect(status).toContain("bundleStatusText");
    expect(status).toContain("AGE_LEVEL_TEXT[labels.ageLevel]");
    expect(status).toContain("DRIFT_LEVEL_TEXT[labels.driftLevel]");
    expect(status).toContain("Last sync");
    expect(status).toContain("Generated");
    expect(status).toContain("Downloaded");
  });
});
