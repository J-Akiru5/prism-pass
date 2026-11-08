import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

type P = { params: Promise<{ orgId: string; documentId: string }> };

export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, documentId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: {
        signatures: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            order: true,
            consentVersion: true,
            expiresAt: true,
            createdAt: true,
            events: {
              orderBy: { sequence: "asc" },
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
                prevHash: true,
                currHash: true,
              },
            },
          },
        },
      },
    });
    // Cross-org ids are indistinguishable from missing ids.
    if (!document || document.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Document not found in this organization");
    }
    return ok(document);
  } catch (e) {
    return handleRouteError(e);
  }
}
