import { ok, handleRouteError } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { buildPageMeta, platformOrgsQuery, shapePlatformOrgRow } from "@/modules/platform/ledger";

/**
 * Platform organization ledger.
 *
 * Server-side gate: `requirePlatformAdmin` (ADR-11) — an org OWNER, even of
 * every tenant, gets 403 here. The response is aggregate-only: org identity,
 * status, counts and timestamps. It never returns member names, e-mails,
 * credentials or any org-scoped row, so a platform read cannot become a
 * cross-tenant data export.
 */
export async function GET(req: Request) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(req.url);
    const { page, pageSize, status, q } = platformOrgsQuery.parse(Object.fromEntries(searchParams));

    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [orgs, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        // Stable ordering: createdAt alone ties for seeded tenants, which would
        // let a row repeat or vanish between pages.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          _count: {
            select: {
              memberships: { where: { status: "ACTIVE" } },
              passes: { where: { status: "ACTIVE" } },
            },
          },
          auditLogs: { take: 1, orderBy: { createdAt: "desc" }, select: { createdAt: true } },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return ok(orgs.map(shapePlatformOrgRow), buildPageMeta({ page, pageSize, total }));
  } catch (e) {
    return handleRouteError(e);
  }
}
