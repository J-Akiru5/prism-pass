import { ok, handleRouteError, pagination, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createPolicyInput } from "@/modules/attendance/engine";

type P = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const [rows, total] = await Promise.all([
      prisma.attendancePolicy.findMany({ where: { organizationId: ctx.organizationId }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
      prisma.attendancePolicy.count({ where: { organizationId: ctx.organizationId } }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);
    const input = createPolicyInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const policy = await prisma.attendancePolicy.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        graceMin: input.graceMin,
        lateThresholdMin: input.lateThresholdMin,
        duplicateWindowSec: input.duplicateWindowSec,
        geoMode: input.geoMode,
        evidenceRequired: input.evidenceRequired as never,
        approvalSteps: input.approvalSteps as never,
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "policy.create", resource: `policy:${policy.id}`, result: "ok" },
    });
    return ok(policy);
  } catch (e) { return handleRouteError(e); }
}
