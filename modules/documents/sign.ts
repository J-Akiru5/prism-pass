import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  chainHash,
  evaluateSigning,
  isValidSignatureOrder,
  nextDocumentStatus,
  signerKey,
  signerKeyOf,
  verifyChain,
  type ChainEvent,
  type ChainVerification,
  type DocumentStatus,
  type SignatureOrderStep,
  type SigningDecision,
} from "./service";
import type { SignInput } from "./schema";
import { CERTIFICATE_CONSENT_VERSION, CERTIFICATE_MAX_BATCH } from "@/modules/certificates/generate";
import { CERTIFICATE_TEMPLATE_KEY, certificatePayloadV1 } from "@/modules/certificates/schema";

// Shared signing core for the P5 single-request route and the M3 certificate
// batch routes. The pure helpers at the top (chain assembly, actor keys, batch
// decisions, member projection) are the tested contract; the async functions at
// the bottom own persistence and are used only by route handlers.
//
// Prisma and tenant access are imported lazily inside the async functions so a
// test that imports the pure helpers never constructs a PrismaClient or pulls a
// server-only module into the module graph.

/** Literal consent version the signer must present. */
export { CERTIFICATE_CONSENT_VERSION };

/**
 * Exact consent wording for `certificate-consent-v1`. Shown on the signing
 * screen and stored-by-reference through the version in each signature event.
 * Changing the wording requires a new consent version, never editing this one.
 */
export const CERTIFICATE_CONSENT_TEXT =
  "I confirm that I reviewed the certificates in this batch, that the information shown is accurate to the best of my knowledge, and that I intend to sign them electronically. I understand that each signature is recorded with a server timestamp and a SHA-256 hash chain, and that a signed certificate cannot be edited.";

/** Hard cap on documents one signing request may seal. Mirrors the generation cap. */
export const CERTIFICATE_SIGNING_BATCH_MAX = CERTIFICATE_MAX_BATCH;

// ---------------------------------------------------------------------------
// Single-request signing
// ---------------------------------------------------------------------------

export type SigningActor = {
  organizationId: string;
  internalUserId: string;
  membershipId: string;
};

/** Shape of a SignatureEvent row as loaded by the sign route. */
export type SigningEventRow = {
  requestId: string;
  signerUserId: string | null;
  signerPersonId: string | null;
  docHash: string;
  consentVersion: string;
  serverTs: Date | string;
  prevHash: string | null;
  currHash: string;
};

export type ChainFromRowsResult =
  | { ok: true; chain: ChainEvent[] }
  | { ok: false; reason: "missing_signer" };

/** Converts stored events into the canonical chain input. */
export function chainFromEventRows(rows: readonly SigningEventRow[]): ChainFromRowsResult {
  const chain: ChainEvent[] = [];
  for (const event of rows) {
    const key = signerKeyOf({ signerUserId: event.signerUserId, signerPersonId: event.signerPersonId });
    if (!key) return { ok: false, reason: "missing_signer" };
    chain.push({
      requestId: event.requestId,
      docHash: event.docHash,
      signerKey: key,
      consentVersion: event.consentVersion,
      serverTs: event.serverTs,
      prevHash: event.prevHash,
      currHash: event.currHash,
    });
  }
  return { ok: true, chain };
}

/**
 * Every identity key the authenticated actor may sign as: their internal user
 * id plus any Person rows linked to that user inside the organization.
 */
export function actorSignerKeys(input: { userId: string; personIds: readonly string[] }): string[] {
  return [
    signerKey({ signerUserId: input.userId }),
    ...input.personIds.map((personId) => signerKey({ signerPersonId: personId })),
  ];
}

/** Loads the actor's linked Person rows and derives their signer keys. */
export async function loadActorSignerKeys(organizationId: string, internalUserId: string): Promise<string[]> {
  const prisma = await database();
  const people = await prisma.person.findMany({
    where: { organizationId, userId: internalUserId },
    select: { id: true },
  });
  return actorSignerKeys({ userId: internalUserId, personIds: people.map((person) => person.id) });
}

export type SignedEventProjection = {
  id: string;
  sequence: number;
  signerUserId: string | null;
  signerPersonId: string | null;
  docVersion: number;
  docHash: string;
  method: string;
  consentVersion: string;
  serverTs: Date;
  deviceId: string | null;
  artifactRef: string | null;
  prevHash: string | null;
  currHash: string;
};

