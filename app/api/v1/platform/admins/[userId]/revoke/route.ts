import { Prisma } from "@prisma/client";
import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformActor } from "@/lib/platform";
import {
  decideAdminRevoke,
  NO_PLATFORM_ADMIN_GRANT_RULE,
  revokePlatformAdminInput,
} from "@/modules/platform/console";

type P = { params: Promise<{ userId: string }> };

/**
 * Read the revoke reason from a JSON body (POST) or the `reason` query param
 * (DELETE, where some clients cannot send a body). Validation is identical.
 */
async function readReason(req: Request): Promise<string | undefined> {
  const fromQuery = new URL(req.url).searchParams.get("reason");
  if (fromQuery) return fromQuery;
  if (!req.headers.get("content-type")?.includes("application/json")) return undefined;
  const text = await req.text();
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as { reason?: unknown };
    return typeof parsed.reason === "string" ? parsed.reason : undefined;
  } catch {
    return undefined;
  }
}

async function revoke(req: Request, { params }: P) {
  try {
    const { userId } = await params;
    const actor = await requirePlatformActor();
    // Parsed after the gate so an unauthenticated caller never learns whether
    // the target exists, and never sees validation detail.
    const { reason } = revokePlatformAdminInput.parse({ reason: await readReason(req) });

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.platformAdmin.findUnique({
          where: { userId },
          select: { userId: true },
        });
        if (!existing) {
          return { kind: "denied" as const, status: 404, code: "NO_GRANT", message: NO_PLATFORM_ADMIN_GRANT_RULE };
        }

        const activePlatformAdmins = await tx.platformAdmin.count();
        const decision = decideAdminRevoke({
          targetHasGrant: true,
          targetIsSelf: userId === actor.internalUserId,
          activePlatformAdmins,
        });
        if (!decision.allowed) {
          return { kind: "denied" as const, status: 409, code: decision.code, message: decision.message };
        }

        await tx.platformAdmin.delete({ where: { userId } });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.internalUserId,
            action: "platform.admin.revoke",
            resource: `user:${userId}`,
            result: "ok",
            meta: { scope: "platform", reason } as never,
          },
        });
        return { kind: "ok" as const };
      },
      // Serializable: two concurrent revokes must not both observe "two admins"
      // and leave the platform with zero. One transaction aborts with P2034.
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.kind === "denied") return fail(result.status, result.code, result.message);
    return ok({ userId, revoked: true });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2034") {
      return fail(409, "CONFLICT", "Another platform admin change was in flight. Refresh and try again.");
    }
    return handleRouteError(e);
  }
}

export async function POST(req: Request, ctx: P) {
  return revoke(req, ctx);
}

export async function DELETE(req: Request, ctx: P) {
  return revoke(req, ctx);
}
