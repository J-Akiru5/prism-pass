// Public verification response for the unauthenticated verify endpoint/page.
//
// Pure: no Prisma, no network, no clock. The caller loads the Document row plus
// its signature requests/events; this module decides which response shape is
// safe to publish.
//
// Two shapes exist:
// - certificate documents (`certificate.attendance.v1`) use the allowlisted
//   projection from buildCertificateVerification(), with the signature chain
//   checked here;
// - every other document keeps the original minimal shape (exists, sealed,
//   hashPrefix, createdAt, sealedAt) so existing consumers do not regress.
//
// Neither shape includes recipient identity, payload, email, external ids,
// attendance instants or signature auth evidence. The certificate projection
// is an allowlist, not a redaction pass (ADR-10, RA 10173).

import { signerKeyOf, verifyChain, type ChainEvent } from "../documents/service";
import { CERTIFICATE_TEMPLATE_KEY } from "./schema";
import {
  CERTIFICATE_HASH_PREFIX_LENGTH,
  buildCertificateVerification,
  type CertificatePublicVerification,
  type CertificateVerificationDocument,
} from "./verify";

// Must match the route's capability bounds. Tokens are generated as
// `dv_` + 32 hex characters; the bounds reject obvious junk before a DB lookup
// without guessing a stricter alphabet that could break older rows.
export const VERIFY_TOKEN_MIN_LENGTH = 16;
export const VERIFY_TOKEN_MAX_LENGTH = 128;

export type PublicVerificationDocument = CertificateVerificationDocument;

export type PublicVerificationChainEvent = {
  requestId: string;
  signerUserId?: string | null;
  signerPersonId?: string | null;
  docHash: string;
  consentVersion: string;
  serverTs: Date | string;
  prevHash: string | null;
  currHash: string;
};

export type PublicVerificationSignatureRequest = {
  id: string;
  events: readonly PublicVerificationChainEvent[];
};

/** The pre-M3 minimal response, unchanged for non-certificate documents. */
export type GenericDocumentVerification = {
  exists: true;
  sealed: boolean;
  hashPrefix: string;
  createdAt: string | null;
  sealedAt: string | null;
};

// A found document always exists, so the `{ exists: false }` variant is
// reserved for callers that build the projection directly. This module returns
// null for an unknown token instead.
export type PublicVerificationPayload =
  | Extract<CertificatePublicVerification, { exists: true }>
  | GenericDocumentVerification;

export function isVerificationTokenCandidate(token: string | null | undefined): token is string {
  return (
    typeof token === "string" &&
    token.length >= VERIFY_TOKEN_MIN_LENGTH &&
    token.length <= VERIFY_TOKEN_MAX_LENGTH
  );
}

/**
 * True when the payload is a certificate projection (not the generic shape and
 * not `{ exists: false }`). Lets callers narrow without key guessing.
 */
export function isCertificateVerification(
  payload: PublicVerificationPayload,
): payload is Extract<CertificatePublicVerification, { exists: true }> {
  return payload.exists && "integrity" in payload;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Verifies every signature request chain. Each request is checked with its own
 * id, so an event cannot be transplanted from a different request. A request
 * with no events yet is a draft chain, not a broken one; sealing is decided by
 * buildCertificateVerification().
 *
 * A missing signer identity fails closed: the chain cannot be recomputed
 * without the key it committed to.
 */
export function signatureRequestsChainValid(
  requests: readonly PublicVerificationSignatureRequest[] | null | undefined,
): boolean {
  if (!requests) return true;
  for (const request of requests) {
    const chain: ChainEvent[] = [];
    for (const event of request.events) {
      const signerKey = signerKeyOf(event);
      if (!signerKey) return false;
      chain.push({
        requestId: event.requestId,
        docHash: event.docHash,
        signerKey,
        consentVersion: event.consentVersion,
        serverTs: event.serverTs,
        prevHash: event.prevHash,
        currHash: event.currHash,
      });
    }
    if (!verifyChain(chain, { requestId: request.id }).ok) return false;
  }
  return true;
}

function genericDocumentVerification(document: PublicVerificationDocument): GenericDocumentVerification {
  return {
    exists: true,
    sealed: document.status === "SEALED",
    hashPrefix: document.sha256.slice(0, CERTIFICATE_HASH_PREFIX_LENGTH),
    createdAt: isoOrNull(document.createdAt),
    sealedAt: isoOrNull(document.sealedAt),
  };
}

/**
 * Maps a loaded document to its public response, or null when the token is
 * unknown. Certificate documents are detected by template and verified against
 * their payload hash and signature chain; all other documents keep the minimal
 * pre-M3 response.
 */
export function buildPublicVerification(
  document: PublicVerificationDocument | null | undefined,
  signatureRequests: readonly PublicVerificationSignatureRequest[] = [],
): PublicVerificationPayload | null {
  if (!document) return null;

  if (document.template === CERTIFICATE_TEMPLATE_KEY) {
    const projection = buildCertificateVerification(document, {
      chainValid: signatureRequestsChainValid(signatureRequests),
    });
    return projection.exists ? projection : null;
  }

  return genericDocumentVerification(document);
}
