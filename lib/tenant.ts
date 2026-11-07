import "server-only";
import { getSessionUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { roleGrants, type Permission, type Role } from "@/packages/authorization/permissions";

export type AuthContext = { userId: string; internalUserId: string; organizationId: string; role: Role; membershipId: string };
const DEMO_MEMBERSHIPS: Record<string, { org: string; role: Role }> = {};
export class AuthError extends Error { status = 401; }
export class ForbiddenError extends Error { status = 403; }

// Strict deny + service-role: org resolved from verified session via service-role REST. Never trusts browser claim.
// Uses Supabase admin REST (no Prisma engine) against lowercase live tables.
export async function requireOrganizationPermission(permission: Permission, organizationId: string): Promise<AuthContext> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthenticated");
  if (!organizationId) throw new ForbiddenError("Missing organization context");
  if (process.env.DATABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { data: internal, error: uErr } = await admin.from("users").select("id").eq("auth_id", user.id).maybeSingle();
      if (uErr) throw uErr;
      if (!internal) throw new ForbiddenError("No linked user");
      const { data: m, error: mErr } = await admin.from("memberships").select("id, role, status, organization_id").eq("organization_id", organizationId).eq("user_id", (internal as { id: string }).id).maybeSingle();
      if (mErr) throw mErr;
      if (!m || (m as { status: string }).status !== "ACTIVE") throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
      const mm = m as { id: string; role: Role; status: string };
      const { data: org, error: oErr } = await admin.from("organizations").select("status").eq("id", organizationId).maybeSingle();
      if (oErr) throw oErr;
      if (!org || (org as { status: string }).status !== "ACTIVE") throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
      const { data: overrides } = await admin.from("membership_permissions").select("permission, allow").eq("membership_id", mm.id);
      const ov = (overrides as { permission: string; allow: boolean }[] | null)?.find((o) => o.permission === permission);
      const granted = ov ? ov.allow : roleGrants(mm.role, permission);
      if (!granted) throw new ForbiddenError(`Denied ${permission} for ${mm.role}`);
      return { userId: user.id, internalUserId: (internal as { id: string }).id, organizationId, role: mm.role, membershipId: mm.id };
    } catch (e) {
      if (e instanceof AuthError || e instanceof ForbiddenError) throw e;
      // Fall through to demo only when demo explicitly wired (tests); otherwise fail closed
      const entry = DEMO_MEMBERSHIPS[`${user.id}:${organizationId}`];
      if (!entry) throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
      if (!roleGrants(entry.role, permission)) throw new ForbiddenError(`Denied ${permission} for ${entry.role}`);
      return { userId: user.id, internalUserId: user.id, organizationId, role: entry.role, membershipId: `${user.id}-${organizationId}` };
    }
  }
  const entry = DEMO_MEMBERSHIPS[`${user.id}:${organizationId}`];
  if (!entry) throw new ForbiddenError(`Denied ${permission} in ${organizationId}`);
  if (!roleGrants(entry.role, permission)) throw new ForbiddenError(`Denied ${permission} for ${entry.role}`);
  return { userId: user.id, internalUserId: user.id, organizationId, role: entry.role, membershipId: `${user.id}-${organizationId}` };
}

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Unauthenticated");
  try {
    const admin = createAdminClient();
    const { data: internal } = await admin.from("users").select("id").eq("auth_id", user.id).maybeSingle();
    if (!internal) throw new ForbiddenError("No linked user");
    const { data: pa } = await admin.from("platform_admins").select("id").eq("user_id", (internal as { id: string }).id).maybeSingle();
    if (!pa) throw new ForbiddenError("Platform admin required (org OWNER is not sufficient)");
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
