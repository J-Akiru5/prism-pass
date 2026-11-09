import { ok, fail, handleRouteError, pagination, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { addSessionRosterInput } from "@/modules/attendance/engine";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

async function sessionInOrg(organizationId: string, sessionId: string) {
  return prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { id: true, organizationId: true, status: true, rosterEnforced: true, walkInAllowed: true },
  });
}

// GET /orgs/:orgId/sessions/:sessionId/roster (attendance.scan)
// The allow list a scanner checks. Read access follows scanning so staff can
// see who is expected; only writes require organization.manage.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const session = await sessionInOrg(ctx.organizationId, sessionId);
    if (!session || session.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Session not found in this organization");
    }
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const [rows, total] = await Promise.all([
      prisma.sessionRoster.findMany({
        where: { organizationId: ctx.organizationId, sessionId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { addedAt: "asc" },
        include: { person: { select: { id: true, displayName: true, status: true } } },
      }),
      prisma.sessionRoster.count({ where: { organizationId: ctx.organizationId, sessionId } }),
    ]);
    return ok({ session, roster: rows }, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

// POST /orgs/:orgId/sessions/:sessionId/roster (organization.manage)
// { personIds: string[] } — up to 500 per add. Every person must belong to the
// caller's organization; duplicates in the request and rows already on the
// roster are ignored, so retrying an add is safe.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("organization.manage", orgId);
    const session = await sessionInOrg(ctx.organizationId, sessionId);
    if (!session || session.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Session not found in this organization");
    }
    const input = addSessionRosterInput.parse(await readJson(req, BODY_LIMITS.small));
    const personIds = [...new Set(input.personIds)];
    const people = await prisma.person.findMany({
      where: { organizationId: ctx.organizationId, id: { in: personIds } },
      select: { id: true },
    });
    if (people.length !== personIds.length) {
      const found = new Set(people.map((p) => p.id));
      return fail(400, "INVALID_INPUT", "Every person must belong to this organization", {
        missingPersonIds: personIds.filter((id) => !found.has(id)),
      });
    }
    const created = await prisma.sessionRoster.createMany({
      data: personIds.map((personId) => ({
        organizationId: ctx.organizationId,
        sessionId,
        personId,
        source: "manual",
        addedByUserId: ctx.internalUserId,
      })),
      skipDuplicates: true,
    });
    const rosterCount = await prisma.sessionRoster.count({ where: { organizationId: ctx.organizationId, sessionId } });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "session.roster_add",
        resource: `session:${sessionId}`,
        result: "ok",
        meta: { added: created.count, requested: personIds.length, rosterCount } as never,
      },
    });
    return ok({ added: created.count, rosterCount });
  } catch (e) { return handleRouteError(e); }
}
