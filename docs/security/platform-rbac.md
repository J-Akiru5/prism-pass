# Platform RBAC — enterprise superadmin dashboard

Status: **Proposed**. Scope: the `/platform` control plane. Related:
[ADR-11](../decisions/ADR-11-separate-platform-admin.md) (two-plane separation, still
normative) and [permission-matrix.md](permission-matrix.md) (tenant plane, unchanged).

## 1. The problem

A row in `platform_admins` is a single binary grant. Every holder gets the same
console: suspend any tenant, change any plan, read any member list, export the
cross-tenant audit ledger, and grant or revoke other platform admins. The only
guard rails today are "cannot revoke yourself" and "at least one admin must
remain."

That is not an enterprise control plane. It cannot answer:

- Can a support engineer read a tenant's members without also being able to
  suspend that tenant?
- Can finance change a plan without seeing people's e-mail addresses?
- Can a security auditor read the audit ledger without being able to mutate
  anything?
- Who approved the suspension of a customer at 02:00, and from which session?
- What happens when a platform account is compromised?

The fix is not more rows in `platform_admins`. It is **least privilege,
separation of duties, time bounds and attributable evidence** — with the
dashboard rendered from that policy.

## 2. Frame check

"The superadmin dashboard" conflates two different things:

1. **The everyday platform console** — tenant lifecycle, support, commercial
   operations, audit. Most operators need parts of this.
2. **Break-glass superadmin authority** — managing platform access, destructive
   tenant actions, security configuration. Very few people should hold this.

Enterprise-grade means most operators never hold the second. Keep
"Superadmin" as the UI label for `PLATFORM_OWNER`, but implement it as a rare,
guarded role rather than the default admin.

## 3. Current state (verified)

| Fact | Evidence |
|---|---|
| Platform access is presence-only | `platform_admins` has `user_id`, `created_at`, nullable `organization_id`; no role, status, expiry or grantor (`prisma/schema.prisma:131`) |
| Every platform route uses the same gate | `requirePlatformAdmin()` checks only that a row exists (`lib/tenant.ts:60`) |
| Platform and tenant authority are separate | `platform_admins` is checked independently of `memberships`; ADR-11 |
| Platform console is read-mostly | overview, tenant lifecycle, plans, admins, audit, health (`app/(platform)/platform/*`) |
| Tenant RBAC is already granular | 7 roles × 11 permissions + per-membership overrides, deny wins (`packages/authorization/permissions.ts`, `docs/security/permission-matrix.md`) |
| Audit is shared and not tamper-evident | `audit_logs` has actor/action/resource/result/meta; no role snapshot, request id, IP or hash chain (`prisma/schema.prisma:472`) |
| No step-up, dual control or support sessions | no matching code in `app/`, `lib/`, `modules/` |
| Revocation destroys history | revoking an admin deletes the `platform_admins` row |
| Every signed-in user sees the Platform card | `app/consoles/page.tsx` renders it unconditionally, then the route returns 403 |
| DB failures look like authorization failures | `requirePlatformAdmin` converts unexpected errors to `ForbiddenError` |

Two smaller issues worth fixing with the migration:

- `platform_admins.organization_id` is written by the seed but read by no
  authorization path. It is ambiguous legacy; do **not** build tenant scoping
  on it. Use an explicit join table.
- The current gate performs two sequential lookups (user, then admin). The new
  resolver can load assignments in one query.

## 4. Target model

### 4.1 Two planes, one policy style

```
Platform plane (Syntaxure staff)          Tenant plane (customer)
platform_role_assignments                 memberships + overrides
  roles, tenant scope, expiry               roles, campus/program scope
        │                                          │
        └──────────► request authorization ◄───────┘
                     never merged, never inferred
```

A platform role never implies tenant membership. A tenant OWNER — even of every
tenant — never implies platform access. Cross-plane access is only an explicit,
time-boxed support session (section 7).

### 4.2 Platform roles

Five fixed roles. Fixed roles are deliberate: role explosion is the usual
failure mode of "enterprise RBAC", and a stable permission catalog can support
custom roles later without changing the enforcement seam.

