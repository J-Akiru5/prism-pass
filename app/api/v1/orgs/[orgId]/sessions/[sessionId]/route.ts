import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { updateSessionStatusInput } from "@/modules/attendance/engine";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

// GET /orgs/:orgId/sessions/:sessionId
// Org-scoped session detail for the attendance page: lifecycle status plus the
// roster count. Uses attendance.scan so staff can work an event without
// organization.manage.
//
// Scan contract for this session (enforced in modules/attendance/scan-service):
// - closed session / closed event  -> 409 EVENT_CLOSED
// - roster enforced + unlisted + no walk-ins -> 403 NOT_ON_ROSTER
// A refusal carries no person name; an accepted, duplicate or idempotent replay
// carries personName.
export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { roster: true } } },
    });
    if (!session || session.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Session not found in this organization");
    }
    const { _count, ...rest } = session;
    return ok({ ...rest, rosterCount: _count.roster });
  } catch (e) { return handleRouteError(e); }
}

// PATCH /orgs/:orgId/sessions/:sessionId
// { status: "OPEN" | "CLOSED" } — open/close an event. organization.manage.
// Idempotent: repeating the current status returns the row without changing
// closedAt or writing a second audit entry. Closing sets closedAt; reopening
// clears it. Cross-org ids are 404, never 403.
export async function PATCH(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);
    const input = updateSessionStatusInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const existing = await prisma.attendanceSession.findUnique({ where: { id: sessionId } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Session not found in this organization");
    }
    if (existing.status === input.status) return ok(existing);
    const updated = await prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { status: input.status, closedAt: input.status === "CLOSED" ? new Date() : null },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: input.status === "CLOSED" ? "session.close" : "session.open",
        resource: `session:${sessionId}`,
        result: "ok",
        meta: { from: existing.status, to: input.status } as never,
      },
    });
    return ok(updated);
  } catch (e) { return handleRouteError(e); }
}
