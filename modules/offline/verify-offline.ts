import {
  SCANNER_BUNDLE_VERSION,
  type BundleRosterEntry,
  type CachedBundle,
  type ScannerBundle,
} from "./bundle-schema";
import { AGE_STALE_MS } from "./clock";
import { DEVICE_KEY_PREFIX } from "./canonical";
import { canonicalBundlePayload } from "./canonical-bundle";
import { parseQrPayload } from "../passes/verify";
import { constantTimeEqualHex, hashCredentialHex, sha256Hex } from "./verify-hash";

// On-device verification against the signed M2 event bundle.
//
// This is the offline counterpart of the online scanner: it decides whether a
// QR payload is in the downloaded, device-signed roster snapshot at the door.
// It is deliberately browser-safe (WebCrypto only) and side-effect free — the
// caller owns queueing, UI copy and the provisional record.
//
// Guarantees and limits (docs/security/rbac-ssot.md 12.7):
// - The bundle signature is checked before any pass data is trusted. A missing
//   secret, an unsigned legacy snapshot, a bundle for another organization or
//   another session, and a changed roster/pass field all fail closed.
// - The roster is the only admission list. An active pass that is not on this
//   session's roster is refused as NOT_LISTED; the verifier never consults
//   `passCache` for admission.
// - A refusal never carries a display name or person id (D-03), and no verdict
//   ever echoes the credential or its secret.
// - Bundle age uses the caller's monotonic clock only. The wall clock is used
//   only for the pass expiry comparison, so moving the device clock forward
//   cannot make a stale snapshot look fresh.
// - The result is provisional: the server revalidates every queued scan at
//   sync time, including revocations that happened after the bundle download.

/**
 * The fields this verifier needs from `CachedBundle`. `receivedAtMonoMs` is the
 * monotonic receipt stamp captured by the cache writer (`performance.now()` or
 * `process.hrtime.bigint()`); `CachedBundle` in bundle-schema predates it, so it
 * is optional here. When it is absent the age is unmeasurable and `stale` is
 * true; the verifier does not substitute the untrusted wall clock.
 */
export type OfflineCachedBundle = Pick<
  CachedBundle,
  "bundle" | "generatedAt" | "receivedAt" | "serverTime" | "sessionId"
> & {
  receivedAtMonoMs?: number;
};

/**
 * Why a pass is not on the roster. `revoked_since_bundle` is reserved for
 * sync-side reconciliation: the offline verifier never emits it, because an
 * unlisted pass that happens to appear in the revocation list must remain
 * indistinguishable from an unknown pass at the door.
 */
export type OfflineNotListedReason = "not_on_roster" | "revoked_since_bundle" | "unknown_pass";

export type OfflineVerdict =
  | {
      verdict: "VALID";
      personId: string;
      displayName: string;
      expiresAt: string | null;
      bundleAgeMs: number;
      stale: boolean;
      provisional: true;
    }
  | { verdict: "EXPIRED" }
  | { verdict: "REVOKED" }
  | { verdict: "NOT_LISTED"; reason: OfflineNotListedReason }
  | { verdict: "INACTIVE_PERSON" }
  | { verdict: "INVALID_CREDENTIAL" }
  | { verdict: "INVALID_FORMAT" }
  | { verdict: "BUNDLE_MISSING" }
  | { verdict: "BUNDLE_UNSUPPORTED" }
  | { verdict: "BUNDLE_TAMPERED" };

export type VerifyOfflineInput = {
  /** Raw `PRISM1:<passPublicId>:<secret>` payload from the scanner. */
  credential: string;
  cachedBundle: OfflineCachedBundle | null | undefined;
  expectedOrganizationId: string;
  /** One-time device secret; hashed locally before the bundle HMAC check. */
  deviceSecret: string;
  /** Device wall clock, used only for pass expiry. */
  nowMs: number;
  /** Monotonic device clock (same origin as `receivedAtMonoMs`), used for bundle age. */
  nowMonoMs: number;
  /** Age at or above this is flagged `stale`. Defaults to the 24-hour UI limit. */
  maxBundleAgeMs?: number;
};

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hasSupportedShape(bundle: unknown): bundle is ScannerBundle {
  if (typeof bundle !== "object" || bundle === null) return false;
  const candidate = bundle as Partial<ScannerBundle>;
  return (
    candidate.bundleVersion === SCANNER_BUNDLE_VERSION &&
    typeof candidate.organizationId === "string" &&
    Array.isArray(candidate.sessionIds) &&
    Array.isArray(candidate.roster) &&
    Array.isArray(candidate.revocations)
  );
}

/**
 * HMAC-SHA256(deviceKeyHash(secret), canonicalBundlePayload(bundle)), matching
 * the server signer in sync-bundle/route.ts and the cache client's verifier.
 * The HMAC key is the lowercase hex hash as ASCII text, not the decoded bytes.
 */
async function verifyBundleSignature(bundle: ScannerBundle, deviceSecret: string): Promise<boolean> {
  if (typeof deviceSecret !== "string" || deviceSecret.length === 0) return false;
  const { bundleSignature, ...unsigned } = bundle;
  if (typeof bundleSignature !== "string" || bundleSignature.length === 0) return false;

  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return false;
    const keyHash = await sha256Hex(`${DEVICE_KEY_PREFIX}${deviceSecret}`);
    const key = await subtle.importKey(
      "raw",
      new TextEncoder().encode(keyHash),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(canonicalBundlePayload(unsigned)),
    );
    return constantTimeEqualHex(toHex(signature), bundleSignature);
  } catch {
    // WebCrypto unavailable or malformed key material: fail closed.
    return false;
  }
}