| Role | Purpose | Typical holder | Default scope |
|---|---|---|---|
| `PLATFORM_OWNER` | Platform access control, destructive tenant actions, security config. Break-glass. | CTO / Head of Platform (2–3 people) | Global |
| `PLATFORM_ADMIN` | Day-to-day tenant lifecycle, plans, entitlements, feature flags, support approvals | Platform operations lead | Global |
| `PLATFORM_SUPPORT` | Tenant support: read metadata/members/audit for assigned tenants; time-boxed support sessions | Support engineers | Assigned tenants |
| `PLATFORM_BILLING` | Plans, subscriptions, entitlement changes; no people data | Finance / RevOps | Global, commercial only |
| `PLATFORM_AUDITOR` | Read-only audit, access review, compliance export | Security / compliance | Global, read-only |

Rank is `OWNER 100 > ADMIN 80 > BILLING 60 > SUPPORT 50 > AUDITOR 40`. A caller
can never grant or modify an assignment at or above their own rank, and can
never modify their own assignment.

Optional later: `PLATFORM_ENGINEER` for health, jobs and flags without tenant
PII. Do not add it until there is a real holder; ADMIN covers it today.

### 4.3 Permission catalog

Org permissions keep their current names. Platform permissions are namespaced
and never reused inside a tenant check.

| Permission | Meaning | Sensitive |
|---|---|---|
| `platform.overview.read` | Deployment-level counts and activity | |
| `platform.org.read` | Tenant identity, status, counts | |
| `platform.member.read` | Tenant member e-mail/role/status list | PII |
| `platform.plan.read` | Plan and entitlements | |
| `platform.audit.read` | Cross-tenant audit ledger | |
| `platform.access.read` | Platform assignments and roles | |
| `platform.health.read` | App/database/migration health | |
| `platform.billing.read` | Commercial view | |
| `platform.org.create` | Provision a tenant | |
| `platform.org.suspend` | Suspend a tenant | **S** |
| `platform.org.reactivate` | Reactivate a tenant | |
| `platform.org.retire` | Request/approve retirement | **S + D** |
| `platform.plan.update` | Change plan | **S** |
| `platform.entitlement.update` | Change entitlements | **S** |
| `platform.access.grant` | Grant an assignment | **S** |
| `platform.access.revoke` | Revoke an assignment | **S** |
| `platform.audit.export` | Export audit rows | **S** |
| `platform.support.request` | Request a support session | |
| `platform.support.approve` | Approve a support session | **S** |
| `platform.support.use` | Act inside an approved session | **S** |
| `platform.feature_flag.manage` | Toggle tenant/platform flags | **S** |
| `platform.config.update` | Platform-wide configuration | **S + D** |
| `platform.data.export` | Bulk tenant data export (DSAR) | **S + D** |
| `platform.data.erase` | Erasure request execution | **S + D** |

`S` = reason + step-up required. `D` = dual control (second approver).
`platform.security_event.read` and `platform.job.run` are reserved for phase 4;
do not implement empty permissions.

### 4.4 Role → permission matrix

`scoped` means the grant only applies inside the assignment's tenant set.
`own` means the actor can read their own assignment but not modify it.

