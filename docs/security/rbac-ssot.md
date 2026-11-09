# RBAC — Single Source of Truth

Status: **Proposed — normative once accepted.** Supersedes
[permission-matrix.md](permission-matrix.md) and the earlier five-role platform
proposal. When this document and the code disagree, the code is wrong until it
is changed or this document is amended through an ADR.

Scope: platform administration, tenant administration, per-user access,
identity credentials, and attendance access.

## 0. Vocabulary

| Term | Meaning |
|---|---|
| **Platform** | Syntaxure Labs, the SaaS operator. |
| **Tenant** | An agency/organization using Prism Pass. |
| **Capability** | An atomic permission string, e.g. `attendance.record`. |
| **Role** | A named bundle of capabilities assigned to a membership. |
| **Base role** | One of `OWNER`, `TENANT_ADMIN`, `STAFF`, `ATTENDEE`. Defines a ceiling and the default template. |
| **Global role** | A default role shipped with the product. The same definition in every tenant. |
| **Custom role** | A tenant-specific named role created by a Superadmin from a base role. |
| **Override** | A per-membership allow/deny row for one capability. |
| **Identity credential** | One stable QR credential per user. It identifies; it does not grant access. |
| **Access grant** | Event- or DTR-scoped eligibility for one person. It grants; it does not identify. |
| **Superadmin** | The only platform role. God mode, audited. |

## 1. Planes

```
Platform plane        Tenant plane                 Identity / access
SUPERADMIN      →     OWNER                        one identity credential per user
                      TENANT_ADMIN                 event access grants
                      STAFF                        DTR eligibility
                      ATTENDEE                     attendance records
                      + tenant custom roles
```

Rules:

1. A platform role never implies tenant membership.
2. A tenant role never implies platform access.
3. A Superadmin may act inside any tenant (god mode) but every action is
   attributed to the Superadmin and written to both platform and tenant audit.
4. Identity is global; access is tenant/event/DTR scoped.

## 2. Roles

### 2.1 Platform

| Role | Holders | Defaults | Guard rails |
|---|---|---|---|
| `SUPERADMIN` | Syntaxure operators, recommended 2+ | Creates/suspends tenants, sets plans and entitlements, manages the global catalogue and tenant custom roles, and can act on any tenant data | MFA required; every action audited; last-superadmin guard; destructive actions require a reason |

Superadmin actions are **direct and attributed**, not silent impersonation. A
read-only “view as tenant” mode may render tenant data, but it must be audited
and must never issue the tenant user's credentials. God mode does not expose
identity QR secrets; a lost QR is recovered by reissue.

There are no other platform roles. Billing, support and audit are capabilities of
the Superadmin, not separate platform personas.

### 2.2 Tenant

| Role | Who it is | Default access | Protected? |
|---|---|---|---|
| `OWNER` | Agency principal / account owner | Read-only operational view + ownership powers | Yes: cannot be removed by a Tenant Admin; at least one per tenant |
| `TENANT_ADMIN` | Agency operations manager | Full operational management, user provisioning, reports | No |
| `STAFF` | Secretary, clerk, event crew, scanner | Record attendance, read people/events, self check-in; optional capabilities granted by Tenant Admin | No |
| `ATTENDEE` | Member or event participant | Own QR, own history, self check-in, own documents | No |
| Custom | Tenant-named role, e.g. “Secretary”, “Event Crew”, “Viewer” | Subset of its base role's ceiling | No |

Custom roles may be based on `TENANT_ADMIN`, `STAFF` or `ATTENDEE`. They may not
be based on `OWNER`; ownership is a singleton protection, not a template.

## 3. Capability catalogue

Capabilities are fixed strings. Tenants may combine them through roles and
overrides, but may not invent new ones.

