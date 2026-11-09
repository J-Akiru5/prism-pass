// Certificate batch planning — the pure bridge between reconciled attendance
// records and the P5 Document/SignatureRequest rows a route persists.
//
// Pure: no Prisma, no network, no clock. The route loads records, the event and
// the signatory, then asks this module what to create. Keeping the decision here
// means preview, generation and tests cannot disagree about eligibility,
// de-duplication or the exact bytes that will be hashed.
//
// Two entry points share one classifier:
//   * previewCertificateBatch() — eligible / skipped / alreadyGenerated without
//     payloads, for the organizer preview (no Document rows are created);
//   * planCertificateBatch()   — the same split plus a validated payload and
//     SHA-256 per recipient, for POST generation.
//
// Idempotency: a recipient is keyed by (sessionId, personId). `existingKeys`
// usually comes from Document rows carrying source_session_id/source_person_id.
// A key already present is reported as alreadyGenerated, never as an error; the
// database unique index is the final backstop against concurrent runs.
//
// Privacy: the audit helper at the bottom is deliberately counts-only. Recipient
// names and person ids never enter an audit entry.

import {
  evaluateCertificateEligibility,
  type CertificateEligibilityOptions,
  type CertificateEligibilityRecord,
  type CertificateSkipReason,
} from "./eligibility";
import { buildCertificatePayload, certificateContentHash } from "./payload";
import { CERTIFICATE_TEMPLATE_KEY, type CertificatePayloadV1, type CertificateSessionType } from "./schema";

/** Literal consent version the signer must present when signing. */
export const CERTIFICATE_CONSENT_VERSION = "certificate-consent-v1";
/** Hard cap on documents one generate request may create. */
export const CERTIFICATE_MAX_BATCH = 100;
export const CERTIFICATE_DOCUMENT_TITLE_PREFIX = "Certificate of Attendance — ";

const PLAN_SKIP_MESSAGES = {
  duplicate_record: "Attendance record is repeated in this batch",
  invalid_recipient_name: "Recipient has no usable display name",
} as const;

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Organization Owner",
  ADMIN: "Administrator",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  SCANNER: "Scanner",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export type CertificatePlanSkipReason = CertificateSkipReason | keyof typeof PLAN_SKIP_MESSAGES;

/** The subset of an AttendanceRecord + Person that generation needs. */
export type CertificateGenerationRecord = CertificateEligibilityRecord & {
  /** Person.displayName; the only recipient identity a certificate prints. */
  personDisplayName: string;
};

export type CertificateBatchRecipient = {
  /** Stable de-duplication key: certificateDedupeKey(sessionId, personId). */
  key: string;
  sessionId: string;
  personId: string;
  displayName: string;
};

export type CertificateBatchSkipped = CertificateBatchRecipient & {
  reason: CertificatePlanSkipReason;
  message: string;
};

export type CertificateBatchCounts = {
  /** Records considered in this request. */
  records: number;
  /** Records that will become a new document. */
  eligible: number;
  /** Records excluded, including duplicates. */
  skipped: number;
  /** Keys that already have a document (idempotent repeat or earlier run). */
  alreadyGenerated: number;
  /** Subset of `skipped`: the same key appeared more than once in the input. */
  duplicates: number;
};

export type CertificateBatchPreview = {
  eligible: CertificateBatchRecipient[];
  skipped: CertificateBatchSkipped[];
  alreadyGenerated: CertificateBatchRecipient[];
  counts: CertificateBatchCounts;
  maxBatch: number;
  exceedsBatchLimit: boolean;
};

export type CertificatePlannedDocument = CertificateBatchRecipient & {
  payload: CertificatePayloadV1;
  /**
   * certificateContentHash(payload) — the payload-only hash the public verifier
   * recomputes. Intentionally NOT documentContentHash(template, version, payload).
   */
  sha256: string;
};

