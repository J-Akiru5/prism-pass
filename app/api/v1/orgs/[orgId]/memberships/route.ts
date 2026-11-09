import { ok, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const rows = await prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        revokedAt: true,
        user: {
          select: {
            email: true,
            // A user can have at most one identity link per organization; take
            // the first so the settings list can show a human name when present.
            peopleLinks: {
              where: { organizationId: ctx.organizationId },
              select: { displayName: true },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { id: "asc" },
    });
    return ok(
      rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        role: row.role,
        status: row.status,
        revokedAt: row.revokedAt,
        email: row.user.email,
        personDisplayName: row.user.peopleLinks[0]?.displayName ?? null,
        isSelf: row.userId === ctx.internalUserId,
      })),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
