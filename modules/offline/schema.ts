import { z } from "zod";

// P6 offline sync contracts (pure). No Prisma, no clock reads: callers pass `now`.
// The canonical write path is still the scan route; these shapes only describe
// what a scanner may queue while disconnected.

export const MAX_BATCH_EVENTS = 500;
/** A batch is signed when it is sent, not when it is captured. */
export const MAX_SIGNATURE_SKEW_MS = 10 * 60_000;
/** Capture may be offline for a long time; bounded so a tampered clock cannot inject ancient data. */
export const MAX_OFFLINE_AGE_MS = 30 * 24 * 60 * 60_000;
/** A device clock may run slightly ahead of the server. */
export const MAX_CLIENT_FUTURE_MS = 5 * 60_000;

export const offlineGeoInput = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyM: z.number().optional(),
});

export const offlineEventSchema = z.object({
  idempotencyKey: z.string().uuid(),
  sessionId: z.string().min(1).max(120),
  credential: z.string().min(8).max(512),
  clientTs: z.string().datetime(),
  direction: z.enum(["auto", "in", "out"]).default("auto"),
  geo: offlineGeoInput.optional(),
});

export type OfflineEventInput = z.infer<typeof offlineEventSchema>;

// The organisation is part of the signed payload even though the route also
// authorizes it: a signature replayed against another org must never verify.
export const batchPayloadSchema = z.object({
  organizationId: z.string().min(1).max(120),
  deviceId: z.string().min(1).max(120),
  batchId: z.string().uuid(),
  clientVersion: z.string().min(1).max(40).default("1.0.0"),
  sentAt: z.string().datetime(),
  events: z.array(offlineEventSchema),
});

export type BatchPayload = z.infer<typeof batchPayloadSchema>;

export const signatureSchema = z.string().regex(/^[a-f0-9]{64}$/i, "signature must be a hex SHA-256 HMAC");

export const batchEnvelopeSchema = batchPayloadSchema.extend({ signature: signatureSchema });

export type BatchEnvelope = z.infer<typeof batchEnvelopeSchema>;

export type BatchIssueCode =
  | "invalid_shape"
  | "empty_batch"
  | "batch_too_large"
  | "timestamp_stale"
  | "timestamp_future"
  | "clock_out_of_order";

export type BatchIssue = {
  code: BatchIssueCode;
  message: string;
  /** Event index for per-item issues; absent for whole-batch issues. */
  index?: number;
};

export type BatchValidation =
  | { ok: true; batch: BatchPayload }
  | { ok: false; issues: BatchIssue[] };

/**
 * Structural + clock validation for a batch payload. Signature verification is
 * separate (crypto.ts) because it needs the device's stored verifier.
 *
 * Monotonicity rule: events are queued in capture order, so `clientTs` must be
 * non-decreasing inside one batch. A backwards jump means the queue or the
 * device clock was tampered with; the batch is refused instead of silently
 * reordering attendance evidence.
 */
export function validateBatch(input: unknown, opts: { now?: Date } = {}): BatchValidation {
  const now = opts.now ?? new Date();
  const parsed = batchPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid_shape",
          message: "Batch payload failed validation",
          ...(parsed.error.issues[0]?.path.length
            ? { index: typeof parsed.error.issues[0].path[0] === "number" ? (parsed.error.issues[0].path[0] as number) : undefined }
            : {}),
        },
      ],
    };
  }

  const batch = parsed.data;
  if (batch.events.length === 0) {
    return { ok: false, issues: [{ code: "empty_batch", message: "A batch must contain at least one event" }] };
  }
  if (batch.events.length > MAX_BATCH_EVENTS) {
    return {
      ok: false,
      issues: [{ code: "batch_too_large", message: `A batch may contain at most ${MAX_BATCH_EVENTS} events` }],
    };
  }

  const sentAt = new Date(batch.sentAt).getTime();
  if (Number.isNaN(sentAt)) {
    return { ok: false, issues: [{ code: "invalid_shape", message: "Invalid sentAt timestamp" }] };
  }
  if (sentAt < now.getTime() - MAX_SIGNATURE_SKEW_MS) {
    return { ok: false, issues: [{ code: "timestamp_stale", message: "Batch timestamp is outside the accepted clock window" }] };
  }
  if (sentAt > now.getTime() + MAX_SIGNATURE_SKEW_MS) {
    return { ok: false, issues: [{ code: "timestamp_future", message: "Batch timestamp is in the future" }] };
  }

  const issues: BatchIssue[] = [];
  for (let i = 1; i < batch.events.length; i += 1) {
    const prev = new Date(batch.events[i - 1].clientTs).getTime();
    const curr = new Date(batch.events[i].clientTs).getTime();
    if (curr < prev) {
      issues.push({
        code: "clock_out_of_order",
        message: "Event clientTs is earlier than the previous event in the batch",
        index: i,
      });
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true, batch };
}
