import { randomUUID } from "crypto";
import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { parseQrPayload, verifyPassStatus } from "@/modules/passes/verify";
import { hashCredential } from "@/modules/passes/service";
import { scanInput, reconcileRecord, resolveDirection } from "@/modules/attendance/engine";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

// Canonical scan path — the ONLY attendance write path for employees, interns,
// and event participants. Group identity comes from person_assignments, not branches.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const input = scanInput.parse(await req.json());

    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { policy: true },
    });
    if (!session || session.organizationId !== ctx.organizationId) return fail(404, "NOT_FOUND", "Session not found in this organization");

    // 1. Verify pass (same checks as verify endpoint — no divergence)
    const parsed = parseQrPayload(input.credential);
    if (!parsed) return fail(400, "INVALID_INPUT", "Unrecognized QR payload");
    const pass = await prisma.pass.findUnique({
      where: { organizationId_passPublicId: { organizationId: ctx.organizationId, passPublicId: parsed.passPublicId } },
      include: { person: true },
    });
    if (!pass) {
      await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `session:${sessionId}`, result: "not_found" } });
      return fail(404, "NOT_FOUND", "Unknown pass in this organization");
    }
    if (pass.person.organizationId !== ctx.organizationId || pass.person.status !== "active") {
      await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: "person_inactive" } });
      return fail(403, "FORBIDDEN", "Pass holder is not active in this organization");
    }
    if (pass.credentialHash !== hashCredential(parsed.passPublicId, parsed.secret)) {
      await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: "credential_mismatch" } });
      return fail(403, "FORBIDDEN", "Credential mismatch");
    }
    const v = verifyPassStatus({ status: pass.status as never, expiresAt: pass.expiresAt });
    if (!v.valid) {
      await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: v.reason.toLowerCase() } });
      return fail(v.reason === "REVOKED" ? 403 : 410, v.reason, `Pass ${v.reason.toLowerCase()}`);
    }

    // 2. Idempotency: same key returns existing event, no double write
    const idempotencyKey = input.idempotencyKey ?? randomUUID();
    const existingKey = await prisma.attendanceEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: ctx.organizationId, idempotencyKey } },
    });
    if (existingKey) return ok({ event: existingKey, dedupe: true, key: "idempotencyKey" });

    const clientTs = new Date(input.clientTs);
    const serverTs = new Date();

    // 3. Duplicate window: same pass re-scan → DUPLICATE_DETECTED, record untouched
    const windowSince = new Date(serverTs.getTime() - session.policy.duplicateWindowSec * 1000);
    const recentScan = await prisma.attendanceEvent.findFirst({
      where: { organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId, serverTs: { gte: windowSince }, status: "accepted" },
      orderBy: { serverTs: "desc" },
    });
    if (recentScan && recentScan.passId === pass.id) {
      const dup = await prisma.attendanceEvent.create({
        data: {
          organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId,
          passId: pass.id, passVersion: pass.version, type: "DUPLICATE_DETECTED",
          clientTs, lat: input.geo?.lat ?? null, lng: input.geo?.lng ?? null, accuracyM: input.geo?.accuracyM ?? null,
          deviceId: input.deviceId ?? null, networkState: input.networkState, source: "scanner",
          idempotencyKey, status: "accepted",
        },
      });
      await prisma.auditLog.create({ data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `event:${dup.id}`, result: "valid_duplicate", meta: { sessionId, personId: pass.personId } as never } });
      const record = await prisma.attendanceRecord.findUnique({ where: { organizationId_sessionId_personId: { organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId } } });
      return ok({ event: dup, record, duplicate: true });
    }

    // 4. Resolve direction + append event
    const record0 = await prisma.attendanceRecord.findUnique({
      where: { organizationId_sessionId_personId: { organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId } },
    });
    const eventType = resolveDirection(input.direction, !!record0?.checkInEventId);
    const event = await prisma.attendanceEvent.create({
      data: {
        organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId,
        passId: pass.id, passVersion: pass.version, type: eventType,
        clientTs, lat: input.geo?.lat ?? null, lng: input.geo?.lng ?? null, accuracyM: input.geo?.accuracyM ?? null,
        deviceId: input.deviceId ?? null, networkState: input.networkState, source: "scanner",
        idempotencyKey, status: "accepted",
      },
    });

    // 5. Reconcile single record per (org, session, person)
    let checkInAt: Date | null = null;
    if (eventType === "CHECK_IN") {
      checkInAt = serverTs;
    } else if (record0?.checkInEventId) {
      const inEv = await prisma.attendanceEvent.findUnique({ where: { id: record0.checkInEventId } });
      checkInAt = inEv ? new Date(inEv.serverTs) : null;
    }
    const r = reconcileRecord(
      { checkInAt, checkOutAt: null },
      eventType, serverTs, new Date(session.startsAt), session.policy.graceMin, session.policy.lateThresholdMin,
    );
    const record = await prisma.attendanceRecord.upsert({
      where: { organizationId_sessionId_personId: { organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId } },
      create: {
        organizationId: ctx.organizationId, sessionId: session.id, personId: pass.personId,
        checkInEventId: eventType === "CHECK_IN" ? event.id : null,
        checkOutEventId: eventType === "CHECK_OUT" ? event.id : null,
        durationMin: r.durationMin,
        status: r.status as never,
      },
      update: eventType === "CHECK_IN"
        ? { checkInEventId: event.id, status: r.status as never }
        : { checkOutEventId: event.id, durationMin: checkInAt ? Math.max(0, Math.round((serverTs.getTime() - checkInAt.getTime()) / 60000)) : null },
    });
    await prisma.auditLog.create({
      data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "attendance.scan", resource: `event:${event.id}`, result: "accepted", meta: { sessionId, personId: pass.personId, direction: eventType } as never },
    });
    return ok({ event, record, duplicate: false });
  } catch (e) { return handleRouteError(e); }
}
