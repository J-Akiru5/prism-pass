import { ok, handleRouteError, pagination, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createProgramInput } from "@/modules/identity/service";

type P = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const [rows, total] = await Promise.all([
      prisma.program.findMany({ where: { organizationId: ctx.organizationId }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" } }),
      prisma.program.count({ where: { organizationId: ctx.organizationId } }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = createProgramInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const program = await prisma.program.create({ data: { organizationId: ctx.organizationId, name: input.name, kind: input.kind } });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "program.create", resource: `program:${program.id}`, result: "ok" },
    });
    return ok(program);
  } catch (e) { return handleRouteError(e); }
}
