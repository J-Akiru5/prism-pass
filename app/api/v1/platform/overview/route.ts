import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import {
  OVERVIEW_ACTIVITY_LIMIT,
  shapePlatformActivityRow,
  shapePlatformOverview,
  utcDayWindow,
} from "@/modules/platform/console";

/**
 * Platform overview — aggregate counts only.
 *
 * `requirePlatformAdmin` runs before any query. Every number comes from a
 * `count()`; no tenant rows, identities or pass credentials are read. "Today"
 * is the UTC calendar day because a platform-wide aggregate has no single local
 * timezone — the page says so instead of implying tenant-local boundaries.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    if (!process.env.DATABASE_URL) {
      return fail(503, "DB_NOT_CONFIGURED", "The platform overview needs DATABASE_URL; no numbers are fabricated.");
    }

    const { start, end } = utcDayWindow();
    const today = { gte: start, lt: end };

    const [
      organizationsTotal,
      organizationsActive,
      organizationsSuspended,
      organizationsPendingDeletion,
      users,
      activePasses,
      sessionsToday,
      eventsToday,
      pendingApprovals,
      platformAdmins,
      activity,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { status: "ACTIVE" } }),
      prisma.organization.count({ where: { status: "SUSPENDED" } }),
      prisma.organization.count({ where: { status: "PENDING_DELETION" } }),
      prisma.user.count(),
      prisma.pass.count({ where: { status: "ACTIVE" } }),
      prisma.attendanceSession.count({ where: { startsAt: today } }),
      prisma.attendanceEvent.count({ where: { serverTs: today } }),
      prisma.attendanceRecord.count({ where: { approvalStatus: "PENDING" } }),
      prisma.platformAdmin.count(),
      prisma.auditLog.findMany({
        where: {
          OR: [
            { action: { startsWith: "platform." } },
            { meta: { path: ["scope"], equals: "platform" } },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: OVERVIEW_ACTIVITY_LIMIT,
        select: {
          id: true,
          action: true,
          result: true,
          organizationId: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
      }),
    ]);

    return ok({
      counts: shapePlatformOverview({
        organizationsTotal,
        organizationsActive,
        organizationsSuspended,
        organizationsPendingDeletion,
        users,
        activePasses,
        sessionsToday,
        eventsToday,
        pendingApprovals,
        platformAdmins,
      }),
      activity: activity.map(shapePlatformActivityRow),
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
