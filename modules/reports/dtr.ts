// Pure DTR (daily time record) aggregation for P7 exports.
//
// No Prisma, no network, no clock: callers pass the canonical attendance records,
// the events they were reconciled from, the sessions and the people directory.
// The same inputs always produce the same rows, which keeps the export testable
// and auditable.
//
// Day assignment: a record belongs to the **local date on which its session
// starts** (the shift date), not the date of the check-out. A 22:00–06:00
// overnight shift therefore lands on one row instead of being split across two.
// When the session is missing (defensive), the check-in instant is used.
//
// Event instants: serverTs is authoritative (client clocks are untrusted and
// offline events can be replayed later); clientTs is only a fallback.

export type DtrPerson = {
  id: string;
  displayName: string;
  externalId?: string | null;
};

export type DtrSession = {
  id: string;
  type?: string | null;
  title?: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone?: string | null;
};

export type DtrRecord = {
  id?: string;
  sessionId: string;
  personId: string;
  checkInEventId?: string | null;
  checkOutEventId?: string | null;
  durationMin?: number | null;
  status: string;
  approvalStatus?: string | null;
  exceptionFlags?: readonly string[] | null;
};

export type DtrEvent = {
  id: string;
  sessionId: string;
  personId: string;
  type: string;
  clientTs: Date | string;
  serverTs: Date | string;
  status?: string | null;
};

export type DtrInput = {
  /** Inclusive first local date, YYYY-MM-DD. */
  from: string;
  /** Inclusive last local date, YYYY-MM-DD. */
  to: string;
  /** Organization timezone (IANA). Invalid values fall back to UTC. */
  timezone?: string | null;
  people: readonly DtrPerson[];
  sessions: readonly DtrSession[];
  records: readonly DtrRecord[];
  events: readonly DtrEvent[];
};

export type DtrRow = {
  date: string;
  personId: string;
  displayName: string;
  externalId: string | null;
  /** ISO-8601 instant of the first check-in for the day, or null. */
  firstIn: string | null;
  /** ISO-8601 instant of the last check-out for the day, or null. */
  lastOut: string | null;
  /** Local wall-clock labels (HH:mm) for the export. */
  firstInLocal: string | null;
  lastOutLocal: string | null;
  /** Total minutes across every record in the day (dust-to-dusk sum). */
  minutes: number;
  status: string;
  approvalStatus: string;
  exceptionFlags: string[];
  sessionIds: string[];
};

const FALLBACK_TIMEZONE = "Asia/Manila";

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Intl formatter construction is comparatively expensive; exports can contain
// thousands of instants, so validate/cache per timezone.
const timeZoneCache = new Map<string, string>();
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return FALLBACK_TIMEZONE;
  const cached = timeZoneCache.get(timeZone);
  if (cached) return cached;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    timeZoneCache.set(timeZone, timeZone);
    return timeZone;
  } catch {
    timeZoneCache.set(timeZone, "UTC");
    return "UTC";
  }
}

function dateFormatter(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const zone = safeTimeZone(timeZone);
  let formatter = dateFormatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatterCache.set(zone, formatter);
  }
  return formatter;
}

function timeFormatter(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const zone = safeTimeZone(timeZone);
  let formatter = timeFormatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormatterCache.set(zone, formatter);
  }
  return formatter;
}

/** Local calendar date (YYYY-MM-DD) for an instant in an IANA timezone. */
export function localDateKey(value: Date | string | null | undefined, timeZone?: string | null): string | null {
  const instant = toDate(value);
  if (!instant) return null;
  const parts = dateFormatter(timeZone).formatToParts(instant);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/** Local wall-clock label (HH:mm, 24-hour) for an instant in an IANA timezone. */
export function localTimeLabel(value: Date | string | null | undefined, timeZone?: string | null): string | null {
  const instant = toDate(value);
  if (!instant) return null;
  return timeFormatter(timeZone).format(instant);
}

function eventInstant(event: DtrEvent): Date | null {
  return toDate(event.serverTs) ?? toDate(event.clientTs);
}

function recordMinutes(record: DtrRecord, checkIn: Date | null, checkOut: Date | null): number | null {
  if (typeof record.durationMin === "number" && Number.isFinite(record.durationMin)) {
    return Math.max(0, Math.round(record.durationMin));
  }
  if (checkIn && checkOut) return Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 60_000));
  return null;
}

function rollupStatus(statuses: readonly string[], hasCheckIn: boolean, missingCheckOut: boolean): string {
  if (statuses.length === 0) return "ABSENT";
  if (statuses.every((s) => s === "EXCUSED")) return "EXCUSED";
  if (missingCheckOut || statuses.some((s) => s === "PARTIAL")) return "PARTIAL";
  if (!hasCheckIn) return "ABSENT";
  if (statuses.some((s) => s === "LATE")) return "LATE";
  return "PRESENT";
}

function rollupApproval(statuses: readonly string[]): string {
  const set = new Set(statuses.map((s) => s || "NONE"));
  if (set.size === 0) return "NONE";
  if (set.size === 1) return [...set][0];
  if (set.has("REJECTED")) return "REJECTED";
  if (set.has("PENDING")) return "PENDING";
  if (set.has("APPROVED")) return "APPROVED";
  return "MIXED";
}