| Capability | Meaning |
|---|---|
| `org.read` | Read tenant profile, settings, staff directory, and structural data |
| `org.settings.manage` | Edit tenant profile, branding, campuses, departments, programs |
| `users.manage` | Invite/remove Staff and Attendee accounts, assign roles, set per-user overrides |
| `tenant.admin.appoint` | Appoint/remove Tenant Admins; protected ownership capability |
| `people.read` | Read the attendee/people directory |
| `people.manage` | Add, edit, import, archive attendees |
| `events.read` | Read events/sessions and rosters |
| `events.manage` | Create, edit, end, close, cancel events/sessions |
| `attendance.record` | Scan/record attendance for others |
| `attendance.self_check` | Check oneself in/out |
| `attendance.edit` | Correct or void an attendance record |
| `attendance.approve` | Approve attendance records |
| `attendance.context.assign` | Decide whether attendance is event attendance or a work DTR |
| `attendance.config.manage` | Policies, geofences, scanners/devices |
| `passes.manage` | Issue/revoke event access grants and legacy passes |
| `documents.manage` | Document templates and signature requests |
| `documents.sign` | Sign documents assigned to the person |
| `reports.read` | View reports |
| `reports.export` | Export reports and data |
| `audit.read` | Read the tenant audit log |
| `billing.read` | View plan, entitlements, invoices |
| `billing.manage` | Change plan, payment, billing details; protected ownership capability |
| `ownership.transfer` | Transfer the Owner role; protected ownership capability |
| `tenant.delete` | Retire/delete the tenant; protected ownership capability |

`self.read` is not a toggle. Every authenticated member may always read their own
profile, own identity credential, own access grants, own attendance history and
own documents.

## 4. Default role matrix

Legend: **✅** default, **◻** optional (may be granted within the base ceiling),
**—** not allowed, **🔒** protected (always on for Owner, only Superadmin can
change).

| Capability | OWNER | TENANT_ADMIN | STAFF | ATTENDEE |
|---|---|---|---|---|
| `org.read` | ✅ | ✅ | ✅ | — |
| `org.settings.manage` | ◻ | ✅ | — | — |
| `users.manage` | ◻ | ✅ | — | — |
| `tenant.admin.appoint` | 🔒 | — | — | — |
| `people.read` | ✅ | ✅ | ✅ | — |
| `people.manage` | ◻ | ✅ | ◻ | — |
| `events.read` | ✅ | ✅ | ✅ | — |
| `events.manage` | ◻ | ✅ | ◻ | — |
| `attendance.record` | ◻ | ✅ | ✅ | — |
| `attendance.self_check` | ◻ | ✅ | ✅ | ✅ |
| `attendance.edit` | ◻ | ✅ | ◻ | — |
| `attendance.approve` | ◻ | ✅ | ◻ | — |
| `attendance.context.assign` | ◻ | ✅ | ◻ | — |
| `attendance.config.manage` | ◻ | ✅ | — | — |
| `passes.manage` | ◻ | ✅ | ◻ | — |
| `documents.manage` | ◻ | ✅ | ◻ | — |
| `documents.sign` | ✅ | ✅ | ✅ | ✅ |
| `reports.read` | ✅ | ✅ | ✅ | — |
| `reports.export` | ✅ | ✅ | ◻ | — |
| `audit.read` | ✅ | ✅ | — | — |
| `billing.read` | ✅ | ✅ | — | — |
| `billing.manage` | 🔒 | — | — | — |
| `ownership.transfer` | 🔒 | — | — | — |
| `tenant.delete` | 🔒 | — | — | — |

Notes:

- **Owner is view-only by default.** The protected rows are ownership powers,
  not day-to-day operations. The Owner may enable optional operational
  capabilities for their own membership; this is audited.
- **Staff defaults are intentionally minimal.** A Tenant Admin may grant the
  optional Staff capabilities per user, which is the “HR is always moving” case.
- **Attendee has no directory access.** An attendee can see only their own
  identity, access grants, attendance and documents.
- **Tenant Admin cannot touch Owner or another Tenant Admin.** Rank and
  protected-capability rules in section 7 enforce this.

## 5. Effective access resolution

For one membership:

```
effective =
  union(default capabilities of every assigned role)
  + allow overrides
  - deny overrides
```

Then apply, in order:

1. **Base ceiling.** The union of the base-role ceilings of the assigned roles.
   A capability outside every ceiling cannot be granted, even by an override.
2. **Plan entitlement.** The tenant's subscription must include the feature that
   the capability belongs to.
3. **Actor grant ceiling.** The actor cannot grant or retain a capability they do
   not hold themselves. No escalation.
4. **Protected capabilities.** Only the Owner (or Superadmin) holds the protected
   ownership rows. A Tenant Admin cannot grant, deny or remove them.
