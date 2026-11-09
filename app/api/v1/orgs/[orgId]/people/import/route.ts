import { z } from "zod";
import { ok, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { peopleImportAuditMeta, planPeopleImport } from "@/modules/identity/csv";

// An empty file is handed to the planner so it can return the structured
// "CSV is empty" row error instead of a generic validation failure.
const importPeopleInput = z.object({ csv: z.string() });

export async function POST(req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("members.manage", orgId);
    const { csv } = importPeopleInput.parse(await readJson(req, BODY_LIMITS.medium));

    if (!process.env.DATABASE_URL) {
      const plan = planPeopleImport({ csv });
      return ok({ demo: true, ...peopleImportAuditMeta(plan), created: 0, errors: plan.errors });
    }

    const existing = await prisma.person.findMany({
      where: { organizationId: ctx.organizationId, externalId: { not: null } },
      select: { externalId: true },
    });
    const plan = planPeopleImport({
      csv,
      existingExternalIds: existing
        .map((person) => person.externalId)
        .filter((externalId): externalId is string => externalId !== null),
    });

    let created = 0;
    if (plan.rows.length > 0) {
      const result = await prisma.person.createMany({
        data: plan.rows.map((row) => ({
          organizationId: ctx.organizationId,
          displayName: row.displayName,
          externalId: row.externalId ?? null,
        })),
      });
      created = result.count;
    }

    const counts = { ...peopleImportAuditMeta(plan), created };
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "people.import",
        resource: "person:import",
        result: "ok",
        // Counts only: never the CSV text, display names, or external ids.
        meta: counts as never,
      },
    });

    return ok({ ...counts, errors: plan.errors });
  } catch (e) { return handleRouteError(e); }
}
