import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// Digital identity: the signed-in member's own pass(es). Any active membership
// may read ONLY its own records — people linked via users.id. No PII beyond own.
export async function GET(_req: Request, { params }: { params: Promise<{ orgId: string }> }) {
  try {
    const { orgId } = await params;
    // documents.sign is the minimal grant every MEMBER has; the real gate is
    // active membership in this org (fail-closed). Admins/scanners use directory APIs.
    let ctx;
    try {
      ctx = await requireOrganizationPermission("documents.sign", orgId);
    } catch {
      ctx = await requireOrganizationPermission("attendance.scan", orgId);
    }
    const people = await prisma.person.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.internalUserId },
      include: { passes: { orderBy: { createdAt: "desc" } }, assignments: true },
    });
    if (people.length === 0) return fail(404, "NOT_FOUND", "No identity linked to your account in this organization");
    // Never expose credentialHash
    const safe = people.map((p) => ({
      ...p,
      passes: p.passes.map(({ credentialHash: _h, ...rest }) => rest),
    }));
    return ok(safe);
  } catch (e) { return handleRouteError(e); }
}
