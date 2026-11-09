import { z } from "zod";

// M2 offline event bundle (pure).
//
// The scanner downloads one signed snapshot before going offline. It verifies
// passes against this snapshot only: the roster entry is the admission list and
// the only accepted passes for an event are the ones listed in `roster`. An
// active pass that is not on the roster is deliberately absent, so an unlisted
// attendee is refused on the device instead of being admitted from the wider
// organisation pass cache.
//
// `bundleSignature` is HMAC-SHA256 over `canonicalBundlePayload()` keyed by the
// device's stored `secretHash`. A bundle without a device id is the legacy
// unsigned, organisation-wide snapshot (`deviceId: null`, `bundleSignature:
// null`); it carries no offline integrity guarantee and must not be used to
// admit attendees at a disconnected door.

export const SCANNER_BUNDLE_VERSION = 2;

/** Bounds for one bundle. The server fetches `max + 1` and flags truncation. */
export const MAX_BUNDLE_SESSIONS = 500;
export const MAX_BUNDLE_POLICIES = 500;
export const MAX_BUNDLE_GEOFENCES = 500;
export const MAX_BUNDLE_ROSTER = 5_000;
export const MAX_BUNDLE_PASSES = 5_000;
export const MAX_BUNDLE_REVOCATIONS = 5_000;

const id = z.string().min(1).max(160);
const shortText = z.string().max(500);
const isoDate = z.string().datetime();
const nonNegativeInt = z.number().int().min(0);

export const bundleSessionSchema = z.object({
  id,
  title: shortText,
  type: z.string().min(1).max(40),
  startsAt: isoDate,
  endsAt: isoDate,
  timezone: z.string().min(1).max(100),
  policyId: id,
  // Additive v2 fields. Optional so a bundle produced by a slightly older
  // server still validates; the current server always sends them.
  status: z.string().min(1).max(40).optional(),
  closedAt: isoDate.nullable().optional(),
  rosterEnforced: z.boolean().optional(),
  walkInAllowed: z.boolean().optional(),
});

export const bundlePolicySchema = z.object({
  id,
  name: shortText,
  graceMin: nonNegativeInt,
  lateThresholdMin: nonNegativeInt,
  duplicateWindowSec: nonNegativeInt,
  geoMode: z.string().min(1).max(40),
});

export const bundleGeofenceSchema = z.object({
  id,
  label: shortText,
  centerLat: z.number().finite().min(-90).max(90),
  centerLng: z.number().finite().min(-180).max(180),
  radiusM: nonNegativeInt,
});

/**
 * One admission row for one session. `credentialHash` is the verifier
 * (SHA-256(passPublicId:secret)); the QR secret itself is never in the bundle.
 * `rosterState` is `listed` for a normal roster row and `walk_in` for a row
 * explicitly recorded as a walk-in. Walk-ins are not synthesised from the org
 * pass cache: only rows present in `session_roster` become entries.
 */
export const bundleRosterEntrySchema = z.object({
  sessionId: id,
  personId: id,
  displayName: shortText,
  passPublicId: z.string().min(1).max(200),
  passVersion: z.number().int().min(1),
  credentialHash: z.string().min(1).max(256),
  expiresAt: isoDate.nullable(),
  personStatus: z.string().min(1).max(40),
  rosterState: z.enum(["listed", "walk_in"]),
});

export const bundleRevocationSchema = z.object({
  passPublicId: z.string().min(1).max(200),
  passVersion: z.number().int().min(1),
  revokedAt: isoDate,
});

/** Legacy organisation-wide pass cache, still served when no session is named. */
export const bundlePassCacheEntrySchema = z.object({
  passPublicId: z.string().min(1).max(200),
  passVersion: z.number().int().min(1),
  statusAtSync: z.string().min(1).max(40),
  expiresAt: isoDate.nullable(),
  personId: id,
  credentialHash: z.string().min(1).max(256),
});

export const bundleTruncatedSchema = z.object({
  sessions: z.boolean().default(false),
  policies: z.boolean().default(false),
  geofences: z.boolean().default(false),
  roster: z.boolean().default(false),
  passes: z.boolean().default(false),
  revocations: z.boolean().default(false),
});

export type BundleTruncated = z.infer<typeof bundleTruncatedSchema>;

export function emptyBundleTruncated(): BundleTruncated {
  return {
    sessions: false,
    policies: false,
    geofences: false,
    roster: false,
    passes: false,
    revocations: false,
  };
}

export const bundleLimitsSchema = z.object({
  maxBatchEvents: z.number().int().positive(),
  maxClientFutureSkewMs: nonNegativeInt,
  maxOfflineAgeMs: z.number().int().positive(),
  signatureSkewMs: nonNegativeInt,
  maxSessions: z.number().int().positive(),
  maxRosterEntries: z.number().int().positive(),
  maxPasses: z.number().int().positive(),
  maxPolicies: z.number().int().positive(),
  maxGeofences: z.number().int().positive(),
  maxRevocations: z.number().int().positive(),
});

