import { Prisma } from "@prisma/client";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { chainHash } from "@/modules/documents/service";
import {
  CERTIFICATE_SIGNING_BATCH_MAX,
  certificateBatchSignAuditMeta,
  certificateBatchSignInput,
  decideCertificateBatchSigning,
  inspectCertificateBatchDocument,
  loadActorSignerKeys,
} from "@/modules/documents/sign";
import { CERTIFICATE_TEMPLATE_KEY } from "@/modules/certificates/schema";

type P = { params: Promise<{ orgId: string; batchId: string }> };

class BatchSigningRaceError extends Error {}

function invalidDecisionResponse(decision: Extract<ReturnType<typeof decideCertificateBatchSigning>, { status: "invalid" }>) {
  const details = {
    reason: decision.code,
    ...(decision.documentIds ? { documentIds: decision.documentIds } : {}),
  };
  switch (decision.code) {
    case "CONSENT_REQUIRED":
    case "CONSENT_VERSION_MISMATCH":
      return fail(400, "INVALID_INPUT", decision.message, details);
    case "SIGNER_MISMATCH":
    case "NOT_YOUR_TURN":
      return fail(403, "FORBIDDEN", decision.message, details);
    default:
      return fail(409, "CONFLICT", decision.message, details);
  }
}

// POST /api/v1/orgs/:orgId/certificate-batches/:batchId/sign
// { consentVersion, method: "typed" | "credential", authEvidence?, deviceId? }
//
// Bulk-signs one generated certificate batch. All-or-nothing: a batch with some
// sealed certificates is refused (PARTIAL_BATCH) instead of silently signing
// the remainder. Every request shares one server timestamp, each document is
// sealed and its request marked signed, and exactly one counts-only
// `certificate.batch_sign` audit row is written.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, batchId } = await params;
    const ctx = await requireOrganizationPermission("documents.sign", orgId);
    const input = certificateBatchSignInput.parse(await readJson(req, BODY_LIMITS.small));

    const documents = await prisma.document.findMany({
      where: { organizationId: ctx.organizationId, batchId, template: CERTIFICATE_TEMPLATE_KEY },
      orderBy: { createdAt: "asc" },
      // One extra row proves the cap without loading an unbounded batch.
      take: CERTIFICATE_SIGNING_BATCH_MAX + 1,
      select: {
        id: true,
        status: true,
        version: true,
        sealedAt: true,
        sha256: true,
        signatures: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            order: true,
            consentVersion: true,
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
    if (documents.length > CERTIFICATE_SIGNING_BATCH_MAX) {
      return fail(
        409,
        "BATCH_LIMIT",
        `This batch exceeds the ${CERTIFICATE_SIGNING_BATCH_MAX}-certificate signing limit`,
        { maxBatch: CERTIFICATE_SIGNING_BATCH_MAX },
      );
    }

    const inspections = documents.map((document) => inspectCertificateBatchDocument(document));
    const failed = inspections.find((inspection) => !inspection.ok);
    if (failed && !failed.ok) {
      return fail(409, "CONFLICT", failed.message, {
        reason: failed.code,
        documentId: failed.documentId,
        ...(failed.details && typeof failed.details === "object" ? failed.details : {}),
      });
    }

    const inspected = inspections.filter(
      (inspection): inspection is Extract<typeof inspection, { ok: true }> => inspection.ok,
    );
    const actorKeys = await loadActorSignerKeys(ctx.organizationId, ctx.internalUserId);
    const decision = decideCertificateBatchSigning({
      documents: inspected.map((inspection) => inspection.state),
      actorKeys,
      consentVersion: input.consentVersion,
      maxBatch: CERTIFICATE_SIGNING_BATCH_MAX,
    });

    if (decision.status === "invalid") return invalidDecisionResponse(decision);

    if (decision.status === "already_signed") {
      const lastSealedAt = documents.reduce<Date | null>((latest, document) => {
        const sealedAt = document.sealedAt;
        if (!sealedAt) return latest;
        return latest === null || sealedAt.getTime() > latest.getTime() ? sealedAt : latest;
      }, null);
      return ok({
        batchId,
        alreadySigned: true,
        signed: 0,
        sealed: documents.length,
        documentIds: decision.documentIds,
        sealedAt: lastSealedAt?.toISOString() ?? null,
        consentVersion: input.consentVersion,
        method: input.method,
      });
    }

    if (decision.status === "partial") {
      return fail(
        409,
        "PARTIAL_BATCH",
        "Some certificates in this batch are already signed; the batch cannot be signed again",
        {
          documentIds: decision.documentIds,
          pendingDocumentIds: decision.pendingDocumentIds,
        },
      );
    }

    const byDocumentId = new Map(inspected.map((inspection) => [inspection.document.documentId, inspection.document]));
    const selected = decision.documentIds.map((documentId) => {
      const inspection = byDocumentId.get(documentId);
      if (!inspection) throw new Error("Batch decision referenced an unknown document");
      return inspection;
    });

    const serverTs = new Date();
    const signedHashes: string[] = [];
    const sealedCount = selected.filter((document) => document.sealOnSign).length;

    await prisma.$transaction(async (tx) => {
      for (const document of selected) {
        // Same race guard as the single-sign route: a concurrent append must not
        // be extended twice. The (request_id, sequence) unique index is the
        // hard backstop; this produces the clear conflict instead.
        const currentCount = await tx.signatureEvent.count({
          where: { requestId: document.requestId },
        });
        if (currentCount !== document.signedSignerKeys.length) {
          throw new BatchSigningRaceError("Certificate batch changed; reload and try again");
        }

        const currHash = chainHash({
          prevHash: document.lastHash,
          requestId: document.requestId,
          docHash: document.sha256,
          signerKey: decision.signerKey,
          consentVersion: input.consentVersion,
          serverTs,
        });

        await tx.signatureEvent.create({
          data: {
            organizationId: ctx.organizationId,
            requestId: document.requestId,
            sequence: document.signedSignerKeys.length,
            signerUserId: decision.signerKey.startsWith("user:")
              ? decision.signerKey.slice("user:".length)
              : null,
            signerPersonId: decision.signerKey.startsWith("person:")
              ? decision.signerKey.slice("person:".length)
              : null,
            docVersion: document.docVersion,
            docHash: document.sha256,
            method: input.method,
            consentVersion: input.consentVersion,
            serverTs,
            authEvidence: {
              ...(input.authEvidence ?? {}),
              actorUserId: ctx.internalUserId,
              membershipId: ctx.membershipId,
              via: "certificate_batch",
            } as Prisma.InputJsonValue,
            deviceId: input.deviceId ?? null,
            artifactRef: null,
            prevHash: document.lastHash,
            currHash,
          },
        });

        if (document.sealOnSign) {
          await tx.document.update({
            where: { id: document.documentId },
            data: { status: "SEALED", sealedAt: serverTs },
          });
          await tx.signatureRequest.update({
            where: { id: document.requestId },
            data: { status: "signed" },
          });
        }
        signedHashes.push(currHash);
      }

      await tx.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: ctx.internalUserId,
          action: "certificate.batch_sign",
          resource: `certificate_batch:${batchId}`,
          result: "ok",
          // Counts and hashes only: recipient names and person ids never enter
          // the audit log.
          meta: certificateBatchSignAuditMeta({
            batchId,
            documentCount: selected.length,
            method: input.method,
            consentVersion: input.consentVersion,
            sealedAt: serverTs,
            firstHash: signedHashes[0] ?? null,
            lastHash: signedHashes[signedHashes.length - 1] ?? null,
          }) as never,
        },
      });
    });

    return ok({
      batchId,
      alreadySigned: false,
      signed: selected.length,
      sealed: sealedCount,
      documentIds: decision.documentIds,
      sealedAt: serverTs.toISOString(),
      consentVersion: input.consentVersion,
      method: input.method,
    });
  } catch (e) {
    if (e instanceof BatchSigningRaceError) return fail(409, "CONFLICT", e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(409, "CONFLICT", "Another signature was recorded first; reload and try again");
    }
    return handleRouteError(e);
  }
}
