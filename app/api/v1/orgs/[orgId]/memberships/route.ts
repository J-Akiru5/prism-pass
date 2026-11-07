import { ok, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const rows = await prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, userId: true, role: true, status: true, revokedAt: true },
      orderBy: { id: "asc" },
    });
    return ok(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}
