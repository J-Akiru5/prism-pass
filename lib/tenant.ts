import "server-only";
import { getSessionUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { roleGrants, type Permission, type Role } from "@/packages/authorization/permissions";

export type AuthContext = { userId: string; internalUserId: string; organizationId: string; role: Role; membershipId: string };
const DEMO_MEMBERSHIPS: Record<string, { org: string; role: Role }> = {};
export class AuthError extends Error { status = 401; }
export class ForbiddenError extends Error { status = 403; }

// Strict deny + service-role: the org is resolved from the verified session and a
// single membership query, never from a browser claim. One Prisma round trip beats
// the previous four sequential Supabase REST calls (users -> memberships -> org ->
// overrides), which cost seconds per request on a cross-region pooler.
export async function requireOrganizationPermission(permission: Permission, organizationId: string): Promise<AuthContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthenticated");
  if (!organizationId) throw new ForbiddenError("Missing organization context");
  try {
    const internal = await prisma.user.findUnique({
      where: { authId: user.id },
      select: {
        id: true,
        memberships: {
          where: { organizationId },
          select: {
            id: true,
            role: true,
            status: true,
            overrides: { select: { permission: true, allow: true } },
            organization: { select: { status: true } },
          },
        },
      },
    });
    if (!internal) throw new ForbiddenError("No linked user");
    const m = internal.memberships[0];
    if (!m || m.status !== "ACTIVE") throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
    if (m.organization.status !== "ACTIVE") throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
    const override = m.overrides.find((o) => o.permission === permission);
    const granted = override ? override.allow : roleGrants(m.role as Role, permission);
    if (!granted) throw new ForbiddenError(`Denied ${permission} for ${m.role}`);
    return {
      userId: user.id,
      internalUserId: internal.id,
      organizationId,
      role: m.role as Role,
      membershipId: m.id,
    };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) throw e;
    // Fall through to demo only when demo explicitly wired (tests); otherwise fail closed.
    const entry = DEMO_MEMBERSHIPS[`${user.id}:${organizationId}`];
    if (!entry) throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
    if (!roleGrants(entry.role, permission)) throw new ForbiddenError(`Denied ${permission} for ${entry.role}`);
    return { userId: user.id, internalUserId: user.id, organizationId, role: entry.role, membershipId: `${user.id}-${organizationId}` };
  }
}

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthenticated");
  try {
    const internal = await prisma.user.findUnique({
      where: { authId: user.id },
      select: { id: true },
    });
    if (!internal) throw new ForbiddenError("No linked user");
    const admin = await prisma.platformAdmin.findUnique({ where: { userId: internal.id } });
    if (!admin) throw new ForbiddenError("Platform admin required (org OWNER is not sufficient)");
    return { userId: user.id };
  } catch (e) {
    if (e instanceof AuthError || e instanceof ForbiddenError) throw e;
    throw new ForbiddenError("Platform admin required");
  }
}

export function __setDemoMembership(userId: string, organizationId: string, role: Role) {
  DEMO_MEMBERSHIPS[`${userId}:${organizationId}`] = { org: organizationId, role };
}
export function __clearDemo() { for (const k of Object.keys(DEMO_MEMBERSHIPS)) delete DEMO_MEMBERSHIPS[k]; }
