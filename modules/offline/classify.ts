import { MAX_CLIENT_FUTURE_MS, MAX_OFFLINE_AGE_MS, type OfflineEventInput } from "./schema";

// P6 per-item classification (pure). The caller supplies what the server
// already knows: idempotency keys on record and sessions in this organisation.
// No Prisma import, no clock read, no writes — this is intentionally testable
// against the sync route without a database.

export type ItemStatus = "accept" | "duplicate" | "reject";

export type ItemReason =
  | "ok"
  | "idempotency_key_seen"
  | "duplicate_in_batch"
  | "unknown_session"
  | "invalid_client_ts"
  | "clock_future"
  | "clock_too_old"
  | "clock_out_of_order";

export type ItemDecision = {
  index: number;
  idempotencyKey: string;
  sessionId: string;
  status: ItemStatus;
  reason: ItemReason;
};

export type ClassifyInput = {
  events: readonly OfflineEventInput[];
  /** Keys already persisted as `AttendanceEvent.idempotencyKey` for this org. */
  existingKeys: ReadonlySet<string>;
  /** Session ids that belong to the authenticated organisation. */
  knownSessionIds: ReadonlySet<string>;
  now?: Date;
  maxOfflineAgeMs?: number;
  maxClientFutureMs?: number;
};

/**
 * Classify every event in order. Duplicates are decided before freshness so a
 * retried item is reported as a duplicate even if its capture time is old.
 * A repeated key inside the same batch is a duplicate too: only the first
 * occurrence may be applied.
 */
export function classifyBatchItems(input: ClassifyInput): ItemDecision[] {
  const now = (input.now ?? new Date()).getTime();
  const maxAge = input.maxOfflineAgeMs ?? MAX_OFFLINE_AGE_MS;
  const maxFuture = input.maxClientFutureMs ?? MAX_CLIENT_FUTURE_MS;
  const seen = new Set(input.existingKeys);
  const decisions: ItemDecision[] = [];
  let previousTs: number | null = null;

  input.events.forEach((event, index) => {
    const decision = (status: ItemStatus, reason: ItemReason) =>
      decisions.push({ index, idempotencyKey: event.idempotencyKey, sessionId: event.sessionId, status, reason });

    if (seen.has(event.idempotencyKey)) {
      const reason = input.existingKeys.has(event.idempotencyKey) ? "idempotency_key_seen" : "duplicate_in_batch";
      decision("duplicate", reason);
      previousTs = new Date(event.clientTs).getTime();
      return;
    }
    seen.add(event.idempotencyKey);

    if (!input.knownSessionIds.has(event.sessionId)) {
      decision("reject", "unknown_session");
      previousTs = new Date(event.clientTs).getTime();
      return;
    }

    const clientTs = new Date(event.clientTs).getTime();
    if (Number.isNaN(clientTs)) {
      decision("reject", "invalid_client_ts");
      return;
    }
    if (clientTs > now + maxFuture) {
      decision("reject", "clock_future");
      previousTs = clientTs;
      return;
    }
    if (clientTs < now - maxAge) {
      decision("reject", "clock_too_old");
      previousTs = clientTs;
      return;
    }
    if (previousTs !== null && clientTs < previousTs) {
      decision("reject", "clock_out_of_order");
      previousTs = clientTs;
      return;
    }

    previousTs = clientTs;
    decision("accept", "ok");
  });

  return decisions;
}

export type DecisionSummary = { accepted: number; duplicates: number; rejected: number };

export function summarizeDecisions(decisions: readonly ItemDecision[]): DecisionSummary {
  return decisions.reduce<DecisionSummary>(
    (acc, decision) => {
      if (decision.status === "accept") acc.accepted += 1;
      else if (decision.status === "duplicate") acc.duplicates += 1;
      else acc.rejected += 1;
      return acc;
    },
    { accepted: 0, duplicates: 0, rejected: 0 },
  );
}
