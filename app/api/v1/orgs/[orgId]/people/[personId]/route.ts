import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { updatePersonInput } from "@/modules/identity/service";

type P = { params: Promise<{ orgId: string; personId: string }> };

export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, personId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: { passes: { orderBy: { createdAt: "desc" }, take: 10 }, assignments: true },
    });
    if (!person || person.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Person not found in this organization");
    return ok(person);
  } catch (e) { return handleRouteError(e); }
}

export async function PATCH(req: Request, { params }: P) {
  try {
    const { orgId, personId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = updatePersonInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const existing = await prisma.person.findUnique({ where: { id: personId } });
    if (!existing || existing.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Person not found in this organization");
    if (input.externalId) {
      const clash = await prisma.person.findFirst({
        where: { organizationId: ctx.organizationId, externalId: input.externalId, NOT: { id: personId } },
      });
      if (clash) return fail(409, "CONFLICT", "externalId already in use in this organization");
    }
    const updated = await prisma.person.update({ where: { id: personId }, data: input });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "person.update", resource: `person:${personId}`, result: "ok" },
    });
    return ok(updated);
  } catch (e) { return handleRouteError(e); }
}
