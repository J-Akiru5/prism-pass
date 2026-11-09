import type {
  BundleGeofence,
  BundlePassCacheEntry,
  BundlePolicy,
  BundleRevocation,
  BundleRosterEntry,
  BundleSession,
  BundleTruncated,
  ScannerBundle,
} from "./bundle-schema";

// Deterministic canonical text for the M2 bundle HMAC.
//
// Dependency free on purpose: the browser verifier (`lib/bundle-client.ts`)
// and the server signer (`sync-bundle/route.ts`) must produce byte-identical
// text without pulling `node:crypto` into the client bundle.
//
// Stability rules:
// - Every array is sorted by its identity fields, so database row order cannot
//   change the signature.
// - Objects are rebuilt with a fixed key order; `limits` and `truncated` are
//   normalised to sorted [key, value] pairs.
// - Optional/absent values become explicit nulls or empty strings.
// - `bundleSignature` is never part of the payload (it signs the payload).

export const BUNDLE_CANONICAL_VERSION = "prism-bundle-v2";

export type BundleSignable = Omit<ScannerBundle, "bundleSignature">;

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asNullableText = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const asBoolean = (value: unknown): boolean => value === true;

/** Locale-independent comparison; identical output on every runtime. */
function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortBy<T>(items: readonly T[], compare: (left: T, right: T) => number): T[] {
  return [...items].sort(compare);
}

function compareSessions(left: BundleSession, right: BundleSession): number {
  return compareText(asText(left.id), asText(right.id));
}

function comparePolicies(left: BundlePolicy, right: BundlePolicy): number {
  return compareText(asText(left.id), asText(right.id));
}

function compareGeofences(left: BundleGeofence, right: BundleGeofence): number {
  return compareText(asText(left.id), asText(right.id));
}

function compareRoster(left: BundleRosterEntry, right: BundleRosterEntry): number {
  return (
    compareText(asText(left.sessionId), asText(right.sessionId)) ||
    compareText(asText(left.personId), asText(right.personId)) ||
    compareText(asText(left.passPublicId), asText(right.passPublicId)) ||
    asNumber(left.passVersion) - asNumber(right.passVersion)
  );
}

function compareRevocations(left: BundleRevocation, right: BundleRevocation): number {
  return (
    compareText(asText(left.passPublicId), asText(right.passPublicId)) ||
    asNumber(left.passVersion) - asNumber(right.passVersion) ||
    compareText(asText(left.revokedAt), asText(right.revokedAt))
  );
}

function comparePassCache(left: BundlePassCacheEntry, right: BundlePassCacheEntry): number {
  return (
    compareText(asText(left.passPublicId), asText(right.passPublicId)) ||
    asNumber(left.passVersion) - asNumber(right.passVersion)
  );
}

function canonicalTruncated(truncated: BundleTruncated | undefined): Array<[string, boolean]> {
  const value = truncated ?? ({} as Partial<BundleTruncated>);
  return [
    ["geofences", asBoolean(value.geofences)],
    ["passes", asBoolean(value.passes)],
    ["policies", asBoolean(value.policies)],
    ["revocations", asBoolean(value.revocations)],
    ["roster", asBoolean(value.roster)],
    ["sessions", asBoolean(value.sessions)],
  ];
}

function canonicalLimits(
  limits: BundleSignable["limits"] | undefined,
): Array<[string, number]> {
  return Object.entries(limits ?? {})
    .map(([key, value]): [string, number] => [key, asNumber(value)])
    .sort((left, right) => compareText(left[0], right[0]));
}

/**
 * Canonical text signed by the server and re-derived by the browser. The output
 * is independent of array order and of the object key order in `limits` and
 * `truncated`; changing any signed field (roster name, pass version, expiry,
 * timestamp, limits, ...) changes the text.
 */
export function canonicalBundlePayload(bundle: BundleSignable): string {
  const bundleRecord = bundle as Partial<BundleSignable>;
  const sessionIds = Array.from(
    new Set((bundleRecord.sessionIds ?? []).map((sessionId) => asText(sessionId))),
  ).sort(compareText);

  return JSON.stringify({
    canonical: BUNDLE_CANONICAL_VERSION,
    bundleVersion: asNumber(bundleRecord.bundleVersion),
    organizationId: asText(bundleRecord.organizationId),
    deviceId: asNullableText(bundleRecord.deviceId),
    generatedAt: asText(bundleRecord.generatedAt),
    serverTime: asText(bundleRecord.serverTime),
    sessionIds,
    truncated: canonicalTruncated(bundleRecord.truncated),
    limits: canonicalLimits(bundleRecord.limits),
    sessions: sortBy(bundleRecord.sessions ?? [], compareSessions).map((session) => [
      asText(session.id),
      asText(session.title),
      asText(session.type),
      asText(session.startsAt),
      asText(session.endsAt),
      asText(session.timezone),
      asText(session.policyId),
      asText(session.status),
      asNullableText(session.closedAt),
      asBoolean(session.rosterEnforced),
      asBoolean(session.walkInAllowed),
    ]),
    policies: sortBy(bundleRecord.policies ?? [], comparePolicies).map((policy) => [
      asText(policy.id),
      asText(policy.name),
      asNumber(policy.graceMin),
      asNumber(policy.lateThresholdMin),
      asNumber(policy.duplicateWindowSec),
      asText(policy.geoMode),
    ]),
    geofences: sortBy(bundleRecord.geofences ?? [], compareGeofences).map((geofence) => [
      asText(geofence.id),
      asText(geofence.label),
      asNumber(geofence.centerLat),
      asNumber(geofence.centerLng),
      asNumber(geofence.radiusM),
    ]),
    roster: sortBy(bundleRecord.roster ?? [], compareRoster).map((entry) => [
      asText(entry.sessionId),
      asText(entry.personId),
      asText(entry.displayName),
      asText(entry.passPublicId),
      asNumber(entry.passVersion),
      asText(entry.credentialHash),
      asNullableText(entry.expiresAt),
      asText(entry.personStatus),
      asText(entry.rosterState),
    ]),
    revocations: sortBy(bundleRecord.revocations ?? [], compareRevocations).map((revocation) => [
      asText(revocation.passPublicId),
      asNumber(revocation.passVersion),
      asText(revocation.revokedAt),
    ]),
    passCache: sortBy(bundleRecord.passCache ?? [], comparePassCache).map((entry) => [
      asText(entry.passPublicId),
      asNumber(entry.passVersion),
      asText(entry.statusAtSync),
      asNullableText(entry.expiresAt),
      asText(entry.personId),
      asText(entry.credentialHash),
    ]),
  });
}
