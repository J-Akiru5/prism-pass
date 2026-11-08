import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformActor } from "@/lib/platform";
import {
  decideAdminGrant,
  grantPlatformAdminInput,
  shapePlatformAdminRow,
} from "@/modules/platform/console";

/**
 * Platform admin grants.
 *
 * The PlatformAdmin row is the only source of platform authority (ADR-11); an
 * organization OWNER never appears here. Grant by internal user id or e-mail,
 * resolve the id server-side, refuse duplicates, and record the reason.
 */
export async function GET() {
  try {
    const actor = await requirePlatformActor();
    const grants = await prisma.platformAdmin.findMany({
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
      select: { userId: true, createdAt: true },
    });
    const users = grants.length
      ? await prisma.user.findMany({
          where: { id: { in: grants.map((grant) => grant.userId) } },
          select: { id: true, email: true },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));
    return ok(
      grants.map((grant) =>
        shapePlatformAdminRow({ ...grant, user: byId.get(grant.userId) }, actor.internalUserId),
      ),
      { total: grants.length, selfUserId: actor.internalUserId },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const actor = await requirePlatformActor();
    const input = grantPlatformAdminInput.parse(await req.json());

    const user = input.email
      ? await prisma.user
          .findMany({
            where: { email: { equals: input.email, mode: "insensitive" } },
            take: 2,
            select: { id: true, email: true },
          })
          .then((matches) => {
            if (matches.length > 1) return "AMBIGUOUS" as const;
            return matches[0] ?? null;
          })
      : await prisma.user.findUnique({
          where: { id: input.userId as string },
          select: { id: true, email: true },
        });

    if (user === "AMBIGUOUS") {
      return fail(
        409,
        "AMBIGUOUS_EMAIL",
        "More than one internal user matches that e-mail. Grant by user id instead.",
      );
    }

    const existing = user
      ? await prisma.platformAdmin.findUnique({ where: { userId: user.id }, select: { userId: true } })
      : null;

    const decision = decideAdminGrant({ userExists: Boolean(user), alreadyAdmin: Boolean(existing) });
    if (!user || !decision.allowed) {
      const code = decision.allowed ? "USER_NOT_FOUND" : decision.code;
      const message = decision.allowed ? "User not found" : decision.message;
      return fail(code === "USER_NOT_FOUND" ? 404 : 409, code, message);
    }

    await prisma.$transaction(async (tx) => {
      await tx.platformAdmin.create({ data: { userId: user.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.internalUserId,
          action: "platform.admin.grant",
          resource: `user:${user.id}`,
          result: "ok",
          meta: {
            scope: "platform",
            reason: input.reason,
            via: input.email ? "email" : "userId",
          } as never,
        },
      });
    });

    const created = await prisma.platformAdmin.findUnique({
      where: { userId: user.id },
      select: { userId: true, createdAt: true },
    });

    return ok(
      shapePlatformAdminRow({ userId: user.id, createdAt: created?.createdAt, user }, actor.internalUserId),
    );
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
      return fail(409, "ALREADY_PLATFORM_ADMIN", "That user is already a platform admin.");
    }
    return handleRouteError(e);
  }
}
