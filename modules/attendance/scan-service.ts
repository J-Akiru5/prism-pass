import { randomUUID } from "crypto";
import type { AttendanceEvent, AttendanceRecord } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseQrPayload, passStatusHttpStatus, verifyPassStatus } from "@/modules/passes/verify";
import { verifyCredentialHash } from "@/modules/passes/credential";
import { reconcileRecord, evaluateSessionAdmission, type ScanInput } from "@/modules/attendance/engine";
import {
  decideScanTransition,
  EMPTY_RECORD_SNAPSHOT,
  type RecordSnapshot,
} from "@/modules/attendance/scan-policy";
import { evaluateGeo } from "@/modules/geo/evaluate";

// Canonical attendance write path, extracted from the scan route so offline
// batch sync applies exactly the same rules (credential check, person status,
// idempotency, duplicate window, geo enforce, direction, reconciliation).
// Behaviour is intentionally byte-for-byte identical to the online route.

export type ScanActor = { organizationId: string; actorUserId: string | null };

export type ScanSuccessData = {
  event: AttendanceEvent;
  record?: AttendanceRecord | null;
  duplicate?: boolean;
  geoResult: string;
  dedupe?: true;
  key?: "idempotencyKey";
  /** Always present on an accepted/deduped/duplicate scan (M1-7). */
  personName: string;
};

export type ScanFailure = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type ScanOutcome = { ok: true; data: ScanSuccessData } | ({ ok: false } & ScanFailure);