| Permission | OWNER | ADMIN | SUPPORT | BILLING | AUDITOR |
|---|---|---|---|---|---|
| `platform.overview.read` | ✅ | ✅ | ✅ scoped | ✅ | ✅ |
| `platform.org.read` | ✅ | ✅ | ✅ scoped | ✅ | ✅ |
| `platform.member.read` | ✅ | ✅ | ✅ scoped | — | ✅ masked |
| `platform.plan.read` | ✅ | ✅ | ✅ scoped | ✅ | ✅ |
| `platform.audit.read` | ✅ | ✅ | ✅ scoped | — | ✅ |
| `platform.access.read` | ✅ | ✅ | own | — | ✅ |
| `platform.health.read` | ✅ | ✅ | ✅ basic | — | — |
| `platform.billing.read` | ✅ | ✅ | — | ✅ | — |
| `platform.org.create` | ✅ | ✅ | — | — | — |
| `platform.org.suspend` | ✅ | ✅ | — | — | — |
| `platform.org.reactivate` | ✅ | ✅ | — | — | — |
| `platform.org.retire` | ✅ | request | — | — | — |
| `platform.plan.update` | ✅ | ✅ | — | ✅ | — |
| `platform.entitlement.update` | ✅ | ✅ | — | ✅ | — |
| `platform.access.grant` | ✅ all | ✅ SUPPORT/AUDITOR | — | — | — |
| `platform.access.revoke` | ✅ all | ✅ SUPPORT/AUDITOR | — | — | — |
| `platform.audit.export` | ✅ | — | — | — | ✅ |
| `platform.support.request` | ✅ | ✅ | ✅ | — | — |
| `platform.support.approve` | ✅ | ✅ | — | — | — |
| `platform.support.use` | ✅ | ✅ | ✅ | — | — |
| `platform.feature_flag.manage` | ✅ | ✅ | — | — | — |
| `platform.config.update` | ✅ | — | — | — | — |
| `platform.data.export` | ✅ | — | — | — | ✅ |
| `platform.data.erase` | ✅ | — | — | — | — |

Deliberate omissions:

- **BILLING cannot read people.** Commercial operations do not require member
  e-mail addresses.
- **SUPPORT cannot suspend, change plans, grant access or export.** The most
  common compromised-account path should not be able to take a customer down.
- **AUDITOR cannot mutate anything, including access.** Audit access is
  read-only by construction.
- **ADMIN cannot manage ADMIN/OWNER/BILLING or change platform config.** Access
  control and security configuration stay with OWNER.

### 4.5 Scopes and time bounds

An assignment carries:

- `scope_type`: `GLOBAL` or `TENANTS`
- zero or more `organization_id`s when `TENANTS`
- optional `expires_at` (support and contractors should always have one)
- `status`: `ACTIVE` or `REVOKED`

Rules:

1. A tenant-bound request requires an assignment whose scope contains that
   organization.
2. Cross-tenant reads (overview, global audit) require `GLOBAL`. A tenant-scoped
   audit read returns only rows for its tenants.
3. New tenants are **not** automatically in any support scope. Assignment is an
   explicit act.
4. Expired or revoked assignments fail closed on the next request; no cached
   allow survives the expiry window.
5. `REGION`/`POD` scope is future work; it needs a region attribute on
   `organizations` that does not exist today.

## 5. Enforcement architecture

### 5.1 Gate

Replace every `requirePlatformAdmin()` call with a permission-specific gate:

```ts
// Phase 1: authenticate and authorize before parsing input.
const actor = await requirePlatformPermission("platform.org.suspend", {
  organizationId,
});

// Phase 2: after zod validation, immediately before the mutation.
assertSensitiveAction(actor, "platform.org.suspend", {
  reason: input.reason,
  approvalId: input.approvalId,
  stepUp: true, // verifies a fresh AAL2 window
});
```

`requirePlatformPermission(permission, opts)` runs in this order:

1. Verify the Supabase session (`getSessionUser`).
2. Resolve the internal user id.
3. Load active, unexpired assignments + role defaults + tenant scopes in one
   query; reject an empty result.
4. Check scope for `opts.organizationId`.
5. Return `PlatformActor` (internal user id, auth id, roles, permissions,
   scope, assignment ids, assurance level).
6. On denial, write `audit_logs(result="denied")` with the permission and
   reason code, then throw `ForbiddenError`.

`assertSensitiveAction` runs **after** the body is validated so it can require a
reason, a fresh step-up and a dual-control approval without parsing
untrusted input before authorization. It writes the allow audit row; the
mutation and audit row share a transaction.

Keep `requirePlatformAdmin()` as a deprecated alias that maps to
`platform.overview.read` only during the migration, then delete it. Do not leave
two authorities in place.

### 5.2 Pure policy module

