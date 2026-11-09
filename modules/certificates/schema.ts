import { z } from "zod";

// Certificate payload v1 — the exact content a certificate signature commits
// to. This module is pure (zod only): no Prisma, no network, no clock. Routes
// persist the payload; the hash and public projection live beside it.
//
// Privacy boundary (RA 10173): the payload deliberately carries only what the
// printed certificate shows. There is no email, external id, attendance
// history, check-in/out instant, or free-form metadata. Every object is
// `.strict()` so an extra key is a validation error rather than silent PII
// leakage into a signed artifact.

export const CERTIFICATE_SCHEMA_VERSION = 1 as const;
export const CERTIFICATE_KIND = "attendance_certificate" as const;
export const CERTIFICATE_TEMPLATE_KEY = "certificate.attendance.v1" as const;

/** Mirrors the Prisma `SessionType` enum without importing the client. */
export const CERTIFICATE_SESSION_TYPES = ["EVENT", "OJT", "SHIFT", "CLASS", "VISITOR", "TRAINING"] as const;
export type CertificateSessionType = (typeof CERTIFICATE_SESSION_TYPES)[number];

const ID_MAX = 120;
const NAME_MAX = 200;
const TITLE_MAX = 300;
const LABEL_MAX = 120;
const STATEMENT_MAX = 2_000;

const idString = z.string().trim().min(1).max(ID_MAX);
const displayName = z.string().trim().min(1).max(NAME_MAX);
const label = z.string().trim().min(1).max(LABEL_MAX);

/** ISO-8601 instant. Offsets are accepted; the payload builder normalizes to UTC. */
const instant = z.string().datetime({ offset: true });

/** Calendar date without a time or zone: YYYY-MM-DD. */
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "Expected a real calendar date");

export const certificateOrganizationSchema = z
  .object({
    id: idString,
    name: displayName,
  })
  .strict();

/**
 * Event identity and display label. `dateLabel` is the rendered local date
 * (e.g. "November 9, 2026"); the instants are kept so the certificate can be
 * re-rendered and audited without trusting the label alone.
 */
export const certificateEventSchema = z
  .object({
    sessionId: idString,
    title: z.string().trim().min(1).max(TITLE_MAX),
    type: z.enum(CERTIFICATE_SESSION_TYPES),
    startsAt: instant,
    endsAt: instant,
    timezone: z.string().trim().min(1).max(64),
    dateLabel: label,
  })
  .strict()
  .refine((event) => Date.parse(event.endsAt) >= Date.parse(event.startsAt), {
    message: "endsAt must not precede startsAt",
    path: ["endsAt"],
  });

export const certificateRecipientSchema = z
  .object({
    personId: idString,
    displayName,
  })
  .strict();

/**
 * The signatory is the accountable official, not the attendee. `personId` is
 * nullable because the signing user may not have a linked Person row.
 */
export const certificateSignatorySchema = z
  .object({
    userId: idString,
    personId: idString.nullable(),
    displayName,
    roleLabel: label,
  })
  .strict();

export const certificatePayloadV1 = z
  .object({
    schemaVersion: z.literal(CERTIFICATE_SCHEMA_VERSION),
    kind: z.literal(CERTIFICATE_KIND),
    templateKey: z.literal(CERTIFICATE_TEMPLATE_KEY),
    organization: certificateOrganizationSchema,
    event: certificateEventSchema,
    recipient: certificateRecipientSchema,
    signatory: certificateSignatorySchema,
    statement: z.string().trim().min(1).max(STATEMENT_MAX),
    issuedOn: calendarDate,
  })
  .strict();

export type CertificatePayloadV1 = z.infer<typeof certificatePayloadV1>;
export type CertificateOrganization = CertificatePayloadV1["organization"];
export type CertificateEvent = CertificatePayloadV1["event"];
export type CertificateRecipient = CertificatePayloadV1["recipient"];
export type CertificateSignatory = CertificatePayloadV1["signatory"];
