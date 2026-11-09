import { ok, fail, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { signerKey } from "@/modules/documents/service";
import {
  CERTIFICATE_CONSENT_TEXT,
  inspectCertificateBatchDocument,
  loadActorSignerKeys,
  requireCertificateBatchAccess,
  type CertificateBatchInspectionFailureCode,
} from "@/modules/documents/sign";
import { CERTIFICATE_TEMPLATE_KEY, certificatePayloadV1 } from "@/modules/certificates/schema";

type P = { params: Promise<{ orgId: string; batchId: string }> };

type DocumentStatusCounts = {
  documents: number;
  draft: number;
  sealed: number;
  superseded: number;
  revoked: number;
  pending: number;
  signed: number;
};

function statusBucket(status: string): keyof DocumentStatusCounts | null {
  switch (status.trim().toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "SEALED":
      return "sealed";
    case "SUPERSEDED":
      return "superseded";
    case "REVOKED":
      return "revoked";
    default:
      return null;
  }
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// GET /api/v1/orgs/:orgId/certificate-batches/:batchId
// The signing screen's read model. Readable by the assigned signatory and by
// document managers; anyone else gets 403 rather than an enumeration oracle.
//
// Recipient display names and the sample certificate are PII for the signer's
// review, so they are returned only after that authorization check. Cross-org
// batch ids resolve to 404, indistinguishable from a missing batch.
export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, batchId } = await params;
    const { ctx, canManage } = await requireCertificateBatchAccess(orgId);

    const documents = await prisma.document.findMany({
      where: { organizationId: ctx.organizationId, batchId, template: CERTIFICATE_TEMPLATE_KEY },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        version: true,
        sealedAt: true,
        sha256: true,
        payload: true,
        createdAt: true,
        signatures: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            order: true,
            consentVersion: true,
            expiresAt: true,
            events: {
              orderBy: { sequence: "asc" },
              select: {
                signerUserId: true,
                signerPersonId: true,
                docHash: true,
                consentVersion: true,
                serverTs: true,
                prevHash: true,
                currHash: true,
              },
            },
          },
        },
      },
    });

    if (documents.length === 0) {
      return fail(404, "NOT_FOUND", "Certificate batch not found in this organization");
    }

    const inspections = documents.map((document) => inspectCertificateBatchDocument(document));
    const parsedPayloads = documents.map((document) => certificatePayloadV1.safeParse(document.payload));
    const validPayloads = parsedPayloads.filter((parsed) => parsed.success);
    const firstPayload = validPayloads[0];
    const signatory = firstPayload?.success ? firstPayload.data.signatory : null;
    const allPayloadsValid = validPayloads.length === documents.length;
    const signatoryUserIds = new Set(
      parsedPayloads.flatMap((parsed) => (parsed.success ? [parsed.data.signatory.userId] : [])),
    );

    const actorKeys = await loadActorSignerKeys(ctx.organizationId, ctx.internalUserId);
    const assignedSignerKey = signatory ? signerKey({ signerUserId: signatory.userId }) : null;
    const isAssignedSigner = assignedSignerKey ? actorKeys.includes(assignedSignerKey) : false;
    // Managers read for oversight; the signatory reads to review and sign. Any
    // other holder of documents.sign may read the summary, but recipient names
    // and the sample certificate are withheld from them.
    const canSeeRecipients = canManage || isAssignedSigner;

    const counts: DocumentStatusCounts = {
      documents: documents.length,
      draft: 0,
      sealed: 0,
      superseded: 0,
      revoked: 0,
      pending: 0,
      signed: 0,
    };
    for (const document of documents) {
      const bucket = statusBucket(document.status);
      if (bucket) counts[bucket] += 1;
      const request = document.signatures[0];
      if (request?.status === "pending") counts.pending += 1;
      if (request?.status === "signed") counts.signed += 1;
    }

    const failedInspection = inspections.find((inspection) => !inspection.ok);
    const consentVersions = new Set(
      inspections
        .filter((inspection) => inspection.ok)
        .map((inspection) => inspection.document.consentVersion ?? ""),
    );
    const consentVersion =
      consentVersions.size === 1
        ? [...consentVersions][0] || null
        : inspections[0]?.ok
          ? inspections[0].document.consentVersion
          : null;

    let ineligibleReason: string | null = null;
    if (!signatory) ineligibleReason = "missing_signatory";
    else if (!allPayloadsValid) ineligibleReason = "invalid_payload";
    else if (signatoryUserIds.size !== 1) ineligibleReason = "signer_mismatch";
    else if (counts.sealed === counts.documents) ineligibleReason = "already_signed";
    else if (counts.sealed > 0) ineligibleReason = "partial_batch";
    else if (failedInspection) ineligibleReason = failedInspection.code.toLowerCase();
    else if (consentVersions.size !== 1 || !consentVersion) ineligibleReason = "consent_mismatch";
    else if (!isAssignedSigner) ineligibleReason = "not_assigned_signer";
    else if (counts.draft !== counts.documents || counts.pending !== counts.documents) {
      ineligibleReason = "not_pending";
    }

    const event = firstPayload?.success
      ? {
          id: firstPayload.data.event.sessionId,
          title: firstPayload.data.event.title,
          dateLabel: firstPayload.data.event.dateLabel,
        }
      : {
          id: null,
          title: documents[0]?.title ?? null,
          dateLabel: null,
        };

    const recipients = canSeeRecipients
      ? documents.map((document, index) => {
          const parsed = parsedPayloads[index];
          return {
            documentId: document.id,
            displayName: parsed.success ? parsed.data.recipient.displayName : null,
            status: document.status,
            sealedAt: isoOrNull(document.sealedAt),
          };
        })
      : [];

    const preview =
      canSeeRecipients && firstPayload?.success
        ? {
            recipientName: firstPayload.data.recipient.displayName,
            eventTitle: firstPayload.data.event.title,
            eventDateLabel: firstPayload.data.event.dateLabel,
            organizationName: firstPayload.data.organization.name,
            statement: firstPayload.data.statement,
            issuedOn: firstPayload.data.issuedOn,
            signatory: {
              displayName: firstPayload.data.signatory.displayName,
              roleLabel: firstPayload.data.signatory.roleLabel,
            },
          }
        : null;

    return ok({
      batchId,
      event,
      signatory: signatory
        ? {
            displayName: signatory.displayName,
            roleLabel: signatory.roleLabel,
            isYou: signatory.userId === ctx.internalUserId,
          }
        : null,
      documentCount: documents.length,
      counts,
      statuses: documents.map((document) => ({
        documentId: document.id,
        status: document.status,
        requestStatus: document.signatures[0]?.status ?? null,
      })),
      consentVersion,
      consent: {
        version: consentVersion,
        text: CERTIFICATE_CONSENT_TEXT,
      },
      signer: {
        assigned: isAssignedSigner,
        eligible: ineligibleReason === null,
        reason: ineligibleReason,
      },
      inspection: failedInspection
        ? {
            documentId: failedInspection.documentId,
            code: failedInspection.code as CertificateBatchInspectionFailureCode,
            message: failedInspection.message,
          }
        : null,
      recipients,
      preview,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
