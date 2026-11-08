import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission, requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { updateOrgStatusInput } from "@/modules/organizations/service";

async function isPlatformAdmin(): Promise<boolean> {
  try {
    await requirePlatformAdmin();
    return true;
  } catch {
    return false;
  }
}

// GET status: org member (organization.manage) or platform admin
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    let ctx = null;
    try {
      ctx = await requireOrganizationPermission("organization.manage", orgId);
    } catch {
      await requirePlatformAdmin();
    }
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return fail(404, "NOT_FOUND", "Organization not found");
    return ok({ id: org.id, slug: org.slug, name: org.name, status: org.status, timezone: org.timezone });
  } catch (e) {
    return handleRouteError(e);
  }
}

// PATCH status: platform admin ONLY (org OWNER cannot suspend own org — boundary per ADR-11)
export async function PATCH(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    await requirePlatformAdmin();
    const input = updateOrgStatusInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const org = await prisma.organization.update({ where: { id: orgId }, data: { status: input.status } });
    await prisma.auditLog.create({
      data: {
        organizationId: org.id,
        action: input.status === "SUSPENDED" ? "org.suspend" : "org.reactivate",
        resource: `org:${org.id}`,
        result: "ok",
      },
    });
    return ok({ id: org.id, slug: org.slug, status: org.status });
  } catch (e) {
    return handleRouteError(e);
  }
}
