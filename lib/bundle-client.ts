import {
  SCANNER_BUNDLE_VERSION,
  scannerBundleSchema,
  type CachedBundle,
  type CachedBundleRecord,
  type ScannerBundle,
} from "@/modules/offline/bundle-schema";
import {
  canonicalBundlePayload,
  type BundleSignable,
} from "@/modules/offline/canonical-bundle";
import { estimateClockDrift } from "@/modules/offline/clock";
import {
  OfflineQueueError,
  isQuotaExceededError,
} from "@/modules/offline/queue-state";
import { loadOrCreateQueueKey, loadQueueKey, openCredential, sealCredential } from "@/modules/offline/at-rest";
import { deleteBundle, getBundle, putBundle } from "@/lib/offline-queue";
import { hashDeviceSecret } from "@/lib/sync-client";

// Browser-side M2 event bundle client.
//
// `fetchAndCacheBundle` downloads the signed snapshot, verifies the HMAC with
// the device secret (hashed exactly like the server's `deviceKeyHash`), seals
// the whole bundle with the queue's non-extractable AES-GCM key, and stores it
// in the Dexie `bundles` table. A quota failure is a typed error and never
// deletes the scan queue or an existing bundle.
//
// `loadCachedBundle` returns the bundle plus age/drift metadata for the scanner
// banner. The bundle is only a snapshot: the server revalidates every queued
// scan at sync time (see docs/security/rbac-ssot.md 12.7).

export type BundleClientErrorCode =
  | "invalid_request"
  | "network"
  | "http"
  | "invalid_bundle"
  | "signature_invalid"
  | "quota"
  | "unavailable"
  | "unreadable";

export class BundleClientError extends Error {
  readonly code: BundleClientErrorCode;
  readonly status: number | null;

  constructor(code: BundleClientErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "BundleClientError";
    this.code = code;
    this.status = status;
  }
}

export const BUNDLE_REQUEST_TIMEOUT_MS = 30_000;

