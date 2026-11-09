import { timingSafeEqual } from "crypto";
import { hashCredential } from "@/modules/passes/service";

// Server-only credential verification.
//
// The QR payload carries the public id and the secret in clear text. The
// database stores only SHA-256("<passPublicId>:<secret>"). Comparing hashes
// with `===` leaks the position of the first differing byte through timing,
// so both server verification paths must use this helper instead.
//
// Kept out of modules/passes/verify.ts so the pure QR parser stays safe to
// import from client bundles (no Node `crypto` dependency).

const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/i;

/**
 * Constant-time comparison of two hex strings.
 *
 * Returns false for non-string input, invalid hex, odd-length hex and length
 * mismatches before touching `crypto.timingSafeEqual` (which throws when the
 * buffers differ in length). Inputs are validated as hex first because
 * `Buffer.from(value, "hex")` silently truncates malformed strings.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (!HEX_PATTERN.test(a) || !HEX_PATTERN.test(b)) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Verify a scanned pass id + secret against the stored credential hash.
 *
 * The hash scheme is unchanged on purpose: `hashCredential` hashes the literal
 * `<passPublicId>:<secret>` string, exactly as issuance and the offline scanner
 * do. Only the comparison primitive changes.
 */
export function verifyCredentialHash(
  passPublicId: string,
  secret: string,
  storedCredentialHash: string,
): boolean {
  if (typeof passPublicId !== "string" || typeof secret !== "string") return false;
  if (typeof storedCredentialHash !== "string") return false;
  const computed = hashCredential(passPublicId, secret);
  return constantTimeEqualHex(computed, storedCredentialHash);
}
