// Certificate payload construction and content hashing.
//
// Pure: no Prisma, no network, no implicit clock. Dates and the issue date are
// caller-supplied so the same inputs always produce byte-identical payloads and
// hashes across retries, servers and tests. Hashing reuses the canonical JSON
// and SHA-256 helpers from the P5 document core (no Prisma/server-only imports).
//
// Timezone policy: unlike report exports, an invalid IANA zone is an error, not
// a silent UTC fallback. A certificate states a human date; falling back would
// print the wrong day at a midnight boundary.

import { canonicalJson, sha256Hex } from "../documents/service";
import {
  CERTIFICATE_KIND,
  CERTIFICATE_SCHEMA_VERSION,
  CERTIFICATE_TEMPLATE_KEY,
  certificatePayloadV1,
  type CertificatePayloadV1,
  type CertificateSessionType,
} from "./schema";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// Intl formatter construction is comparatively expensive and generation can
// render many certificates for one event; cache per timezone like the DTR
// export does.
const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

export function isSupportedTimeZone(timezone: string | null | undefined): boolean {
  if (typeof timezone !== "string") return false;
  const trimmed = timezone.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

function assertTimeZone(timezone: string): string {
  const trimmed = timezone.trim();
  if (!isSupportedTimeZone(trimmed)) {
    throw new Error(`Invalid IANA timezone: ${String(timezone)}`);
  }
  return trimmed;
}

function toValidDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date: expected a Date or ISO-8601 string");
  }
  return date;
}

function dateFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = dateFormatterCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  dateFormatterCache.set(timezone, formatter);
  return formatter;
}

type LocalDateParts = { year: number; month: number; day: number };

function localDateParts(instant: Date, timezone: string): LocalDateParts {
  const parts = dateFormatter(timezone).formatToParts(instant);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error("Could not resolve the local date for the certificate");
  }
  return { year, month, day };
}

/**
 * Human-readable event date in the event's own timezone.
 *
 * Example: `2026-11-09T16:00:00.000Z` in `Asia/Manila` is local midnight on
 * 10 November, so the label is "November 10, 2026" — not "November 9, 2026".
 */
export function renderEventDateLabel(startsAt: Date | string, timezone: string): string {
  const instant = toValidDate(startsAt);
  const zone = assertTimeZone(timezone);
  const { year, month, day } = localDateParts(instant, zone);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

/**
 * Local calendar date (YYYY-MM-DD) used for `issuedOn`. The caller passes the
 * issuance instant; this function never reads the clock.
 */
export function issueDateInTimeZone(instant: Date | string, timezone: string): string {
  const date = toValidDate(instant);
  const zone = assertTimeZone(timezone);
  const { year, month, day } = localDateParts(date, zone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type BuildCertificatePayloadInput = {
  organization: CertificatePayloadV1["organization"];
  event: {
    sessionId: string;
    title: string;
    type: CertificateSessionType;
    startsAt: Date | string;
    endsAt: Date | string;
    timezone: string;
    /** Optional pre-rendered label; derived from startsAt/timezone when absent. */
    dateLabel?: string;
  };
  recipient: CertificatePayloadV1["recipient"];
  signatory: {
    userId: string;
    personId?: string | null;
    displayName: string;
    roleLabel: string;
  };
  statement: string;
  /** Calendar date shown on the certificate. Preferred over `issuedAt`. */
  issuedOn?: string;
  /** Issuance instant used to derive `issuedOn` in the event timezone. */
  issuedAt?: Date | string;
};

/**
 * Build a validated CertificatePayloadV1. Deterministic: object shape and key
 * order are fixed, instants are normalized to UTC ISO strings, and a missing
 * issue date requires an explicit `issuedAt` (there is no implicit `now`).
 */
export function buildCertificatePayload(input: BuildCertificatePayloadInput): CertificatePayloadV1 {
  const timezone = assertTimeZone(input.event.timezone);
  const startsAt = toValidDate(input.event.startsAt);
  const endsAt = toValidDate(input.event.endsAt);
  if (endsAt.getTime() < startsAt.getTime()) {
    throw new Error("Certificate event endsAt must not precede startsAt");
  }

  const issuedOn = input.issuedOn ?? (input.issuedAt ? issueDateInTimeZone(input.issuedAt, timezone) : null);
  if (!issuedOn) {
    throw new Error("Certificate issue date requires issuedOn or issuedAt");
  }

  const payload = {
    schemaVersion: CERTIFICATE_SCHEMA_VERSION,
    kind: CERTIFICATE_KIND,
    templateKey: CERTIFICATE_TEMPLATE_KEY,
    organization: {
      id: input.organization.id,
      name: input.organization.name,
    },
    event: {
      sessionId: input.event.sessionId,
      title: input.event.title,
      type: input.event.type,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      timezone,
      dateLabel: input.event.dateLabel ?? renderEventDateLabel(startsAt, timezone),
    },
    recipient: {
      personId: input.recipient.personId,
      displayName: input.recipient.displayName,
    },
    signatory: {
      userId: input.signatory.userId,
      personId: input.signatory.personId ?? null,
      displayName: input.signatory.displayName,
      roleLabel: input.signatory.roleLabel,
    },
    statement: input.statement,
    issuedOn,
  };

  // Throws on missing/extra fields and impossible dates. The parsed value is
  // the canonical payload (trimmed strings), so callers must hash the result,
  // not the unparsed input.
  return certificatePayloadV1.parse(payload);
}

/**
 * SHA-256 of the canonical payload. This is the value stored in
 * `Document.sha256` and re-checked by the public verifier. It intentionally
 * hashes only the payload: schemaVersion/kind/templateKey inside the payload
 * provide domain separation, and the payload is the signed artifact.
 */
export function certificateContentHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}
