import { canonicalBatchPayload, DEVICE_KEY_PREFIX } from "@/modules/offline/canonical";
import { backoffDelayMs, MAX_BACKOFF_MS } from "@/modules/offline/queue-state";
import {
  MAX_BATCH_EVENTS,
  type BatchEnvelope,
  type BatchPayload,
  type OfflineEventInput,
} from "@/modules/offline/schema";
import {
  ack,
  fail,
  peek,
  release,
  size,
  type OfflineQueueItem,
} from "@/lib/offline-queue";

// Client-only offline sync. The device secret is never read from storage here:
// callers pass a `SyncContext` (the scanner page owns provisioning). Batch
// assembly, response decisions and the retry schedule are pure exports so they
// can be tested without IndexedDB, a browser or a server.
//
// Wire contract: POST /api/v1/sync/batches (see app/api/v1/sync/batches).

export type SyncContext = {
  organizationId: string;
  deviceId: string;
  /** One-time device secret shown at registration; hashed locally before HMAC. */
  deviceSecret: string;
  clientVersion?: string;
  endpoint?: string;
  /** Injectable only for tests; production uses the global fetch. */
  fetchImpl?: typeof fetch;
};

export type BatchReceipt = {
  idempotencyKey: string;
  sessionId: string;
  status: "accept" | "duplicate" | "reject";
  reason: string;
  eventId?: string;
  message?: string;
};

export type BatchDecision =
  | { kind: "ack"; receipts: BatchReceipt[] }
  | { kind: "replay"; batchId: string | null }
  | { kind: "reject"; code: string; message: string }
  | { kind: "fatal"; status: number; code: string; message: string }
  | { kind: "retry"; code: string; message: string; retryAfterMs?: number };

export type SyncOutcome = "idle" | "offline" | "acked" | "replay" | "retry" | "rejected" | "fatal";

export type SyncSummary = {
  outcome: SyncOutcome;
  attempted: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  remaining: number;
  message: string;
  replayed: boolean;
  receipts: BatchReceipt[];
};

const DEFAULT_ENDPOINT = "/api/v1/sync/batches";
export const DEFAULT_CLIENT_VERSION = "1.0.0";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** UUIDs are generated on the device before any network call (ADR-09). */
export function newUuid(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  if (!webCrypto?.getRandomValues) throw new Error("Secure random source unavailable");
  const bytes = webCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

function subtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  // WebCrypto needs a secure context. Say so instead of silently producing an
  // unsigned batch that the server would reject as a signature failure.
  if (!subtle) throw new Error("Batch signing requires a secure context (https or localhost)");
  return subtle;
}

/** Mirrors `deviceKeyHash` in modules/offline/crypto.ts. */
export async function hashDeviceSecret(secret: string): Promise<string> {
  const digest = await subtleCrypto().digest("SHA-256", new TextEncoder().encode(`${DEVICE_KEY_PREFIX}${secret}`));
  return toHex(digest);
}

/**
 * HMAC-SHA256 over the canonical payload, keyed by the device secret hash. The
 * server verifies this with `verifyBatchSignature`; both sides use the same
 * `canonicalBatchPayload`, so the wire form cannot drift.
 */
