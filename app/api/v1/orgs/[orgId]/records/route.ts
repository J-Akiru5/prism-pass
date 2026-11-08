import { z } from "zod";
import { ok, handleRouteError, optionalQueryId } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sessionId: optionalQueryId,
  personId: optionalQueryId,
  status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED", "PARTIAL"]).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize, sessionId, personId, status } = query.parse(Object.fromEntries(searchParams));
    const where = { organizationId: ctx.organizationId, ...(sessionId ? { sessionId } : {}), ...(personId ? { personId } : {}), ...(status ? { status } : {}) };
    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: "asc" } }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}
