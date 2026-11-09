# ADR-13 — Platform RBAC: fixed roles, tenant scopes, sensitive-action controls

Status: Proposed. Replaces the binary `platform_admins` grant with
`platform_role_assignments` (five fixed roles + explicit tenant scope),
permission-namespaced gates (`platform.*`), and step-up/dual control for
sensitive actions. Platform authority remains separate from organization
membership (ADR-11); a tenant OWNER never gains platform rights, and a platform
role never implies tenant membership. Cross-plane access is only an audited,
time-boxed support session attributed to the platform actor.

Rejected alternatives: keeping the binary grant (no least privilege, no
separation of duties); per-customer custom roles now (role explosion, no stable
catalog yet); an external policy engine (Cedar/OPA/SpiceDB) before the policy
module exists (operational cost without a complexity problem).

Reversibility: the new tables are additive; `platform_admins` is backfilled and
dual-written before removal. The permission catalog and pure policy module are
the seam if custom roles or an external engine are needed later.

Refs: [platform-rbac.md](../security/platform-rbac.md), ADR-11,
permission-matrix.md.