export async function signBatchPayload(batch: BatchPayload, secret: string): Promise<string> {
  const keyHash = await hashDeviceSecret(secret);
  const key = await subtleCrypto().importKey(
    "raw",
    new TextEncoder().encode(keyHash),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await subtleCrypto().sign("HMAC", key, new TextEncoder().encode(canonicalBatchPayload(batch)));
  return toHex(signature);
}

export type BuildBatchOptions = {
  organizationId: string;
  deviceId: string;
  batchId?: string;
  sentAt?: string;
  clientVersion?: string;
  maxEvents?: number;
};

export type BuiltBatch = {
  batch: BatchPayload;
  items: OfflineQueueItem[];
  /** Peeked rows belonging to another org/device; the caller must release them. */
  excluded: OfflineQueueItem[];
};

function normalizeEvent(event: OfflineEventInput) {
  return {
    idempotencyKey: event.idempotencyKey,
    sessionId: event.sessionId,
    credential: event.credential,
    clientTs: event.clientTs,
    direction: event.direction ?? "auto",
    ...(event.geo ? { geo: event.geo } : {}),
  };
}

/**
 * Assemble a batch from queued rows.
 *
 * Ordering: `clientTs` ascending (tie-broken by capture order), because the
 * server refuses a batch whose client timestamps move backwards. Rows captured
 * before this device was provisioned (`deviceId` empty) are adopted, so a
 * queue written while the signing key was absent is not stranded.
 */
export function buildBatchFromQueue(items: readonly OfflineQueueItem[], options: BuildBatchOptions): BuiltBatch {
  const maxEvents = Math.max(0, Math.floor(options.maxEvents ?? MAX_BATCH_EVENTS));
  const deviceId = options.deviceId.trim();

  const matching: OfflineQueueItem[] = [];
  const excluded: OfflineQueueItem[] = [];
  for (const item of items) {
    const sameOrg = item.organizationId === options.organizationId;
    const sameDevice = item.deviceId === deviceId || item.deviceId.trim() === "";
    if (sameOrg && sameDevice) matching.push(item);
    else excluded.push(item);
  }

  const selected = matching
    .slice()
    .sort(
      (a, b) =>
        a.event.clientTs.localeCompare(b.event.clientTs) ||
        a.createdAt - b.createdAt ||
        (a.id ?? 0) - (b.id ?? 0),
    )
    .slice(0, maxEvents);

  return {
    batch: {
      organizationId: options.organizationId,
      deviceId,
      batchId: options.batchId ?? newUuid(),
      clientVersion: options.clientVersion ?? DEFAULT_CLIENT_VERSION,
      sentAt: options.sentAt ?? new Date().toISOString(),
      events: selected.map((item) => normalizeEvent(item.event)),
    },
    items: selected,
    excluded,
  };
}

export async function buildSignedEnvelope(batch: BatchPayload, secret: string): Promise<BatchEnvelope> {
  return { ...batch, signature: await signBatchPayload(batch, secret) };
}

function parseReceipt(value: unknown): BatchReceipt | null {
  if (!isRecord(value)) return null;
  const { idempotencyKey, sessionId, status, reason, eventId, message } = value;
  if (typeof idempotencyKey !== "string" || typeof sessionId !== "string") return null;
  if (status !== "accept" && status !== "duplicate" && status !== "reject") return null;
  if (typeof reason !== "string") return null;
  return {
    idempotencyKey,
    sessionId,
    status,
    reason,
    ...(typeof eventId === "string" ? { eventId } : {}),
    ...(typeof message === "string" ? { message } : {}),
  };
}

function readError(body: unknown): { code: string; message: string; details: unknown } {
  if (!isRecord(body) || !isRecord(body.error)) {
    return { code: "", message: "", details: undefined };
  }
  const { code, message, details } = body.error;
  return {
    code: typeof code === "string" ? code : "",
    message: typeof message === "string" ? message : "",
    details,
  };
}

function readReplayBatchId(details: unknown): string | null {
  if (!isRecord(details)) return null;
  return typeof details.batchId === "string" ? details.batchId : null;
}

/**
 * Decision table for a batch response.
 *
 * 200 + valid receipts → ack (delete accepted/duplicate rows, keep rejects).
 * 409 → the batch id was already processed; retry the same idempotency keys
 *       under a fresh batch id (the server reports them as duplicates).
 * 400 → structurally invalid batch; retrying the same rows cannot help.
 * 401/403/404 → credentials/device/organisation problem; surfaced as fatal.
 * 408/425/429/5xx → transient; back off.
 * A 200 without parseable receipts is treated as transient so queued rows are
 * never deleted without authoritative evidence.
 */
export function decideBatchResponse(input: {
  status: number;
  body: unknown;
  retryAfterMs?: number;
}): BatchDecision {
  const error = readError(input.body);

  if (input.status === 409) {
    return { kind: "replay", batchId: readReplayBatchId(error.details) };
  }

  if (input.status === 200) {
    const data = isRecord(input.body) && isRecord(input.body.data) ? input.body.data : null;
    const rawReceipts = data && Array.isArray(data.receipts) ? data.receipts : null;
    if (rawReceipts) {
      const receipts = rawReceipts.map(parseReceipt);
      if (receipts.every((receipt): receipt is BatchReceipt => receipt !== null)) {
        return { kind: "ack", receipts };
      }
    }
    return { kind: "retry", code: "malformed_response", message: "The sync response did not contain usable receipts." };
  }

  if (input.status === 400) {
    return {
      kind: "reject",
      code: error.code || "INVALID_INPUT",
      message: error.message || "The server rejected the batch as invalid.",
    };
  }

  if (input.status === 401 || input.status === 403 || input.status === 404) {
    return {
      kind: "fatal",
      status: input.status,
      code: error.code || `HTTP_${input.status}`,
      message: error.message || "The server refused this device or organization.",
    };
  }

  if (input.status === 408 || input.status === 425 || input.status === 429 || input.status >= 500) {
    return {
      kind: "retry",
      code: error.code || `HTTP_${input.status}`,
      message: error.message || "The sync service is temporarily unavailable.",
      ...(input.retryAfterMs !== undefined ? { retryAfterMs: input.retryAfterMs } : {}),
    };
  }

  if (input.status >= 400 && input.status < 500) {
    return {
      kind: "reject",
      code: error.code || `HTTP_${input.status}`,
      message: error.message || "The server refused this batch.",
    };
  }

  return {
    kind: "retry",
    code: error.code || `HTTP_${input.status}`,
    message: error.message || "Unexpected sync response.",
  };
}

/**
 * Retry delay: exponential backoff, raised by `Retry-After`, capped at 5 min.
 * The Dexie adapter applies the same `backoffDelayMs` schedule through `fail()`;
 * this helper is the response-policy version for callers that schedule their
 * own retry (and for the documented decision table).
 */
export function retryDelayMs(attempt: number, retryAfterMs?: number): number {
  const base = backoffDelayMs(attempt);
  const hinted = Number.isFinite(retryAfterMs) ? Math.max(0, retryAfterMs as number) : 0;
  return Math.min(MAX_BACKOFF_MS, Math.max(base, hinted));
}

/** `Retry-After` is either delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, nowMs = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, at - nowMs);
}

export type PostBatchOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

export async function postBatch(
  envelope: BatchEnvelope,
  options: PostBatchOptions = {},
): Promise<{ status: number; body: unknown; retryAfterMs?: number }> {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(options.endpoint ?? DEFAULT_ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      // Selector hint only; the signed body's organizationId is authoritative.
      "x-org-id": envelope.organizationId,
    },
    body: JSON.stringify(envelope),
  });
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
}

export type SyncQueueOptions = {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  limit?: number;
  now?: () => Date;
  batchId?: () => string;
  /** A user-triggered "Sync now" overrides the per-item backoff wait. */
  includeDeferred?: boolean;
};

