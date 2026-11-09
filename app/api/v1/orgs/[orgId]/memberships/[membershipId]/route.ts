import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { decideMembershipRoleChange } from "@/packages/authorization/presets";

const updateMembershipRoleInput = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SCANNER", "MEMBER", "VIEWER"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string; membershipId: string }> }) {
  try {
    const { orgId, membershipId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = updateMembershipRoleInput.parse(await readJson(req, BODY_LIMITS.tiny));

    const target = await prisma.membership.findUnique({
      where: { id: membershipId },
      select: { id: true, organizationId: true, role: true, status: true },
    });
    if (!target || target.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Membership not found in this organization");
    }

    // The last-owner guard only needs a count when an OWNER could be demoted.
    const activeOwnerCount =
      target.role === "OWNER" && input.role !== "OWNER"
        ? await prisma.membership.count({
            where: { organizationId: ctx.organizationId, role: "OWNER", status: "ACTIVE" },
          })
        : 0;

    const decision = decideMembershipRoleChange({
      actorMembershipId: ctx.membershipId,
      actorRole: ctx.role,
      organizationId: ctx.organizationId,
      target,
      nextRole: input.role,
      activeOwnerCount,
    });
    if (!decision.allowed) return fail(decision.status, decision.code, decision.message);
    if (!decision.changed) return ok({ id: target.id, role: target.role, changed: false });

    // Only the role changes. MembershipPermission overrides are preserved: they
    // are evaluated before ROLE_DEFAULTS by requireOrganizationPermission, so a
    // deny override still wins over any permission the new role would grant.
    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { role: input.role },
      select: { id: true, role: true, status: true },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "membership.role_update",
        resource: `membership:${updated.id}`,
        result: "ok",
        meta: { from: target.role, to: updated.role } as never,
      },
    });
    return ok({ id: updated.id, role: updated.role, status: updated.status, changed: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