export function bundleEndpoint(organizationId: string): string {
  return `/api/v1/orgs/${encodeURIComponent(organizationId)}/sync-bundle`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function readError(body: unknown): { code: string; message: string } {
  if (!isRecord(body) || !isRecord(body.error)) return { code: "", message: "" };
  return {
    code: typeof body.error.code === "string" ? body.error.code : "",
    message: typeof body.error.message === "string" ? body.error.message : "",
  };
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 keyed by the device secret hash, matching the server signer. */
async function hmacHex(secretHash: string, message: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new BundleClientError(
      "unavailable",
      "Bundle signing requires a secure context (https or localhost).",
    );
  }
  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secretHash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(signature);
}

/** Sign an unsigned bundle with the one-time device secret (browser/WebCrypto). */
export async function signBundlePayload(bundle: BundleSignable, secret: string): Promise<string> {
  return hmacHex(await hashDeviceSecret(secret), canonicalBundlePayload(bundle));
}

/** Length-constant hex comparison; there is no timing-safe primitive in WebCrypto. */
function constantTimeEqualHex(expected: string, actual: string): boolean {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  if (expected.length !== actual.length || expected.length === 0) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index += 1) {
    diff |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Verify a downloaded bundle against the device secret. The signature covers
 * every signed field through `canonicalBundlePayload`; a tampered roster,
 * expiry, pass version or timestamp fails verification.
 */
export async function verifyBundleSignature(
  bundle: ScannerBundle,
  secret: string,
): Promise<boolean> {
  if (!bundle.bundleSignature) return false;
  const { bundleSignature, ...unsigned } = bundle;
  const expected = await signBundlePayload(unsigned, secret);
  return constantTimeEqualHex(expected, bundleSignature);
}

function mapQueueError(error: unknown): BundleClientError {
  if (error instanceof BundleClientError) return error;
  if (isQuotaExceededError(error)) {
    return new BundleClientError(
      "quota",
      "This device has no storage left for the offline bundle (IndexedDB quota exceeded). " +
        "The bundle was not cached and the scan queue was left untouched.",
    );
  }
  if (error instanceof OfflineQueueError) {
    if (error.code === "quota") {
      return new BundleClientError(
        "quota",
        "This device has no storage left for the offline bundle (IndexedDB quota exceeded). " +
          "The bundle was not cached and the scan queue was left untouched.",
      );
    }
    return new BundleClientError("unavailable", error.message);
  }
  return new BundleClientError(
    "unavailable",
    "Secure storage for the offline bundle is unavailable in this browser.",
  );
}

export type FetchAndCacheBundleInput = {
  organizationId: string;
  sessionId?: string;
  deviceId: string;
  /** One-time device secret; hashed locally before the HMAC check. */
  secret: string;
  endpoint?: string;
  /** Injectable for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
};

/**
 * Download, verify and cache one bundle. Throws `BundleClientError` with a
 * stable code; in particular `quota` means the cache write failed but no queue
 * row or prior bundle was removed.
 */
export async function fetchAndCacheBundle(input: FetchAndCacheBundleInput): Promise<CachedBundle> {
  const organizationId = input.organizationId.trim();
  const deviceId = input.deviceId.trim();
  const secret = input.secret.trim();
  if (!organizationId || !deviceId || !secret) {
    throw new BundleClientError(
      "invalid_request",
      "An organization id, a device id and the device secret are required to download a bundle.",
    );
  }

  const now = input.now ?? Date.now;
  const params = new URLSearchParams();
  if (input.sessionId?.trim()) params.set("sessionId", input.sessionId.trim());
  params.set("deviceId", deviceId);
  const endpoint = `${input.endpoint ?? bundleEndpoint(organizationId)}?${params.toString()}`;

  const timeoutMs = Math.max(1, input.timeoutMs ?? BUNDLE_REQUEST_TIMEOUT_MS);
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const beforeMs = now();

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(endpoint, {
      method: "GET",
      credentials: "include",
      headers: {
        accept: "application/json",
        // Selector hint only; the device and session are authorized server-side.
        "x-org-id": organizationId,
      },
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    throw new BundleClientError(
      "network",
      `Could not download the offline bundle. ${(error as Error).message ?? ""}`.trim(),
    );
  }
  const afterMs = now();
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const serverError = readError(body);
    throw new BundleClientError(
      "http",
      serverError.message ||
        `The server refused the offline bundle (HTTP ${response.status}).`,
      response.status,
    );
  }

  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const parsed = scannerBundleSchema.safeParse(data);
  if (!parsed.success) {
    throw new BundleClientError(
      "invalid_bundle",
      "The offline bundle did not match the expected version 2 shape.",
    );
  }
  const bundle = parsed.data;

  if (bundle.organizationId !== organizationId) {
    throw new BundleClientError("invalid_bundle", "The offline bundle belongs to another organization.");
  }
  if (bundle.deviceId !== deviceId) {
    throw new BundleClientError("invalid_bundle", "The offline bundle was signed for another device.");
  }
  if (!bundle.bundleSignature) {
    throw new BundleClientError("signature_invalid", "The offline bundle is not signed.");
  }
  if (!(await verifyBundleSignature(bundle, secret))) {
    throw new BundleClientError(
      "signature_invalid",
      "The offline bundle signature did not verify; it was not cached.",
    );
  }

  const serverTimeMs = Date.parse(bundle.serverTime);
  const drift = estimateClockDrift({
    deviceBeforeMs: beforeMs,
    deviceAfterMs: afterMs,
    serverTimeMs,
  });
  const driftMs = Number.isFinite(drift.driftMs) ? drift.driftMs : null;
  const rttMs = Number.isFinite(drift.rttMs) ? drift.rttMs : null;

  const receivedAt = now();
  let sealed: string;
  try {
    const key = await loadOrCreateQueueKey();
    sealed = await sealCredential(JSON.stringify(bundle), key);
  } catch (error) {
    throw mapQueueError(error);
  }

  const record: CachedBundleRecord = {
    organizationId,
    bundleVersion: SCANNER_BUNDLE_VERSION,
    sessionId: input.sessionId?.trim() || null,
    deviceId,
    generatedAt: bundle.generatedAt,
    receivedAt,
    serverTime: bundle.serverTime,
    driftMs,
    rttMs,
    sessionIds: [...bundle.sessionIds],
    rosterCount: bundle.roster.length,
    revocationCount: bundle.revocations.length,
    sealed,
    sealedAt: receivedAt,
  };

  try {
    await putBundle(record);
  } catch (error) {
    throw mapQueueError(error);
  }

  return {
    bundle,
    generatedAt: record.generatedAt,
    receivedAt: record.receivedAt,
    serverTime: record.serverTime,
    driftMs: record.driftMs,
    rttMs: record.rttMs,
    sessionId: record.sessionId,
    ageMs: Math.max(0, receivedAt - Date.parse(record.generatedAt)),
  };
}

/** Metadata returned by `loadCachedBundle`; age is recomputed on every load. */
export type CachedBundleLoadOptions = {
  now?: () => number;
};

/**
 * Load and unseal the cached bundle for an organization. Returns null when no
 * bundle was cached. A confirmed missing key is `unreadable`, never silently
 * treated as "no bundle" (that would hide a lost offline snapshot).
 */
export async function loadCachedBundle(
  organizationId: string,
  options: CachedBundleLoadOptions = {},
): Promise<CachedBundle | null> {
  const org = organizationId.trim();
  if (!org) return null;

  let record: CachedBundleRecord | null;
  try {
    record = await getBundle(org);
  } catch (error) {
    throw mapQueueError(error);
  }
  if (!record) return null;

  let key: CryptoKey | null;
  try {
    key = await loadQueueKey();
  } catch (error) {
    throw mapQueueError(error);
  }
  if (!key) {
    throw new BundleClientError(
      "unreadable",
      "The offline bundle could not be decrypted because its local key is missing. " +
        "Download the bundle again while this device has a connection.",
    );
  }

  let bundle: ScannerBundle;
  try {
    const json = await openCredential(record.sealed, key);
    const parsed = scannerBundleSchema.safeParse(JSON.parse(json));
    if (!parsed.success) throw new Error("cached bundle shape is invalid");
    bundle = parsed.data;
  } catch (error) {
    if (error instanceof BundleClientError) throw error;
    throw new BundleClientError(
      "unreadable",
      "The cached offline bundle could not be read. Download it again while connected.",
    );
  }

  if (bundle.organizationId !== org) {
    throw new BundleClientError("invalid_bundle", "The cached bundle belongs to another organization.");
  }

  const nowMs = (options.now ?? Date.now)();
  // Prefer the sealed bundle's own timestamps over the plaintext metadata row:
  // `generatedAt`/`serverTime` are covered by the device signature, while the
  // cache row is only as trustworthy as the origin's storage.
  return {
    bundle,
    generatedAt: bundle.generatedAt,
    receivedAt: record.receivedAt,
    serverTime: bundle.serverTime,
    driftMs: record.driftMs,
    rttMs: record.rttMs,
    sessionId: record.sessionId,
    ageMs: Math.max(0, nowMs - Date.parse(bundle.generatedAt)),
  };
}

/** Forget the cached bundle for one organization. Never touches the queue. */
export async function clearCachedBundle(organizationId: string): Promise<void> {
  const org = organizationId.trim();
  if (!org) return;
  try {
    await deleteBundle(org);
  } catch (error) {
    throw mapQueueError(error);
  }
}
