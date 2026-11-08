import { Prisma } from "@prisma/client";
import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { signInput } from "@/modules/documents/schema";
import {
  chainHash,
  evaluateSigning,
  nextDocumentStatus,
  signerKey,
  signerKeyOf,
  verifyChain,
  type ChainEvent,
  type DocumentStatus,
  type SignatureOrderStep,
  type SigningDecision,
} from "@/modules/documents/service";

type P = { params: Promise<{ orgId: string; requestId: string }> };

class SigningRaceError extends Error {}

function signingFailure(decision: Extract<SigningDecision, { ok: false }>) {
  const details = { reason: decision.code };
  switch (decision.code) {
    case "CONSENT_REQUIRED":
    case "CONSENT_VERSION_MISMATCH":
      return fail(400, "INVALID_INPUT", decision.message, details);
    case "NOT_YOUR_TURN":
      return fail(403, "FORBIDDEN", decision.message, details);
    default:
      return fail(409, "CONFLICT", decision.message, details);
  }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, requestId } = await params;
    const ctx = await requireOrganizationPermission("documents.sign", orgId);
    const input = signInput.parse(await req.json());

    const request = await prisma.signatureRequest.findUnique({
      where: { id: requestId },
      include: {
        document: true,
        events: { orderBy: { sequence: "asc" } },
      },
    });
    // Tenant scope is checked on both rows; cross-org ids resolve to 404.
    if (!request || request.organizationId !== ctx.organizationId || request.document.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Signature request not found in this organization");
    }

    const events = request.events;
    const chain: ChainEvent[] = [];
    for (const event of events) {
      const key = signerKeyOf({ signerUserId: event.signerUserId, signerPersonId: event.signerPersonId });
      if (!key) {
        return fail(409, "CONFLICT", "Signature chain is broken; refusing to append", {
          reason: "missing_signer",
        });
      }
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
    // Refuse to extend a chain that no longer verifies; a rewrite is a data
    // incident, not something to paper over with another signature.
    const chainCheck = verifyChain(chain, { requestId: request.id });
    if (!chainCheck.ok) {
      return fail(409, "CONFLICT", "Signature chain is broken; refusing to append", {
        brokenAt: chainCheck.brokenAt,
        reason: chainCheck.reason,
      });
    }

    // A user may sign as themselves or as a person linked to their identity.
    const linkedPeople = await prisma.person.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.internalUserId },
      select: { id: true },
    });
    const actorKeys = [
      signerKey({ signerUserId: ctx.internalUserId }),
      ...linkedPeople.map((person) => signerKey({ signerPersonId: person.id })),
    ];

    const decision = evaluateSigning({
      order: request.order as unknown as SignatureOrderStep[],
      signedEvents: events.map((event) => ({ signerUserId: event.signerUserId, signerPersonId: event.signerPersonId })),
      documentStatus: request.document.status as DocumentStatus,
      consentVersion: input.consentVersion,
      requiredConsentVersion: request.consentVersion,
      actorKeys,
      expiresAt: request.expiresAt,
    });
    if (!decision.ok) return signingFailure(decision);

    const serverTs = new Date();
    const prevHash = events.length > 0 ? events[events.length - 1].currHash : null;
    const currHash = chainHash({
      prevHash,
      requestId: request.id,
      docHash: request.document.sha256,
      signerKey: decision.signerKey,
      consentVersion: input.consentVersion,
      serverTs,
    });
    const documentStatus = nextDocumentStatus(request.document.status as DocumentStatus, decision.sealsDocument);

    const result = await prisma.$transaction(async (tx) => {
      // Guard against two signers racing on the same step: the unique
      // (request_id, sequence) index is the hard backstop, this is the clear error.
      const currentCount = await tx.signatureEvent.count({ where: { requestId: request.id } });
      if (currentCount !== decision.sequence) {
        throw new SigningRaceError("Signature state changed; reload and try again");
      }

      const event = await tx.signatureEvent.create({
        data: {
          organizationId: ctx.organizationId,
          requestId: request.id,
          sequence: decision.sequence,
          signerUserId: decision.step.signerUserId ?? null,
          signerPersonId: decision.step.signerPersonId ?? null,
          docVersion: request.document.version,
          docHash: request.document.sha256,
          method: input.method,
          consentVersion: input.consentVersion,
          serverTs,
          authEvidence: {
            ...(input.authEvidence ?? {}),
            actorUserId: ctx.internalUserId,
            membershipId: ctx.membershipId,
            via: "session",
          } as Prisma.InputJsonValue,
          deviceId: input.deviceId ?? null,
          artifactRef: input.artifactRef ?? null,
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
          organizationId: ctx.organizationId,
          actorUserId: ctx.internalUserId,
          action: "document.sign",
          resource: `document:${request.document.id}`,
          result: "ok",
          meta: {
            requestId: request.id,
            sequence: decision.sequence,
            method: input.method,
            currHash,
            sealed: decision.sealsDocument,
          } as never,
        },
      });
      return { event, documentStatus };
    });

    return ok({
      event: result.event,
      sealed: decision.sealsDocument,
      documentStatus: result.documentStatus,
    });
  } catch (e) {
    if (e instanceof SigningRaceError) return fail(409, "CONFLICT", e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(409, "CONFLICT", "Another signature was recorded first; reload and try again");
    }
    return handleRouteError(e);
  }
}
