import { ok, handleRouteError, pagination } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { toDeviceSummary } from "@/modules/devices/revocation";

type P = { params: Promise<{ orgId: string }> };

const deviceSelect = {
  id: true,
  devicePublicId: true,
  role: true,
  lastSeenAt: true,
  lastSyncAt: true,
  revokedAt: true,
} as const;

// GET /api/v1/orgs/:orgId/devices (devices.manage)
// Public id, role, last sync and revocation state only. The secret verifier is
// never selected, so it cannot reach the response by accident.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("devices.manage", orgId);
    const { searchParams } = new URL(req.url);
    const { page, pageSize } = pagination.parse(Object.fromEntries(searchParams));

    const where = { organizationId: ctx.organizationId };
    const [rows, total] = await Promise.all([
      prisma.device.findMany({
        where,
        select: deviceSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { devicePublicId: "asc" },
      }),
      prisma.device.count({ where }),
    ]);

    return ok(rows.map(toDeviceSummary), { page, pageSize, total });
  } catch (e) {
    return handleRouteError(e);
  }
}
