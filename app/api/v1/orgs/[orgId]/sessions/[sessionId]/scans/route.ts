import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { scanInput } from "@/modules/attendance/engine";
import { performScan } from "@/modules/attendance/scan-service";
import { enforceRateLimits, ipCheck, limiters, orgCheck } from "@/lib/rate-limit-http";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

// Canonical scan path — the ONLY attendance write path for employees, interns,
// and event participants. Group identity comes from person_assignments, not branches.
// The write logic lives in modules/attendance/scan-service so offline batch sync
// reuses the same rules instead of forking them.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const denied = enforceRateLimits([ipCheck(limiters.scanIp, req)]);
    if (denied) return denied;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const orgDenied = enforceRateLimits([orgCheck(limiters.scanOrg, ctx.organizationId)]);
    if (orgDenied) return orgDenied;
    const input = scanInput.parse(await readJson(req, BODY_LIMITS.small));

    const result = await performScan(
      { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId },
      sessionId,
      input,
    );
    if (!result.ok) return fail(result.status, result.code, result.message, result.details);
    return ok(result.data);
  } catch (e) { return handleRouteError(e); }
}
