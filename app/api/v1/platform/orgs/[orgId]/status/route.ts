import { ok, fail, handleRouteError } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { decideOrgStatusChange, setOrgStatusInput } from "@/modules/platform/ledger";

/**
 * Platform-only organization status control.
 *
 * The gate is `requirePlatformAdmin`, never the UI: hiding a button is not
 * authorization, and `PATCH /orgs/:orgId` already reserves suspension to
 * platform admins (ADR-11).
 *
 * Rule (see docs/api/platform-console.md): reactivation is always allowed;
 * suspension requires at least one *other* active platform admin. The guard
 * prevents a lone operator from making a platform-wide change nobody else can
 * reverse. It does not require an org OWNER — platform authority is separate
 * from org membership, and locking down an abandoned tenant must stay possible.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const { userId } = await requirePlatformAdmin();
    const input = setOrgStatusInput.parse(await req.json());

    // requirePlatformAdmin resolves the Supabase user; audit rows key on the
    // internal user id. Resolve here instead of widening that helper's contract.
    const actor = await prisma.user.findUnique({ where: { authId: userId }, select: { id: true } });
    if (!actor) return fail(403, "FORBIDDEN", "Platform admin is not linked to an internal user");

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, status: true },
    });
    if (!org) return fail(404, "NOT_FOUND", "Organization not found");

    // platform_admins has no soft-delete column: presence is the grant.
    const otherActivePlatformAdmins = await prisma.platformAdmin.count({
      where: { userId: { not: actor.id } },
    });
    const decision = decideOrgStatusChange({
      currentStatus: org.status,
      nextStatus: input.status,
      otherActivePlatformAdmins,
    });

    if (!decision.allowed) {
      await prisma.auditLog.create({
        data: {
          organizationId: org.id,
          actorUserId: actor.id,
          action: input.status === "SUSPENDED" ? "org.suspend" : "org.reactivate",
          resource: `org:${org.id}`,
          result: "denied",
          meta: { code: decision.code, requestedStatus: input.status, scope: "platform" },
        },
      });
      return fail(409, decision.code, decision.message);
    }

    if (!decision.changed) {
      return ok({ id: org.id, name: org.name, slug: org.slug, status: org.status, changed: false });
    }

    const [updated] = await prisma.$transaction([
      prisma.organization.update({
        where: { id: org.id },
        data: { status: decision.nextStatus },
        select: { id: true, name: true, slug: true, status: true },
      }),
      prisma.auditLog.create({
        data: {
          organizationId: org.id,
          actorUserId: actor.id,
          action: decision.action,
          resource: `org:${org.id}`,
          result: "ok",
          meta: {
            previousStatus: org.status,
            nextStatus: decision.nextStatus,
            scope: "platform",
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      }),
    ]);

    return ok({ id: updated.id, name: updated.name, slug: updated.slug, status: updated.status, changed: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
