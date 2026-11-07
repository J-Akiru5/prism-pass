import { ok, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const sessionId = searchParams.get("sessionId") ?? undefined;
    const personId = searchParams.get("personId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const where = { organizationId: ctx.organizationId, ...(sessionId ? { sessionId } : {}), ...(personId ? { personId } : {}), ...(status ? { status: status as never } : {}) };
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: "asc" } }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}
