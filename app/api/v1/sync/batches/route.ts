import { Prisma } from "@prisma/client";
import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { performScan } from "@/modules/attendance/scan-service";
import { classifyBatchItems, type ItemDecision, type ItemStatus } from "@/modules/offline/classify";
import { verifyBatchSignature } from "@/modules/offline/crypto";
import { batchEnvelopeSchema, validateBatch } from "@/modules/offline/schema";

type Receipt = {
  idempotencyKey: string;
  sessionId: string;
  status: ItemStatus;
  reason: string;
  eventId?: string;
  message?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// POST /api/v1/sync/batches
// Device-signed offline batch. Rejects replayed batch ids, verifies the HMAC
// over the canonical payload, revalidates every pass and applies accepted items
// through the canonical attendance write path (`performScan`).
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json();
    // The org is normally in the signed body; `X-Org-Id` is only a selector hint
    // that fills a missing field, never an authority (membership is checked below).
    const hintedOrg = req.headers.get("x-org-id");
    const payload: unknown =
      isRecord(raw) && raw.organizationId === undefined && hintedOrg ? { ...raw, organizationId: hintedOrg } : raw;

    const parsed = batchEnvelopeSchema.parse(payload);
    const ctx = await requireOrganizationPermission("attendance.scan", parsed.organizationId);

    const device = await prisma.device.findFirst({
      where: {
        organizationId: ctx.organizationId,
        OR: [{ devicePublicId: parsed.deviceId }, { id: parsed.deviceId }],
      },
      select: { id: true, devicePublicId: true, secretHash: true, revokedAt: true },
    });
    // Unknown/cross-org device is a 404, never a 403 that confirms its existence.
    if (!device) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `device:${parsed.deviceId}`, result: "device_not_found" },
      });
      return fail(404, "NOT_FOUND", "Unknown device in this organization");
    }
    if (device.revokedAt || !device.secretHash) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `device:${device.id}`, result: "device_revoked" },
      });
      return fail(403, "FORBIDDEN", "Device is revoked");
    }

    if (!verifyBatchSignature({ batch: parsed, secretHash: device.secretHash, signature: parsed.signature })) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `device:${device.id}`, result: "signature_invalid" },
      });
      return fail(403, "FORBIDDEN", "Invalid batch signature");
    }

    // Structural + clock-window validation. A tampered/backwards queue is a
    // whole-batch failure; idempotent item retries are handled per item below.
    const validation = validateBatch(parsed, { now: new Date() });
    if (!validation.ok) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `batch:${parsed.batchId}`, result: "invalid_batch", meta: { issues: validation.issues } as never },
      });
      return fail(400, "INVALID_INPUT", "Batch validation failed", validation.issues);
    }
    const batch = validation.batch;

    // Replay: one server receipt per (org, batchId). A retry must reuse the
    // original receipts; it may not apply anything a second time.
    const replay = await prisma.offlineSyncBatch.findUnique({
      where: { organizationId_batchId: { organizationId: ctx.organizationId, batchId: batch.batchId } },
      select: { id: true },
    });
    if (replay) {
      await prisma.auditLog.create({
        data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `batch:${batch.batchId}`, result: "replay_rejected" },
      });
      return fail(409, "CONFLICT", "Batch has already been processed", { batchId: batch.batchId });
    }

    // Reserve the batch id before writing attendance so concurrent replays lose
    // the unique constraint instead of double-applying items.
    let received: { id: string };
    try {
      received = await prisma.offlineSyncBatch.create({
        data: {
          organizationId: ctx.organizationId,
          deviceId: device.id,
          batchId: batch.batchId,
          signature: parsed.signature,
          clientVersion: parsed.clientVersion,
          accepted: 0,
          rejected: 0,
        },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        await prisma.auditLog.create({
          data: { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId, action: "sync.batches", resource: `batch:${batch.batchId}`, result: "replay_rejected" },
        });
        return fail(409, "CONFLICT", "Batch has already been processed", { batchId: batch.batchId });
      }
      throw e;
    }

    const sessionIds = [...new Set(batch.events.map((event) => event.sessionId))];
    const idempotencyKeys = [...new Set(batch.events.map((event) => event.idempotencyKey))];
    const [sessions, existingEvents] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: { organizationId: ctx.organizationId, id: { in: sessionIds } },
        select: { id: true },
      }),
      prisma.attendanceEvent.findMany({
        where: { organizationId: ctx.organizationId, idempotencyKey: { in: idempotencyKeys } },
        select: { id: true, idempotencyKey: true },
      }),
    ]);
    const existingByKey = new Map(existingEvents.map((event) => [event.idempotencyKey, event.id]));

    const decisions = classifyBatchItems({
      events: batch.events,
      existingKeys: new Set(existingEvents.map((event) => event.idempotencyKey)),
      knownSessionIds: new Set(sessions.map((session) => session.id)),
      now: new Date(),
    });

    const receipts: Receipt[] = [];
    for (const decision of decisions) {
      const event = batch.events[decision.index];
      if (decision.status !== "accept") {
        receipts.push(toReceipt(decision, existingByKey.get(decision.idempotencyKey)));
        continue;
      }

      const result = await performScan(
        { organizationId: ctx.organizationId, actorUserId: ctx.internalUserId },
        event.sessionId,
        {
          credential: event.credential,
          clientTs: event.clientTs,
          direction: event.direction,
          idempotencyKey: event.idempotencyKey,
          geo: event.geo,
          deviceId: device.id,
          // The canonical scanner path records offline capture as evidence;
          // server time remains authoritative for lateness/reconciliation.
          networkState: "offline",
        },
      );

      if (!result.ok) {
        receipts.push({
          idempotencyKey: decision.idempotencyKey,
          sessionId: decision.sessionId,
          status: "reject",
          reason: result.code,
          message: result.message,
        });
        continue;
      }

      const duplicate = Boolean(result.data.duplicate || result.data.dedupe);
      receipts.push({
        idempotencyKey: decision.idempotencyKey,
        sessionId: decision.sessionId,
        status: duplicate ? "duplicate" : "accept",
        reason: result.data.duplicate ? "duplicate_window" : result.data.dedupe ? "idempotency_key_seen" : "ok",
        eventId: result.data.event.id,
      });
    }

    const accepted = receipts.filter((receipt) => receipt.status !== "reject").length;
    const rejected = receipts.length - accepted;
    const nonAccepted = receipts.filter((receipt) => receipt.status !== "accept");

    await prisma.offlineSyncBatch.update({
      where: { id: received.id },
      data: { accepted, rejected, errors: nonAccepted.length ? (nonAccepted as never) : undefined },
    });
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(), lastSyncAt: new Date() },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "sync.batches",
        resource: `batch:${batch.batchId}`,
        result: "ok",
        meta: { deviceId: device.id, accepted, rejected, events: receipts.length } as never,
      },
    });

    return ok({
      batch: { id: received.id, batchId: batch.batchId, accepted, rejected },
      receipts,
    });
  } catch (e) { return handleRouteError(e); }
}

function toReceipt(decision: ItemDecision, eventId?: string): Receipt {
  return {
    idempotencyKey: decision.idempotencyKey,
    sessionId: decision.sessionId,
    status: decision.status,
    reason: decision.reason,
    ...(eventId ? { eventId } : {}),
  };
}