`packages/authorization/platform.ts` mirrors the org policy module:

```ts
export const PLATFORM_PERMISSIONS = [...] as const;
export const PLATFORM_ROLES = [...] as const;
export const PLATFORM_ROLE_DEFAULTS: Record<PlatformRole, PlatformPermission[]>;

export function platformRoleGrants(role, permission): boolean;
export function scopeAllows(assignment, organizationId?): boolean;
export function isSensitive(permission): boolean;
export function requiresDualControl(permission): boolean;
export function canGrantRole(actorRoles, targetRole): boolean;
export function resolvePlatformPermissions(assignments): PlatformPermission[];
```

Everything here is pure and unit-testable without a database, matching the
existing `modules/platform/console.ts` pattern. Route handlers stay thin: gate
first, parse with zod, query, shape through allowlists.

### 5.3 UI is not authorization

- The layout calls the gate for render, and the nav is filtered by the actor's
  permission set.
- Every page re-checks its own permission and shows a 403 panel naming what is
  required.
- Every API route re-checks independently. Hiding a button is never a control.
- The client receives only the serialized permission list needed for rendering,
  never role-independent authority or another tenant's scope.
- `app/consoles/page.tsx` shows the Platform card only when the user holds at
  least one active platform assignment, and labels the role and scope.

### 5.4 Error semantics

- `401` unauthenticated.
- `403` authenticated but not permitted (audited).
- `409` policy refusal (last owner, self-modification, dual-control conflict).
- `503` database unavailable — **never** a 403. The current gate turns a DB
  outage into "you are not an admin"; the new resolver must distinguish
  infrastructure failure from authorization failure.

### 5.5 Guards

- **Last owner.** At least one active `PLATFORM_OWNER` assignment must remain;
  two is the operational target. Revoking or downgrading the last owner is
  refused. The count and update run in a serializable transaction, as the
  current last-admin rule does.
- **Self-modification.** No one can revoke or downgrade their own assignment,
  or approve their own access/support request.
- **Rank.** No one can grant or modify an assignment at or above their rank;
  only OWNER manages OWNER/ADMIN/BILLING.
- **Session invalidation.** Revoking an assignment increments a per-user
  authorization version; the gate checks it, and the platform console calls
  Supabase sign-out for that user's sessions.

## 6. Sensitive-action controls

| Action | Reason | Step-up | Dual control | Additional |
|---|---|---|---|---|
| Suspend tenant | ✅ | ✅ | — | notify org OWNER + incident channel |
| Retire tenant | ✅ | ✅ | ✅ | 7-day grace, typed confirmation |
| Plan / entitlement change | ✅ | ✅ | — | billing notification |
| Grant/revoke OWNER/ADMIN/BILLING | ✅ | ✅ | ✅ | cannot self-modify |
| Grant/revoke SUPPORT/AUDITOR | ✅ | ✅ | — | ADMIN may do it |
| Audit export | ✅ | ✅ | — | 5,000-row cap, rate limit, watermark |
| Member list read | — | — | — | audit event (PII) |
| Support session (read) | ✅ | ✅ | — | 60 min, ticket ref |
| Support session (write) | ✅ | ✅ | ✅ | 30 min, ticket ref, banner |
| Data export / erase | ✅ | ✅ | ✅ | DPO approval, tenant notification |

Mechanics:

- **Step-up** is a fresh AAL2 assertion (Supabase MFA) within 15 minutes,
  checked server-side from the session's assurance level/`amr`, never from a
  client claim. If Supabase passkeys are unavailable on the current plan, TOTP
  is the baseline; verify the platform capability before committing UI copy.
- **Dual control** is a `platform_access_requests` row: a second eligible actor
  approves a specific permission + tenant + reason + expiry. The acting request
  must carry the approval id; the approver cannot be the requester; the
  approval is single-use and expires. The bootstrap owner grant is the one
  exception: it is performed by a reviewed ops script with a recorded reason,
  not through the console.
- **Reason** is a bounded string (10–280 chars) stored on the audit row and the
  request. The existing console already requires this for some actions; make it
  universal for mutations.