5. **Deny wins.** If an allow and a deny exist for the same capability, the deny
   wins.
6. **Superadmin bypass.** A Superadmin resolves to all capabilities in every
   tenant. Every use is audited.

Multiple roles are allowed. A secretary may hold `STAFF` and `ATTENDEE`; the
effective set is the union, bounded by the highest applicable ceiling. An Owner
may also hold `ATTENDEE` (assigned by a Superadmin) to use self check-in without
losing ownership controls.

### 5.1 Scope

Capabilities answer “what”; scope answers “where.”

- `TENANT` — the assignment applies to the whole tenant.
- `ASSIGNED` — the assignment applies only to the events/programs the membership
  is assigned to through `membership_event_assignments`.
- `SELF` — attendee-only; the membership can act only on its own records.

Rules:

1. Owner and Tenant Admin assignments are `TENANT`.
2. Staff defaults to `TENANT`; a Tenant Admin may set `ASSIGNED` per user, which
   is the “secretary only handles their event” case.
3. Attendee is always `SELF`.
4. A scoped Staff member can read/record only people, events, reports and records
   inside their assigned events/programs. The server filters; the UI only
   reflects it.
5. Changing scope requires `users.manage`, a reason and an audit row.

## 6. Customization rules

1. **Superadmin creates custom roles.** A custom role has a tenant, a name, a
   base role, and a capability set within the base role's ceiling.
2. **Global defaults are immutable per tenant.** A tenant cannot rename, delete
   or weaken `OWNER`, `TENANT_ADMIN`, `STAFF` or `ATTENDEE`. Custom roles are
   additions.
3. **Tenant Admin assigns and tunes, but does not define roles.** A Tenant Admin
   may assign existing roles and set per-user allow/deny overrides within the
   target's base ceiling. They cannot create, rename or archive roles.
4. **Tenant Admin cannot exceed their own access.** No self-escalation, no
   granting a capability they do not hold, no modifying Owner or another Tenant
   Admin.
5. **Custom roles are templates.** Per-user overrides may move within the base
   ceiling, not beyond it. The UI must show the role plus any overrides and offer
   “reset to role defaults.”
6. **Cap the catalogue.** Maximum 20 active custom roles per tenant. Archived
   roles remain readable in audit but cannot be assigned.
7. **Every role or override change requires a reason and writes an audit row**
   with before/after values.

## 7. Assignment, rank and guards

Rank order: `SUPERADMIN > OWNER > TENANT_ADMIN > STAFF > ATTENDEE`.

| Actor | May assign | May modify |
|---|---|---|
| Superadmin | Any role, any override | Anything |
| Owner | `TENANT_ADMIN`, `STAFF`, `ATTENDEE` | Staff/Attendee roles and overrides; own optional functional capabilities; Tenant Admin appointment/removal |
| Tenant Admin | `STAFF`, `ATTENDEE` | Staff/Attendee roles and overrides |
| Staff | None | Own profile only |
| Attendee | None | Own profile only |

Assignment also requires the actor to hold `users.manage`. Appointing or
removing a Tenant Admin requires the separate protected
`tenant.admin.appoint` capability. The Superadmin bypasses both.

Invariants:

1. At least one active `OWNER` per tenant.
2. At least one active `SUPERADMIN` globally; two is the operational target.
3. No actor can assign or modify a role at or above their own rank, except a
   Superadmin.
4. No actor can change their own role, overrides or ownership status. The one
   exception is an Owner enabling an optional functional capability for their
   own membership; it is audited and can never touch a protected capability.
5. No actor can approve their own access request or elevated action.
6. Ownership transfer requires an active member with a verified account to
   accept; the outgoing Owner is demoted to `TENANT_ADMIN` unless another role is
   explicitly chosen.
7. Archiving a role removes it from new assignments but does not change existing
   memberships until they are reassigned; the UI must list affected users.
8. Deleting a tenant is a status change (`PENDING_DELETION`), never an immediate
   hard delete.

## 8. Identity credentials and QR

### 8.1 One QR per account

Every internal user has exactly one active identity credential. It is stable
across tenants and events. It is the person's identity, not an event pass.

