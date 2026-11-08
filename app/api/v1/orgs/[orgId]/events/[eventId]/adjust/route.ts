import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

const body = z.object({ reason: z.string().min(4).max(500) });

type P = { params: Promise<{ orgId: string; eventId: string }> };

// Manual correction: compensating MANUAL_ADJUST event, never mutates history.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, eventId } = await params;
    const ctx = await requireOrganizationPermission("attendance.override", orgId);
    const input = body.parse(await readJson(req, BODY_LIMITS.tiny));
    const target = await prisma.attendanceEvent.findUnique({ where: { id: eventId } });
    if (!target || target.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Event not found in this organization");
    const adjustment = await prisma.attendanceEvent.create({
      data: {
        organizationId: ctx.organizationId, sessionId: target.sessionId, personId: target.personId,
        passId: target.passId, passVersion: target.passVersion, type: "MANUAL_ADJUST",
        clientTs: new Date(), deviceId: target.deviceId, networkState: "online", source: "manual",
        idempotencyKey: `adjust-${target.id}-${Date.now()}`, status: "accepted",
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.adjust", resource: `event:${target.id}`, result: "adjusted", meta: { reason: input.reason, adjustmentId: adjustment.id } as never },
    });
    return ok({ adjustment, reason: input.reason });
  } catch (e) { return handleRouteError(e); }
}
