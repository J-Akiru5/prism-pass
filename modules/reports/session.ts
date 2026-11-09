// Per-session (per-event) attendance report.
//
// Pure aggregation: no Prisma, no network, no clock. The route loads the rows
// for exactly one session and passes them here. Rows are the **union** of the
// session roster and the recorded people:
//
//   - rostered, no record      -> a synthesized ABSENT row
//   - recorded, not rostered   -> a walk-in (`onRoster: false`)
//   - recorded and rostered    -> the record's own status
//
// Duplicate check-in/check-out events collapse to the earliest accepted
// check-in and the latest accepted check-out. serverTs is authoritative (client
// clocks are untrusted and offline events can be replayed later); clientTs is
// only a fallback. Duplicate records for one person (the schema forbids them,
// but callers can pass fixtures) collapse to the most complete record.
//
// Time labels reuse the DTR helpers, so both exports render the same wall clock
// in the session's IANA zone. Masking reuses the existing VIEWER policy rather
// than re-deriving it here.

import { serializeCsv } from "./csv";
import { localTimeLabel } from "./dtr";
import { MASKED_EXPORT_ROLES, initials, pseudonymizeExternalId } from "./masking";

export type SessionReportPerson = {
  id: string;
  displayName: string;
  externalId?: string | null;
};

export type SessionReportSession = {
  id: string;
  type?: string | null;
  title?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone?: string | null;
  rosterEnforced?: boolean | null;
  walkInAllowed?: boolean | null;
};

export type SessionReportRosterEntry = {
  /** Present when the caller passes rows for several sessions; foreign rows are ignored. */
  sessionId?: string | null;
  personId: string;
  source?: string | null;
};

export type SessionReportRecord = {
  id?: string;
  sessionId?: string | null;
  personId: string;
  checkInEventId?: string | null;
  checkOutEventId?: string | null;
  durationMin?: number | null;
  status: string;
  approvalStatus?: string | null;
  exceptionFlags?: readonly string[] | null;
};

export type SessionReportEvent = {
  id: string;
  sessionId?: string | null;
  personId: string;
  type: string;
  clientTs: Date | string;
  serverTs: Date | string;
  status?: string | null;
};

export type SessionReportInput = {
  session: SessionReportSession;
  roster: readonly SessionReportRosterEntry[];
  records: readonly SessionReportRecord[];
  events: readonly SessionReportEvent[];
  people: readonly SessionReportPerson[];
  /** IANA zone override; defaults to `session.timezone`. */
  timezone?: string | null;
};

export type SessionReportRow = {
  personId: string;
  displayName: string;
  externalId: string | null;
  onRoster: boolean;
  /** Recorded but not rostered: a walk-in. */
  walkIn: boolean;
  /** Local wall-clock label (HH:mm) of the accepted check-in, or null. */
  checkInAt: string | null;
  /** Local wall-clock label (HH:mm) of the accepted check-out, or null. */
  checkOutAt: string | null;
  minutes: number;
  status: string;
  approvalStatus: string;
  exceptionFlags: string[];
  /** True when an attendance record backs the row; false for a synthesized ABSENT row. */
  recorded: boolean;
};

export type SessionReportSummary = {
  /** People on the event roster (after scope filtering). */
  rostered: number;
  /** Rows whose status is PRESENT (on time). LATE is counted separately. */
  present: number;
  late: number;
  absent: number;
  /** Recorded people who are not on the roster. */
  walkIns: number;
  /** Rows backed by an attendance record. */
  recorded: number;
  pendingApproval: number;
};

const UNKNOWN_PERSON = "Unknown person";

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function eventInstant(event: SessionReportEvent): Date | null {
  return toDate(event.serverTs) ?? toDate(event.clientTs);
}

/** A row without a session id is accepted; a row for another session is noise. */
function belongsToSession(row: { sessionId?: string | null }, sessionId: string): boolean {
  return !row.sessionId || row.sessionId === sessionId;
}

/** Prefer the record with the most canonical links, then the earliest in input order. */
function recordScore(record: SessionReportRecord): number {
  return (
    (record.checkInEventId ? 2 : 0) +
    (record.checkOutEventId ? 2 : 0) +
    (typeof record.durationMin === "number" && Number.isFinite(record.durationMin) ? 1 : 0)
  );
}

function minutesFor(
  record: SessionReportRecord | undefined,
  checkIn: Date | null,
  checkOut: Date | null,
): number {
  if (record && typeof record.durationMin === "number" && Number.isFinite(record.durationMin)) {
    return Math.max(0, Math.round(record.durationMin));
  }
  if (record && checkIn && checkOut) {
    return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000));
  }
  return 0;
}

function statusFor(
  record: SessionReportRecord | undefined,
  checkIn: Date | null,
  checkOut: Date | null,
): string {
  if (!record) return "ABSENT";
  if (record.status === "EXCUSED") return "EXCUSED";
  // A check-in without a check-out is incomplete even when the record says LATE.
  if (checkIn && !checkOut) return "PARTIAL";
  return record.status || "PRESENT";
}

/**
 * Aggregate one session into one row per person.
 *
 * Rows are sorted by display name then person id, so the export and the JSON
 * response are stable for the same inputs.
 */