export const bundleSignatureSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "bundle signature must be a hex SHA-256 HMAC");

export const scannerBundleSchema = z
  .object({
    bundleVersion: z.literal(SCANNER_BUNDLE_VERSION),
    generatedAt: isoDate,
    serverTime: isoDate,
    organizationId: z.string().min(1).max(120),
    sessionIds: z.array(id),
    sessions: z.array(bundleSessionSchema),
    policies: z.array(bundlePolicySchema),
    geofences: z.array(bundleGeofenceSchema),
    roster: z.array(bundleRosterEntrySchema),
    revocations: z.array(bundleRevocationSchema),
    passCache: z.array(bundlePassCacheEntrySchema).default([]),
    truncated: bundleTruncatedSchema.default(emptyBundleTruncated()),
    limits: bundleLimitsSchema,
    /** Requested device id; null for the legacy unsigned org-wide snapshot. */
    deviceId: id.nullable(),
    /** HMAC-SHA256(device.secretHash, canonicalBundlePayload()); null when unsigned. */
    bundleSignature: bundleSignatureSchema.nullable(),
  })
  .superRefine((bundle, ctx) => {
    if (bundle.deviceId !== null && bundle.bundleSignature === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundleSignature"],
        message: "A device-bound bundle must carry a signature",
      });
    }
    if (bundle.deviceId === null && bundle.bundleSignature !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundleSignature"],
        message: "An unsigned bundle cannot carry a signature",
      });
    }
  });

export type ScannerBundle = z.infer<typeof scannerBundleSchema>;
export type BundleSession = z.infer<typeof bundleSessionSchema>;
export type BundlePolicy = z.infer<typeof bundlePolicySchema>;
export type BundleGeofence = z.infer<typeof bundleGeofenceSchema>;
export type BundleRosterEntry = z.infer<typeof bundleRosterEntrySchema>;
export type BundleRevocation = z.infer<typeof bundleRevocationSchema>;
export type BundlePassCacheEntry = z.infer<typeof bundlePassCacheEntrySchema>;
export type BundleLimits = z.infer<typeof bundleLimitsSchema>;

/**
 * Apply a hard cap to a fetched list. Callers fetch `max + 1` rows so a full
 * page is distinguishable from a truncated one. Pure so the cap/flag behaviour
 * is testable without Prisma.
 */
export function capBundleList<T>(
  items: readonly T[],
  max: number,
): { items: T[]; truncated: boolean } {
  const limit = Math.max(0, Math.floor(max));
  if (!Number.isFinite(limit)) return { items: [...items], truncated: false };
  if (items.length <= limit) return { items: [...items], truncated: false };
  return { items: items.slice(0, limit), truncated: true };
}

/**
 * Audit metadata for one bundle download. Counts and flags only: display names,
 * person ids, pass ids and credential hashes must never reach `audit_logs.meta`.
 */
export type BundleAuditMeta = {
  bundleVersion: number;
  signed: boolean;
  sessions: number;
  policies: number;
  geofences: number;
  roster: number;
  revocations: number;
  passes: number;
  truncated: BundleTruncated;
};

export function bundleAuditMeta(input: {
  signed: boolean;
  sessions: number;
  policies: number;
  geofences: number;
  roster: number;
  revocations: number;
  passes: number;
  truncated: BundleTruncated;
}): BundleAuditMeta {
  return {
    bundleVersion: SCANNER_BUNDLE_VERSION,
    signed: input.signed,
    sessions: input.sessions,
    policies: input.policies,
    geofences: input.geofences,
    roster: input.roster,
    revocations: input.revocations,
    passes: input.passes,
    truncated: { ...input.truncated },
  };
}

/**
 * Cache metadata persisted next to the sealed bundle. Kept here (pure types) so
 * both the Dexie adapter and the browser client share one shape without
 * importing each other.
 */
export type CachedBundleRecord = {
  organizationId: string;
  bundleVersion: number;
  sessionId: string | null;
  deviceId: string | null;
  generatedAt: string;
  receivedAt: number;
  serverTime: string;
  /** `serverTime - device midpoint`; null when it could not be measured. */
  driftMs: number | null;
  rttMs: number | null;
  sessionIds: string[];
  rosterCount: number;
  revocationCount: number;
  /** AES-GCM sealed JSON of the whole bundle. */
  sealed: string;
  sealedAt: number;
};

export type CachedBundle = {
  bundle: ScannerBundle;
  generatedAt: string;
  receivedAt: number;
  serverTime: string;
  driftMs: number | null;
  rttMs: number | null;
  sessionId: string | null;
  /** Data age at load time: now - generatedAt, never negative. */
  ageMs: number;
};