export async function performScan(actor: ScanActor, sessionId: string, input: ScanInput): Promise<ScanOutcome> {
  const organizationId = actor.organizationId;
  const actorUserId = actor.actorUserId;

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { policy: true },
  });
  if (!session || session.organizationId !== organizationId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Session not found in this organization" };
  }

  // 1. Verify pass (same checks as verify endpoint — no divergence)
  const parsed = parseQrPayload(input.credential);
  if (!parsed) {
    // Record the malformed attempt without echoing the credential or secret.
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `session:${sessionId}`, result: "invalid_format" } });
    return { ok: false, status: 400, code: "INVALID_INPUT", message: "Unrecognized QR payload" };
  }
  const pass = await prisma.pass.findUnique({
    where: { organizationId_passPublicId: { organizationId, passPublicId: parsed.passPublicId } },
    include: { person: true },
  });
  if (!pass) {
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `session:${sessionId}`, result: "not_found" } });
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Unknown pass in this organization" };
  }
  if (pass.person.organizationId !== organizationId || pass.person.status !== "active") {
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: "person_inactive" } });
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Pass holder is not active in this organization" };
  }
  if (!verifyCredentialHash(parsed.passPublicId, parsed.secret, pass.credentialHash)) {
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: "credential_mismatch" } });
    return { ok: false, status: 403, code: "FORBIDDEN", message: "Credential mismatch" };
  }
  const v = verifyPassStatus({ status: pass.status as never, expiresAt: pass.expiresAt });
  if (!v.valid) {
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `pass:${pass.id}`, result: v.reason.toLowerCase() } });
    return {
      ok: false,
      status: passStatusHttpStatus(v.reason),
      code: v.reason,
      message: `Pass ${v.reason.toLowerCase()}`,
    };
  }

  // 2. Idempotency: same key returns existing event, no double write
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const existingKey = await prisma.attendanceEvent.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
  });
  if (existingKey) {
    return { ok: true, data: { event: existingKey, dedupe: true, key: "idempotencyKey", geoResult: existingKey.geoResult, personName: pass.person.displayName } };
  }

  // 2a. Event gates, in this order and before the duplicate window:
  //   1. CLOSED refuses every new scan (409).
  //   2. A roster-enforced session refuses an unlisted person unless walk-ins
  //      are allowed (403).
  // Idempotency ran first on purpose: a scan accepted before the event closed
  // replays as accepted instead of turning into a refusal. The refusal carries
  // no person name (D-03); the audit row is internal.
  const rosterGateApplies = session.rosterEnforced && !session.walkInAllowed;
  const onRoster = rosterGateApplies
    ? Boolean(
        await prisma.sessionRoster.findUnique({
          where: { organizationId_sessionId_personId: { organizationId, sessionId: session.id, personId: pass.personId } },
          select: { id: true },
        }),
      )
    : true;
  const admission = evaluateSessionAdmission({
    status: session.status,
    rosterEnforced: session.rosterEnforced,
    walkInAllowed: session.walkInAllowed,
    onRoster,
  });
  if (!admission.allowed) {
    const closed = admission.code === "EVENT_CLOSED";
    await prisma.auditLog.create({
      data: {
        organizationId, actorUserId, action: "attendance.scan", resource: `session:${session.id}`,
        result: closed ? "event_closed" : "not_on_roster",
        meta: { sessionId, personId: pass.personId, gate: admission.code } as never,
      },
    });
    return closed
      ? { ok: false, status: 409, code: "EVENT_CLOSED", message: "This event is closed" }
      : { ok: false, status: 403, code: "NOT_ON_ROSTER", message: "Pass holder is not on this event's roster" };
  }

  const clientTs = new Date(input.clientTs);
  const serverTs = new Date();

  // 2b. Geo verification is derived server-side from raw coordinates + configured
  // fences. A client-supplied "inside" boolean is never trusted. `off` skips the
  // fence lookup entirely; missing coordinates are recorded, never auto-rejected.
  const geoMode = session.policy.geoMode;
  const geofences =
    geoMode !== "off" && input.geo
      ? await prisma.geofence.findMany({
          where: { organizationId },
          select: { id: true, centerLat: true, centerLng: true, radiusM: true },
        })
      : [];
  const geo = evaluateGeo(
    { lat: input.geo?.lat, lng: input.geo?.lng, accuracyM: input.geo?.accuracyM },
    geofences,
    geoMode,
  );
  const geoEvidence = {
    lat: input.geo?.lat ?? null,
    lng: input.geo?.lng ?? null,
    accuracyM: input.geo?.accuracyM ?? null,
    geoResult: geo.geoResult,
    geofenceId: geo.matchedGeofenceId,
  };

  // 3. Duplicate window + direction: one pure decision, no writes. The record
  // is loaded first so the helper can resolve `auto`; the check-in timestamp is
  // the same event row step 5 used to load.
  const record0 = await prisma.attendanceRecord.findUnique({
    where: { organizationId_sessionId_personId: { organizationId, sessionId: session.id, personId: pass.personId } },
  });
  const checkInEvent = record0?.checkInEventId
    ? await prisma.attendanceEvent.findUnique({
        where: { id: record0.checkInEventId },
        select: { serverTs: true, passId: true },
      })
    : null;
  const recordSnapshot: RecordSnapshot = record0
    ? {
        checkInAtMs: checkInEvent ? checkInEvent.serverTs.getTime() : null,
        checkOutAtMs: null,
        checkInPassId: checkInEvent?.passId ?? null,
      }
    : EMPTY_RECORD_SNAPSHOT;

  const windowSince = new Date(serverTs.getTime() - session.policy.duplicateWindowSec * 1000);
  const recentScan = await prisma.attendanceEvent.findFirst({
    where: { organizationId, sessionId: session.id, personId: pass.personId, serverTs: { gte: windowSince }, status: "accepted" },
    orderBy: { serverTs: "desc" },
  });
  const transition = decideScanTransition({
    record: recordSnapshot,
    recentSamePassScan: recentScan ? { passId: recentScan.passId, serverTsMs: recentScan.serverTs.getTime() } : null,
    passId: pass.id,
    requestedDirection: input.direction,
    serverTsMs: serverTs.getTime(),
    duplicateWindowMs: session.policy.duplicateWindowSec * 1000,
  });

  if (transition.eventType === "DUPLICATE_DETECTED") {
    const dup = await prisma.attendanceEvent.create({
      data: {
        organizationId, sessionId: session.id, personId: pass.personId,
        passId: pass.id, passVersion: pass.version, type: "DUPLICATE_DETECTED",
        clientTs, ...geoEvidence,
        deviceId: input.deviceId ?? null, networkState: input.networkState, source: "scanner",
        idempotencyKey, status: "accepted",
      },
    });
    await prisma.auditLog.create({ data: { organizationId, actorUserId, action: "attendance.scan", resource: `event:${dup.id}`, result: "valid_duplicate", meta: { sessionId, personId: pass.personId, geoResult: geo.geoResult } as never } });
    return { ok: true, data: { event: dup, record: record0, duplicate: true, geoResult: geo.geoResult, personName: pass.person.displayName } };
  }

  // 3b. Enforce mode: a reliable out-of-fence scan is rejected, audited and never
  // reaches the attendance record. Duplicates above are recorded but not rejected,
  // so duplicate-window behaviour is unchanged.
  if (geo.reject) {
    const rejected = await prisma.attendanceEvent.create({
      data: {
        organizationId, sessionId: session.id, personId: pass.personId,
        passId: pass.id, passVersion: pass.version, type: "REJECTED",
        clientTs, ...geoEvidence,
        deviceId: input.deviceId ?? null, networkState: input.networkState, source: "scanner",
        idempotencyKey, status: "rejected",
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId, actorUserId, action: "attendance.scan",
        resource: `event:${rejected.id}`, result: "geo_outside",
        meta: { sessionId, personId: pass.personId, geoResult: geo.geoResult, distanceM: geo.distanceM, direction: input.direction } as never,
      },
    });
    return {
      ok: false,
      status: 422,
      code: "GEO_OUTSIDE",
      message: "Scan is outside the organization's geofence",
      details: { geoResult: geo.geoResult, distanceM: geo.distanceM },
    };
  }

  // 4. Append the event selected by the pure transition decision
  const eventType = transition.eventType;
  const event = await prisma.attendanceEvent.create({
    data: {
      organizationId, sessionId: session.id, personId: pass.personId,
      passId: pass.id, passVersion: pass.version, type: eventType,
      clientTs, ...geoEvidence,
      deviceId: input.deviceId ?? null, networkState: input.networkState, source: "scanner",
      idempotencyKey, status: "accepted",
    },
  });

  // 5. Reconcile single record per (org, session, person)
  const checkInAt = transition.record.checkInAtMs === null ? null : new Date(transition.record.checkInAtMs);
  const r = reconcileRecord(
    { checkInAt, checkOutAt: null },
    eventType, serverTs, new Date(session.startsAt), session.policy.graceMin, session.policy.lateThresholdMin,
  );
  const record = await prisma.attendanceRecord.upsert({
    where: { organizationId_sessionId_personId: { organizationId, sessionId: session.id, personId: pass.personId } },
    create: {
      organizationId, sessionId: session.id, personId: pass.personId,
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
    data: { organizationId, actorUserId, action: "attendance.scan", resource: `event:${event.id}`, result: "accepted", meta: { sessionId, personId: pass.personId, direction: eventType, geoResult: geo.geoResult } as never },
  });
  return { ok: true, data: { event, record, duplicate: false, geoResult: geo.geoResult, personName: pass.person.displayName } };
}
