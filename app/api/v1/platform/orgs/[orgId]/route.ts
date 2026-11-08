import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import {
  readEntitlements,
  shapeOrganizationCounts,
  shapeOrganizationMemberRow,
  shapePlatformAuditRow,
} from "@/modules/platform/console";

const MEMBER_LIMIT = 200;
const AUDIT_LIMIT = 20;

type P = { params: Promise<{ orgId: string }> };

/**
 * Platform organization detail.
 *
 * Aggregate counts plus two explicitly documented read surfaces:
 * - the member list (e-mail/role/status, read-only, capped and labelled), and
 * - the last 20 audit rows for the tenant (meta allowlist applied in shaping).
 *
 * There is no mutation here beyond the sibling status/plan routes. A platform
 * admin cannot edit tenant records, passes, attendance or people — ADR-11
 * keeps oversight separate from tenant operations.
 */
export async function GET(_req: Request, { params }: P) {
  try {
    await requirePlatformAdmin();
    const { orgId } = await params;
    if (!process.env.DATABASE_URL) {
      return fail(503, "DB_NOT_CONFIGURED", "The platform console needs DATABASE_URL; no numbers are fabricated.");
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        timezone: true,
        createdAt: true,
        subscription: { select: { plan: true, entitlements: true } },
        memberships: {
          orderBy: [{ status: "asc" }, { role: "asc" }, { id: "asc" }],
          take: MEMBER_LIMIT + 1,
          select: {
            id: true,
            role: true,
            status: true,
            revokedAt: true,
            user: { select: { email: true } },
          },
        },
      },
    });
    if (!org) return fail(404, "NOT_FOUND", "Organization not found");

    const [activePasses, sessions, events, records, documents, activeMembers, audit] = await Promise.all([
      prisma.pass.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
      prisma.attendanceSession.count({ where: { organizationId: org.id } }),
      prisma.attendanceEvent.count({ where: { organizationId: org.id } }),
      prisma.attendanceRecord.count({ where: { organizationId: org.id } }),
      prisma.document.count({ where: { organizationId: org.id } }),
      prisma.membership.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
      prisma.auditLog.findMany({
        where: { organizationId: org.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: AUDIT_LIMIT,
        select: {
          id: true,
          organizationId: true,
          actorUserId: true,
          action: true,
          resource: true,
          result: true,
          meta: true,
          createdAt: true,
        },
      }),
    ]);

    const plan = org.subscription?.plan ?? "pilot";
    const membersTruncated = org.memberships.length > MEMBER_LIMIT;
    const members = membersTruncated ? org.memberships.slice(0, MEMBER_LIMIT) : org.memberships;
    return ok({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        timezone: org.timezone,
        createdAt: org.createdAt.toISOString(),
      },
      subscription: {
        exists: Boolean(org.subscription),
        plan,
        entitlements: readEntitlements(plan, org.subscription?.entitlements),
      },
      counts: shapeOrganizationCounts({
        members: activeMembers,
        activePasses,
        sessions,
        events,
        records,
        documents,
      }),
      members: members.map(shapeOrganizationMemberRow),
      membersTruncated,
      audit: audit.map((row) => shapePlatformAuditRow({ ...row, organization: { name: org.name } })),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
