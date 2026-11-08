import "server-only";
import { prisma } from "@/lib/db";
import { ForbiddenError, requirePlatformAdmin } from "@/lib/tenant";

/**
 * Platform console actor resolution.
 *
 * `requirePlatformAdmin` proves the grant; audit rows need the *internal* user
 * id, and a few responses need "is this me?" for self-revoke protection. This
 * helper resolves both in one place instead of widening the tenant helper's
 * contract. It never returns the Supabase auth id to a response.
 */
export type PlatformActor = {
  /** Supabase auth user id — server-only. */
  authId: string;
  /** Internal users.id used by audit_logs.actor_user_id. */
  internalUserId: string;
  email: string | null;
};

export async function requirePlatformActor(): Promise<PlatformActor> {
  const { userId } = await requirePlatformAdmin();
  const internal = await prisma.user.findUnique({
    where: { authId: userId },
    select: { id: true, email: true },
  });
  if (!internal) throw new ForbiddenError("Platform admin is not linked to an internal user");
  return { authId: userId, internalUserId: internal.id, email: internal.email };
}