- Payload: `PRISMID1:<identityPublicId>:<64-hex-secret>`.
- `identityPublicId` is opaque (`uid_` + 16 hex). No PII is encoded.
- The server stores `credential_hash = sha256("<publicId>:<secret>")` for
  constant-time verification, plus `secret_ciphertext` (AES-256-GCM,
  envelope-encrypted with a managed key) so the authenticated owner can display
  the same QR on any device.
- The plaintext secret is returned only to the authenticated owner, never logged,
  never rendered as text in the UI, and never exposed to a Tenant Admin or
  Superadmin. Every reveal is audited and rate-limited.
- The scanner resolves the identity, then checks the event grant or DTR
  eligibility. A valid QR with no active grant is denied.
- The credential can be revoked and reissued; the old QR becomes invalid. This
  is the recovery path for a leaked QR and the only way to replace a lost secret.
- The QR may be displayed on the member portal or printed. It does not rotate per
  scan. Wallet integration is future work.

### 8.2 Static QR risk

A static global QR is a bearer identifier. If copied, it identifies the person
everywhere. Access is still gated by event grants, but the copied QR could be
used to impersonate the person at an event where they have a grant.

Mandatory mitigations:

- Scanner displays the person's name and, when a photo is on file, their photo;
  staff visually confirms for event check-in. Tenants without photos must rely on
  staff recognition and anomaly detection.
- Duplicate and cross-location anomaly detection.
- Revoke/reissue on report of loss or compromise.
- Rate limits on identity resolution, reveal and scan endpoints.
- Device binding and geo evidence for self check-in.
- Per-tenant policy can require photo confirmation or a live challenge (PIN or
  short-lived code) for high-assurance events.

The static QR is an accepted product decision; these controls are not optional.

### 8.3 Legacy passes

The existing org-scoped `PRISM1` pass remains accepted during migration. New
identity credentials use `PRISMID1`. The legacy pass path is removed after the
migration window; no new legacy passes are issued once identity credentials are
live.

## 9. Event and DTR access

### 9.1 Session context

`attendance_sessions.context` is either:

- `EVENT` — attendance for an event, class, OJT, training or visit.
- `DTR` — daily time record for work.

`attendance.context.assign` controls who can set or change the context. Reports,
records and exports must carry the context so event attendance and work DTR are
never mixed.

### 9.2 Event lifecycle

| Status | Meaning | Access |
|---|---|---|
| `SCHEDULED` | Created, not started | Not active unless the tenant policy allows an early check-in window |
| `ACTIVE` | Started | Active |
| `ENDED` | End time reached or manually ended, not closed | Active until `ends_at + 24 hours` |
| `CLOSED` | Manually/automatically closed | Revoked immediately |
| `CANCELLED` | Event cancelled | Revoked immediately |

Rules:

1. Closing an event sets `closed_at`, expires every active grant at `now`, and
   writes one audit row per affected grant summary (not one row per person).
2. Ending an event sets `ended_at` and `access_expires_at = ends_at + 24h`. A
   sweeper expires grants at that time even if nobody closes the event.
3. Cancelling an event revokes all grants immediately.
4. Reopening a closed event requires `events.manage` and a reason; it issues new
   grants, never revives expired ones silently.
5. A scheduled event may allow early check-in only if the tenant policy sets an
   `early_check_in_minutes` value.

### 9.3 Access grants

`event_access_grants` is the only event-level authority:

- One row per `(organization, session, person)`.
- Statuses: `INVITED`, `ACTIVE`, `EXPIRED`, `REVOKED`.
- Sources: `INVITE`, `IMPORT`, `SELF`, `ROSTER`.
- `expires_at` follows section 9.2.
- An attendee without a row is denied, even with a valid identity QR.
- Walk-ins are allowed only if the event policy enables them; the scanner then
  creates an `ACTIVE` grant from the `ROSTER`/`SELF` source and audits it.

### 9.4 DTR eligibility

DTR does not use event grants. A person is eligible when they have an active
`person_assignments` row (or an employment status the tenant configures) for the
work context. A full work-schedule table is a later addition; until then the
assignment window (`starts_at`/`ends_at`) is the schedule.

### 9.5 Scan order

