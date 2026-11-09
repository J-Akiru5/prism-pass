/**
 * Account provisioning for self-serve sign-up.
 *
 * Sign-up writes the Supabase Auth user; this module links that identity to the
 * internal `users` row. It deliberately creates nothing else: no organization,
 * membership, platform admin, or organization-scoped audit row. Access is
 * granted later by an administrator through the existing membership flow.
 */

export type ProvisionDecision =
  | { allowed: true; code: "OK"; message: string }
  | { allowed: false; code: "UNAUTHENTICATED" | "EMAIL_NOT_CONFIRMED"; message: string };

/**
 * Pure eligibility policy, kept separate from Prisma so it is unit-testable
 * without a database or a live Supabase project.
 */
export function decideProvision({ authenticated, emailConfirmed }: { authenticated: boolean; emailConfirmed: boolean }): ProvisionDecision {
  if (!authenticated) {
    return { allowed: false, code: "UNAUTHENTICATED", message: "Sign in required" };
  }
  if (!emailConfirmed) {
    return { allowed: false, code: "EMAIL_NOT_CONFIRMED", message: "Confirm your email address before provisioning an account" };
  }
  return { allowed: true, code: "OK", message: "Eligible for provisioning" };
}

/**
 * Trim and lower-case an address before it is stored or compared. Supabase
 * normalizes addresses on its side; doing the same here keeps the internal row
 * stable across repeated provisioning calls.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export type InternalUser = { id: string; email: string | null };

/**
 * Idempotently create or refresh the internal user linked to a verified
 * Supabase Auth identity. The auth id is the only lookup key; callers must take
 * it from the verified session, never from a request body.
 *
 * The Prisma module is imported lazily so unit tests of the pure policy above
 * do not need a generated Prisma client or a database connection.
 */
export async function ensureInternalUser({ authId, email }: { authId: string; email: string }): Promise<InternalUser> {
  const normalizedAuthId = authId.trim();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedAuthId) throw new Error("authId is required");
  if (!normalizedEmail) throw new Error("email is required");

  const { prisma } = await import("@/lib/db");
  return prisma.user.upsert({
    where: { authId: normalizedAuthId },
    update: { email: normalizedEmail },
    create: { authId: normalizedAuthId, email: normalizedEmail },
    select: { id: true, email: true },
  });
}
