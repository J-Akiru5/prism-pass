import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; membershipId: string }> }) {
  try {
    const { orgId, membershipId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const target = await prisma.membership.findUnique({ where: { id: membershipId } });
    if (!target || target.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Membership not found in this organization");
    if (target.status === "REVOKED") return ok({ id: target.id, status: target.status, already: true });
    // Prevent self-revoke of last OWNER: at least one ACTIVE OWNER must remain
    if (target.role === "OWNER" && target.id === ctx.membershipId) {
      const owners = await prisma.membership.count({
        where: { organizationId: ctx.organizationId, role: "OWNER", status: "ACTIVE" },
      });
      if (owners <= 1) return fail(409, "CONFLICT", "Cannot revoke the last active OWNER");
    }
    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "membership.revoke",
        resource: `membership:${updated.id}`,
        result: "ok",
      },
    });
    return ok({ id: updated.id, status: updated.status, revokedAt: updated.revokedAt });
  } catch (e) {
    return handleRouteError(e);
  }
}
