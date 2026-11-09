import { fail, handleRouteError, ok } from "@/lib/api";
import { decideProvision, ensureInternalUser, normalizeEmail } from "@/lib/auth/provision";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Link the current Supabase Auth identity to an internal `users` row.
 *
 * The request body is intentionally ignored: the auth id and email come only
 * from the verified Supabase session. The endpoint creates no organization,
 * membership, platform admin, or organization-scoped audit row.
 */
export async function POST() {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "UNAUTHENTICATED", "Sign in required");

    const decision = decideProvision({
      authenticated: true,
      emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    });
    if (!decision.allowed) return fail(403, decision.code, decision.message);

    const email = normalizeEmail(user.email);
    if (!email) return fail(403, "EMAIL_NOT_CONFIRMED", "The verified account has no email address");

    const internal = await ensureInternalUser({ authId: user.id, email });
    return ok({ internalUserId: internal.id, email: internal.email ?? email });
  } catch (e) {
    return handleRouteError(e);
  }
}
