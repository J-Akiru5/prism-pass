import { ok, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { projectMemberCertificate, type MemberCertificate } from "@/modules/documents/sign";
import { CERTIFICATE_TEMPLATE_KEY } from "@/modules/certificates/schema";

type P = { params: Promise<{ orgId: string }> };

// GET /api/v1/orgs/:orgId/my-certificates
// The signed-in member's own sealed attendance certificates. The gate is
// documents.sign plus Person.userId === the internal user: no other person's
// document is ever queried, and the projection is an allowlist.
export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("documents.sign", orgId);

    const people = await prisma.person.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.internalUserId },
      select: { id: true },
    });
    if (people.length === 0) return ok([]);

    const documents = await prisma.document.findMany({
      where: {
        organizationId: ctx.organizationId,
        template: CERTIFICATE_TEMPLATE_KEY,
        status: "SEALED",
        sourcePersonId: { in: people.map((person) => person.id) },
      },
      orderBy: { sealedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        template: true,
        status: true,
        sealedAt: true,
        verifyToken: true,
        payload: true,
      },
    });

    return ok(
      documents
        .map((document) => projectMemberCertificate(document))
        .filter((certificate): certificate is MemberCertificate => certificate !== null),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
