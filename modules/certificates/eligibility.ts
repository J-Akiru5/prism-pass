// Certificate eligibility over reconciled attendance records.
//
// Pure: no Prisma, no network, no clock. A route passes the records it already
// loaded; this module owns the one definition of "may receive a certificate",
// so generation, preview and tests cannot drift apart.
//
// Default policy — proof of presence:
//   * a check-in event is mandatory (a record without one has no scanned
//     evidence, so issuing a certificate would certify nothing);
//   * status must be PRESENT or LATE (LATE still attended, just not on time);
//   * ABSENT, EXCUSED and PARTIAL are excluded by default:
//       - ABSENT: no attendance happened;
//       - EXCUSED: absence was permitted, but a certificate claims attendance;
//       - PARTIAL: check-in happened without a complete record, so the event
//         is not "complete" yet (M3 exit test); there is no partial-certificate
//         mode in v1;
//   * a REJECTED approval always blocks, even when `requireApproval` is off:
//     a reviewer explicitly said the record is not valid;
//   * `requireCheckOut` and `requireApproval` are strictness opt-ins for
//     organizations that need duration proof or a positive approval.
//
// Status and approval values are compared case-insensitively against the
// Prisma enums so lower-case rows from a data import still match. An unknown
// status fails closed; an unrecognized approval is treated as NONE.

export const CERTIFICATE_RECORD_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED", "PARTIAL"] as const;
export type CertificateRecordStatus = (typeof CERTIFICATE_RECORD_STATUSES)[number];

export const CERTIFICATE_APPROVAL_STATUSES = ["NONE", "PENDING", "APPROVED", "REJECTED"] as const;
export type CertificateApprovalStatus = (typeof CERTIFICATE_APPROVAL_STATUSES)[number];

/** The subset of `AttendanceRecord` eligibility reads; a Prisma `select` can match it. */
export type CertificateEligibilityRecord = {
  sessionId: string;
  personId: string;
  checkInEventId?: string | null;
  checkOutEventId?: string | null;
  status: string;
  approvalStatus?: string | null;
};

export type CertificateEligibilityOptions = {
  /** Require a check-out event (duration proof). Default: false. */
  requireCheckOut?: boolean;
  /** Require approvalStatus APPROVED, not merely "not rejected". Default: false. */
  requireApproval?: boolean;
};

export type CertificateSkipReason =
  | "missing_check_in"
  | "record_absent"
  | "record_excused"
  | "record_partial"
  | "unknown_status"
  | "approval_rejected"
  | "approval_required"
  | "check_out_required";

export type CertificateEligibility =
  | { eligible: true }
  | { eligible: false; reason: CertificateSkipReason; message: string };

const SKIP_MESSAGES: Record<CertificateSkipReason, string> = {
  missing_check_in: "Record has no check-in event",
  record_absent: "Record is absent",
  record_excused: "Record is excused, not attended",
  record_partial: "Record is partial (incomplete attendance)",
  unknown_status: "Record status is not recognized",
  approval_rejected: "Record approval was rejected",
  approval_required: "Record is not approved",
  check_out_required: "Record has no check-out event",
};

function normalizedStatus(status: string | null | undefined): CertificateRecordStatus | null {
  const value = (status ?? "").trim().toUpperCase();
  return (CERTIFICATE_RECORD_STATUSES as readonly string[]).includes(value)
    ? (value as CertificateRecordStatus)
    : null;
}

function normalizedApproval(status: string | null | undefined): CertificateApprovalStatus | null {
  const value = (status ?? "").trim().toUpperCase();
  return (CERTIFICATE_APPROVAL_STATUSES as readonly string[]).includes(value)
    ? (value as CertificateApprovalStatus)
    : null;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function skip(reason: CertificateSkipReason): CertificateEligibility {
  return { eligible: false, reason, message: SKIP_MESSAGES[reason] };
}

/**
 * Decide one record. `status` must be an exact Prisma enum value
 * (case-insensitive); a missing or unknown status fails closed.
 */
export function evaluateCertificateEligibility(
  record: CertificateEligibilityRecord,
  options: CertificateEligibilityOptions = {},
): CertificateEligibility {
  if (!hasText(record.checkInEventId)) return skip("missing_check_in");

  const status = normalizedStatus(record.status);
  if (status === "ABSENT") return skip("record_absent");
  if (status === "EXCUSED") return skip("record_excused");
  if (status === "PARTIAL") return skip("record_partial");
  if (status !== "PRESENT" && status !== "LATE") return skip("unknown_status");

  const approval = normalizedApproval(record.approvalStatus) ?? "NONE";
  if (approval === "REJECTED") return skip("approval_rejected");
  if (options.requireApproval && approval !== "APPROVED") return skip("approval_required");
  if (options.requireCheckOut && !hasText(record.checkOutEventId)) return skip("check_out_required");

  return { eligible: true };
}

export function isCertificateEligible(
  record: CertificateEligibilityRecord,
  options: CertificateEligibilityOptions = {},
): boolean {
  return evaluateCertificateEligibility(record, options).eligible;
}

export type CertificateSkippedCandidate<T extends CertificateEligibilityRecord> = {
  record: T;
  reason: CertificateSkipReason;
  message: string;
};

export type CertificateCandidateDecision<T extends CertificateEligibilityRecord> = {
  /** Eligible records in input order. */
  eligible: T[];
  /** Skipped records with a machine-readable reason, in input order. */
  skipped: CertificateSkippedCandidate<T>[];
};

/**
 * Split a batch into eligible and skipped records. Deterministic: input order is
 * preserved in both lists and no record is de-duplicated. The caller decides
 * whether duplicates (same session/person) are a data error.
 */
export function decideCertificateCandidates<T extends CertificateEligibilityRecord>(
  records: readonly T[],
  options: CertificateEligibilityOptions = {},
): CertificateCandidateDecision<T> {
  const eligible: T[] = [];
  const skipped: CertificateSkippedCandidate<T>[] = [];

  for (const record of records) {
    const decision = evaluateCertificateEligibility(record, options);
    if (decision.eligible) eligible.push(record);
    else skipped.push({ record, reason: decision.reason, message: decision.message });
  }

  return { eligible, skipped };
}

/** Human-readable description, shared with preview/UI callers. */
export function describeCertificateSkipReason(reason: CertificateSkipReason): string {
  return SKIP_MESSAGES[reason];
}