- **Incident escape hatch.** An OWNER can execute a destructive action without
  a second approver only by opening a recorded break-glass incident, which
  alerts the security channel and is reviewed after the fact. This is not a
  silent bypass.

## 7. Support access (break-glass, audited)

ADR-11 calls for controlled, time-boxed impersonation. Design:

1. `PLATFORM_SUPPORT` requests a session for one tenant, mode `READ` or
   `WRITE`, reason + ticket reference, duration ≤ 60 minutes.
2. `READ` may be auto-approved for support; `WRITE` requires ADMIN/OWNER
   approval by a different person.
3. The session is a server-side row. A signed, `HttpOnly` cookie scoped to the
   tenant route carries the session id; it is not a user token and grants no
   platform rights.
4. `requireOrganizationPermission` gains an explicit support-session path:
   it returns `actorType: "SUPPORT"`, the support actor as the audit actor, and
   a read-only constraint unless mode is `WRITE`.
5. The tenant UI shows a persistent support banner. The tenant OWNER sees the
   session in their own audit log, with actor, reason and mode.
6. Sessions expire automatically, can be ended early, and every request inside
   the session carries `support_session_id` on the audit row.
7. "View as user" for debugging is read-only, masks PII by default, and never
   issues the target user's credentials.

The important invariant: **audit attribution stays with the support actor**.
Do not implement this as logging in as the customer; that destroys attribution
and turns a support tool into an account-takeover primitive.

## 8. Data model (additive migration `0009_platform_rbac.sql`)

The DDL below is illustrative; the final migration must follow the existing
snake_case conventions and Prisma mapping rules.

```sql
create type platform_role as enum
  ('PLATFORM_OWNER','PLATFORM_ADMIN','PLATFORM_SUPPORT','PLATFORM_BILLING','PLATFORM_AUDITOR');
create type platform_assignment_status as enum ('ACTIVE','REVOKED');
create type platform_scope_type as enum ('GLOBAL','TENANTS');

create table platform_role_assignments (
  id                  text primary key,
  user_id             text not null references users(id),
  role                platform_role not null,
  scope_type          platform_scope_type not null default 'GLOBAL',
  status              platform_assignment_status not null default 'ACTIVE',
  expires_at          timestamptz,
  granted_by_user_id  text references users(id),
  granted_at          timestamptz not null default now(),
  revoked_at          timestamptz,
  revoked_by_user_id  text references users(id),
  reason              text not null
);
create index on platform_role_assignments (user_id, status);
create index on platform_role_assignments (role, status);

create table platform_assignment_orgs (
  assignment_id   text not null references platform_role_assignments(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  primary key (assignment_id, organization_id)
);
create index on platform_assignment_orgs (organization_id);

create table platform_access_requests (
  id                    text primary key,
  requested_by_user_id  text not null references users(id),
  permission            text not null,
  organization_id       text references organizations(id),
  reason                text not null,
  ticket_ref            text,
  status                text not null default 'PENDING',
  approved_by_user_id   text references users(id),
  approved_at           timestamptz,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now()
);

create table platform_support_sessions (
  id                    text primary key,
  actor_user_id         text not null references users(id),
  subject_user_id       text references users(id),
  organization_id       text not null references organizations(id),
  mode                  text not null check (mode in ('READ','WRITE')),
  reason                text not null,
  ticket_ref            text not null,
  approved_by_user_id   text references users(id),
  status                text not null default 'ACTIVE',
  started_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  ended_at              timestamptz,
  request_id            text,
  ip_hash               text,
  user_agent            text
);
```

Audit additions (same migration, nullable so existing writers keep working):

```sql
alter table audit_logs add column actor_role text;
alter table audit_logs add column actor_scope text;
alter table audit_logs add column request_id text;
alter table audit_logs add column ip_hash text;
alter table audit_logs add column user_agent text;
alter table audit_logs add column approval_id text;
alter table audit_logs add column support_session_id text;
create index on audit_logs (request_id);
create index on audit_logs (action, created_at);
```

