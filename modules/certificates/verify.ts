// Public verification projection for an attendance certificate.
//
// Pure: no Prisma, no network, no clock. The caller loads the Document row and
// optionally the result of the P5 hash-chain verification; this module decides
// what the public QR/link may reveal.
//
// Privacy rule (ADR-10, signature-lifecycle.md §7, RA 10173): the projection is
// an allowlist, not a redaction pass. It never includes the recipient name or
// person id, the payload, email, external id, attendance instants, or signer
// identity beyond the role label. Organization name, event title/date and
// signatory role are the minimum needed to recognize the certificate.
//
// Integrity precedence (first match wins):
//   revoked > not_sealed > hash_mismatch > chain_broken > verified
// "Revoked" dominates because the document must never read as currently valid.
// "Not sealed" covers DRAFT and SUPERSEDED (the current row is not the sealed
// artifact). A payload that does not parse as CertificatePayloadV1 is treated
// as hash_mismatch: the stored hash may match bytes that are not a certificate.

import { certificateContentHash } from "./payload";
import { CERTIFICATE_TEMPLATE_KEY, certificatePayloadV1 } from "./schema";

export const CERTIFICATE_HASH_PREFIX_LENGTH = 16;
const CERTIFICATE_NUMBER_TOKEN_SUFFIX = 8;
const CERTIFICATE_NUMBER_HASH_PREFIX = 12;

export type CertificateIntegrity = "verified" | "hash_mismatch" | "chain_broken" | "not_sealed" | "revoked";

export type CertificateVerificationDocument = {
  template: string;
  title: string | null;
  version: number;
  sha256: string;
  payload: unknown;
  status: string;
  sealedAt: Date | string | null;
  verifyToken: string | null;
  createdAt: Date | string;
};

export type CertificatePublicVerification =
  | { exists: false }
  | {
      exists: true;
      status: string;
      sealed: boolean;
      title: string | null;
      organizationName: string | null;
      eventTitle: string | null;
      eventDateLabel: string | null;
      signatoryRoleLabel: string | null;
      sealedAt: string | null;
      certificateNumber: string | null;
      hashPrefix: string;
      integrity: CertificateIntegrity;
    };

export type CertificateVerificationOptions = {
  /**
   * Result of verifying the signature event chain. `undefined` means the
   * caller did not check (treated as not broken); `false` fails closed.
   */
  chainValid?: boolean;
};

function normalizeStatus(status: string): string {
  return typeof status === "string" ? status.trim().toUpperCase() : "";
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safeHash(payload: unknown): string | null {
  try {
    return certificateContentHash(payload);
  } catch {
    return null;
  }
}

/**
 * Stable public certificate number.
 *
 * Preferred form is the last 8 alphanumeric characters of the unguessable
 * verify token, prefixed with `CERT-` (e.g. `CERT-7F3K9QAZ`). Two documents
 * cannot share it while their tokens differ. When a document predates token
 * issuance, fall back to the first 12 hex characters of the stored SHA-256
 * (`CERT-1A2B3C4D5E6F`). Returns null when neither is usable.
 */
export function certificateNumberFor(input: {
  verifyToken?: string | null;
  sha256?: string | null;
}): string | null {
  const token = (input.verifyToken ?? "").trim();
  const tokenSuffix = token.replace(/[^a-zA-Z0-9]/g, "").slice(-CERTIFICATE_NUMBER_TOKEN_SUFFIX).toUpperCase();
  if (tokenSuffix.length > 0) return `CERT-${tokenSuffix}`;

  const hash = (input.sha256 ?? "").trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(hash)) {
    return `CERT-${hash.slice(0, CERTIFICATE_NUMBER_HASH_PREFIX).toUpperCase()}`;
  }
  return null;
}

/**
 * Build the public projection. A missing row or a row for another template is
 * reported as `{ exists: false }`; a caller must not reveal non-certificate
 * documents through the certificate verify endpoint.
 */
export function buildCertificateVerification(
  document: CertificateVerificationDocument | null | undefined,
  options: CertificateVerificationOptions = {},
): CertificatePublicVerification {
  if (!document || document.template !== CERTIFICATE_TEMPLATE_KEY) {
    return { exists: false };
  }

  const status = normalizeStatus(document.status);
  const sealedAt = isoOrNull(document.sealedAt);
  const sealed = status === "SEALED" && sealedAt !== null;

  const storedHash = (document.sha256 ?? "").trim().toLowerCase();
  const computedHash = safeHash(document.payload);
  const hashMatches = computedHash !== null && computedHash === storedHash;

  const parsed = certificatePayloadV1.safeParse(document.payload);
  const payloadValid = parsed.success;
  const payload = payloadValid ? parsed.data : null;

  let integrity: CertificateIntegrity;
  if (status === "REVOKED") integrity = "revoked";
  else if (!sealed) integrity = "not_sealed";
  else if (!hashMatches || !payloadValid) integrity = "hash_mismatch";
  else if (options.chainValid === false) integrity = "chain_broken";
  else integrity = "verified";

  return {
    exists: true,
    status,
    sealed,
    title: document.title ?? null,
    organizationName: payload?.organization.name ?? null,
    eventTitle: payload?.event.title ?? null,
    eventDateLabel: payload?.event.dateLabel ?? null,
    signatoryRoleLabel: payload?.signatory.roleLabel ?? null,
    sealedAt,
    certificateNumber: certificateNumberFor({ verifyToken: document.verifyToken, sha256: storedHash }),
    hashPrefix: storedHash.slice(0, CERTIFICATE_HASH_PREFIX_LENGTH),
    integrity,
  };
}
