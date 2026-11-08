import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

const body = z.object({ reason: z.string().min(4).max(500) });
type P = { params: Promise<{ orgId: string; eventId: string }> };

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, eventId } = await params;
    const ctx = await requireOrganizationPermission("attendance.approve", orgId);
    const input = body.parse(await readJson(req, BODY_LIMITS.tiny));
    const target = await prisma.attendanceEvent.findUnique({ where: { id: eventId } });
    if (!target || target.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Event not found in this organization");
    const rejection = await prisma.attendanceEvent.create({
      data: {
        organizationId: ctx.organizationId, sessionId: target.sessionId, personId: target.personId,
        passId: target.passId, passVersion: target.passVersion, type: "REJECTED",
        clientTs: new Date(), networkState: "online", source: "approval",
        idempotencyKey: `reject-${target.id}-${Date.now()}`, status: "accepted",
      },
    });
    await prisma.attendanceRecord.updateMany({
      where: { organizationId: ctx.organizationId, sessionId: target.sessionId, personId: target.personId },
      data: { approvalStatus: "REJECTED" },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.reject", resource: `event:${target.id}`, result: "rejected", meta: { reason: input.reason } as never },
    });
    return ok({ rejection });
  } catch (e) { return handleRouteError(e); }
}