type Bucket = {
  date: string;
  personId: string;
  firstIn: Date | null;
  lastOut: Date | null;
  minutes: number;
  statuses: string[];
  approvals: string[];
  flags: Set<string>;
  sessionIds: Set<string>;
};

/**
 * Aggregate records into one row per person per local day.
 *
 * Rows are limited to the inclusive `[from, to]` local-date range, sorted by
 * date then display name. A person with several sessions on the same day gets
 * one row: first-in is the earliest check-in, last-out the latest check-out and
 * minutes the sum of each record's reconciled duration.
 */
export function aggregateDtr(input: DtrInput): DtrRow[] {
  const timeZone = input.timezone;
  const people = new Map(input.people.map((p) => [p.id, p]));
  const sessions = new Map(input.sessions.map((s) => [s.id, s]));
  const eventsById = new Map(input.events.map((e) => [e.id, e]));

  // Fallback index for records whose stored event ids are missing/stale.
  const eventsByPair = new Map<string, DtrEvent[]>();
  for (const event of input.events) {
    if (event.type !== "CHECK_IN" && event.type !== "CHECK_OUT") continue;
    const key = `${event.sessionId}:${event.personId}`;
    const bucket = eventsByPair.get(key);
    if (bucket) bucket.push(event);
    else eventsByPair.set(key, [event]);
  }

  const buckets = new Map<string, Bucket>();

  for (const record of input.records) {
    const session = sessions.get(record.sessionId);
    const sessionStart = session ? toDate(session.startsAt) : null;
    const checkInEvent = record.checkInEventId ? eventsById.get(record.checkInEventId) : undefined;
    const checkOutEvent = record.checkOutEventId ? eventsById.get(record.checkOutEventId) : undefined;

    const fallback = eventsByPair.get(`${record.sessionId}:${record.personId}`) ?? [];
    let fallbackIn: DtrEvent | undefined;
    let fallbackOut: DtrEvent | undefined;
    for (const event of fallback) {
      const at = eventInstant(event);
      if (!at) continue;
      if (event.type === "CHECK_IN") {
        const current = fallbackIn ? eventInstant(fallbackIn) : null;
        if (!current || at.getTime() < current.getTime()) fallbackIn = event;
      } else if (event.type === "CHECK_OUT") {
        const current = fallbackOut ? eventInstant(fallbackOut) : null;
        if (!current || at.getTime() > current.getTime()) fallbackOut = event;
      }
    }

    const checkIn = (checkInEvent ? eventInstant(checkInEvent) : null) ?? (fallbackIn ? eventInstant(fallbackIn) : null);
    const checkOut = (checkOutEvent ? eventInstant(checkOutEvent) : null) ?? (fallbackOut ? eventInstant(fallbackOut) : null);

    const date = localDateKey(sessionStart ?? checkIn, timeZone);
    if (!date || date < input.from || date > input.to) continue;

    const key = `${date}:${record.personId}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        date,
        personId: record.personId,
        firstIn: null,
        lastOut: null,
        minutes: 0,
        statuses: [],
        approvals: [],
        flags: new Set<string>(),
        sessionIds: new Set<string>(),
      };
      buckets.set(key, bucket);
    }

    if (checkIn && (!bucket.firstIn || checkIn.getTime() < bucket.firstIn.getTime())) bucket.firstIn = checkIn;
    if (checkOut && (!bucket.lastOut || checkOut.getTime() > bucket.lastOut.getTime())) bucket.lastOut = checkOut;

    const minutes = recordMinutes(record, checkIn, checkOut);
    if (minutes !== null) bucket.minutes += minutes;

    bucket.statuses.push(record.status);
    bucket.approvals.push(record.approvalStatus ?? "NONE");
    bucket.sessionIds.add(record.sessionId);

    for (const flag of record.exceptionFlags ?? []) {
      if (typeof flag === "string" && flag.length > 0) bucket.flags.add(flag);
    }

    if (checkIn && !checkOut) bucket.flags.add("missing_check_out");
    if (session) {
      const end = toDate(session.endsAt);
      const endDate = end ? localDateKey(end, timeZone) : null;
      if (endDate && endDate !== date) bucket.flags.add("overnight");
    }
  }

  const rows: DtrRow[] = [];
  for (const bucket of buckets.values()) {
    const person = people.get(bucket.personId);
    rows.push({
      date: bucket.date,
      personId: bucket.personId,
      displayName: person?.displayName ?? "Unknown person",
      externalId: person?.externalId ?? null,
      firstIn: bucket.firstIn ? bucket.firstIn.toISOString() : null,
      lastOut: bucket.lastOut ? bucket.lastOut.toISOString() : null,
      firstInLocal: bucket.firstIn ? localTimeLabel(bucket.firstIn, timeZone) : null,
      lastOutLocal: bucket.lastOut ? localTimeLabel(bucket.lastOut, timeZone) : null,
      minutes: bucket.minutes,
      status: rollupStatus(bucket.statuses, Boolean(bucket.firstIn), bucket.flags.has("missing_check_out")),
      approvalStatus: rollupApproval(bucket.approvals),
      exceptionFlags: [...bucket.flags].sort(),
      sessionIds: [...bucket.sessionIds].sort(),
    });
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const byName = a.displayName.localeCompare(b.displayName);
    return byName !== 0 ? byName : a.personId.localeCompare(b.personId);
  });
  return rows;
}
