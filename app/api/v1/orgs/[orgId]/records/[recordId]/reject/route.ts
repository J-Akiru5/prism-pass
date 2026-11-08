import { z } from "zod";
import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { applyApproval } from "@/modules/reports/approval";

const body = z.object({ reason: z.string().min(4).max(500) });
type P = { params: Promise<{ orgId: string; recordId: string }> };

// POST /api/v1/orgs/:orgId/records/:recordId/reject
// attendance.approve. Reason is required, matching the event-level reject route.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, recordId } = await params;
    const ctx = await requireOrganizationPermission("attendance.approve", orgId);
    const input = body.parse(await req.json());

    const target = await prisma.attendanceRecord.findUnique({ where: { id: recordId } });
    if (!target || target.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Record not found in this organization");
    }

    const transition = applyApproval(target.approvalStatus, "reject");
    const record = await prisma.attendanceRecord.update({
      where: { id: target.id },
      data: { approvalStatus: transition.next },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "attendance.reject",
        resource: `record:${target.id}`,
        result: transition.result,
        meta: {
          sessionId: target.sessionId,
          personId: target.personId,
          previous: transition.previous,
          changed: transition.changed,
          reason: input.reason,
        } as never,
      },
    });

    return ok({ record, reason: input.reason, changed: transition.changed });
  } catch (e) {
    return handleRouteError(e);
  }
}
