import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { evaluateDeviceRevocation, toDeviceSummary } from "@/modules/devices/revocation";

type P = { params: Promise<{ orgId: string; deviceId: string }> };

// POST /api/v1/orgs/:orgId/devices/:deviceId/revoke (devices.manage)
// Idempotent: a second call returns the original `revokedAt` with `already: true`
// and still records the attempt. Matching accepts the internal id or public id.
export async function POST(_req: Request, { params }: P) {
  try {
    const { orgId, deviceId } = await params;
    const ctx = await requireOrganizationPermission("devices.manage", orgId);

    const device = await prisma.device.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ id: deviceId }, { devicePublicId: deviceId }],
      },
      select: {
        id: true,
        devicePublicId: true,
        role: true,
        revokedAt: true,
        lastSeenAt: true,
        lastSyncAt: true,
      },
    });
    if (!device) return fail(404, "NOT_FOUND", "Device not found in this organization");

    const outcome = evaluateDeviceRevocation(device);
    if (!outcome.already) {
      // Clear the verifier as defence in depth; revocation is permanent.
      await prisma.device.update({
        where: { id: device.id },
        data: { revokedAt: outcome.revokedAt, secretHash: null },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "device.revoke",
        resource: `device:${device.id}`,
        result: outcome.already ? "already_revoked" : "ok",
        meta: { devicePublicId: device.devicePublicId, already: outcome.already } as never,
      },
    });

    return ok({
      device: toDeviceSummary({ ...device, revokedAt: outcome.revokedAt }),
      already: outcome.already,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