1. Authenticate the scanner and resolve the tenant.
2. Resolve the identity credential (constant-time hash check).
3. Resolve the person in the tenant; deny if absent/inactive.
4. Resolve the session and its context.
5. For `EVENT`: check lifecycle, then the access grant.
6. For `DTR`: check assignment eligibility.
7. Apply geo/device/policy checks.
8. Write the attendance event and record.
9. Write audit with identity id, person id, session id, grant id and result.

## 10. Authentication and account lifecycle

1. **Google sign-in** is available on login and signup. Supabase OAuth handles
   the consent flow; `/auth/callback` exchanges the code and provisions the
   internal user.
2. **Email/password** remains available for staff and admins who need it.
3. **One internal user per person.** `users.auth_id` is the primary Supabase
   identity. Supabase identity linking is used for verified-email providers. If
   a second auth user with the same verified email appears and cannot be linked,
   the system refuses automatic merging and requires an explicit support flow.
   Never auto-merge on an unverified email.
4. **Event-only attendees** can create an account with Google, claim an invite
   matching their verified email, and receive an event access grant. Claiming
   activates an `ATTENDEE` membership in that tenant; the account and membership
   persist after the event, while the event grant expires per section 9. A member
   with no active grant sees an empty/expired state, not tenant directory access.
   The tenant may revoke the membership separately.
5. **Staff/admin accounts** are still provisioned by a tenant invitation and a
   role assignment. A Google account alone grants no tenant access.
6. **Superadmin** requires MFA (TOTP or stronger). Session lifetime is shorter
   than tenant sessions; every sensitive action requires a fresh step-up.

## 11. Data model

Existing tables are extended; nothing is replaced in one step.

### 11.1 Roles and assignments

```
roles
  id                 text pk
  organization_id    text null references organizations(id)  -- null = global default
  key                text                                   -- owner, tenant_admin, staff, attendee, custom slug
  name               text
  base_role          enum(OWNER, TENANT_ADMIN, STAFF, ATTENDEE)
  is_system          boolean
  status             enum(ACTIVE, ARCHIVED)
  created_by_user_id text null references users(id)
  created_at, updated_at
  unique (organization_id, key)

role_capabilities
  role_id            text references roles(id) on delete cascade
  capability         text
  primary key (role_id, capability)

membership_roles
  membership_id      text references memberships(id) on delete cascade
  role_id            text references roles(id) on delete restrict
  scope              enum(TENANT, ASSIGNED, SELF) default TENANT
  assigned_by_user_id text references users(id)
  assigned_at        timestamptz
  primary key (membership_id, role_id)

membership_event_assignments
  membership_id      text references memberships(id) on delete cascade
  session_id         text null references attendance_sessions(id)
  program_id         text null references programs(id)
  assigned_by_user_id text references users(id)
  assigned_at        timestamptz
  check (session_id is not null or program_id is not null)
```

Global role keys are unique with a partial unique index where
`organization_id is null`; tenant role keys are unique per tenant. Role names are
unique per tenant through a normalized-name column or the service layer.

`membership_permissions` remains the per-user override table and gains
`granted_by_user_id`, `reason` and `updated_at`. `allow` stays boolean; deny wins.

### 11.2 Platform

`platform_admins` becomes the Superadmin table. Add `status` (`ACTIVE`,
`REVOKED`) and `revoked_at`; revoke instead of delete. A row is a Superadmin
grant only.

### 11.3 Identity and access

```
identity_credentials
  id                text pk
  user_id           text unique references users(id)
  public_id         text unique
  credential_hash   text
  secret_ciphertext text
  key_version       int
  version           int default 1
  status            enum(ACTIVE, REVOKED)
  issued_at, rotated_at, revoked_at, last_revealed_at

event_access_grants
  id                text pk
  organization_id   text references organizations(id)
  session_id        text references attendance_sessions(id)
  person_id         text references people(id)
  status            enum(INVITED, ACTIVE, EXPIRED, REVOKED)
  source            text
  granted_by_user_id text null references users(id)
  granted_at, expires_at, revoked_at
  unique (organization_id, session_id, person_id)

attendance_sessions additions
  status            enum(SCHEDULED, ACTIVE, ENDED, CLOSED, CANCELLED)
  context           enum(EVENT, DTR)
  started_at, ended_at, closed_at, access_expires_at
```

`event_invites` may be added for email-based event invitations:

