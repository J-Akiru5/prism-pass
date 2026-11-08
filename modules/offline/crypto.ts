import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { BatchPayload } from "./schema";

// P6 device signing (pure crypto, no Prisma).
//
// Design note: HMAC is symmetric, so *some* key material must remain on the
// server. We return the device secret exactly once and persist only its
// SHA-256 domain-separated hash. Clients derive the same hash locally and use
// it as the HMAC key; the raw secret is never stored or sent again. A database
// disclosure therefore yields a signing verifier (inherent to HMAC without a
// KMS), never the device-issued secret.

export const DEVICE_KEY_PREFIX = "prism-device-key:v1:";
export const CANONICAL_VERSION = "prism-sync-v1";

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

const normalizedString = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Deterministic canonical form of the signed batch. Written explicitly rather
 * than `JSON.stringify` so key order, defaults and number formatting cannot
 * drift between the browser and the server.
 */
export function canonicalBatchPayload(batch: BatchPayload): string {
  const lines = [
    CANONICAL_VERSION,
    `org:${normalizedString(batch.organizationId)}`,
    `device:${normalizedString(batch.deviceId)}`,
    `batch:${normalizedString(batch.batchId)}`,
    `client:${normalizedString(batch.clientVersion) || "1.0.0"}`,
    `sent:${normalizedString(batch.sentAt)}`,
    `count:${batch.events.length}`,
  ];

  for (const event of batch.events) {
    const geo = event.geo
      ? `${event.geo.lat},${event.geo.lng},${event.geo.accuracyM ?? ""}`
      : "none";
    lines.push(
      [
        normalizedString(event.idempotencyKey),
        normalizedString(event.sessionId),
        normalizedString(event.credential),
        normalizedString(event.clientTs),
        normalizedString(event.direction) || "auto",
        geo,
      ].join("|"),
    );
  }

  return lines.join("\n");
}

/** Sign a batch with the one-time device secret (client side). */
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
