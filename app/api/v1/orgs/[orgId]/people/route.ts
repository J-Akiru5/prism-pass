import { ok, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createPersonInput } from "@/modules/identity/service";
export async function GET(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    if (!process.env.DATABASE_URL) return ok([], { note: "DB not configured — demo empty" });
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const [rows, total] = await Promise.all([
      prisma.person.findMany({ where: { organizationId: ctx.organizationId }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { displayName: "asc" } }),
      prisma.person.count({ where: { organizationId: ctx.organizationId } }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}
export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = createPersonInput.parse(await req.json());
    if (!process.env.DATABASE_URL) return ok({ demo: true, ...input, organizationId: ctx.organizationId });
    const person = await prisma.person.create({ data: { organizationId: ctx.organizationId, displayName: input.displayName, externalId: input.externalId, userId: input.userId } });
    await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "person.create", resource: `person:${person.id}`, result: "ok" } });
    return ok(person);
  } catch (e) { return handleRouteError(e); }
}