Backfill:

```sql
insert into platform_role_assignments
  (id, user_id, role, scope_type, status, granted_at, reason)
select 'pra_' || id, user_id, 'PLATFORM_ADMIN', 'GLOBAL', 'ACTIVE', created_at,
       'Backfill from platform_admins'
from platform_admins;
```

Then designate two `PLATFORM_OWNER`s through a reviewed ops script or seed.
Never infer ownership from "first row" or `created_at`.

Migration sequence (no flag day):

1. Create tables and backfill; keep `platform_admins` untouched.
2. Deploy code that **writes both** models and reads the new one.
3. Verify assignment counts and that every existing admin still reaches the
   console.
4. Stop writing `platform_admins`; keep it read-only for one release.
5. Drop it (or replace with a compatibility view) in the next migration.

## 9. Audit and compliance

Every mutation, every denial, and every sensitive or PII read on a platform
route writes one `audit_logs` row with:

- actor internal user id, **actor role snapshot** (roles change; the historical
  decision must remain attributable)
- permission, action, resource, tenant id (nullable for platform scope)
- result, reason, request id, support session id, approval id
- IP hash (hashed, not raw) and a bounded user-agent string
- timestamp

Additional requirements:

- **Read auditing** for PII reads (member lists) and for audit exports. Today
  reads are silent; enterprise buyers will ask for this.
- **Hash chain** for `audit_logs` (`prev_hash`, `row_hash`), with a daily anchor
  exported outside the database. Phase 2, because every writer must participate.
- **Retention/export**: CSV today; add a signed, asynchronous export and a SIEM
  webhook in phase 4. Never expose tenant audit `meta` to platform readers
  beyond the existing platform-scope reason allowlist.
- **Access review**: a quarterly report of all platform assignments, last use,
  and scope, generated from the same tables, not a spreadsheet.

## 10. Dashboard information architecture

Navigation is permission-driven. Each item declares its required permission;
the shell renders only what the actor holds, and each page re-checks.

| Section | Items | Required permission |
|---|---|---|
| Overview | Deployment summary, recent activity | `platform.overview.read` |
| Tenants | Organizations, tenant detail | `platform.org.read` |
| Support | Support sessions, access requests | `platform.support.request` / `.approve` |
| Commercial | Plans & entitlements, billing | `platform.plan.read` / `platform.billing.read` |
| Trust & security | Audit log, access control, security events | `platform.audit.read` / `platform.access.read` |
| Operations | System health, feature flags | `platform.health.read` / `platform.feature_flag.manage` |
| Settings | Platform configuration | `platform.config.update` |

Behavior:

- The overview adapts: support sees assigned tenants; billing sees commercial
  counts; auditor sees audit volume and export shortcuts; admin sees the full
  operational rail. No role sees a control it cannot use.
- The access-control page replaces "Platform admins": assignments, role
  explainer, scope picker, expiry, grantor, last use, revoke with reason.
  OWNER sees all; ADMIN sees read-only except SUPPORT/AUDITOR grants.
- The audit page shows actor role, scope, request id and support session, with
  a click-through request timeline.
- A read-only "Who can do what" page is generated from the policy module, so
  documentation and UI cannot drift.
- The console chooser (`/consoles`) shows Platform only with an active
  assignment and displays the role/scope.

## 11. Non-goals

- Custom per-customer platform roles (phase 4+, only if real demand).
- A full policy engine (Cedar, OPA, SpiceDB). The pure policy module is the
  seam; replace it later if policy complexity justifies it.
- Platform staff editing tenant attendance, passes, people or memberships.
  There is no such endpoint today and this plan does not add one.
- Billing-provider integration, invoicing, dunning.
- Tenant SSO/SCIM, custom org roles and entitlement enforcement. These are
  enterprise **tenant** features and should be planned separately; do not block
  platform RBAC on them.

## 12. Rollout

### Phase 1 — Foundation (1–2 weeks)

