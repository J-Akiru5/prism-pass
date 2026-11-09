# ADR-13 — RBAC: one Superadmin, four tenant base roles, tenant custom roles

Status: Proposed — target M6 (after the pilot). The pilot keeps the seven
existing backend roles and shows four presets in the UI; the full migration is
deferred. Replaces the binary `platform_admins` grant and the seven-role tenant
enum with:

- one platform role, `SUPERADMIN` (multiple holders, god mode, audited, MFA);
- four tenant base roles: `OWNER`, `TENANT_ADMIN`, `STAFF`, `ATTENDEE`;
- a global capability catalogue and immutable global defaults;
- tenant-specific custom roles created by a Superadmin from a base role;
- multiple roles per membership, plus per-user allow/deny overrides within the
  base-role ceiling.

A Tenant Admin assigns roles and tunes per-user overrides but cannot create or
rename roles, modify the Owner, or grant a capability outside the base ceiling.
The Owner is view-only by default and keeps protected ownership powers (billing,
Tenant Admin appointment, ownership transfer, tenant retirement).

Rejected alternatives: five platform personas (over-modelled for the current
team); per-user permissions as the primary model (unreviewable); tenant-invented
capabilities (no stable security contract); custom roles based on Owner
(ownership is a singleton protection, not a template).

Reversibility: the new tables are additive. `memberships.role` and
`permission-matrix.md` remain for one release while the new resolver is
dual-read; rollback is a feature flag, not a data restore.

Refs: [rbac-ssot.md](../security/rbac-ssot.md), ADR-11.
