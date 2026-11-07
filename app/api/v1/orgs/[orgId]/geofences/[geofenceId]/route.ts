import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { updateGeofenceInput } from "@/modules/geo/schema";

type P = { params: Promise<{ orgId: string; geofenceId: string }> };

export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, geofenceId } = await params;
    const ctx = await requireOrganizationPermission("geofences.manage", orgId);
    const geofence = await prisma.geofence.findUnique({ where: { id: geofenceId } });
    if (!geofence || geofence.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Geofence not found in this organization");
    }
    return ok(geofence);
  } catch (e) { return handleRouteError(e); }
}

export async function PATCH(req: Request, { params }: P) {
  try {
    const { orgId, geofenceId } = await params;
    const ctx = await requireOrganizationPermission("geofences.manage", orgId);
    const input = updateGeofenceInput.parse(await req.json());
    const existing = await prisma.geofence.findUnique({ where: { id: geofenceId } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Geofence not found in this organization");
    }
    if (input.campusId) {
      const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
      if (!campus || campus.organizationId !== ctx.organizationId) {
        return fail(404, "NOT_FOUND", "Campus not found in this organization");
      }
    }
    const updated = await prisma.geofence.update({ where: { id: geofenceId }, data: input });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "geofence.update", resource: `geofence:${geofenceId}`, result: "ok" },
    });
    return ok(updated);
  } catch (e) { return handleRouteError(e); }
}

export async function DELETE(_req: Request, { params }: P) {
  try {
    const { orgId, geofenceId } = await params;
    const ctx = await requireOrganizationPermission("geofences.manage", orgId);
    const existing = await prisma.geofence.findUnique({ where: { id: geofenceId } });
    if (!existing || existing.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Geofence not found in this organization");
    }
    await prisma.geofence.delete({ where: { id: geofenceId } });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "geofence.delete", resource: `geofence:${geofenceId}`, result: "ok" },
    });
    return ok({ id: geofenceId, deleted: true });
  } catch (e) { return handleRouteError(e); }
}
