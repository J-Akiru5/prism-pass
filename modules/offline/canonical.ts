import type { BatchPayload } from "./schema";

// Canonical wire form shared by the browser signer (`lib/sync-client.ts`) and
// the server verifier (`modules/offline/crypto.ts`). Deliberately dependency
// free: the browser must be able to import it without pulling `node:crypto`
// into the client bundle, and both sides must produce byte-identical text.

export const DEVICE_KEY_PREFIX = "prism-device-key:v1:";
export const CANONICAL_VERSION = "prism-sync-v1";

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
    const geo = event.geo ? `${event.geo.lat},${event.geo.lng},${event.geo.accuracyM ?? ""}` : "none";
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
