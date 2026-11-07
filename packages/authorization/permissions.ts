// Canonical permissions — mirrors docs/security/permission-matrix.md
export const PERMISSIONS = [
  "organization.manage",
  "members.manage",
  "passes.revoke",
  "attendance.scan",
  "attendance.override",
  "attendance.approve",
  "documents.sign",
  "documents.manage",
  "reports.export",
  "geofences.manage",
  "devices.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type Role = "OWNER" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "SCANNER" | "MEMBER" | "VIEWER";
export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  OWNER: [...PERMISSIONS],
  ADMIN: [...PERMISSIONS],
  MANAGER: ["members.manage","passes.revoke","attendance.scan","attendance.override","attendance.approve","documents.manage","documents.sign","reports.export","geofences.manage","devices.manage"],
  SUPERVISOR: ["attendance.scan","attendance.override","attendance.approve","documents.sign","reports.export"],
  SCANNER: ["attendance.scan"],
  MEMBER: ["documents.sign"],
  VIEWER: [],
};
export function roleGrants(role: Role, permission: Permission): boolean {
  return ROLE_DEFAULTS[role]?.includes(permission) ?? false;
}
