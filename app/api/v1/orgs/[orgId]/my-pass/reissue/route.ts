import { z } from "zod";
import { BODY_LIMITS, fail, handleRouteError, ok, readJson } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { newCredentialPair } from "@/modules/passes/service";

const body = z.object({ passId: z.string().min(1).max(128) });

/**
 * Member self-service pass re-issue. Legacy passes were issued with a random
 * secret that cannot be recovered; re-issuing derives a new secret for the next
 * version and returns the QR payload once. The member must own the pass.
 */
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    let ctx;
    try {
      ctx = await requireOrganizationPermission("documents.sign", orgId);
    } catch {
      ctx = await requireOrganizationPermission("attendance.scan", orgId);
    }

    const input = body.parse(await readJson(req, BODY_LIMITS.tiny));
    const pass = await prisma.pass.findFirst({
      where: {
        id: input.passId,
        organizationId: ctx.organizationId,
        person: { userId: ctx.internalUserId },
      },
    });
    if (!pass) return fail(404, "NOT_FOUND", "Pass not found for your account in this organization");
    if (pass.status !== "ACTIVE") return fail(409, "CONFLICT", "Only ACTIVE passes can be re-issued");

    const nextVersion = pass.version + 1;
    const { qrPayload, credentialHash } = newCredentialPair(pass.passPublicId, nextVersion);
    const updated = await prisma.pass.update({
      where: { id: pass.id },
      data: { credentialHash, version: nextVersion },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "pass.rotate",
        resource: `pass:${updated.id}`,
        result: "ok",
        meta: { self: true, version: updated.version } as never,
      },
    });

    return ok({
      pass: { id: updated.id, passPublicId: updated.passPublicId, version: updated.version },
      qrPayload,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
