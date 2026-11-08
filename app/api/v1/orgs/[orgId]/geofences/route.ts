import { ok, fail, handleRouteError, pagination, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { createGeofenceInput } from "@/modules/geo/schema";

type P = { params: Promise<{ orgId: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("geofences.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));
    const where = { organizationId: ctx.organizationId };
    const [rows, total] = await Promise.all([
      prisma.geofence.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { label: "asc" } }),
      prisma.geofence.count({ where }),
    ]);
    return ok(rows, { page, pageSize, total });
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("geofences.manage", orgId);
    const input = createGeofenceInput.parse(await readJson(req, BODY_LIMITS.tiny));
    if (input.campusId) {
      const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
      if (!campus || campus.organizationId !== ctx.organizationId) {
        return fail(404, "NOT_FOUND", "Campus not found in this organization");
      }
    }
    const geofence = await prisma.geofence.create({
      data: {
        organizationId: ctx.organizationId,
        campusId: input.campusId ?? null,
        label: input.label,
        centerLat: input.centerLat,
        centerLng: input.centerLng,
        radiusM: input.radiusM,
      },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "geofence.create", resource: `geofence:${geofence.id}`, result: "ok" },
    });
    return ok(geofence);
  } catch (e) { return handleRouteError(e); }
}