- ADR-13 accepted; permission catalog and role matrix frozen.
- `packages/authorization/platform.ts` + matrix tests.
- Migration 0009 + backfill; designate two owners.
- `requirePlatformPermission` / `getPlatformActor`; convert all platform routes
  and pages; deprecated alias only for the transition.
- Access-control page; nav filtering; console chooser gating; error semantics.

Exit: every platform route names a permission; the matrix test covers every
role × permission; existing admins keep access; no route still checks only
"is there a row".

### Phase 2 — Sensitive-action hardening (1–2 weeks)

- MFA enrollment requirement for platform roles; step-up window.
- Universal reason enforcement; dual-control requests; last-owner and rank
  guards; serializable transactions.
- Audit columns, read auditing for PII, request ids, IP/UA hashes.
- Session policy (12 h absolute, 30 min idle, revoke on assignment change).

Exit: tabletop tests pass — support cannot suspend, admin cannot grant owner,
an export without approval fails, every attempt is audited, DB outage returns
503 rather than 403.

### Phase 3 — Support access (2 weeks)

- Support sessions, read/write modes, approval, banner, expiry, tenant-visible
  audit.
- Read-only "view as" with masking.

Exit: a support session for Org A cannot read Org B; write access requires a
different approver; audit attribution points at the support actor.

### Phase 4 — Enterprise tenant RBAC (separate track)

- Org `AUDITOR` role, scoped presets, entitlement enforcement, SSO/SCIM,
  custom org roles if demanded, SIEM export, audit hash chain.

## 13. Test plan

- **Matrix snapshot** — every role × every permission, from the pure policy
  module (`packages/authorization/platform.ts`).
- **Route contract** — table-driven: for each platform route, actor role and
  scope → expected status + one audit row. Include an org OWNER (always 403)
  and an unauthenticated request (401).
- **Scope** — `TENANTS` allows its org, denies another; `GLOBAL` allows both;
  expired and revoked deny; new tenants are not implicitly included.
- **Guards** — last owner, self-revoke, self-approve, rank escalation, approval
  reuse, stale step-up, approver ≠ requester.
- **Audit** — deny rows, role snapshots, export rows, support-session
  attribution, reason bounds, no tenant `meta` leakage.
- **Isolation regression** — platform support without a session gets 403 on
  tenant routes; tenant admin gets 403 on every platform route.
- **UI** — nav filtering, direct-URL 403, hidden controls still enforced by the
  API.

## 14. Risks and open decisions

1. **Role count for a small team.** Five roles may be more than a 3-person
   platform team needs today. Minimal viable set: OWNER, ADMIN, SUPPORT,
   AUDITOR; add BILLING when billing actually ships. The catalog stays.
2. **MFA capability.** Verify Supabase's current AAL2/passkey support on the
   project plan before promising passkeys. TOTP step-up is the baseline.
3. **Dual control vs incident response.** Destructive actions during an
   incident cannot wait for a second approver. The recorded break-glass
   incident is the compromise: one owner can act, the security channel is
   alerted, review happens after.
4. **Support scope drift.** Tenant sets go stale as customers are added. Decide
   whether new tenants start outside every support scope (recommended) or
   inherit a pod rule.
5. **Audit hash chain write cost.** Adds a hash per row and a migration risk
   across every writer. Phase it after RBAC; do not bundle it into phase 1.
6. **`platform_admins` transition.** Dual-write is safe but easy to leave
   behind. Put the drop migration in the phase-1 checklist so it does not
   become permanent debt.
7. **Naming.** "Superadmin" in the UI for `PLATFORM_OWNER` is fine, but the code
   and audit must use the precise role name; ambiguous labels make access
   reviews unreliable.

## 15. Recommendation

Adopt five fixed platform roles + tenant-set scopes + step-up and dual control
for sensitive actions, keep the two-plane separation, and ship in three
platform phases. Do not build custom roles or an external policy engine yet;
freeze the permission catalog and the gate interface so either can be added
later without rewriting routes. The dashboard navigation should be generated
from the same matrix so it cannot drift from enforcement.
