import { handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";

const OPTION_LIMIT = 1000;

/**
 * Compact organization list for the audit explorer's filter.
 *
 * Identity only (id, name, status) — no counts, members or credentials. Capped
 * at 1,000 tenants; the response says so instead of silently omitting rows.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    if (!process.env.DATABASE_URL) {
      return ok([], { total: 0, truncated: false });
    }
    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: OPTION_LIMIT,
        select: { id: true, name: true, status: true },
      }),
      prisma.organization.count(),
    ]);
    return ok(orgs, { total, truncated: total > OPTION_LIMIT });
  } catch (e) {
    return handleRouteError(e);
  }
}
