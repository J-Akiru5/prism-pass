import { z } from "zod";
import { fail, ok, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { MAX_AUDIT_RANGE_DAYS, parseDateRange } from "@/modules/reports/range";

type P = { params: Promise<{ orgId: string }> };

const auditFilters = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  result: z.string().trim().min(1).max(40).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
});

// GET /api/v1/orgs/:orgId/audit?action&result&from&to&page&pageSize
// organization.manage. Newest first; optional 366-day date window.
//
// Stays org-wide intentionally: `organization.manage` is held only by OWNER and
// ADMIN, and both are org-wide in modules/reports/scope.ts. AuditLog has no
// personId column (only an optional actorUserId), so a person/program allow-list
// cannot be expressed against this table; hiding rows by actor would hide the
// actions an admin must review. MANAGER/SUPERVISOR cannot read audit at all.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);

    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const filters = auditFilters.parse({
      action: searchParams.get("action") || undefined,
      result: searchParams.get("result") || undefined,
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
    });

    let createdAt: { gte: Date; lte: Date } | undefined;
    if (filters.from || filters.to) {
      const parsed = parseDateRange(filters.from, filters.to, MAX_AUDIT_RANGE_DAYS);
      if (!parsed.ok) return fail(400, "INVALID_INPUT", parsed.message);
      createdAt = {
        gte: new Date(`${parsed.range.from}T00:00:00.000Z`),
        lte: new Date(`${parsed.range.to}T23:59:59.999Z`),
      };
    }

    if (!process.env.DATABASE_URL) {
      return ok([], { page, pageSize, total: 0, note: "DB not configured — demo empty" });
    }

    const where = {
      organizationId: ctx.organizationId,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.result ? { result: filters.result } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok(rows, { page, pageSize, total });
  } catch (e) {
    return handleRouteError(e);
  }
}
