// Export range validation (pure). Dates are calendar dates (YYYY-MM-DD) in the
// organization's timezone; arithmetic is done in UTC so it is DST-independent.

export const MAX_DTR_RANGE_DAYS = 92;
export const MAX_AUDIT_RANGE_DAYS = 366;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export type DateRange = { from: string; to: string; days: number };

export type DateRangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; message: string };

function utcMidnight(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9999) return null;
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return ms;
}

/**
 * Validate an inclusive calendar-date range.
 *
 * Rejects missing/non-canonical dates (e.g. 2026-02-30), reversed ranges and
 * ranges longer than `maxDays` (inclusive). The default cap is the DTR export
 * limit of 92 days.
 */
export function parseDateRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  maxDays: number = MAX_DTR_RANGE_DAYS,
): DateRangeResult {
  const from = (fromRaw ?? "").trim();
  const to = (toRaw ?? "").trim();
  if (!from || !to) return { ok: false, message: "from and to are required (YYYY-MM-DD)" };

  const start = utcMidnight(from);
  if (start === null) return { ok: false, message: "from must be a real calendar date (YYYY-MM-DD)" };
  const end = utcMidnight(to);
  if (end === null) return { ok: false, message: "to must be a real calendar date (YYYY-MM-DD)" };
  if (end < start) return { ok: false, message: "from must be on or before to" };

  const days = Math.round((end - start) / DAY_MS) + 1;
  if (days > maxDays) {
    return { ok: false, message: `range is ${days} days; exports are limited to ${maxDays} days` };
  }
  return { ok: true, range: { from, to, days } };
}

/** DTR export range: required dates, inclusive, capped at 92 days. */
export function parseDtrRange(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
): DateRangeResult {
  return parseDateRange(fromRaw, toRaw, MAX_DTR_RANGE_DAYS);
}

/** UTC instants for the inclusive calendar range, used to bound DB queries. */
export function dayRangeUtc(range: Pick<DateRange, "from" | "to">): { start: Date; end: Date } {
  const start = utcMidnight(range.from);
  const end = utcMidnight(range.to);
  // Both were validated before this helper is called; keep a defensive fallback.
  return {
    start: new Date(start ?? Date.UTC(1970, 0, 1)),
    end: new Date((end ?? Date.UTC(1970, 0, 1)) + DAY_MS - 1),
  };
}
