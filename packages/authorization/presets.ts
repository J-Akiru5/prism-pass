// Four user-facing role presets layered over the seven canonical roles in
// permissions.ts. The raw role stays the source of truth for authorization;
// presets only change how the UI groups and labels those roles.
import type { Role } from "@/packages/authorization/permissions";

export type RolePreset = "OWNER" | "ADMIN" | "STAFF" | "ATTENDEE";

type RolePresetDefinition = {
  readonly label: string;
  readonly roles: readonly Role[];
  readonly defaultRole: Role;
};

// Single mapping table. To move a role between presets, change it here only.
export const ROLE_PRESETS = {
  OWNER: { label: "Owner", roles: ["OWNER"], defaultRole: "OWNER" },
  ADMIN: { label: "Admin", roles: ["ADMIN"], defaultRole: "ADMIN" },
  STAFF: {
    label: "Staff",
    roles: ["MANAGER", "SUPERVISOR", "SCANNER", "VIEWER"],
    defaultRole: "SUPERVISOR",
  },
  ATTENDEE: { label: "Attendee", roles: ["MEMBER"], defaultRole: "MEMBER" },
} as const satisfies Record<RolePreset, RolePresetDefinition>;

export const ROLE_PRESET_ORDER: readonly RolePreset[] = ["OWNER", "ADMIN", "STAFF", "ATTENDEE"];

const ROLE_TO_PRESET = new Map<Role, RolePreset>();
for (const preset of ROLE_PRESET_ORDER) {
  for (const role of ROLE_PRESETS[preset].roles) {
    if (ROLE_TO_PRESET.has(role)) {
      throw new Error(`Role ${role} is assigned to more than one preset`);
    }
    ROLE_TO_PRESET.set(role, preset);
  }
}

export function presetForRole(role: Role): RolePreset {
  const preset = ROLE_TO_PRESET.get(role);
  if (!preset) throw new Error(`Role ${role} is not assigned to a preset`);
  return preset;
}

export function rolesForPreset(preset: RolePreset): readonly Role[] {
  return ROLE_PRESETS[preset].roles;
}

export function defaultRoleForPreset(preset: RolePreset): Role {
  return ROLE_PRESETS[preset].defaultRole;
}

export function presetLabel(preset: RolePreset): string {
  return ROLE_PRESETS[preset].label;
}

// ---------------------------------------------------------------------------
// Role-change guard decisions
//
// Extracted as a pure function so the route and the tests share one contract.
// Precedence matters: cross-org is a 404 (never reveal another tenant), revoked
// is a 409, a same-role request is a no-op 200, and only then do the actor
// protections apply. Raw roles decide authority; presets never widen it.
// ---------------------------------------------------------------------------

export type MembershipStatus = "ACTIVE" | "REVOKED";

export type RoleChangeTarget = {
  id: string;
  organizationId: string;
  role: Role;
  status: MembershipStatus;
};

export type RoleChangeInput = {
  actorMembershipId: string;
  actorRole: Role;
  organizationId: string;
  target: RoleChangeTarget;
  nextRole: Role;
  /** ACTIVE OWNER rows in the same organization, used for the last-owner guard. */
  activeOwnerCount: number;
};

export type RoleChangeDeniedReason =
  | "cross_org"
  | "revoked"
  | "self_role_change"
  | "owner_or_admin_protected"
  | "last_active_owner";

export type RoleChangeDecision =
  | { allowed: true; changed: false }
  | { allowed: true; changed: true }
  | {
      allowed: false;
      reason: RoleChangeDeniedReason;
      status: 403 | 404 | 409;
      code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT";
      message: string;
    };

export function decideMembershipRoleChange(input: RoleChangeInput): RoleChangeDecision {
  const { actorMembershipId, actorRole, organizationId, target, nextRole, activeOwnerCount } = input;

  if (target.organizationId !== organizationId) {
    return {
      allowed: false,
      reason: "cross_org",
      status: 404,
      code: "NOT_FOUND",
      message: "Membership not found in this organization",
    };
  }

  if (target.status === "REVOKED") {
    return {
      allowed: false,
      reason: "revoked",
      status: 409,
      code: "CONFLICT",
      message: "Membership is revoked and cannot be changed",
    };
  }

  // A same-role request changes nothing, so it is safe even for self.
  if (nextRole === target.role) {
    return { allowed: true, changed: false };
  }

  if (target.id === actorMembershipId) {
    return {
      allowed: false,
      reason: "self_role_change",
      status: 409,
      code: "CONFLICT",
      message: "You cannot change your own role",
    };
  }

  // Only an OWNER may grant or remove OWNER, and an ADMIN cannot modify an
  // OWNER/ADMIN row or assign either role. This also protects ADMIN rows from
  // lower scoped roles that happen to carry members.manage.
  if (actorRole !== "OWNER" && (target.role === "OWNER" || target.role === "ADMIN" || nextRole === "OWNER" || nextRole === "ADMIN")) {
    return {
      allowed: false,
      reason: "owner_or_admin_protected",
      status: 403,
      code: "FORBIDDEN",
      message: "Only an OWNER can grant or change OWNER or ADMIN roles",
    };
  }

  // At least one ACTIVE OWNER must remain in the organization.
  if (target.role === "OWNER" && nextRole !== "OWNER" && activeOwnerCount <= 1) {
    return {
      allowed: false,
      reason: "last_active_owner",
      status: 409,
      code: "CONFLICT",
      message: "Cannot demote the last active OWNER",
    };
  }

  return { allowed: true, changed: true };
}
