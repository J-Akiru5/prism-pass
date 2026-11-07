import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

type P = { params: Promise<{ orgId: string; eventId: string }> };

export async function POST(_req: Request, { params }: P) {
  try {
    const { orgId, eventId } = await params;
    const ctx = await requireOrganizationPermission("attendance.approve", orgId);
    const target = await prisma.attendanceEvent.findUnique({ where: { id: eventId } });
    if (!target || target.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Event not found in this organization");
    const approval = await prisma.attendanceEvent.create({
      data: {
        organizationId: ctx.organizationId, sessionId: target.sessionId, personId: target.personId,
        passId: target.passId, passVersion: target.passVersion, type: "APPROVED",
        clientTs: new Date(), networkState: "online", source: "approval",
        idempotencyKey: `approve-${target.id}-${Date.now()}`, status: "accepted",
      },
    });
    await prisma.attendanceRecord.updateMany({
      where: { organizationId: ctx.organizationId, sessionId: target.sessionId, personId: target.personId },
      data: { approvalStatus: "APPROVED" },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.approve", resource: `event:${target.id}`, result: "approved" },
    });
    return ok({ approval });
  } catch (e) { return handleRouteError(e); }
}
