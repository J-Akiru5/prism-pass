import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { parseQrPayload, verifyPassStatus } from "@/modules/passes/verify";
import { hashCredential } from "@/modules/passes/service";
import { enforceRateLimits, ipCheck, limiters, orgCheck } from "@/lib/rate-limit-http";

const body = z.object({ credential: z.string().min(8).max(512) });
const DUPLICATE_WINDOW_MS = 120_000;

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    // Unauthenticated cost is the cheapest thing to flood; spend the IP token first.
    const denied = enforceRateLimits([ipCheck(limiters.passVerifyIp, req)]);
    if (denied) return denied;
    // attendance.scan required; requireOrganizationPermission already blocks suspended orgs + revoked memberships
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const orgDenied = enforceRateLimits([orgCheck(limiters.passVerifyOrg, ctx.organizationId)]);
    if (orgDenied) return orgDenied;
    const { credential } = body.parse(await readJson(req, BODY_LIMITS.tiny));
    const parsed = parseQrPayload(credential);
    if (!parsed) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.verify", resource: `org:${ctx.organizationId}`, result: "invalid_format" },
      });
      return fail(400, "INVALID_INPUT", "Unrecognized QR payload");
    }
    const pass = await prisma.pass.findUnique({
      where: { organizationId_passPublicId: { organizationId: ctx.organizationId, passPublicId: parsed.passPublicId } },
      include: { person: true },
    });
    // Unknown pass in THIS org (cross-tenant passes never match — org-scoped unique)
    if (!pass) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.verify", resource: `pass:unknown:${parsed.passPublicId}`, result: "not_found" },
      });
      return fail(404, "NOT_FOUND", "Unknown pass in this organization");
    }
    if (pass.person.organizationId !== ctx.organizationId) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.verify", resource: `pass:${pass.id}`, result: "wrong_org_person" },
      });
      return fail(403, "FORBIDDEN", "Pass person belongs to a different organization");
    }
    if (pass.credentialHash !== hashCredential(parsed.passPublicId, parsed.secret)) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.verify", resource: `pass:${pass.id}`, result: "credential_mismatch" },
      });
      return fail(403, "FORBIDDEN", "Credential mismatch");
    }
    const v = verifyPassStatus({ status: pass.status as never, expiresAt: pass.expiresAt });
    if (!v.valid) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "pass.verify", resource: `pass:${pass.id}`, result: v.reason.toLowerCase() },
      });
      const code = v.reason === "REVOKED" ? 403 : 410;
      return fail(code, v.reason, `Pass ${v.reason.toLowerCase()}`);
    }
    // Duplicate: same pass verified within window
    const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
    const recent = await prisma.auditLog.findFirst({
      where: { organizationId: ctx.organizationId, action: "pass.verify", resource: `pass:${pass.id}`, result: "valid", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    });
    const duplicate = !!recent;
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "pass.verify",
        resource: `pass:${pass.id}`,
        result: duplicate ? "valid_duplicate" : "valid",
        meta: { version: pass.version, personId: pass.personId } as never,
      },
    });
    return ok({ valid: true, reason: duplicate ? "VALID_DUPLICATE" : "VALID", passPublicId: pass.passPublicId, version: pass.version, personId: pass.personId, duplicate });
  } catch (e) {
    return handleRouteError(e);
  }
}
