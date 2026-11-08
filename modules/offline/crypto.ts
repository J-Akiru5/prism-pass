import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { canonicalBatchPayload, DEVICE_KEY_PREFIX } from "./canonical";
import type { BatchPayload } from "./schema";

export { CANONICAL_VERSION, DEVICE_KEY_PREFIX, canonicalBatchPayload } from "./canonical";

// P6 device signing (pure crypto, no Prisma).
//
// Design note: HMAC is symmetric, so *some* key material must remain on the
// server. We return the device secret exactly once and persist only its
// SHA-256 domain-separated hash. Clients derive the same hash locally and use
// it as the HMAC key; the raw secret is never stored or sent again. A database
// disclosure therefore yields a signing verifier (inherent to HMAC without a
// KMS), never the device-issued secret.

export type DeviceKey = { devicePublicId: string; secret: string };

/** Generate a device identity and a one-time secret (returned to the caller once). */
export function generateDeviceKey(): DeviceKey {
  return {
    devicePublicId: `dev_${randomBytes(12).toString("hex")}`,
    secret: randomBytes(32).toString("hex"),
  };
}

/** One-way, domain-separated derivation stored as `Device.secretHash`. */
export function deviceKeyHash(secret: string): string {
  return createHash("sha256").update(`${DEVICE_KEY_PREFIX}${secret}`).digest("hex");
}

function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

/** Sign a batch with the one-time device secret (server-side/Node callers). */
export function signBatch(batch: BatchPayload, secret: string): string {
  return hmacHex(deviceKeyHash(secret), canonicalBatchPayload(batch));
}

/** Constant-time hex comparison; length mismatches fail without leaking a prefix. */
export function secureCompareHex(expected: string, actual: string): boolean {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (!/^[a-f0-9]+$/i.test(expected) || !/^[a-f0-9]+$/i.test(actual)) return false;
  if (expected.length !== actual.length || expected.length === 0) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export type VerifyBatchSignatureInput = {
  batch: BatchPayload;
  /** The stored `Device.secretHash`, never the raw secret. */
  secretHash: string;
  signature: string;
};

/**
 * Verify the HMAC over the canonical payload. The caller must still check the
 * batch clock window (`validateBatch`) and device revocation.
 */
export function verifyBatchSignature({ batch, secretHash, signature }: VerifyBatchSignatureInput): boolean {
  if (!secretHash) return false;
  const expected = hmacHex(secretHash, canonicalBatchPayload(batch));
  return secureCompareHex(expected, signature);
}

/** Replay/batch identity is org-scoped; the same batchId under another org is a different batch. */
export function batchReplayKey(organizationId: string, batchId: string): string {
  return `${organizationId}:${batchId}`;
}

export function isBatchReplay(existingReplayKeys: ReadonlySet<string>, organizationId: string, batchId: string): boolean {
  return existingReplayKeys.has(batchReplayKey(organizationId, batchId));
}

/** Stable UUID for a queued scan; generated on the device before any network call. */
export function newIdempotencyKey(): string {
  return randomUUID();
}
