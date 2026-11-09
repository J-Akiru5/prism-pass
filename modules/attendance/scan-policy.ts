import { resolveDirection } from "@/modules/attendance/engine";

// Pure scan transition policy (M2-WS5).
//
// `performScan` owns I/O: pass/credential checks, idempotency, event gates, geo,
// the event append and the (org, session, person) upsert. This module owns the
// two decisions those writes depend on, so both can be exercised without a
// database:
//
//   1. Duplicate window — a scan is a duplicate only when the latest accepted
//      scan for the person/session is the *same pass* and falls inside the
//      policy window (inclusive). A duplicate is recorded as evidence but never
//      changes the attendance record.
//   2. Direction — explicit in/out wins; `auto` checks out once a check-in
//      exists, otherwise checks in (see `resolveDirection` in engine.ts).
//
// The record snapshot is the logical state used for direction and
// reconciliation, not a mirror of every `AttendanceRecord` column: scan-service
// still owns the upsert and its existing update shape.

export type ScanEventType = "CHECK_IN" | "CHECK_OUT" | "DUPLICATE_DETECTED";

export type RecordSnapshot = {
  /** Server timestamp of the check-in event; null when nobody has checked in. */
  checkInAtMs: number | null;
  /** Server timestamp of the last check-out; carried for snapshot invariants. */
  checkOutAtMs: number | null;
  /** Pass that produced the check-in, so the evidence stays attributable. */
  checkInPassId: string | null;
};

export const EMPTY_RECORD_SNAPSHOT: RecordSnapshot = Object.freeze({
  checkInAtMs: null,
  checkOutAtMs: null,
  checkInPassId: null,
});

export type RecentScanSnapshot = {
  /** `AttendanceEvent.passId` of the latest accepted scan in the window. */
  passId: string | null;
  serverTsMs: number;
};

export type ScanTransitionInput = {
  record: RecordSnapshot | null;
  /**
   * Latest accepted scan for this (org, session, person), or null. The caller
   * may pre-filter by the window; the window is re-checked here so the decision
   * is complete and testable on its own. DUPLICATE_DETECTED rows are accepted
   * evidence, so they roll the window forward exactly like check-in/out rows.
   */
  recentSamePassScan: RecentScanSnapshot | null;
  passId: string;
  requestedDirection: "auto" | "in" | "out";
  serverTsMs: number;
  duplicateWindowMs: number;
};

export type ScanTransition = {
  eventType: ScanEventType;
  /** Logical record after the transition; unchanged for a duplicate. */
  record: RecordSnapshot;
};

/**
 * Decide what a scan should write. Pure: no clock read, no Prisma, no crypto.
 *
 * The duplicate check mirrors the current SQL predicate exactly: the latest
 * accepted event in `server_ts >= now - window` must have the same `pass_id`.
 * The boundary is inclusive, and there is no upper bound (a row with a server
 * timestamp slightly ahead of the caller still counts).
 */
export function decideScanTransition(input: ScanTransitionInput): ScanTransition {
  const record: RecordSnapshot = input.record ?? EMPTY_RECORD_SNAPSHOT;
  const recent = input.recentSamePassScan;

  if (
    recent !== null &&
    recent.passId === input.passId &&
    recent.serverTsMs >= input.serverTsMs - input.duplicateWindowMs
  ) {
    return { eventType: "DUPLICATE_DETECTED", record: { ...record } };
  }

  const eventType = resolveDirection(input.requestedDirection, record.checkInAtMs !== null);
  if (eventType === "CHECK_IN") {
    return {
      eventType,
      record: {
        checkInAtMs: input.serverTsMs,
        // scan-service passes `checkOutAt: null` to reconcileRecord on a
        // check-in; keep the snapshot consistent with that write path.
        checkOutAtMs: null,
        checkInPassId: input.passId,
      },
    };
  }

  return {
    eventType,
    record: {
      checkInAtMs: record.checkInAtMs,
      checkOutAtMs: input.serverTsMs,
      checkInPassId: record.checkInPassId,
    },
  };
}