export function buildSessionReport(input: SessionReportInput): SessionReportRow[] {
  const sessionId = input.session.id;
  const timeZone = input.timezone ?? input.session.timezone ?? null;
  const people = new Map(input.people.map((person) => [person.id, person]));

  const rosterIds = new Set<string>();
  for (const entry of input.roster) {
    if (belongsToSession(entry, sessionId)) rosterIds.add(entry.personId);
  }

  const eventsById = new Map<string, SessionReportEvent>();
  const firstCheckIn = new Map<string, Date>();
  const lastCheckOut = new Map<string, Date>();
  for (const event of input.events) {
    if (!belongsToSession(event, sessionId)) continue;
    eventsById.set(event.id, event);
    if (event.type !== "CHECK_IN" && event.type !== "CHECK_OUT") continue;
    const at = eventInstant(event);
    if (!at) continue;
    if (event.type === "CHECK_IN") {
      const current = firstCheckIn.get(event.personId);
      if (!current || at.getTime() < current.getTime()) firstCheckIn.set(event.personId, at);
    } else {
      const current = lastCheckOut.get(event.personId);
      if (!current || at.getTime() > current.getTime()) lastCheckOut.set(event.personId, at);
    }
  }

  const recordsByPerson = new Map<string, SessionReportRecord>();
  for (const record of input.records) {
    if (!belongsToSession(record, sessionId)) continue;
    const current = recordsByPerson.get(record.personId);
    if (!current || recordScore(record) > recordScore(current)) {
      recordsByPerson.set(record.personId, record);
    }
  }

  const personIds = [...new Set<string>([...rosterIds, ...recordsByPerson.keys()])];
  const rows: SessionReportRow[] = personIds.map((personId) => {
    const person = people.get(personId);
    const record = recordsByPerson.get(personId);
    const onRoster = rosterIds.has(personId);

    const linkedIn = record?.checkInEventId ? eventsById.get(record.checkInEventId) : undefined;
    const linkedOut = record?.checkOutEventId ? eventsById.get(record.checkOutEventId) : undefined;
    const linkedInAt =
      linkedIn && linkedIn.personId === personId && linkedIn.type === "CHECK_IN" ? eventInstant(linkedIn) : null;
    const linkedOutAt =
      linkedOut && linkedOut.personId === personId && linkedOut.type === "CHECK_OUT" ? eventInstant(linkedOut) : null;

    // The record's linked event is canonical; the scan-type index covers stale
    // records and collapses duplicate events to first-in / last-out.
    const checkIn = linkedInAt ?? firstCheckIn.get(personId) ?? null;
    const checkOut = linkedOutAt ?? lastCheckOut.get(personId) ?? null;

    const flags = new Set<string>();
    for (const flag of record?.exceptionFlags ?? []) {
      if (typeof flag === "string" && flag.length > 0) flags.add(flag);
    }
    if (record && checkIn && !checkOut) flags.add("missing_check_out");

    return {
      personId,
      displayName: person?.displayName ?? UNKNOWN_PERSON,
      externalId: person?.externalId ?? null,
      onRoster,
      walkIn: !onRoster,
      checkInAt: checkIn ? localTimeLabel(checkIn, timeZone) : null,
      checkOutAt: checkOut ? localTimeLabel(checkOut, timeZone) : null,
      minutes: minutesFor(record, checkIn, checkOut),
      status: statusFor(record, checkIn, checkOut),
      approvalStatus: record?.approvalStatus || "NONE",
      exceptionFlags: [...flags].sort(),
      recorded: Boolean(record),
    };
  });

  rows.sort((a, b) => {
    const byName = a.displayName.localeCompare(b.displayName);
    return byName !== 0 ? byName : a.personId.localeCompare(b.personId);
  });
  return rows;
}

/**
 * Counts for the response summary. Call it after scope filtering so the totals
 * describe exactly the rows the caller may see.
 */
export function summarizeSessionRows(rows: readonly SessionReportRow[]): SessionReportSummary {
  const summary: SessionReportSummary = {
    rostered: 0,
    present: 0,
    late: 0,
    absent: 0,
    walkIns: 0,
    recorded: 0,
    pendingApproval: 0,
  };

  for (const row of rows) {
    if (row.onRoster) summary.rostered += 1;
    if (!row.onRoster) summary.walkIns += 1;
    if (row.recorded) summary.recorded += 1;
    if (row.status === "PRESENT") summary.present += 1;
    if (row.status === "LATE") summary.late += 1;
    if (row.status === "ABSENT") summary.absent += 1;
    if (row.approvalStatus === "PENDING") summary.pendingApproval += 1;
  }

  return summary;
}

/**
 * Apply the existing VIEWER export policy. `masked` comes from the report scope
 * decision; when omitted, the role policy is used. Non-VIEWER roles pass through.
 */
export function maskSessionRows(
  rows: readonly SessionReportRow[],
  options: { role?: string | null; organizationSalt: string; masked?: boolean },
): SessionReportRow[] {
  const shouldMask =
    options.masked ?? (MASKED_EXPORT_ROLES as readonly string[]).includes(options.role ?? "");
  if (!shouldMask) return [...rows];

  return rows.map((row) => ({
    ...row,
    displayName: initials(row.displayName),
    externalId: row.externalId ? pseudonymizeExternalId(row.externalId, options.organizationSalt) : null,
  }));
}

export const SESSION_CSV_HEADER = [
  "Person",
  "External ID",
  "On roster",
  "Walk-in",
  "Check-in",
  "Check-out",
  "Minutes",
  "Status",
  "Approval",
  "Exceptions",
] as const;

export function sessionRowToCsvCells(row: SessionReportRow): unknown[] {
  return [
    row.displayName,
    row.externalId ?? "",
    row.onRoster ? "yes" : "no",
    row.walkIn ? "yes" : "no",
    row.checkInAt ?? "",
    row.checkOutAt ?? "",
    row.minutes,
    row.status,
    row.approvalStatus,
    row.exceptionFlags.join("; "),
  ];
}

/** RFC 4180 records with the shared spreadsheet formula-injection guard. */
export function sessionReportToCsv(rows: readonly SessionReportRow[]): string {
  return serializeCsv(SESSION_CSV_HEADER, rows.map(sessionRowToCsvCells));
}
