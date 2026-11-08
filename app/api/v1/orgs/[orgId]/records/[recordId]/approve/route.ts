import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { applyApproval } from "@/modules/reports/approval";

type P = { params: Promise<{ orgId: string; recordId: string }> };

// POST /api/v1/orgs/:orgId/records/:recordId/approve
// attendance.approve. Record-level decision; the event-level approve path keeps
// its append-only APPROVED/REJECTED event behaviour.
export async function POST(_req: Request, { params }: P) {
  try {
    const { orgId, recordId } = await params;
    const ctx = await requireOrganizationPermission("attendance.approve", orgId);

    const target = await prisma.attendanceRecord.findUnique({ where: { id: recordId } });
    if (!target || target.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Record not found in this organization");
    }

    const transition = applyApproval(target.approvalStatus, "approve");
    const record = await prisma.attendanceRecord.update({
      where: { id: target.id },
      data: { approvalStatus: transition.next },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "attendance.approve",
        resource: `record:${target.id}`,
        result: transition.result,
        meta: {
          sessionId: target.sessionId,
          personId: target.personId,
          previous: transition.previous,
          changed: transition.changed,
        } as never,
      },
    });

    return ok({ record, changed: transition.changed });
  } catch (e) {
    return handleRouteError(e);
  }
}
