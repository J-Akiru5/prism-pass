import { ok, fail, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createSessionInput } from "@/modules/attendance/engine";

type P = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const [rows, total] = await Promise.all([
      prisma.attendanceSession.findMany({ where: { organizationId: ctx.organizationId }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { startsAt: "desc" } }),
      prisma.attendanceSession.count({ where: { organizationId: ctx.organizationId } }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);
    const input = createSessionInput.parse(await req.json());
    const policy = await prisma.attendancePolicy.findUnique({ where: { id: input.policyId } });
    if (!policy || policy.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Policy not found in this organization");
    const session = await prisma.attendanceSession.create({
      data: {
        organizationId: ctx.organizationId,
        policyId: policy.id,
        type: input.type,
        title: input.title,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        timezone: input.timezone,
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "session.create", resource: `session:${session.id}`, result: "ok", meta: { type: session.type } as never },
    });
    return ok(session);
  } catch (e) { return handleRouteError(e); }
}
