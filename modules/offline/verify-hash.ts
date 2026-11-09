// Browser-safe credential hashing for the on-device verifier.
//
// The server stores SHA-256("<passPublicId>:<secret>") (see
// modules/passes/service.ts) and verifies it with Node's timingSafeEqual (see
// modules/passes/credential.ts). This module reproduces the same digest with
// WebCrypto so the offline verifier can run in a browser and under Node 22
// without importing `node:crypto`, `server-only`, or the server-only credential
// helper.
//
// The QR secret is a 256-bit server-derived value, not a password: the hash is
// a stored verifier, not a password KDF.

const HEX_PATTERN = /^(?:[0-9a-f]{2})+$/i;

function subtleOrThrow(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Credential hashing requires WebCrypto (https, localhost, or Node 22).");
  }
  return subtle;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 of a UTF-8 string as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  if (typeof text !== "string") throw new TypeError("sha256Hex expects a string");
  const digest = await subtleOrThrow().digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(digest);
}

/**
 * Verifier for one pass: SHA-256 over the literal `<passPublicId>:<secret>`,
 * exactly as issuance and the server-side verifier compute it. The secret is
 * never normalised or trimmed: the hash is over the raw scanned characters.
 */
export async function hashCredentialHex(passPublicId: string, secret: string): Promise<string> {
  if (typeof passPublicId !== "string" || typeof secret !== "string") {
    throw new TypeError("hashCredentialHex expects two strings");
  }
  return sha256Hex(`${passPublicId}:${secret}`);
}

/**
 * Length-constant comparison of two hex strings.
 *
 * WebCrypto has no timing-safe primitive, so this XORs every character and
 * only branches on the aggregate. Inputs are validated as even-length hex
 * first; a malformed or differently sized value fails without a prefix
 * comparison. Case is normalised, matching Node's `timingSafeEqual` on bytes.
 */
export function constantTimeEqualHex(expected: string, actual: string): boolean {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (!HEX_PATTERN.test(expected) || !HEX_PATTERN.test(actual)) return false;
  if (expected.length !== actual.length || expected.length === 0) return false;

  const left = expected.toLowerCase();
  const right = actual.toLowerCase();
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
