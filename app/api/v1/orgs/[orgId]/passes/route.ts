import { z } from "zod";
import { ok, fail, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { newCredentialPair } from "@/modules/passes/service";
import { randomUUID } from "crypto";

const body = z.object({
  personId: z.string().min(1),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const personId = searchParams.get("personId") ?? undefined;
    const where = { organizationId: ctx.organizationId, ...(personId ? { personId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.pass.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" }, select: { id: true, passPublicId: true, personId: true, version: true, status: true, expiresAt: true, revokedAt: true, createdAt: true } }),
      prisma.pass.count({ where }),
    ]);
    // Never expose credentialHash over the API
    return ok(rows, { page, pageSize, total });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = body.parse(await req.json());
    const person = await prisma.person.findUnique({ where: { id: input.personId } });
    if (!person || person.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Person not found in this organization");
    const passPublicId = `pp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const { qrPayload, credentialHash } = newCredentialPair(passPublicId);
    const pass = await prisma.pass.create({
      data: {
        organizationId: ctx.organizationId,
        personId: person.id,
        passPublicId,
        credentialHash,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "pass.issue",
        resource: `pass:${pass.id}`,
        result: "ok",
        meta: { personId: person.id, passPublicId } as never,
      },
    });
    // qrPayload contains the secret — return ONCE, never store secret
    return ok({ pass: { id: pass.id, passPublicId: pass.passPublicId, personId: pass.personId, status: pass.status, version: pass.version, expiresAt: pass.expiresAt }, qrPayload });
  } catch (e) {
    return handleRouteError(e);
  }
}