function computeBundleAgeMs(cached: OfflineCachedBundle, nowMonoMs: number): number {
  const receivedAtMonoMs = cached.receivedAtMonoMs;
  if (
    typeof nowMonoMs !== "number" ||
    !Number.isFinite(nowMonoMs) ||
    typeof receivedAtMonoMs !== "number" ||
    !Number.isFinite(receivedAtMonoMs)
  ) {
    // Unmeasurable age is not "fresh". NaN is the explicit unknown value; the
    // caller must present it as an expired/unknown snapshot (ageLabel does).
    return Number.NaN;
  }
  return Math.max(0, nowMonoMs - receivedAtMonoMs);
}

function normalizedMaxAge(maxBundleAgeMs: number | undefined): number {
  if (
    typeof maxBundleAgeMs === "number" &&
    Number.isFinite(maxBundleAgeMs) &&
    maxBundleAgeMs >= 0
  ) {
    return maxBundleAgeMs;
  }
  return AGE_STALE_MS;
}

/** Pick the newest roster row for the pass; a bundle should contain at most one. */
function findRosterEntry(
  roster: readonly BundleRosterEntry[],
  sessionId: string,
  passPublicId: string,
): BundleRosterEntry | undefined {
  let match: BundleRosterEntry | undefined;
  for (const entry of roster) {
    if (entry.sessionId !== sessionId || entry.passPublicId !== passPublicId) continue;
    if (!match || entry.passVersion > match.passVersion) match = entry;
  }
  return match;
}

/**
 * Verify one scanned credential against the cached event bundle.
 *
 * Evaluation order is security-relevant:
 * 1. Bundle presence, version/shape, organization and session scope.
 * 2. Device signature over the canonical bundle.
 * 3. QR format.
 * 4. Roster membership for the cached session.
 * 5. Credential hash.
 * 6. Revocation of that pass version, then person status.
 * 7. Pass expiry.
 *
 * A pass absent from the roster is never looked up in the revocation list, so
 * the verdict cannot reveal that an unlisted pass was revoked.
 */
export async function verifyOffline(input: VerifyOfflineInput): Promise<OfflineVerdict> {
  const cached = input.cachedBundle;
  if (!cached || typeof cached !== "object" || !cached.bundle) {
    return { verdict: "BUNDLE_MISSING" };
  }

  const bundle = cached.bundle;
  if (!hasSupportedShape(bundle)) return { verdict: "BUNDLE_UNSUPPORTED" };

  const expectedOrganizationId =
    typeof input.expectedOrganizationId === "string" ? input.expectedOrganizationId.trim() : "";
  if (!expectedOrganizationId || bundle.organizationId !== expectedOrganizationId) {
    // A signed bundle for another tenant is not usable here. It is refused as
    // unsupported scope before its signature is even considered.
    return { verdict: "BUNDLE_UNSUPPORTED" };
  }

  const sessionId = typeof cached.sessionId === "string" ? cached.sessionId.trim() : "";
  if (!sessionId || !bundle.sessionIds.includes(sessionId)) {
    // The legacy org-wide snapshot carries no event roster and must not admit
    // attendees at a disconnected door.
    return { verdict: "BUNDLE_UNSUPPORTED" };
  }

  if (!(await verifyBundleSignature(bundle, input.deviceSecret))) {
    return { verdict: "BUNDLE_TAMPERED" };
  }

  const parsed = parseQrPayload(input.credential);
  if (!parsed) return { verdict: "INVALID_FORMAT" };

  const entry = findRosterEntry(bundle.roster, sessionId, parsed.passPublicId);
  if (!entry) {
    // Do not consult revocations here: an unlisted pass that is present in the
    // revocation list must look exactly like an unknown pass (D-03, 12.7).
    const knownElsewhere = bundle.roster.some(
      (candidate) => candidate.passPublicId === parsed.passPublicId,
    );
    return {
      verdict: "NOT_LISTED",
      reason: knownElsewhere ? "not_on_roster" : "unknown_pass",
    };
  }

  const computed = await hashCredentialHex(parsed.passPublicId, parsed.secret);
  if (!constantTimeEqualHex(computed, entry.credentialHash)) {
    return { verdict: "INVALID_CREDENTIAL" };
  }

  // Version-specific: a revocation of an older rotated version must not block
  // the replacement pass that is currently on the roster.
  const revoked = bundle.revocations.some(
    (revocation) =>
      revocation.passPublicId === parsed.passPublicId &&
      revocation.passVersion === entry.passVersion,
  );
  if (revoked) return { verdict: "REVOKED" };

  if (String(entry.personStatus).trim().toLowerCase() !== "active") {
    return { verdict: "INACTIVE_PERSON" };
  }

  const nowMs = input.nowMs;
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
    // Without a usable wall clock the expiry cannot be evaluated; fail closed.
    return { verdict: "EXPIRED" };
  }
  const expiresAt = entry.expiresAt ?? null;
  if (expiresAt !== null) {
    const expiresMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresMs) || expiresMs < nowMs) return { verdict: "EXPIRED" };
  }

  const bundleAgeMs = computeBundleAgeMs(cached, input.nowMonoMs);
  const maxBundleAgeMs = normalizedMaxAge(input.maxBundleAgeMs);
  const stale = !Number.isFinite(bundleAgeMs) || bundleAgeMs >= maxBundleAgeMs;

  return {
    verdict: "VALID",
    personId: entry.personId,
    displayName: entry.displayName,
    expiresAt,
    bundleAgeMs,
    stale,
    provisional: true,
  };
}