export type CertificateBatchPlan = Omit<CertificateBatchPreview, "eligible"> & {
  eligible: CertificatePlannedDocument[];
};

export type CertificateEventInput = {
  sessionId: string;
  title: string;
  type: CertificateSessionType;
  startsAt: Date | string;
  endsAt: Date | string;
  timezone: string;
  dateLabel?: string;
};

export type CertificateSignatoryInput = {
  userId: string;
  personId?: string | null;
  displayName: string;
  roleLabel: string;
};

export type ClassifyCertificateBatchInput = {
  records: readonly CertificateGenerationRecord[];
  /** Keys that already have a generated document. */
  existingKeys?: Iterable<string>;
  eligibility?: CertificateEligibilityOptions;
  maxBatch?: number;
};

export type PlanCertificateBatchInput = ClassifyCertificateBatchInput & {
  organization: { id: string; name: string };
  event: CertificateEventInput;
  signatory: CertificateSignatoryInput;
  /** Custom statement, used verbatim for every recipient. Defaults per name. */
  statement?: string;
  /** Calendar date (YYYY-MM-DD); the planner never reads the clock. */
  issuedOn: string;
};

/** Stable identity for one attendee's certificate. */
export function certificateDedupeKey(sessionId: string, personId: string): string {
  return JSON.stringify([sessionId, personId]);
}

export function defaultCertificateStatement(recipientDisplayName: string, eventTitle: string): string {
  return `This certifies that ${recipientDisplayName.trim()} attended ${eventTitle.trim()}.`;
}

export function certificateDocumentTitle(eventTitle: string): string {
  return `${CERTIFICATE_DOCUMENT_TITLE_PREFIX}${eventTitle.trim()}`;
}

/** Human signatory label for the certificate; never an email or raw enum. */
export function certificateRoleLabel(role: string): string {
  return ROLE_LABELS[role.trim().toUpperCase()] ?? "Authorized Signatory";
}

function resolveMaxBatch(value: number | undefined): number {
  const max = value ?? CERTIFICATE_MAX_BATCH;
  if (!Number.isInteger(max) || max < 1) {
    throw new Error("Certificate batch limit must be a positive integer");
  }
  return max;
}

type EligibleCandidate = CertificateBatchRecipient;

type Classification = {
  eligible: EligibleCandidate[];
  skipped: CertificateBatchSkipped[];
  alreadyGenerated: CertificateBatchRecipient[];
  counts: CertificateBatchCounts;
  maxBatch: number;
  exceedsBatchLimit: boolean;
};

function classifyCertificateBatch(input: ClassifyCertificateBatchInput): Classification {
  const existing = new Set(input.existingKeys ?? []);
  const seen = new Set<string>();
  const eligible: EligibleCandidate[] = [];
  const skipped: CertificateBatchSkipped[] = [];
  const alreadyGenerated: CertificateBatchRecipient[] = [];
  let duplicates = 0;

  for (const record of input.records) {
    const key = certificateDedupeKey(record.sessionId, record.personId);
    const recipient: CertificateBatchRecipient = {
      key,
      sessionId: record.sessionId,
      personId: record.personId,
      displayName: record.personDisplayName ?? "",
    };

    // Input order wins: only the first occurrence of a key is considered.
    if (seen.has(key)) {
      duplicates += 1;
      skipped.push({
        ...recipient,
        reason: "duplicate_record",
        message: PLAN_SKIP_MESSAGES.duplicate_record,
      });
      continue;
    }
    seen.add(key);

    // Already issued in an earlier run. Not re-evaluated: a record that later
    // became ineligible still has a document, and a repeat must not error.
    if (existing.has(key)) {
      alreadyGenerated.push(recipient);
      continue;
    }

    const decision = evaluateCertificateEligibility(record, input.eligibility);
    if (!decision.eligible) {
      skipped.push({ ...recipient, reason: decision.reason, message: decision.message });
      continue;
    }

    const name = recipient.displayName.trim();
    // Payload names are capped at 200 characters; failing one name must not
    // abort a 100-person batch or silently print an empty certificate.
    if (name.length === 0 || name.length > 200) {
      skipped.push({
        ...recipient,
        reason: "invalid_recipient_name",
        message: PLAN_SKIP_MESSAGES.invalid_recipient_name,
      });
      continue;
    }

    eligible.push({ ...recipient, displayName: name });
  }

  const maxBatch = resolveMaxBatch(input.maxBatch);
  return {
    eligible,
    skipped,
    alreadyGenerated,
    counts: {
      records: input.records.length,
      eligible: eligible.length,
      skipped: skipped.length,
      alreadyGenerated: alreadyGenerated.length,
      duplicates,
    },
    maxBatch,
    exceedsBatchLimit: eligible.length > maxBatch,
  };
}

