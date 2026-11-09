import { createHmac } from "crypto";
import { z } from "zod";
import { ok, fail, handleRouteError, optionalQueryId } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { deviceSyncRejection } from "@/modules/devices/revocation";
import {
  MAX_BUNDLE_GEOFENCES,
  MAX_BUNDLE_PASSES,
  MAX_BUNDLE_POLICIES,
  MAX_BUNDLE_REVOCATIONS,
  MAX_BUNDLE_ROSTER,
  MAX_BUNDLE_SESSIONS,
  SCANNER_BUNDLE_VERSION,
  bundleAuditMeta,
  capBundleList,
  type BundleRosterEntry,
  type BundleTruncated,
  type ScannerBundle,
} from "@/modules/offline/bundle-schema";
import {
  canonicalBundlePayload,
  type BundleSignable,
} from "@/modules/offline/canonical-bundle";
import {
  MAX_BATCH_EVENTS,
  MAX_CLIENT_FUTURE_MS,
  MAX_OFFLINE_AGE_MS,
  MAX_SIGNATURE_SKEW_MS,
} from "@/modules/offline/schema";

type P = { params: Promise<{ orgId: string }> };

const SESSION_LOOKBACK_MS = 30 * 24 * 60 * 60_000;
const SESSION_LOOKAHEAD_MS = 60 * 24 * 60 * 60_000;
/** Revocation rows older than the session lookback window are not bundled. */
const REVOCATION_LOOKBACK_MS = SESSION_LOOKBACK_MS;

const bundleQuery = z.object({
  sessionId: optionalQueryId,
  deviceId: optionalQueryId,
});

const bundleLimits = {
  maxBatchEvents: MAX_BATCH_EVENTS,
  maxClientFutureSkewMs: MAX_CLIENT_FUTURE_MS,
  maxOfflineAgeMs: MAX_OFFLINE_AGE_MS,
  signatureSkewMs: MAX_SIGNATURE_SKEW_MS,
  maxSessions: MAX_BUNDLE_SESSIONS,
  maxRosterEntries: MAX_BUNDLE_ROSTER,
  maxPasses: MAX_BUNDLE_PASSES,
  maxPolicies: MAX_BUNDLE_POLICIES,
  maxGeofences: MAX_BUNDLE_GEOFENCES,
  maxRevocations: MAX_BUNDLE_REVOCATIONS,
} as const;

function signBundle(secretHash: string, unsigned: BundleSignable): string {
  return createHmac("sha256", secretHash)
    .update(canonicalBundlePayload(unsigned), "utf8")
    .digest("hex");
}

