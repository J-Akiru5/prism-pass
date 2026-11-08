import { ok, fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import {
  MAX_BATCH_EVENTS,
  MAX_CLIENT_FUTURE_MS,
  MAX_OFFLINE_AGE_MS,
  MAX_SIGNATURE_SKEW_MS,
} from "@/modules/offline/schema";

type P = { params: Promise<{ orgId: string }> };

const BUNDLE_VERSION = 1;
const SESSION_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const SESSION_LOOKAHEAD_MS = 60 * 24 * 60 * 60_000;
const MAX_SESSIONS = 500;
const MAX_PASSES = 5_000;

// GET /orgs/:orgId/sync-bundle?sessionId=... (attendance.scan)
// Versioned, least-privilege snapshot a scanner can cache before going offline:
// sessions + their policies, geofences, and bounded pass-verification material
// (verifier hashes only, never QR secrets). Server remains authoritative: every
// cached pass is revalidated when the offline batch is synced.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const generatedAt = new Date();

    if (sessionId) {
      const scoped = await prisma.attendanceSession.findUnique({ where: { id: sessionId }, select: { id: true, organizationId: true } });
      if (!scoped || scoped.organizationId !== ctx.organizationId) {
        return fail(404, "NOT_FOUND", "Session not found in this organization");
      }
    }

    const sessionWhere = sessionId
      ? { organizationId: ctx.organizationId, id: sessionId }
      : {
          organizationId: ctx.organizationId,
          startsAt: {
            gte: new Date(generatedAt.getTime() - SESSION_LOOKBACK_MS),
            lte: new Date(generatedAt.getTime() + SESSION_LOOKAHEAD_MS),
          },
        };

    const [sessions, policies, geofences, passes] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: sessionWhere,
        orderBy: { startsAt: "asc" },
        take: MAX_SESSIONS,
        select: {
          id: true,
          title: true,
          type: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          policyId: true,
        },
      }),
      prisma.attendancePolicy.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          graceMin: true,
          lateThresholdMin: true,
          duplicateWindowSec: true,
          geoMode: true,
        },
      }),
      prisma.geofence.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { label: "asc" },
        select: { id: true, label: true, centerLat: true, centerLng: true, radiusM: true },
      }),
      prisma.pass.findMany({
        where: {
          organizationId: ctx.organizationId,
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gte: generatedAt } }],
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PASSES,
        select: {
          passPublicId: true,
          version: true,
          status: true,
          expiresAt: true,
          personId: true,
          credentialHash: true,
        },
      }),
    ]);

    const bundle = {
      bundleVersion: BUNDLE_VERSION,
      generatedAt: generatedAt.toISOString(),
      organizationId: ctx.organizationId,
      sessions,
      policies,
      geofences,
      passCache: passes.map((p) => ({
        passPublicId: p.passPublicId,
        passVersion: p.version,
        statusAtSync: p.status,
        expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
        personId: p.personId,
        // SHA-256(passPublicId:secret); lets the scanner reject a bad QR offline.
        credentialHash: p.credentialHash,
      })),
      limits: {
        maxBatchEvents: MAX_BATCH_EVENTS,
        maxClientFutureSkewMs: MAX_CLIENT_FUTURE_MS,
        maxOfflineAgeMs: MAX_OFFLINE_AGE_MS,
        signatureSkewMs: MAX_SIGNATURE_SKEW_MS,
      },
    };

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "sync.bundle",
        resource: sessionId ? `session:${sessionId}` : `org:${ctx.organizationId}`,
        result: "ok",
        meta: {
          bundleVersion: BUNDLE_VERSION,
          sessions: sessions.length,
          policies: policies.length,
          geofences: geofences.length,
          passes: passes.length,
        } as never,
      },
    });

    return ok(bundle);
  } catch (e) { return handleRouteError(e); }
}