/** Preview only: no payloads, no clock, no persistence. */
export function previewCertificateBatch(input: ClassifyCertificateBatchInput): CertificateBatchPreview {
  const classified = classifyCertificateBatch(input);
  return {
    eligible: classified.eligible,
    skipped: classified.skipped,
    alreadyGenerated: classified.alreadyGenerated,
    counts: classified.counts,
    maxBatch: classified.maxBatch,
    exceedsBatchLimit: classified.exceedsBatchLimit,
  };
}

/**
 * Build one validated payload and hash per eligible recipient. The caller must
 * pass the exact event, organization and signatory that will be persisted; any
 * event-level validation failure throws rather than producing partial garbage.
 */
export function planCertificateBatch(input: PlanCertificateBatchInput): CertificateBatchPlan {
  const classified = classifyCertificateBatch(input);
  const customStatement = input.statement?.trim() ?? "";
  const statementFor = (displayName: string): string =>
    customStatement.length > 0
      ? customStatement
      : defaultCertificateStatement(displayName, input.event.title);

  const eligible = classified.eligible.map((recipient) => {
    const payload = buildCertificatePayload({
      organization: input.organization,
      event: input.event,
      recipient: { personId: recipient.personId, displayName: recipient.displayName },
      signatory: input.signatory,
      statement: statementFor(recipient.displayName),
      issuedOn: input.issuedOn,
    });
    return {
      ...recipient,
      payload,
      // Payload-only hash: this is exactly what buildCertificateVerification()
      // recomputes. documentContentHash() would also fold in template/version
      // and make every generated certificate fail public verification.
      sha256: certificateContentHash(payload),
    };
  });

  return {
    eligible,
    skipped: classified.skipped,
    alreadyGenerated: classified.alreadyGenerated,
    counts: classified.counts,
    maxBatch: classified.maxBatch,
    exceedsBatchLimit: classified.exceedsBatchLimit,
  };
}

export type CertificateBatchAuditCounts = CertificateBatchCounts & {
  /** Documents actually inserted by this run (may be lower than eligible on a race). */
  generated: number;
};

/**
 * Counts-only audit payload for `certificate.batch_generate`. Recipient names,
 * person ids and statement text (which may contain a name) are excluded.
 */
export function certificateBatchAuditMeta(input: {
  batchId: string;
  sessionId: string;
  counts: CertificateBatchAuditCounts;
  requireCheckOut: boolean;
  requireApproval: boolean;
  issuedOn: string;
  customStatement: boolean;
}): Record<string, unknown> {
  return {
    batchId: input.batchId,
    sessionId: input.sessionId,
    template: CERTIFICATE_TEMPLATE_KEY,
    records: input.counts.records,
    eligible: input.counts.eligible,
    generated: input.counts.generated,
    skipped: input.counts.skipped,
    alreadyGenerated: input.counts.alreadyGenerated,
    duplicates: input.counts.duplicates,
    requireCheckOut: input.requireCheckOut,
    requireApproval: input.requireApproval,
    issuedOn: input.issuedOn,
    customStatement: input.customStatement,
  };
}
