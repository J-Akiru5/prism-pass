import { z } from "zod";
import { ok, fail, handleRouteError, pagination, optionalQueryId, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createAssignmentInput } from "@/modules/identity/service";

type P = { params: Promise<{ orgId: string }> };

const query = z.object({ personId: optionalQueryId });

// One assignment model for employees, interns, and event participants alike.
// Group identity comes from programs.kind, never from separate engines.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const { personId } = query.parse(Object.fromEntries(searchParams));
    const where = { organizationId: ctx.organizationId, ...(personId ? { personId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.personAssignment.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { id: "asc" } }),
      prisma.personAssignment.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const input = createAssignmentInput.parse(await readJson(req, BODY_LIMITS.tiny));
    const person = await prisma.person.findUnique({ where: { id: input.personId } });
    if (!person || person.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Person not found in this organization");
    if (input.programId) {
      const program = await prisma.program.findUnique({ where: { id: input.programId } });
      if (!program || program.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Program not found in this organization");
    }
    const assignment = await prisma.personAssignment.create({
      data: {
        organizationId: ctx.organizationId,
        personId: person.id,
        programId: input.programId ?? null,
        role: input.role,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "person.assign", resource: `assignment:${assignment.id}`, result: "ok", meta: { personId: person.id } as never },
    });
    return ok(assignment);
  } catch (e) { return handleRouteError(e); }
}