function failureText(code: string, message?: string): string {
  return message ? `${code}: ${message}` : code;
}

async function failItems(items: readonly OfflineQueueItem[], reason: string): Promise<void> {
  await Promise.all(
    items.map((item) => (item.id === undefined ? Promise.resolve() : fail(item.id, reason))),
  );
}

function summaryOf(
  receipts: readonly BatchReceipt[],
  items: readonly OfflineQueueItem[],
): { accepted: number; duplicates: number; rejected: number } {
  const keys = new Set(items.map((item) => item.event.idempotencyKey));
  return receipts.reduce(
    (acc, receipt) => {
      if (!keys.has(receipt.idempotencyKey)) return acc;
      if (receipt.status === "accept") acc.accepted += 1;
      else if (receipt.status === "duplicate") acc.duplicates += 1;
      else acc.rejected += 1;
      return acc;
    },
    { accepted: 0, duplicates: 0, rejected: 0 },
  );
}

/**
 * Flush due queued scans. Acknowledged items leave the queue; rejected items
 * stay visible with the server's reason; transient failures get backoff.
 * A 409 is retried once with a new batch id, reusing the original idempotency
 * keys so the server resolves them as duplicates.
 */
export async function syncQueuedScans(context: SyncContext, options: SyncQueueOptions = {}): Promise<SyncSummary> {
  const empty = (outcome: SyncOutcome, message: string, remaining: number): SyncSummary => ({
    outcome,
    attempted: 0,
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    remaining,
    message,
    replayed: false,
    receipts: [],
  });

  if (!context.organizationId || !context.deviceId.trim() || !context.deviceSecret) {
    return empty("fatal", "No device signing key is configured for this browser.", await size());
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return empty("offline", "This browser is offline; the queue will retry when it reconnects.", await size());
  }

  const peeked = await peek(options.limit ?? MAX_BATCH_EVENTS, { dueOnly: !options.includeDeferred });
  if (peeked.length === 0) {
    return empty("idle", "Nothing is waiting in the offline queue.", await size());
  }

  const now = options.now ?? (() => new Date());
  const nextBatchId = options.batchId ?? newUuid;
  const built = buildBatchFromQueue(peeked, {
    organizationId: context.organizationId,
    deviceId: context.deviceId,
    clientVersion: context.clientVersion,
    batchId: nextBatchId(),
    sentAt: now().toISOString(),
  });

  // Peeked rows that belong to another org/device must not stay inflight.
  await release(built.excluded.map((item) => item.id).filter((id): id is number => id !== undefined));
  if (built.items.length === 0) {
    return empty("idle", "No queued scans belong to this device.", await size());
  }

  let replayed = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const batch: BatchPayload = {
      ...built.batch,
      batchId: attempt === 0 ? built.batch.batchId : nextBatchId(),
      sentAt: now().toISOString(),
    };

    let envelope: BatchEnvelope;
    try {
      envelope = await buildSignedEnvelope(batch, context.deviceSecret);
    } catch (error) {
      const reason = failureText("sign_failed", (error as Error).message);
      await failItems(built.items, reason);
      return {
        ...empty("fatal", reason, await size()),
        attempted: built.items.length,
      };
    }

    let response: Awaited<ReturnType<typeof postBatch>>;
    try {
      response = await postBatch(envelope, {
        endpoint: context.endpoint ?? options.endpoint,
        fetchImpl: context.fetchImpl ?? options.fetchImpl,
      });
    } catch (error) {
      // Network failure: no authoritative receipt, so keep every row and back
      // off from attempt 0. `fail` owns the nextAttemptAt calculation.
      const reason = failureText("network", (error as Error).message);
      await failItems(built.items, reason);
      return {
        ...empty("retry", `Could not reach the sync service. ${reason}`, await size()),
        attempted: built.items.length,
      };
    }

    const decision = decideBatchResponse(response);

    if (decision.kind === "ack") {
      const byKey = new Map(built.items.map((item) => [item.event.idempotencyKey, item]));
      const acknowledged: number[] = [];
      for (const receipt of decision.receipts) {
        const item = byKey.get(receipt.idempotencyKey);
        if (!item) continue;
        byKey.delete(receipt.idempotencyKey);
        if (receipt.status === "reject") {
          if (item.id !== undefined) await fail(item.id, failureText(receipt.reason, receipt.message));
        } else if (item.id !== undefined) {
          acknowledged.push(item.id);
        }
      }
      // A row the server did not mention must stay queued.
      for (const item of byKey.values()) {
        if (item.id !== undefined) await fail(item.id, "missing_receipt");
      }
      await ack(acknowledged);

      const counts = summaryOf(decision.receipts, built.items);
      return {
        outcome: "acked",
        attempted: built.items.length,
        ...counts,
        remaining: await size(),
        message: `${counts.accepted} recorded, ${counts.duplicates} duplicate, ${counts.rejected} rejected.`,
        replayed,
        receipts: decision.receipts,
      };
    }

    if (decision.kind === "replay" && !replayed) {
      // The server already holds this batch id. Re-send the same idempotency
      // keys under a new batch id; it will classify them as duplicates.
      replayed = true;
      continue;
    }

    const reason =
      decision.kind === "replay"
        ? "replay_rejected_twice"
        : failureText(decision.code, decision.message);
    await failItems(built.items, reason);
    const outcome: SyncOutcome =
      decision.kind === "fatal" ? "fatal" : decision.kind === "reject" || decision.kind === "replay" ? "rejected" : "retry";
    return {
      outcome,
      attempted: built.items.length,
      accepted: 0,
      duplicates: 0,
      rejected: decision.kind === "retry" ? 0 : built.items.length,
      remaining: await size(),
      message:
        decision.kind === "retry"
          ? `${decision.message} The queue will retry automatically.`
          : decision.kind === "replay"
            ? "The server rejected the replacement batch id as a replay."
            : decision.message,
      replayed,
      receipts: [],
    };
  }

  const reason = "replay_rejected_twice";
  await failItems(built.items, reason);
  return {
    outcome: "rejected",
    attempted: built.items.length,
    accepted: 0,
    duplicates: 0,
    rejected: built.items.length,
    remaining: await size(),
    message: "The server rejected the replacement batch id as a replay.",
    replayed: true,
    receipts: [],
  };
}
