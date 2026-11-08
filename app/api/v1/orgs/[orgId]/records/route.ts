import { z } from "zod";
import { ok, handleRouteError, optionalQueryId } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { loadReportScope } from "@/lib/report-scope";
import { scopeLabel } from "@/modules/reports/scope";

const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sessionId: optionalQueryId,
  personId: optionalQueryId,
  status: z.enum(["PRESENT", "LATE", "ABSENT", "EXCUSED", "PARTIAL"]).optional(),
});

// GET /api/v1/orgs/:orgId/records?sessionId&personId&status
// `attendance.scan` is the operational read permission. The same person scope as
// the DTR report applies: OWNER/ADMIN see the org, MANAGER/SUPERVISOR see the
// programs they are assigned to, SCANNER/MEMBER see only their own person row.
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize, sessionId, personId, status } = query.parse(Object.fromEntries(searchParams));

    const scope = await loadReportScope(ctx);
    const scopedPersonIds = scope.visibility === "people" ? scope.personIds : null;
    const outOfScope = Boolean(
      scopedPersonIds && (scopedPersonIds.length === 0 || (personId && !scopedPersonIds.includes(personId))),
    );
    if (outOfScope) {
      return ok([], { page, pageSize, total: 0, scope: scopeLabel(scope) });
    }

    const where = {
      organizationId: ctx.organizationId,
      ...(sessionId ? { sessionId } : {}),
      ...(scopedPersonIds ? { personId: personId ?? { in: scopedPersonIds } } : personId ? { personId } : {}),
      ...(status ? { status } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.attendanceRecord.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: "asc" } }),
      prisma.attendanceRecord.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total, scope: scopeLabel(scope) });
  } catch (e) { return handleRouteError(e); }
}