```
event_invites
  id, organization_id, session_id, email, token_hash,
  status, expires_at, accepted_by_user_id, created_at
```

### 11.4 Audit

`audit_logs` gains `actor_role`, `reason`, `request_id` and
`on_behalf_of_user_id` (nullable). Every mutation and every deny writes a row.
Superadmin actions write to both platform and tenant audit. See section 13.

## 12. Invariants

1. No platform role is derived from a tenant membership; no tenant role is
   derived from a platform grant.
2. No client-declared role, capability, tenant or scope is trusted.
3. Deny wins over allow.
4. A capability outside the base ceiling cannot be granted by an override.
5. No actor can escalate their own access or approve their own elevation.
6. At least one Owner per tenant; at least one Superadmin globally.
7. An identity QR is not an access grant. A valid QR with no active grant is
   denied.
8. Event access expires immediately on close/cancel and 24 hours after an
   unclosed end.
9. Every role, override, access-grant and superadmin action is audited with the
   actor, reason and before/after state.
10. Role and grant rows are archived/expired, never hard-deleted while audit
    retention applies.
11. Static QR deployment always includes name display (photo when available),
    anomaly detection, revocation and rate limits.
12. A Google account with no tenant membership has no tenant access.
13. An `ASSIGNED` or `SELF` scope is enforced server-side on every read and
    write; the UI only reflects it.

## 13. Audit requirements

Every row carries: actor user id, actor role snapshot, action, resource, tenant
id (nullable for platform scope), result, request id, timestamp and
`on_behalf_of_user_id` when a Superadmin acts inside a tenant. Mutation and
denial rows also carry a bounded reason; read rows may omit it.

Required events:

- Role created/renamed/archived; capability added/removed.
- Role assigned/revoked; override allowed/denied.
- Owner appointed/removed/transferred.
- Superadmin granted/revoked; superadmin action in a tenant.
- Identity credential issued/revoked/reissued; scan success/deny.
- Event created/ended/closed/cancelled/reopened; grant issued/expired/revoked;
  walk-in created.
- Export of reports, audit or personal data.

Tenant Owners can read Superadmin actions that touched their tenant. Platform
audit remains the complete cross-tenant ledger.

## 14. Migration mapping from the current model

| Current | New |
|---|---|
| `OWNER` | `OWNER` |
| `ADMIN` | `TENANT_ADMIN` |
| `MANAGER` | Custom “Manager” role, `TENANT_ADMIN` base, current MANAGER capabilities (including device/geo management) |
| `SUPERVISOR` | Custom “Supervisor” role, `STAFF` base, current SUPERVISOR capabilities |
| `SCANNER` | Custom “Scanner” role, `STAFF` base, `attendance.record` only |
| `MEMBER` | `ATTENDEE` |
| `VIEWER` | Custom “Viewer” role, `STAFF` base, read-only reports; masked export off |

Rules:

1. Create the four global roles and one tenant copy of each custom mapping per
   existing tenant.
2. Backfill `membership_roles` from `memberships.role`.
3. Preserve `membership_permissions` overrides, mapping old permission strings
   to the new catalogue. Unknown strings are dropped with an audit row.
4. Keep `memberships.role` for one release as a compatibility column, then
   remove it.
5. Existing program-scoped `MANAGER`/`SUPERVISOR` assignments map to `ASSIGNED`
   scope using their existing `person_assignments` programs; tenant-wide
   `ADMIN` maps to `TENANT`.
6. Keep legacy `PRISM1` pass verification for one release; issue identity
   credentials in parallel.
7. Backfill `attendance_sessions.status` from dates; default `context` to
   `EVENT` except `SHIFT`/`OJT`, which map to `DTR` until reviewed.

## 15. Operational settings (tenant policy, not RBAC)

These are tenant settings, not capabilities:

- Early check-in window.
- Photo confirmation requirement.
- Walk-in allowed/denied.
- Self check-in allowed/denied.
- Geo mode and required evidence.
- Event access grace period (default 24h, maximum 72h).
- Masked exports for read-only roles.

## 16. Change control

- A change to a capability key, base ceiling, protected capability, identity
  format or access-expiry rule requires an ADR.
- The SSOT, the policy module, the UI matrix and the tests change in the same
  task.
- Deprecations keep the old key readable for at least one release and log a
  warning.
