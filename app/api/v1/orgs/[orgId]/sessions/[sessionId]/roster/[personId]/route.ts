import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

type P = { params: Promise<{ orgId: string; sessionId: string; personId: string }> };

// DELETE /orgs/:orgId/sessions/:sessionId/roster/:personId (organization.manage)
// Remove one person from the event allow list. A missing row is 404; a session
// from another organization is 404 before any write.
export async function DELETE(_req: Request, { params }: P) {
  try {
    const { orgId, sessionId, personId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      select: { id: true, organizationId: true },
    });
    if (!session || session.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Session not found in this organization");
    }
    const removed = await prisma.sessionRoster.deleteMany({
      where: { organizationId: ctx.organizationId, sessionId, personId },
    });
    if (removed.count === 0) {
      return fail(404, "NOT_FOUND", "Person is not on this session's roster");
    }
    const rosterCount = await prisma.sessionRoster.count({ where: { organizationId: ctx.organizationId, sessionId } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "session.roster_remove",
        resource: `session:${sessionId}`,
        result: "ok",
        meta: { personId, rosterCount } as never,
      },
    });
    return ok({ removed: true, personId, rosterCount });
  } catch (e) { return handleRouteError(e); }
}
