import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { deviceKeyHash, generateDeviceKey } from "@/modules/offline/crypto";

type P = { params: Promise<{ orgId: string }> };

const registerInput = z.object({
  role: z.enum(["scanner"]).default("scanner"),
});

// POST /orgs/:orgId/devices/register (devices.manage)
// The device secret is returned exactly once and never persisted: only its
// SHA-256 verifier (`secretHash`) is stored. Registration is audited.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("devices.manage", orgId);
    const input = registerInput.parse(await readJson(req, BODY_LIMITS.tiny).catch(() => ({})));
    const { devicePublicId, secret } = generateDeviceKey();

    const device = await prisma.device.create({
      data: {
        organizationId: ctx.organizationId,
        devicePublicId,
        role: input.role,
        secretHash: deviceKeyHash(secret),
      },
      select: { id: true, devicePublicId: true, role: true, lastSeenAt: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "device.register",
        resource: `device:${device.id}`,
        result: "ok",
        meta: { devicePublicId, role: input.role } as never,
      },
    });

    return ok({
      device,
      // One-time credential. Store it on the device; it cannot be recovered.
      secret,
      signature: { algorithm: "HMAC-SHA256", version: "prism-sync-v1" },
    });
  } catch (e) { return handleRouteError(e); }
}
