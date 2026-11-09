// Verify-only scanner logic (owner-confirmed): validity check, no attendance write (P3).
//
// This module stays dependency-free apart from the type system so it is safe to
// import from client components. Server-only credential comparison lives in
// modules/passes/credential.ts.

export type PassStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type PassStatusReason = "VALID" | "REVOKED" | "EXPIRED" | "INVALID_STATUS" | "INVALID_EXPIRY";
export type PassStatusResult = { valid: true; reason: "VALID" } | { valid: false; reason: Exclude<PassStatusReason, "VALID"> };
// `status` is typed as string so callers can pass an unvalidated database value
// (and the verifier can report INVALID_STATUS) without an unsafe cast.
export type PassLike = { status: string; expiresAt?: Date | string | null };

// Real pass ids are `pp_` + 16 hex chars (issuance) or `pp_demo_` + a short
// slug (seed). Both fit [A-Za-z0-9_-]; the schema does not constrain the
// column, so the parser bounds the shape without requiring a `pp_` prefix that
// could reject a manually provisioned legacy pass that exists in the database.
const MAX_PASS_PUBLIC_ID_LENGTH = 64;
const PASS_PUBLIC_ID_PATTERN = "[A-Za-z0-9_-]{1," + MAX_PASS_PUBLIC_ID_LENGTH + "}";
// "PRISM1:" + passPublicId + ":" + 64-hex secret.
export const MAX_QR_PAYLOAD_LENGTH = "PRISM1:".length + MAX_PASS_PUBLIC_ID_LENGTH + 1 + 64;
const QR_PATTERN = new RegExp("^PRISM1:(" + PASS_PUBLIC_ID_PATTERN + "):([a-f0-9]{64})$", "i");

/**
 * Parse an opaque `PRISM1:<passPublicId>:<64-hex-secret>` QR payload.
 *
 * Strict by design: no trimming, no whitespace anywhere, no trailing garbage,
 * no oversized ids/payloads. The secret is returned verbatim because the hash
 * is over the literal string; callers must not normalise its casing.
 */
export function parseQrPayload(payload: string): { passPublicId: string; secret: string } | null {
  if (typeof payload !== "string") return null;
  if (payload.length === 0 || payload.length > MAX_QR_PAYLOAD_LENGTH) return null;
  // Anchored regexes still allow a trailing newline in JavaScript (`$` matches
  // before a final line terminator), and whitespace must never be silently
  // accepted or trimmed away from an opaque credential.
  if (/\s/.test(payload)) return null;
  const match = QR_PATTERN.exec(payload);
  if (!match) return null;
  return { passPublicId: match[1], secret: match[2] };
}

/**
 * HTTP status shared by the verify-only endpoint and the attendance scan path.
 * Revocation is an authorization failure (403); every other unusable state is
 * "gone/expired" (410), preserving the pre-existing API contract.
 */
export function passStatusHttpStatus(reason: Exclude<PassStatusReason, "VALID">): 403 | 410 {
  return reason === "REVOKED" ? 403 : 410;
}

/**
 * Decide whether a pass may be used at `now`.
 *
 * Fail-closed on unparseable expiry values: a non-null `expiresAt` that does
 * not produce a finite timestamp is reported as INVALID_EXPIRY rather than
 * falling through to VALID (the old `new Date(x) < now` check was false for
 * `Invalid Date`, silently accepting corrupt rows).
 */
export function verifyPassStatus(p: PassLike, now = new Date()): PassStatusResult {
  if (p.status === "REVOKED") return { valid: false, reason: "REVOKED" };
  if (p.status === "EXPIRED") return { valid: false, reason: "EXPIRED" };
  if (p.status !== "ACTIVE") return { valid: false, reason: "INVALID_STATUS" };
  if (p.expiresAt !== null && p.expiresAt !== undefined) {
    const expiresAt = p.expiresAt instanceof Date ? p.expiresAt : new Date(p.expiresAt);
    const expiryMs = expiresAt.getTime();
    if (!Number.isFinite(expiryMs)) return { valid: false, reason: "INVALID_EXPIRY" };
    if (expiryMs < now.getTime()) return { valid: false, reason: "EXPIRED" };
  }
  return { valid: true, reason: "VALID" };
}
