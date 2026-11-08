import type { Prisma } from "@prisma/client";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createSignatureRequestInput } from "@/modules/documents/schema";

type P = { params: Promise<{ orgId: string; documentId: string }> };

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, documentId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);
    const input = createSignatureRequestInput.parse(await readJson(req, BODY_LIMITS.small));

    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Document not found in this organization");
    }
    if (document.status !== "DRAFT") {
      return fail(409, "CONFLICT", "Only draft documents can receive a new signature request");
    }

    // Every assigned signer must already belong to this tenant. This prevents an
    // org from creating a request that references another org's user or person.
    for (const step of input.order) {
      if (step.signerUserId) {
        const membership = await prisma.membership.findFirst({
          where: { organizationId: ctx.organizationId, userId: step.signerUserId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!membership) return fail(404, "NOT_FOUND", "Signer is not an active member of this organization");
      }
      if (step.signerPersonId) {
        const person = await prisma.person.findUnique({
          where: { id: step.signerPersonId },
          select: { organizationId: true },
        });
        if (!person || person.organizationId !== ctx.organizationId) {
          return fail(404, "NOT_FOUND", "Signer person not found in this organization");
        }
      }
    }

    const request = await prisma.signatureRequest.create({
      data: {
        organizationId: ctx.organizationId,
        documentId: document.id,
        order: input.order as Prisma.InputJsonValue,
        status: "pending",
        consentVersion: input.consentVersion,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
      select: {
        id: true,
        documentId: true,
        order: true,
        status: true,
        consentVersion: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "document.signature_request.create",
        resource: `document:${document.id}`,
        result: "ok",
        meta: { requestId: request.id, signers: input.order.length, consentVersion: input.consentVersion } as never,
      },
    });
    return ok(request);
  } catch (e) {
    return handleRouteError(e);
  }
}