/**
 * GET /orgs/:orgId/sync-bundle?sessionId=...&deviceId=... (attendance.scan)
 *
 * Versioned, least-privilege snapshot a scanner can cache before going offline.
 *
 * - With `sessionId`: the event bundle. Only that session (plus its policy and
 *   the org geofences), its `session_roster` rows joined to people and each
 *   person's current active pass, and recent pass revocations. The roster is the
 *   only admission list: unlisted active passes are deliberately excluded.
 * - Without `sessionId`: the legacy organisation-wide pass cache, bounded and
 *   flagged when truncated.
 *
 * `deviceId` turns either response into a signed v2 bundle:
 * `bundleSignature = HMAC-SHA256(device.secretHash, canonicalBundlePayload)`.
 * An unknown/cross-org device is a 404; a revoked or unregistered device is a
 * 403 with the same codes the sync endpoint uses. Without `deviceId` the
 * response is the unsigned legacy snapshot (`deviceId`/`bundleSignature` null).
 *
 * The server remains authoritative: every cached pass is revalidated when the
 * offline batch is synced (docs/security/rbac-ssot.md 12.7).
 */
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("attendance.scan", orgId);
    const { searchParams } = new URL(req.url);
    const { sessionId, deviceId: requestedDeviceId } = bundleQuery.parse(
      Object.fromEntries(searchParams),
    );
    const generatedAt = new Date();

    if (sessionId) {
      const scoped = await prisma.attendanceSession.findUnique({
        where: { id: sessionId },
        select: { id: true, organizationId: true },
      });
      if (!scoped || scoped.organizationId !== ctx.organizationId) {
        return fail(404, "NOT_FOUND", "Session not found in this organization");
      }
    }

    // A supplied device id is an authority claim: it must belong to this
    // organization and must still be allowed to sign. Unknown is 404 so the
    // response cannot confirm a device in another tenant.
    let signer: { secretHash: string } | null = null;
    if (requestedDeviceId) {
      const device = await prisma.device.findFirst({
        where: {
          organizationId: ctx.organizationId,
          OR: [{ devicePublicId: requestedDeviceId }, { id: requestedDeviceId }],
        },
        select: { secretHash: true, revokedAt: true },
      });
      if (!device) {
        return fail(404, "NOT_FOUND", "Unknown device in this organization");
      }
      const rejection = deviceSyncRejection(device);
      if (rejection) {
        return fail(rejection.status, rejection.code, rejection.message);
      }
      if (!device.secretHash) {
        // Unreachable while deviceSyncRejection covers it; keeps the signer
        // non-null for the HMAC call if the policy changes.
        return fail(403, "DEVICE_UNREGISTERED", "Device has no signing key; register it again");
      }
      signer = { secretHash: device.secretHash };
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

    const [sessionRows, geofenceRows, passRows, rosterRows, revocationRows] = await Promise.all([
      prisma.attendanceSession.findMany({
        where: sessionWhere,
        orderBy: { startsAt: "asc" },
        take: MAX_BUNDLE_SESSIONS + 1,
        select: {
          id: true,
          title: true,
          type: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          policyId: true,
          status: true,
          closedAt: true,
          rosterEnforced: true,
          walkInAllowed: true,
        },
      }),
      prisma.geofence.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { label: "asc" },
        take: MAX_BUNDLE_GEOFENCES + 1,
        select: { id: true, label: true, centerLat: true, centerLng: true, radiusM: true },
      }),
      // Event bundles intentionally do not ship the org-wide pass cache.
      sessionId
        ? Promise.resolve([])
        : prisma.pass.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: "ACTIVE",
              OR: [{ expiresAt: null }, { expiresAt: { gte: generatedAt } }],
            },
            orderBy: { createdAt: "asc" },
            take: MAX_BUNDLE_PASSES + 1,
            select: {
              passPublicId: true,
              version: true,
              status: true,
              expiresAt: true,
              personId: true,
              credentialHash: true,
            },
          }),
      // Roster + people + each person's newest active pass. Persons without an
      // active pass cannot be verified and are omitted rather than bundled
      // without credential material.
      sessionId
        ? prisma.sessionRoster.findMany({
            where: { organizationId: ctx.organizationId, sessionId },
            orderBy: { personId: "asc" },
            take: MAX_BUNDLE_ROSTER + 1,
            select: {
              personId: true,
              source: true,
              person: {
                select: {
                  displayName: true,
                  status: true,
                  passes: {
                    where: {
                      organizationId: ctx.organizationId,
                      status: "ACTIVE",
                      OR: [{ expiresAt: null }, { expiresAt: { gte: generatedAt } }],
                    },
                    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
                    take: 1,
                    select: {
                      passPublicId: true,
                      version: true,
                      credentialHash: true,
                      expiresAt: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      sessionId
        ? prisma.pass.findMany({
            where: {
              organizationId: ctx.organizationId,
              status: "REVOKED",
              revokedAt: { gte: new Date(generatedAt.getTime() - REVOCATION_LOOKBACK_MS) },
            },
            orderBy: [{ revokedAt: "desc" }, { passPublicId: "asc" }],
            take: MAX_BUNDLE_REVOCATIONS + 1,
            select: { passPublicId: true, version: true, revokedAt: true },
          })
        : Promise.resolve([]),
    ]);

    const sessionCap = capBundleList(sessionRows, MAX_BUNDLE_SESSIONS);
    const geofenceCap = capBundleList(geofenceRows, MAX_BUNDLE_GEOFENCES);
    const passCap = capBundleList(passRows, MAX_BUNDLE_PASSES);
    const rosterCap = capBundleList(rosterRows, MAX_BUNDLE_ROSTER);
    const revocationCap = capBundleList(revocationRows, MAX_BUNDLE_REVOCATIONS);

    const sessions = sessionCap.items.map((session) => ({
      id: session.id,
      title: session.title,
      type: session.type,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      timezone: session.timezone,
      policyId: session.policyId,
      status: session.status,
      closedAt: session.closedAt ? session.closedAt.toISOString() : null,
      rosterEnforced: session.rosterEnforced,
      walkInAllowed: session.walkInAllowed,
    }));

    // Only the policies referenced by the returned sessions; a bundle never
    // carries policies for sessions it does not include.
    const policyIds = [...new Set(sessions.map((session) => session.policyId))];
    const policyRows = await prisma.attendancePolicy.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: policyIds },
      },
      orderBy: { name: "asc" },
      take: MAX_BUNDLE_POLICIES + 1,
      select: {
        id: true,
        name: true,
        graceMin: true,
        lateThresholdMin: true,
        duplicateWindowSec: true,
        geoMode: true,
      },
    });
    const policyCap = capBundleList(policyRows, MAX_BUNDLE_POLICIES);

    const roster: BundleRosterEntry[] = [];
    if (sessionId) {
      for (const entry of rosterCap.items) {
        const pass = entry.person.passes[0];
        if (!pass) continue;
        roster.push({
          sessionId,
          personId: entry.personId,
          displayName: entry.person.displayName,
          passPublicId: pass.passPublicId,
          passVersion: pass.version,
          credentialHash: pass.credentialHash,
          expiresAt: pass.expiresAt ? pass.expiresAt.toISOString() : null,
          personStatus: entry.person.status,
          rosterState: entry.source.toLowerCase().includes("walk") ? "walk_in" : "listed",
        });
      }
    }

    const revocations = revocationCap.items.map((pass) => ({
      passPublicId: pass.passPublicId,
      passVersion: pass.version,
      revokedAt: (pass.revokedAt ?? generatedAt).toISOString(),
    }));

    const passCache = passCap.items.map((pass) => ({
      passPublicId: pass.passPublicId,
      passVersion: pass.version,
      statusAtSync: pass.status,
      expiresAt: pass.expiresAt ? pass.expiresAt.toISOString() : null,
      personId: pass.personId,
      credentialHash: pass.credentialHash,
    }));

    const truncated: BundleTruncated = {
      sessions: sessionCap.truncated,
      policies: policyCap.truncated,
      geofences: geofenceCap.truncated,
      roster: rosterCap.truncated,
      passes: passCap.truncated,
      revocations: revocationCap.truncated,
    };

    const unsigned: BundleSignable = {
      bundleVersion: SCANNER_BUNDLE_VERSION,
      generatedAt: generatedAt.toISOString(),
      serverTime: new Date().toISOString(),
      organizationId: ctx.organizationId,
      sessionIds: [...new Set(sessions.map((session) => session.id))],
      sessions,
      policies: policyCap.items,
      geofences: geofenceCap.items,
      roster,
      revocations,
      passCache,
      truncated,
      limits: bundleLimits,
      // Echo the requested id; registration returns the public id, and an
      // internal id is equally acceptable for lookup. The signature binds it.
      deviceId: requestedDeviceId ?? null,
    };

    const bundle: ScannerBundle = {
      ...unsigned,
      bundleSignature: signer ? signBundle(signer.secretHash, unsigned) : null,
    };

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "sync.bundle",
        resource: sessionId ? `session:${sessionId}` : `org:${ctx.organizationId}`,
        result: "ok",
        // Counts and flags only; never names, person ids, pass ids or hashes.
        meta: bundleAuditMeta({
          signed: Boolean(bundle.bundleSignature),
          sessions: sessions.length,
          policies: bundle.policies.length,
          geofences: bundle.geofences.length,
          roster: roster.length,
          revocations: revocations.length,
          passes: passCache.length,
          truncated,
        }) as never,
      },
    });

    return ok(bundle);
  } catch (e) { return handleRouteError(e); }
}
