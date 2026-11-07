import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { newCredentialPair } from "@/modules/passes/service";

export async function POST(_req: Request, { params }: { params: Promise<{ orgId: string; passId: string }> }) {
  try {
    const { orgId, passId } = await params;
    const ctx = await requireOrganizationPermission("passes.revoke", orgId);
    const pass = await prisma.pass.findUnique({ where: { id: passId } });
    if (!pass || pass.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Pass not found in this organization");
    if (pass.status !== "ACTIVE") return fail(409, "CONFLICT", "Only ACTIVE passes can be rotated");
    const { qrPayload, credentialHash } = newCredentialPair(pass.passPublicId);
    const updated = await prisma.pass.update({
      where: { id: pass.id },
      data: { credentialHash, version: { increment: 1 } },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.rotate", resource: `pass:${updated.id}`, result: "ok", meta: { version: updated.version } as never },
    });
    return ok({ pass: { id: updated.id, passPublicId: updated.passPublicId, version: updated.version }, qrPayload });
  } catch (e) {
    return handleRouteError(e);
  }
}
