import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; passId: string }> }) {
  try {
    const { orgId, passId } = await params;
    const ctx = await requireOrganizationPermission("passes.revoke", orgId);
    const pass = await prisma.pass.findUnique({ where: { id: passId } });
    if (!pass || pass.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Pass not found in this organization");
    if (pass.status === "REVOKED") return ok({ id: pass.id, status: pass.status, already: true });
    const updated = await prisma.pass.update({ where: { id: pass.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.revoke", resource: `pass:${updated.id}`, result: "ok" },
    });
    return ok({ id: updated.id, status: updated.status, revokedAt: updated.revokedAt });
  } catch (e) {
    return handleRouteError(e);
  }
}