export type SingleSignFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";
  message: string;
  details?: unknown;
};

export type SingleSignSuccess = {
  ok: true;
  event: SignedEventProjection;
  sealed: boolean;
  documentStatus: DocumentStatus;
};

export type SingleSignResult = SingleSignSuccess | SingleSignFailure;

class SigningRaceError extends Error {}

function signingFailure(decision: Extract<SigningDecision, { ok: false }>): SingleSignFailure {
  const details = { reason: decision.code };
  switch (decision.code) {
    case "CONSENT_REQUIRED":
    case "CONSENT_VERSION_MISMATCH":
      return { ok: false, status: 400, code: "INVALID_INPUT", message: decision.message, details };
    case "NOT_YOUR_TURN":
      return { ok: false, status: 403, code: "FORBIDDEN", message: decision.message, details };
    default:
      return { ok: false, status: 409, code: "CONFLICT", message: decision.message, details };
  }
}

/**
 * Appends one signature to a request after loading and verifying its chain.
 * Behavior-preserving extraction of the original single-sign route: tenant
 * scoping, consent/order evaluation, the sequence race guard, sealing on the
 * final step and the `document.sign` audit row all happen here.
 */
export async function signSingleRequest(input: {
  actor: SigningActor;
  requestId: string;
  input: SignInput;
}): Promise<SingleSignResult> {
  const prisma = await database();
  const request = await prisma.signatureRequest.findUnique({
    where: { id: input.requestId },
    include: {
      document: true,
      events: { orderBy: { sequence: "asc" } },
    },
  });
  // Tenant scope is checked on both rows; cross-org ids resolve to 404.
  if (
    !request ||
    request.organizationId !== input.actor.organizationId ||
    request.document.organizationId !== input.actor.organizationId
  ) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "Signature request not found in this organization",
    };
  }

  const chainResult = chainFromEventRows(request.events);
  if (!chainResult.ok) {
    return {
      ok: false,
      status: 409,
      code: "CONFLICT",
      message: "Signature chain is broken; refusing to append",
      details: { reason: "missing_signer" },
    };
  }
  // Refuse to extend a chain that no longer verifies; a rewrite is a data
  // incident, not something to paper over with another signature.
  const chainCheck = verifyChain(chainResult.chain, { requestId: request.id });
  if (!chainCheck.ok) {
    return {
      ok: false,
      status: 409,
      code: "CONFLICT",
      message: "Signature chain is broken; refusing to append",
      details: { brokenAt: chainCheck.brokenAt, reason: chainCheck.reason },
    };
  }

  const actorKeys = await loadActorSignerKeys(input.actor.organizationId, input.actor.internalUserId);
  const decision = evaluateSigning({
    order: request.order as unknown as SignatureOrderStep[],
    signedEvents: request.events.map((event) => ({
      signerUserId: event.signerUserId,
      signerPersonId: event.signerPersonId,
    })),
    documentStatus: request.document.status as DocumentStatus,
    consentVersion: input.input.consentVersion,
    requiredConsentVersion: request.consentVersion,
    actorKeys,
    expiresAt: request.expiresAt,
  });
  if (!decision.ok) return signingFailure(decision);

  const serverTs = new Date();
  const prevHash = request.events.length > 0 ? request.events[request.events.length - 1].currHash : null;
  const currHash = chainHash({
    prevHash,
    requestId: request.id,
    docHash: request.document.sha256,
    signerKey: decision.signerKey,
    consentVersion: input.input.consentVersion,
    serverTs,
  });
  const documentStatus = nextDocumentStatus(
    request.document.status as DocumentStatus,
    decision.sealsDocument,
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Guard against two signers racing on the same step: the unique
      // (request_id, sequence) index is the hard backstop, this is the clear error.
      const currentCount = await tx.signatureEvent.count({ where: { requestId: request.id } });
      if (currentCount !== decision.sequence) {
        throw new SigningRaceError("Signature state changed; reload and try again");
      }

      const event = await tx.signatureEvent.create({
        data: {
          organizationId: input.actor.organizationId,
          requestId: request.id,
          sequence: decision.sequence,
          signerUserId: decision.step.signerUserId ?? null,
          signerPersonId: decision.step.signerPersonId ?? null,
          docVersion: request.document.version,
          docHash: request.document.sha256,
          method: input.input.method,
          consentVersion: input.input.consentVersion,
          serverTs,
          authEvidence: {
            ...(input.input.authEvidence ?? {}),
            actorUserId: input.actor.internalUserId,
            membershipId: input.actor.membershipId,
            via: "session",
          } as Prisma.InputJsonValue,
          deviceId: input.input.deviceId ?? null,
          artifactRef: input.input.artifactRef ?? null,
          prevHash,
          currHash,
        },
        select: {
          id: true,
          sequence: true,
          signerUserId: true,
          signerPersonId: true,
          docVersion: true,
          docHash: true,
          method: true,
          consentVersion: true,
          serverTs: true,
          deviceId: true,
          artifactRef: true,
          prevHash: true,
          currHash: true,
        },
      });

      if (decision.sealsDocument) {
        await tx.document.update({
          where: { id: request.document.id },
          data: { status: "SEALED", sealedAt: serverTs },
        });
        await tx.signatureRequest.update({ where: { id: request.id }, data: { status: "signed" } });
      }
      await tx.auditLog.create({
        data: {
          organizationId: input.actor.organizationId,
          actorUserId: input.actor.internalUserId,
          action: "document.sign",
          resource: `document:${request.document.id}`,
          result: "ok",
          meta: {
            requestId: request.id,
            sequence: decision.sequence,
            method: input.input.method,
            currHash,
            sealed: decision.sealsDocument,
          } as never,
        },
      });
      return { event, documentStatus };
    });

    return {
      ok: true,
      event: result.event,
      sealed: decision.sealsDocument,
      documentStatus: result.documentStatus,
    };
  } catch (error) {
    if (error instanceof SigningRaceError) {
      return { ok: false, status: 409, code: "CONFLICT", message: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message: "Another signature was recorded first; reload and try again",
      };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Certificate batch signing
// ---------------------------------------------------------------------------

export const certificateBatchSignInput = z
  .object({
    consentVersion: z.string().trim().min(1).max(120),
    // Drawn signatures need artifact storage; until that exists the batch
    // endpoint accepts only methods that are fully captured in the event.
    method: z.enum(["typed", "credential"]),
    authEvidence: z.record(z.unknown()).optional(),
    deviceId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type CertificateBatchSignInput = z.infer<typeof certificateBatchSignInput>;

export type CertificateBatchSigningDocument = {
  documentId: string;
  requestId: string;
  documentStatus: string;
  requestStatus: string;
  /** Signer keys in the request's assigned order. */
  orderSignerKeys: readonly string[];
  /** Signer key of each stored event, in sequence order. */
  signedSignerKeys: readonly string[];
  requestConsentVersion: string | null;
  /** Result of verifyChain for this request; omitted means the caller verified it. */
  chainValid?: boolean;
};

export type CertificateBatchSigningFailureCode =
  | "BATCH_EMPTY"
  | "BATCH_LIMIT"
  | "CONSENT_REQUIRED"
  | "CONSENT_VERSION_MISMATCH"
  | "SIGNER_MISMATCH"
  | "NOT_YOUR_TURN"
  | "NOT_PENDING"
  | "CHAIN_BROKEN"
  | "INVALID_ORDER";

export type CertificateBatchSigningDecision =
  | { status: "sign"; documentIds: string[]; signerKey: string }
  | { status: "already_signed"; documentIds: string[] }
  | { status: "partial"; documentIds: string[]; pendingDocumentIds: string[] }
  | {
      status: "invalid";
      code: CertificateBatchSigningFailureCode;
      message: string;
      documentIds?: string[];
    };

function normalizeStatus(value: string): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function isFullySignedState(doc: CertificateBatchSigningDocument): boolean {
  return (
    normalizeStatus(doc.documentStatus) === "SEALED" &&
    doc.requestStatus === "signed" &&
    doc.signedSignerKeys.length === doc.orderSignerKeys.length &&
    doc.orderSignerKeys.length > 0
  );
}

function isPendingState(doc: CertificateBatchSigningDocument): boolean {
  return (
    normalizeStatus(doc.documentStatus) === "DRAFT" &&
    doc.requestStatus === "pending" &&
    doc.signedSignerKeys.length < doc.orderSignerKeys.length
  );
}

function batchInvalid(
  code: CertificateBatchSigningFailureCode,
  message: string,
  documentIds?: string[],
): CertificateBatchSigningDecision {
  return { status: "invalid", code, message, ...(documentIds ? { documentIds } : {}) };
}

/**
 * Decides whether one actor may sign a whole certificate batch.
 *
 * Certificates are single-signer documents, so every request in the batch must
 * carry exactly one signer and all of them must name the same person. The
 * decision is all-or-nothing: a batch with some sealed certificates is refused
 * as `partial` rather than silently re-signing the remainder.
 */
export function decideCertificateBatchSigning(input: {
  documents: readonly CertificateBatchSigningDocument[];
  actorKeys: readonly string[];
  consentVersion?: string | null;
  maxBatch?: number;
}): CertificateBatchSigningDecision {
  const maxBatch = input.maxBatch ?? CERTIFICATE_SIGNING_BATCH_MAX;
  if (!Number.isInteger(maxBatch) || maxBatch < 1) {
    throw new Error("Certificate batch limit must be a positive integer");
  }
  if (input.documents.length === 0) {
    return batchInvalid("BATCH_EMPTY", "This batch has no certificates");
  }
  if (input.documents.length > maxBatch) {
    return batchInvalid(
      "BATCH_LIMIT",
      `This batch has ${input.documents.length} certificates; the limit is ${maxBatch}`,
    );
  }

  const consentVersion = input.consentVersion?.trim() ?? "";
  if (!consentVersion) {
    return batchInvalid("CONSENT_REQUIRED", "Explicit consent is required");
  }

  const signerKeys = new Set<string>();
  for (const doc of input.documents) {
    if (doc.chainValid === false) {
      return batchInvalid("CHAIN_BROKEN", "A signature chain is broken; refusing to append", [
        doc.documentId,
      ]);
    }
    const orderKeys = doc.orderSignerKeys.filter(
      (key): key is string => typeof key === "string" && key.trim().length > 0,
    );
    // Certificates are issued with exactly one signatory step. A zero- or
    // multi-step request is not a certificate batch and cannot be bulk-signed.
    if (orderKeys.length !== doc.orderSignerKeys.length || orderKeys.length !== 1) {
      return batchInvalid(
        "INVALID_ORDER",
        "Certificate signing requests must have exactly one signer",
        [doc.documentId],
      );
    }
    if (!doc.requestConsentVersion) {
      return batchInvalid("CONSENT_REQUIRED", "A certificate has no consent version", [
        doc.documentId,
      ]);
    }
    if (doc.requestConsentVersion !== consentVersion) {
      return batchInvalid(
        "CONSENT_VERSION_MISMATCH",
        "Consent version does not match the signing request",
        [doc.documentId],
      );
    }
    if (!isFullySignedState(doc) && !isPendingState(doc)) {
      return batchInvalid("NOT_PENDING", "A certificate is not pending signature", [
        doc.documentId,
      ]);
    }
    signerKeys.add(orderKeys[0]);
  }

  if (signerKeys.size !== 1) {
    return batchInvalid("SIGNER_MISMATCH", "Batch certificates were assigned to different signers");
  }
  const batchSignerKey = [...signerKeys][0];
  if (input.documents.some((doc) => doc.signedSignerKeys.some((key) => key !== batchSignerKey))) {
    return batchInvalid(
      "INVALID_ORDER",
      "Signature events do not follow the assigned signer order",
      input.documents
        .filter((doc) => doc.signedSignerKeys.some((key) => key !== batchSignerKey))
        .map((doc) => doc.documentId),
    );
  }
  if (!input.actorKeys.includes(batchSignerKey)) {
    return batchInvalid("NOT_YOUR_TURN", "Only the assigned signatory may sign this batch");
  }

  const signed = input.documents.filter(isFullySignedState);
  const pending = input.documents.filter((doc) => !isFullySignedState(doc));
  if (pending.length === 0) {
    return { status: "already_signed", documentIds: signed.map((doc) => doc.documentId) };
  }
  if (signed.length > 0) {
    return {
      status: "partial",
      // `documentIds` are the already-sealed certificates that block the batch;
      // `pendingDocumentIds` are the rest, so a client can explain both sides.
      documentIds: signed.map((doc) => doc.documentId),
      pendingDocumentIds: pending.map((doc) => doc.documentId),
    };
  }
  return {
    status: "sign",
    documentIds: pending.map((doc) => doc.documentId),
    signerKey: batchSignerKey,
  };
}

/**
 * Parses a stored SignatureRequest.order. Returns null for anything that is not
 * a valid contiguous order with distinct, identifiable signers.
 */
export function readSignatureOrder(value: unknown): SignatureOrderStep[] | null {
  if (!Array.isArray(value)) return null;
  const steps: SignatureOrderStep[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const step = raw as Record<string, unknown>;
    if (typeof step.order !== "number" || !Number.isInteger(step.order)) return null;
    const signerUserId = typeof step.signerUserId === "string" ? step.signerUserId : null;
    const signerPersonId = typeof step.signerPersonId === "string" ? step.signerPersonId : null;
    const role = typeof step.role === "string" ? step.role : null;
    if (!signerUserId && !signerPersonId) return null;
    steps.push({ order: step.order, signerUserId, signerPersonId, role });
  }
  return isValidSignatureOrder(steps) ? steps : null;
}

export type CertificateBatchEventRow = {
  signerUserId: string | null;
  signerPersonId: string | null;
  docHash: string;
  consentVersion: string;
  serverTs: Date | string;
  prevHash: string | null;
  currHash: string;
};

export type CertificateBatchRequestRow = {
  id: string;
  status: string;
  order: unknown;
  consentVersion: string | null;
  events: readonly CertificateBatchEventRow[];
};

export type CertificateBatchDocumentRow = {
  id: string;
  status: string;
  version: number;
  sha256: string;
  signatures: readonly CertificateBatchRequestRow[];
};

export type InspectedCertificateBatchDocument = {
  documentId: string;
  requestId: string;
  order: SignatureOrderStep[];
  consentVersion: string | null;
  signedSignerKeys: string[];
  chain: ChainEvent[];
  lastHash: string | null;
  documentStatus: string;
  requestStatus: string;
  docVersion: number;
  sha256: string;
  /** True when appending the next event seals this document. */
  sealOnSign: boolean;
};

export type CertificateBatchInspectionFailureCode =
  | "MISSING_REQUEST"
  | "MULTIPLE_REQUESTS"
  | "INVALID_ORDER"
  | "MISSING_SIGNER"
  | "CHAIN_BROKEN";

export type CertificateBatchInspection =
  | {
      ok: true;
      document: InspectedCertificateBatchDocument;
      state: CertificateBatchSigningDocument;
    }
  | {
      ok: false;
      documentId: string;
      code: CertificateBatchInspectionFailureCode;
      message: string;
      details?: unknown;
    };

/**
 * Validates one loaded certificate document: exactly one signature request, a
 * valid single-signer order, a verified hash chain, and stored events that are a
 * prefix of that order. Routes refuse the batch on any failure rather than
 * signing around corrupt data.
 */
export function inspectCertificateBatchDocument(
  row: CertificateBatchDocumentRow,
): CertificateBatchInspection {
  const fail = (
    code: CertificateBatchInspectionFailureCode,
    message: string,
    details?: unknown,
  ): CertificateBatchInspection => ({ ok: false, documentId: row.id, code, message, details });

  if (row.signatures.length === 0) {
    return fail("MISSING_REQUEST", "Certificate has no signature request");
  }
  if (row.signatures.length > 1) {
    return fail("MULTIPLE_REQUESTS", "Certificate has more than one signature request");
  }
  const request = row.signatures[0];
  const order = readSignatureOrder(request.order);
  if (!order) {
    return fail("INVALID_ORDER", "Certificate signature order is invalid");
  }

  const signedSignerKeys: string[] = [];
  const chain: ChainEvent[] = [];
  for (const event of request.events) {
    const key = signerKeyOf({ signerUserId: event.signerUserId, signerPersonId: event.signerPersonId });
    if (!key) return fail("MISSING_SIGNER", "A signature event has no signer identity");
    signedSignerKeys.push(key);
    chain.push({
      requestId: request.id,
      docHash: event.docHash,
      signerKey: key,
      consentVersion: event.consentVersion,
      serverTs: event.serverTs,
      prevHash: event.prevHash,
      currHash: event.currHash,
    });
  }

  const chainCheck: ChainVerification = verifyChain(chain, { requestId: request.id });
  if (!chainCheck.ok) {
    return fail("CHAIN_BROKEN", "Signature chain is broken; refusing to append", {
      brokenAt: chainCheck.brokenAt,
      reason: chainCheck.reason,
    });
  }

  const expectedKeys = order.map((step) => signerKey(step));
  if (signedSignerKeys.length > expectedKeys.length) {
    return fail("INVALID_ORDER", "More signatures exist than the request assigns");
  }
  for (let index = 0; index < signedSignerKeys.length; index += 1) {
    if (signedSignerKeys[index] !== expectedKeys[index]) {
      return fail("INVALID_ORDER", "Signature events do not follow the assigned order");
    }
  }

  const lastHash = chain.length > 0 ? chain[chain.length - 1].currHash : null;
  const document: InspectedCertificateBatchDocument = {
    documentId: row.id,
    requestId: request.id,
    order,
    consentVersion: request.consentVersion,
    signedSignerKeys,
    chain,
    lastHash,
    documentStatus: row.status,
    requestStatus: request.status,
    docVersion: row.version,
    sha256: row.sha256,
    sealOnSign: signedSignerKeys.length + 1 >= order.length,
  };

  return {
    ok: true,
    document,
    state: {
      documentId: row.id,
      requestId: request.id,
      documentStatus: row.status,
      requestStatus: request.status,
      orderSignerKeys: expectedKeys,
      signedSignerKeys,
      requestConsentVersion: request.consentVersion,
      chainValid: true,
    },
  };
}

/** Counts-only audit payload for a certificate batch signature. No PII. */
export function certificateBatchSignAuditMeta(input: {
  batchId: string;
  documentCount: number;
  method: string;
  consentVersion: string;
  sealedAt: Date | string;
  firstHash?: string | null;
  lastHash?: string | null;
}): Record<string, unknown> {
  const sealedAt = input.sealedAt instanceof Date ? input.sealedAt : new Date(input.sealedAt);
  return {
    batchId: input.batchId,
    template: CERTIFICATE_TEMPLATE_KEY,
    documentCount: input.documentCount,
    method: input.method,
    consentVersion: input.consentVersion,
    sealedAt: Number.isNaN(sealedAt.getTime()) ? null : sealedAt.toISOString(),
    ...(input.firstHash ? { firstHash: input.firstHash } : {}),
    ...(input.lastHash ? { lastHash: input.lastHash } : {}),
  };
}

// ---------------------------------------------------------------------------
// Member certificate projection
// ---------------------------------------------------------------------------

export type MemberCertificateSource = {
  id: string;
  title: string | null;
  template: string;
  status: string;
  sealedAt: Date | string | null;
  verifyToken: string | null;
  payload: unknown;
};

export type MemberCertificate = {
  id: string;
  title: string | null;
  eventTitle: string | null;
  eventDateLabel: string | null;
  sealedAt: string;
  verifyToken: string | null;
  verifyPath: string | null;
};

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Allowlisted member projection: only sealed attendance certificates, and only
 * the fields a member may see about their own document. The recipient name,
 * person id, organization id, hash, payload and signatory identity are never
 * copied into the response.
 */
export function projectMemberCertificate(row: MemberCertificateSource): MemberCertificate | null {
  if (row.template !== CERTIFICATE_TEMPLATE_KEY) return null;
  if (normalizeStatus(row.status) !== "SEALED") return null;
  const sealedAt = isoOrNull(row.sealedAt);
  if (!sealedAt) return null;

  const parsed = certificatePayloadV1.safeParse(row.payload);
  const verifyToken =
    typeof row.verifyToken === "string" && row.verifyToken.trim().length > 0
      ? row.verifyToken.trim()
      : null;

  return {
    id: row.id,
    title: row.title ?? null,
    eventTitle: parsed.success ? parsed.data.event.title : null,
    eventDateLabel: parsed.success ? parsed.data.event.dateLabel : null,
    sealedAt,
    verifyToken,
    verifyPath: verifyToken ? `/api/v1/verify/${encodeURIComponent(verifyToken)}` : null,
  };
}

// ---------------------------------------------------------------------------
// Route access helpers (lazy server imports)
// ---------------------------------------------------------------------------

export type CertificateBatchAccess = {
  ctx: import("@/lib/tenant").AuthContext;
  canManage: boolean;
};

/**
 * Certificate batches are readable by the assigned signatory and by document
 * managers. Manage is tried first so the caller knows whether it may see
 * recipient names; an unauthenticated request is never retried.
 */
export async function requireCertificateBatchAccess(
  organizationId: string,
): Promise<CertificateBatchAccess> {
  const { requireOrganizationPermission, AuthError } = await import("@/lib/tenant");
  try {
    const ctx = await requireOrganizationPermission("documents.manage", organizationId);
    return { ctx, canManage: true };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    const ctx = await requireOrganizationPermission("documents.sign", organizationId);
    return { ctx, canManage: false };
  }
}

async function database() {
  const { prisma } = await import("@/lib/db");
  return prisma;
}
