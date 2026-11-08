import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformActor } from "@/lib/platform";
import { requirePlatformAdmin } from "@/lib/tenant";
import { createPlatformOrgInput, readEntitlements } from "@/modules/platform/console";
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

/**
 * Provision a tenant from the platform console.
 *
 * Same semantics as `POST /api/v1/orgs` (slug + name + timezone, platform admin
 * only) plus the plan and its default entitlements. The two rows and the audit
 * entry are one transaction, so a half-provisioned tenant cannot exist.
 */
export async function POST(req: Request) {
  try {
    const actor = await requirePlatformActor();
    if (!process.env.DATABASE_URL) {
      return fail(503, "DB_NOT_CONFIGURED", "Set DATABASE_URL to provision organizations.");
    }
    const input = createPlatformOrgInput.parse(await req.json());

    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          slug: input.slug,
          name: input.name,
          timezone: input.timezone,
          subscription: {
            create: {
              plan: input.plan,
              entitlements: readEntitlements(input.plan, undefined) as never,
            },
          },
        },
        select: { id: true, name: true, slug: true, status: true, timezone: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: created.id,
          actorUserId: actor.internalUserId,
          action: "platform.org.create",
          resource: `org:${created.id}`,
          result: "ok",
          meta: { scope: "platform", plan: input.plan, slug: created.slug } as never,
        },
      });
      return created;
    });

    return ok({ ...org, plan: input.plan });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return fail(409, "SLUG_TAKEN", "An organization with that slug already exists.");
    }
    return handleRouteError(e);
  }
}
