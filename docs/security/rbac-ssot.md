# Prism Pass — RBAC and Access SSOT

Status: **Proposed — target architecture for M6 (after the pilot).** The pilot
(M0–M4) keeps the seven existing backend roles and shows four presets in the UI;
the full role/capability migration is deferred until M6. See
[Pilot vs target](#pilot-vs-target) below.

This is the single source of truth for platform access, tenant roles, per-user
access, identity credentials and attendance access.

When this document and the code disagree, the code is wrong until it is changed
or this document is amended through an ADR.

Supersedes the earlier seven-role permission matrix and the five-role platform
proposal.

---

## 1. Decision summary

- **One platform role:** `SUPERADMIN`. Multiple people may hold it. God mode,
  fully audited, MFA required.
- **Four tenant defaults:** `OWNER`, `TENANT_ADMIN`, `STAFF`, `ATTENDEE`.
- **Global catalogue, tenant customization:** the four defaults are global and
  immutable per tenant. A Superadmin creates tenant-specific named roles
  (“Secretary”, “Event Crew”, “Viewer”) from a base role.
- **Tenant Admin assigns and tunes:** a Tenant Admin assigns roles and sets
  per-user allow/deny overrides within the base-role ceiling.
- **Owner is view-only by default** and keeps protected ownership powers:
  billing, Tenant Admin appointment, ownership transfer, tenant retirement.
- **One identity QR per account**, stable across tenants and events. The QR
  identifies; an event access grant or DTR eligibility authorizes.
- **Event access expires:** immediately on close/cancel; 24 hours after an event
  ends if it is never closed.
- **Google sign-in** creates a persistent account; event-only attendees claim an
  invite and keep the account for future events.
- **Multiple roles per membership** are allowed. Deny wins. No self-escalation.
- **Every mutation and every denial is audited.** Superadmin actions are visible
  in the affected tenant's audit log.

### Pilot vs target

The events-first MVP (M0–M4) must not wait for this migration. The pilot uses the
existing model with a simpler face:

| Area | Pilot (M0–M4) | Target (M6) |
|---|---|---|
| Backend roles | Keep the seven existing roles (`OWNER`, `ADMIN`, `MANAGER`, `SUPERVISOR`, `SCANNER`, `MEMBER`, `VIEWER`) | Four base roles + custom roles |
| UI | Four presets: Owner → `OWNER`, Admin → `ADMIN`, Staff → `SUPERVISOR`, Attendee → `MEMBER`; advanced roles remain available | Full role builder |
| Event access | `event_roster` + `walk_in_allowed`; any active member otherwise | `event_access_grants` with expiry |
| QR | Per-organization `PRISM1` passes | One global `PRISMID1` identity QR |
| Sign-in | Email/password | Google + invite claim |
| Event lifecycle | Open/close + closed-event refusal | Full lifecycle + 24h grace |
| RBAC migration | None | Phases in section 17 |

The rest of this document describes the **target** model. Do not implement the
target tables, global QR or Google sign-in during the pilot unless the owner
reopens O-2.

## 2. Scope and non-goals

**In scope:** platform administration, tenant administration, role
customization, per-user overrides, identity credentials, event/DTR access,
audit, migration from the current model.

**Non-goals (for this version):**

- Additional platform personas (support, billing, auditor). Superadmin covers
  them until real separation is required.
- Tenant-invented capability keys.
- A full ABAC/policy engine (Cedar, OPA, SpiceDB). The pure policy module is the
  seam for a later replacement.
- Payroll integration for DTR.
- Billing-provider implementation.
- Wallet integration for the QR.
- Cross-tenant identity merging beyond verified-email account linking.

## 3. Vocabulary

| Term | Meaning |
|---|---|
| **Platform** | Syntaxure Labs, the SaaS operator. |
| **Tenant** | An agency/organization using Prism Pass. |
| **Capability** | An atomic permission string, e.g. `attendance.record`. |
| **Role** | A named bundle of capabilities assigned to a membership. |
| **Base role** | `OWNER`, `TENANT_ADMIN`, `STAFF` or `ATTENDEE`; defines the ceiling and default template. |
| **Global role** | A default role shipped with the product; identical in every tenant. |
| **Custom role** | A tenant-specific named role created by a Superadmin from a base role. |
| **Override** | A per-membership allow/deny row for one capability. |
| **Scope** | Where an assignment applies: `TENANT`, `ASSIGNED` or `SELF`. |
| **Identity credential** | One stable QR credential per user. It identifies; it does not grant access. |
| **Access grant** | Event- or DTR-scoped eligibility for one person. It grants; it does not identify. |
| **Superadmin** | The only platform role. God mode, audited. |

## 4. Planes and authority

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
3. A Superadmin may act inside any tenant, but every action is attributed to the
   Superadmin and written to both platform and tenant audit.
4. Identity is global; access is tenant/event/DTR scoped.
5. No route trusts a client-declared role, capability, tenant or scope.

## 5. Roles

### 5.1 Platform — Superadmin

| Attribute | Rule |
|---|---|
| Role | `SUPERADMIN` only |
| Holders | Syntaxure operators; at least one, two recommended |
| Powers | Create/suspend tenants, set plans and entitlements, manage the global catalogue, create/rename/archive tenant custom roles, assign any role or override, act on any tenant data |
| Authentication | MFA required (TOTP or stronger); fresh step-up for sensitive actions |
| Audit | Every action, both platform and tenant audit |
| Destructive actions | Reason required; typed confirmation; no silent bulk changes |
| Recovery | At least one active Superadmin must remain; revoke by status, never delete the row |

Superadmin actions are **direct and attributed**, not silent impersonation. A
read-only “view as tenant” mode may render tenant data, but it must be audited
and must never issue the tenant user's credentials. God mode does not expose
identity QR secrets; a lost QR is recovered by reissue.

Superadmin lifecycle:

1. Grant by an existing Superadmin, with a reason and a verified identity.
2. MFA enrollment is required before the grant becomes usable.
3. Revoke sets `status = REVOKED` and `revoked_at`; the row remains for audit.
4. A Superadmin cannot revoke themselves.
5. The last active Superadmin cannot be revoked or demoted.
6. Revocation invalidates active sessions on the next request.
7. Superadmin grants and revocations are audited in the platform ledger and in
   the access-review report.

### 5.2 Tenant roles

| Role | Who it is | Default access | Protected |
|---|---|---|---|
| `OWNER` | Agency principal / account owner | Read-only operational view + ownership powers | Yes: cannot be removed by a Tenant Admin; at least one per tenant |
| `TENANT_ADMIN` | Agency operations manager | Full operational management, user provisioning, reports | No |
| `STAFF` | Secretary, clerk, event crew, scanner | Record attendance, read people/events, self check-in; optional capabilities granted by Tenant Admin | No |
| `ATTENDEE` | Member or event participant | Own QR, own history, self check-in, own documents | No |
| Custom | Tenant-named role, e.g. “Secretary”, “Event Crew”, “Viewer” | Subset of its base role's ceiling | No |

Custom roles may be based on `TENANT_ADMIN`, `STAFF` or `ATTENDEE`. They may not
be based on `OWNER`; ownership is a singleton protection, not a template.

### 5.3 Owner protections

The Owner is the agency's legal/account principal, not necessarily the day-to-day
operator.

- **View-only by default** across people, events, attendance and reports.
- **Protected ownership powers** are always on:
  - `billing.read` and `billing.manage`
  - `tenant.admin.appoint` (appoint/remove Tenant Admins)
  - `ownership.transfer`
  - `tenant.delete`
- **Optional functional tasks** may be enabled for the Owner's own membership
  (e.g. approve attendance, manage events). This is audited and can never remove
  a protected capability.
- A Tenant Admin cannot modify the Owner's role, overrides or ownership status.
- At least one active Owner must remain.
- Ownership transfer requires an active member with a verified account to accept.
  The outgoing Owner is demoted to `TENANT_ADMIN` unless another role is
  explicitly chosen.

## 6. Capability catalogue

Capabilities are fixed strings. Tenants combine them through roles and
overrides; they do not invent new ones.

| Capability | Meaning |
|---|---|
| `org.read` | Read tenant profile, settings, staff directory, structural data |
| `org.settings.manage` | Edit tenant profile, branding, campuses, departments, programs |
| `users.manage` | Invite/remove Staff and Attendee accounts, assign roles, set per-user overrides |
| `tenant.admin.appoint` | Appoint/remove Tenant Admins; protected ownership capability |
| `people.read` | Read the attendee/people directory |
| `people.manage` | Add, edit, import, archive attendees |
| `events.read` | Read events/sessions and rosters |
| `events.manage` | Create, edit, start, end, close, cancel, reopen events/sessions |
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

### 6.1 Implicit self-access

`self.read` is not a toggle. Every authenticated member may always read their own
profile, own identity credential, own access grants, own attendance history and
own documents. No role can remove this.

### 6.2 Plan entitlements

Tenant plan entitlements gate feature families before capabilities are applied:

| Entitlement | Capabilities it enables |
|---|---|
| `passes` | `passes.manage` and event access grants |
| `attendance` | `events.*`, `attendance.record`, `attendance.self_check`, `attendance.edit`, `attendance.approve`, `attendance.context.assign`, `attendance.config.manage` (minus the geofence portion when that entitlement is off) |
| `geofence` | The geofence portion of `attendance.config.manage` |
| `documents` | `documents.manage`, `documents.sign` |
| `reports` | `reports.read`, `reports.export` |
| `offline` | Offline scanning in the scanner app (an operational entitlement, not a role capability) |

A capability whose entitlement is disabled resolves to denied even if a role
grants it. The UI must show the entitlement state as the reason.

### 6.3 Protected capabilities

`tenant.admin.appoint`, `billing.manage`, `ownership.transfer` and
`tenant.delete` are protected:

- Only the Owner or a Superadmin can hold them.
- A Tenant Admin cannot grant, deny or remove them.
- They can never be granted to a custom role.
- Removing one from the Owner requires a Superadmin and an audit reason.

## 7. Default role matrix

Legend: **✅** default, **◻** optional within the base ceiling, **—** not
allowed, **🔒** protected (always on for Owner; only Superadmin can change).

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

- **Owner is view-only by default.** Protected rows are ownership powers, not
  day-to-day operations. Optional operational capabilities are opt-in and
  audited.
- **Staff defaults are minimal.** A Tenant Admin grants the optional Staff
  capabilities per user; this is the “HR is always moving” case.
- **Attendee has no directory access.** An attendee sees only their own identity,
  access grants, attendance and documents.
- **Tenant Admin cannot touch Owner or another Tenant Admin.** Rank and
  protected-capability rules in section 10 enforce this.

## 8. Effective access

For one membership:

```
effective =
  union(default capabilities of every assigned role)
  + allow overrides
  - deny overrides
```

Then apply, in order:

1. **Base ceiling.** The union of the base-role ceilings. A capability outside
   every ceiling cannot be granted, even by an override.
2. **Plan entitlement.** The tenant's subscription must include the feature
   family (section 6.2).
3. **Scope.** `TENANT`, `ASSIGNED` or `SELF` (section 8.1).
4. **Actor grant ceiling.** The actor cannot grant or retain a capability they
   do not hold themselves.
5. **Protected capabilities.** Only the Owner or Superadmin holds them. A Tenant
   Admin cannot grant, deny or remove them.
6. **Deny wins.** If an allow and a deny exist for the same capability, deny
   wins.
7. **Superadmin bypass.** A Superadmin resolves to all capabilities in every
   tenant. Every use is audited.

Multiple roles are allowed. A secretary may hold `STAFF` and `ATTENDEE`; the
effective set is the union, bounded by the highest applicable ceiling. An Owner
may also hold `ATTENDEE` (assigned by a Superadmin) to use self check-in without
losing ownership controls.

### 8.1 Scope

Capabilities answer “what”; scope answers “where.”

| Scope | Meaning | Applies to |
|---|---|---|
| `TENANT` | Whole tenant | Owner, Tenant Admin, default Staff |
| `ASSIGNED` | Only assigned events/programs | Optional Staff, custom Staff/Tenant Admin roles |
| `SELF` | Only the member's own records | Attendee |

Rules:

1. Owner and Tenant Admin assignments are `TENANT`.
2. Staff defaults to `TENANT`. A Tenant Admin may set `ASSIGNED` per user.
3. Attendee is always `SELF`.
4. An `ASSIGNED` Staff member can read/record only people, events, reports and
   records inside their assigned events/programs, through
   `membership_event_assignments`.
5. Changing scope requires `users.manage`, a reason and an audit row.
6. Scope is enforced server-side on every read and write; the UI only reflects
   it.

### 8.2 Enforcement

Every server entry point resolves access from the verified session:

```
Supabase session
  → internal users.id
  → active memberships for the requested tenant
  → active membership_roles
  → role capabilities + tenant entitlements
  → per-user overrides (deny wins)
  → scope check
  → allow / deny + audit
```

Rules:

- The API route, server action and page all call the same gate. UI visibility is
  never authorization.
- Resolve per request. If a short cache is added, key it by membership and
  assignment version and invalidate on any role, override, scope or membership
  change.
- `401` unauthenticated; `403` authenticated but denied (audited); `409` policy
  conflict (last owner, self-modification, invalid transition); `503` dependency
  unavailable. A database outage is never reported as `403`.
- Denials write an audit row with the capability and reason code. Allowed
  mutations and sensitive reads write an audit row with the actor role snapshot.

## 9. Role customization

1. **Superadmin creates custom roles.** A custom role has a tenant, name, base
   role, capability set within the base ceiling, and an optional description.
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
   ceiling, not beyond it. The UI shows the role plus overrides and offers
   “reset to role defaults.”
6. **Catalogue cap.** Maximum 20 active custom roles per tenant. Archived roles
   remain readable in audit but cannot be assigned.
7. **Every role or override change requires a reason and writes an audit row**
   with before/after values.

Custom role lifecycle:

- Create → draft capability set → activate.
- Rename is a Superadmin action and is audited.
- Archive removes the role from new assignments. Existing memberships keep it
  until reassigned; the UI lists affected users.
- A custom role cannot be converted to a different base role after creation;
  create a new role and migrate assignments instead.

## 10. Assignment, rank and guards

Rank order: `SUPERADMIN > OWNER > TENANT_ADMIN > STAFF > ATTENDEE`.

| Actor | May assign | May modify |
|---|---|---|
| Superadmin | Any role, any override | Anything |
| Owner | `TENANT_ADMIN`, `STAFF`, `ATTENDEE`, and custom roles at or below that rank (Staff/Attendee require `users.manage`; Tenant Admin requires `tenant.admin.appoint`) | Staff/Attendee roles and overrides; own optional functional capabilities; Tenant Admin appointment/removal |
| Tenant Admin | `STAFF`, `ATTENDEE`, and custom roles at those ranks (requires `users.manage`) | Staff/Attendee roles and overrides |
| Staff | None | Own profile only |
| Attendee | None | Own profile only |

Assignment of Staff/Attendee roles and overrides requires `users.manage`. The
Owner does not hold it by default but may enable it as an optional functional
capability. Assigning or removing any role based on `TENANT_ADMIN` requires the
protected `tenant.admin.appoint` capability. The Superadmin bypasses both.

`tenant.admin.appoint` is the **explicit delegation authority** for Tenant Admin
roles. It is a deliberate exception to the “cannot grant what you do not hold”
rule: the Owner may appoint a Tenant Admin whose operational capabilities exceed
the Owner's current set, because the protected capability is the authority to
delegate that role. `ownership.transfer` is the equivalent authority for
transferring ownership. No other capability has this exception.

Guards:

1. At least one active `OWNER` per tenant.
2. At least one active `SUPERADMIN` globally; two is the operational target.
3. No actor can assign or modify a role at or above their own rank, except a
   Superadmin.
4. No actor can change their own role, overrides or ownership status. The one
   exception is an Owner enabling an optional functional capability for their
   own membership; it is audited and can never touch a protected capability.
5. No actor can approve their own elevated action.
6. Ownership transfer requires an active member with a verified account to
   accept; the outgoing Owner is demoted to `TENANT_ADMIN` unless another role is
   explicitly chosen.
7. Archiving a role removes it from new assignments but does not change existing
   memberships until reassigned; the UI lists affected users.
8. Deleting a tenant is a status change (`PENDING_DELETION`), never an immediate
   hard delete. A retention window applies.

## 11. Identity credentials and QR

### 11.1 One QR per account

Every internal user has exactly one active identity credential. It is stable
across tenants and events. It is the person's identity, not an event pass.

- Payload: `PRISMID1:<identityPublicId>:<64-hex-secret>`.
- `identityPublicId` is opaque (`uid_` + 16 hex). No PII is encoded.
- The server stores:
  - `credential_hash = sha256("<publicId>:<secret>")` for constant-time
    verification;
  - `secret_ciphertext` (AES-256-GCM, envelope-encrypted with a managed key) so
    the authenticated owner can display the same QR on any device.
- The plaintext secret is returned only to the authenticated owner. It is never
  logged, never rendered as text in the UI, and never exposed to a Tenant Admin
  or Superadmin. Every reveal is audited and rate-limited.
- The scanner resolves the identity, then checks the event grant or DTR
  eligibility. A valid QR with no active grant is denied.
- The credential can be revoked and reissued; the old QR becomes invalid. This
  is the recovery path for a leaked QR and the only way to replace a lost secret.
- The QR may be displayed on the member portal or printed. It does not rotate per
  scan. Wallet integration is future work.

### 11.2 Static QR risk

A static global QR is a bearer identifier. If copied, it identifies the person
everywhere. Access is still gated by event grants, but a copied QR could be used
to impersonate the person at an event where they have a grant.

Mandatory mitigations:

- Scanner displays the person's name and, when a photo is on file, their photo;
  staff visually confirms for event check-in. Tenants without photos rely on
  staff recognition and anomaly detection.
- Duplicate and cross-location anomaly detection.
- Revoke/reissue on report of loss or compromise.
- Rate limits on identity resolution, reveal and scan endpoints.
- Device binding and geo evidence for self check-in.
- Per-tenant policy can require photo confirmation or a live challenge (PIN or
  short-lived code) for high-assurance events.

The static QR is an accepted product decision; these controls are not optional.

### 11.3 Legacy passes

The existing org-scoped `PRISM1` pass remains accepted during migration. New
identity credentials use `PRISMID1`. The legacy pass path is removed after the
migration window; no new legacy passes are issued once identity credentials are
live.

## 12. Event and DTR access

### 12.1 Session context

`attendance_sessions.context` is either:

- `EVENT` — attendance for an event, class, OJT, training or visit.
- `DTR` — daily time record for work.

`attendance.context.assign` controls who can set or change the context. Reports,
records and exports must carry the context so event attendance and work DTR are
never mixed.

### 12.2 Event lifecycle

| Status | Meaning | Access |
|---|---|---|
| `SCHEDULED` | Created, not started | Not active unless the tenant policy allows an early check-in window |
| `ACTIVE` | Started | Active |
| `ENDED` | End time reached or manually ended, not closed | Active until `ended_at + 24 hours` |
| `CLOSED` | Manually/automatically closed | Revoked immediately |
| `CANCELLED` | Event cancelled | Revoked immediately |

Rules:

1. Closing an event sets `closed_at`, expires every active grant at `now`, and
   writes one audit summary row.
2. Ending an event sets `ended_at` (manual end time, or `ends_at` for an
   automatic end) and `access_expires_at = ended_at + 24h`. A sweeper expires
   grants at that time even if nobody closes the event.
3. Cancelling an event revokes all grants immediately.
4. Reopening a closed event requires `events.manage` and a reason; it issues new
   grants, never revives expired ones silently.
5. A scheduled event may allow early check-in only if the tenant policy sets an
   `early_check_in_minutes` value.
6. All expiry calculations use UTC; the event timezone is for display only.

### 12.3 Access grants

`event_access_grants` is the only event-level authority:

- One row per `(organization, session, person)`.
- Statuses: `INVITED`, `ACTIVE`, `EXPIRED`, `REVOKED`.
- Sources: `INVITE`, `IMPORT`, `SELF`, `ROSTER`.
- `expires_at` follows section 12.2.
- An attendee without a row is denied, even with a valid identity QR.
- Walk-ins are allowed only if the event policy enables them; the scanner then
  creates an `ACTIVE` grant from the `ROSTER`/`SELF` source and audits it.
- Issuing or revoking a grant requires `passes.manage`.

**Pilot implementation (M1):** `event_access_grants` is M6. Until then, use
`event_roster` with the same uniqueness key and a `walk_in_allowed` flag on the
session. The scan checks roster membership unless walk-in is allowed. The expiry
rules in section 12.2 apply to the session status, not to a per-person grant.

### 12.4 Invites and event-only attendees

- `event_invites` holds `(organization, session, email, token_hash, status,
  expires_at, accepted_by_user_id)`.
- A staff member with `people.manage` or `passes.manage` creates invites.
- The attendee signs in with Google using the invited email, claims the invite,
  and the system creates/links the person and an access grant.
- The account and `ATTENDEE` membership persist after the event; the event grant
  expires per section 12.2. A member with no active grant sees an empty/expired
  state, not tenant directory access.
- The tenant may revoke the membership separately.

### 12.5 DTR eligibility

DTR does not use event grants. A person is eligible when they have an active
`person_assignments` row (or an employment status the tenant configures) for the
work context. A full work-schedule table is a later addition; until then the
assignment window (`starts_at`/`ends_at`) is the schedule.

### 12.6 Scan order

1. Authenticate the scanner and resolve the tenant.
2. Resolve the identity credential (constant-time hash check).
3. Resolve the person in the tenant; deny if absent/inactive.
4. Resolve the session and its context.
5. For `EVENT`: check lifecycle, then the access grant.
6. For `DTR`: check assignment eligibility.
7. Apply geo/device/policy checks.
8. Write the attendance event and record.
9. Write audit with identity id, person id, session id, grant id and result.

### 12.7 Offline behavior

The online guarantees in this document do not all hold on a disconnected device.
State them honestly:

- The scanner verifies against the **downloaded bundle snapshot**: credential
  hash, person status, roster/grant and event status as of the bundle time.
- A credential revoked, a roster removed or an event closed **after** the bundle
  download is accepted at the door if it was valid in the snapshot, then
  rejected or flagged on sync. The record is provisional until sync.
- A closed event refuses new online scans immediately. An offline scan is
  accepted locally, then rejected on sync if `closed_at` is earlier than the
  scan timestamp; scans taken before the close remain accepted.
- The scanner shows the bundle age and flags device/sync clock drift. Staff can
  decide whether the snapshot is fresh enough for the event.
- Sync is idempotent and reconciles duplicates: two devices scanning the same
  person produce one record, with the duplicate marked.
- No scan is silently lost. Rejected offline items remain visible with a reason.
- The invariant “a revoked QR fails immediately” is an **online** guarantee.
  Offline, it fails at sync, and the UI must say so.

## 13. Authentication and account lifecycle

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
   matching their verified email, and receive an event access grant. The account
   and `ATTENDEE` membership persist; the grant expires per section 12.
5. **Staff/admin accounts** are provisioned by a tenant invitation and a role
   assignment. A Google account alone grants no tenant access.
6. **MFA:** Superadmin requires it. Owner MFA is recommended and may be
   enforced by tenant policy. Tenant Admin MFA is recommended.
7. **Session policy:** tenant sessions have an absolute lifetime and an idle
   timeout configured per tenant; Superadmin sessions are shorter. Revoking a
   role or membership invalidates access on the next request.

## 14. Data model

Existing tables are extended; nothing is replaced in one step.

### 14.1 Roles and assignments

```
roles
  id                  text pk
  organization_id     text null references organizations(id)  -- null = global default
  key                 text                                   -- owner, tenant_admin, staff, attendee, custom slug
  name                text
  name_normalized     text
  base_role           enum(OWNER, TENANT_ADMIN, STAFF, ATTENDEE)
  is_system           boolean
  status              enum(ACTIVE, ARCHIVED)
  created_by_user_id  text null references users(id)
  created_at, updated_at
  unique (organization_id, key)
  unique (organization_id, name_normalized)

role_capabilities
  role_id             text references roles(id) on delete cascade
  capability          text
  primary key (role_id, capability)

membership_roles
  membership_id       text references memberships(id) on delete cascade
  role_id             text references roles(id) on delete restrict
  scope               enum(TENANT, ASSIGNED, SELF) default TENANT
  assigned_by_user_id text references users(id)
  assigned_at         timestamptz
  primary key (membership_id, role_id)

membership_event_assignments
  membership_id       text references memberships(id) on delete cascade
  session_id          text null references attendance_sessions(id)
  program_id          text null references programs(id)
  assigned_by_user_id text references users(id)
  assigned_at         timestamptz
  check (session_id is not null or program_id is not null)
```

Global role keys are unique with a partial unique index where
`organization_id is null`. Tenant role keys and names are unique per tenant.

`membership_permissions` remains the per-user override table and gains
`granted_by_user_id`, `reason` and `updated_at`. `allow` stays boolean; deny wins.

### 14.2 Platform

`platform_admins` becomes the Superadmin table. Add `status` (`ACTIVE`,
`REVOKED`), `revoked_at`, `granted_by_user_id` and `mfa_enrolled_at`. A row is a
Superadmin grant only; revoke by status, never delete.

### 14.3 Identity and access

```
identity_credentials
  id                 text pk
  user_id            text unique references users(id)
  public_id          text unique
  credential_hash    text
  secret_ciphertext  text
  key_version        int
  version            int default 1
  status             enum(ACTIVE, REVOKED)
  issued_at, rotated_at, revoked_at, last_revealed_at

event_access_grants
  id                 text pk
  organization_id    text references organizations(id)
  session_id         text references attendance_sessions(id)
  person_id          text references people(id)
  status             enum(INVITED, ACTIVE, EXPIRED, REVOKED)
  source             text
  granted_by_user_id text null references users(id)
  granted_at, expires_at, revoked_at
  unique (organization_id, session_id, person_id)

event_invites
  id                 text pk
  organization_id    text references organizations(id)
  session_id         text references attendance_sessions(id)
  email              text
  token_hash         text
  status             text
  expires_at         timestamptz
  accepted_by_user_id text null references users(id)
  created_at

event_roster (pilot M1)
  id                 text pk
  organization_id    text references organizations(id)
  session_id         text references attendance_sessions(id)
  person_id          text references people(id)
  status             enum(INVITED, ACTIVE, REMOVED)
  added_by_user_id   text null references users(id)
  added_at           timestamptz
  unique (organization_id, session_id, person_id)

attendance_sessions additions
  status             enum(SCHEDULED, ACTIVE, ENDED, CLOSED, CANCELLED)
  context            enum(EVENT, DTR)
  walk_in_allowed    boolean default false
  started_at, ended_at, closed_at, access_expires_at
  created_by_user_id text null references users(id)
```

### 14.4 Audit

`audit_logs` gains:

- `actor_role` — role snapshot at the time of the action
- `reason` — bounded text for mutations and denials
- `request_id` — correlation id
- `on_behalf_of_user_id` — when a Superadmin acts inside a tenant
- `ip_hash`, `user_agent` — optional, hashed/bounded
- `prev_hash`, `row_hash` — tamper-evident chain (phase 2)

Audit is append-only: no UPDATE/DELETE grants for application roles. Retention is
defined per tenant, with a longer platform retention.

## 15. Audit and access review

Every row carries: actor user id, actor role snapshot, action, resource, tenant
id (nullable for platform scope), result, request id, timestamp and
`on_behalf_of_user_id` when a Superadmin acts inside a tenant. Mutation and
denial rows also carry a bounded reason; read rows may omit it.

Required events:

- Role created/renamed/archived; capability added/removed.
- Role assigned/revoked; override allowed/denied; scope changed.
- Owner appointed/removed/transferred.
- Superadmin granted/revoked; Superadmin action in a tenant.
- Identity credential issued/revoked/reissued/revealed; scan success/deny.
- Event created/started/ended/closed/cancelled/reopened; grant
  issued/expired/revoked; walk-in created.
- Export of reports, audit or personal data.
- Membership revoked; tenant suspended/reactivated/retired.

Visibility:

- Tenant Owners can read Superadmin actions that touched their tenant.
- Platform audit remains the complete cross-tenant ledger.
- Access review (quarterly): every platform and tenant role assignment, scope,
  last use, unused roles and overrides, generated from the tables, not a
  spreadsheet.

## 16. Migration from the current model

| Current | New |
|---|---|
| `OWNER` | `OWNER` |
| `ADMIN` | `TENANT_ADMIN` |
| `MANAGER` | Custom “Manager” role, `TENANT_ADMIN` base, current MANAGER capabilities (including device/geo management) |
| `SUPERVISOR` | Custom “Supervisor” role, `STAFF` base, current SUPERVISOR capabilities |
| `SCANNER` | Custom “Scanner” role, `STAFF` base, `attendance.record` only |
| `MEMBER` | `ATTENDEE` |
| `VIEWER` | Custom “Viewer” role, `STAFF` base, read-only reports; masked export off |

Steps:

1. Seed the four global roles and their capabilities.
2. For each tenant, create the custom roles above with the closest capability
   set. `Manager` uses the `TENANT_ADMIN` base because the legacy role held
   device/geofence management; the others use `STAFF`.
3. Backfill `membership_roles` from `memberships.role`.
4. Preserve `membership_permissions`; map old keys to new capabilities. Unknown
   keys are dropped with an audit row naming the old key.
5. Map existing program-scoped `MANAGER`/`SUPERVISOR` assignments to `ASSIGNED`
   scope using their existing `person_assignments` programs; tenant-wide `ADMIN`
   maps to `TENANT`.
6. Keep `memberships.role` for one release as a compatibility column; dual-read
   and dual-write, then remove it.
7. Keep legacy `PRISM1` pass verification for one release; issue identity
   credentials in parallel.
8. Backfill `attendance_sessions.status` from dates; default `context` to
   `EVENT` except `SHIFT`/`OJT`, which map to `DTR` until reviewed.
9. Rollback: the new tables are additive. Do not drop old columns until one clean
   release has passed. A feature flag switches the gate back to the old resolver.

## 17. Adoption plan (target M6, after the pilot)

Do not implement this migration during M0–M4. The pilot uses the seven backend
roles, four UI presets, per-org passes and the event roster. This plan starts
only when O-2 is reopened and M6 begins.

### Phase 1 — Access model and Superadmin foundation

**Deliverables**

- Schema: `roles`, `role_capabilities`, `membership_roles`,
  `membership_event_assignments`, `membership_permissions` columns,
  `platform_admins` status, `audit_logs` columns.
- Pure policy module `packages/authorization/rbac.ts`: `CAPABILITIES`,
  `BASE_ROLES`, `ROLE_CEILINGS`, `effectiveCapabilities`, `canAssignRole`,
  `canOverride`, `isProtected`, `assertLastOwner`, `assertLastSuperadmin`.
- Gates: `requireTenantCapability(capability, organizationId)` and
  `requireSuperadmin()`. Remove `requireOrganizationPermission` and
  `requirePlatformAdmin` after conversion.
- Superadmin console: tenant list, role catalogue, create/rename/archive custom
  roles, assign roles, inspect overrides.
- Tenant console: staff list, role assignment, per-user overrides, scope,
  access review, “reset to role defaults.”
- Permission-driven navigation. `/consoles` shows Platform only for a Superadmin.
- Error semantics: `401`/`403`/`409`/`503`; a DB outage is never `403`.

**Exit criteria**

- Every tenant route names a capability; every platform route requires
  Superadmin.
- Existing users are backfilled without losing access.
- A Tenant Admin can assign a Superadmin-created “Secretary” role and toggle a
  capability for one person; a Staff user cannot see the role editor.
- A Staff user cannot manage roles, billing or another tenant.

### Phase 2 — Google sign-in and global identity QR

**Deliverables**

- Supabase Google provider; `Continue with Google` on login and signup.
- `/auth/callback`; verified-email account linking; provisioning.
- `identity_credentials` with hash + encrypted secret; owner-only reveal.
- `PRISMID1` QR in the member portal, show/hide, print, reissue.
- Scanner accepts `PRISMID1` and legacy `PRISM1`.
- `event_invites` and the claim flow.
- Audit for reveal, issue, reissue and revoke.

**Exit criteria**

- A new attendee signs in with Google, claims an event, and sees a stable QR.
- The same QR is accepted at a second event where the person has a grant.
- A valid QR with no grant is denied and audited.
- A revoked QR fails immediately.

### Phase 3 — Event lifecycle, access grants and DTR

**Deliverables**

- `attendance_sessions` status/context/timestamps.
- `event_access_grants` and lifecycle actions.
- Close/end/cancel/reopen rules and the expiry sweeper.
- Walk-in policy and invite/claim refinement.
- DTR eligibility via active `person_assignments`.
- Separate EVENT/DTR reports and exports.

**Exit criteria**

- Closing an event denies the next scan immediately.
- An event ended but not closed allows scans for 24 hours, then denies.
- A cancelled event denies immediately.
- An EVENT report never includes DTR records, and vice versa.

### Phase 4 — Close-out and hardening

- Remove the legacy `memberships.role` enum after one release.
- Remove the `PRISM1` path after the migration window.
- Access-review report: roles, overrides, scopes, last use, unused roles.
- Anomaly detection for repeated/cross-location QR use.
- Optional person photo storage and scanner display; photo-confirmation policy.
- Optional live challenge for high-assurance events.
- SIEM/export for audit; audit hash chain.
- Finalize this SSOT and delete superseded docs.

### Test matrix

- Every base role × every capability snapshot.
- Ceiling test: a Staff override cannot grant `billing.manage`,
  `tenant.admin.appoint`, `ownership.transfer` or `tenant.delete`.
- Deny-wins test.
- Multi-role union test.
- Scope test: `ASSIGNED` staff cannot read an unassigned event; `TENANT` can;
  `SELF` attendee sees only own records.
- Rank test: Tenant Admin cannot assign Tenant Admin or Owner.
- Self-escalation test.
- Last-owner and last-superadmin tests.
- Route contracts: role/capability → expected status + one audit row.
- Org Owner gets 403 on every platform route; Staff gets 403 on admin routes;
  no tenant reads another tenant.
- Identity: valid + active grant; valid + no grant; revoked/reissued; legacy
  `PRISM1` during and after the window; copied QR anomaly path.
- Event: scheduled early window; active; closed; ended+24h; cancelled; reopened.
- Auth: first Google sign-in; idempotent repeat; verified link; unverified
  conflict; invite claim; Google account with no membership.
- Migration: role mapping preserves access; overrides map or drop with audit;
  legacy scans still work during the window.

### Risks

| Risk | Mitigation |
|---|---|
| Static QR can be copied | Access still requires a grant; name/photo, anomaly detection, revoke/reissue, optional live challenge |
| Encrypted QR secret store is a target | AES-256-GCM envelope encryption, key rotation, owner-only reveal, audit and rate limits |
| Superadmin god mode abuse | MFA, dual-plane audit, tenant-visible actions, at least two Superadmins |
| Per-user overrides drift | Show role + overrides, “reset to defaults,” access review, before/after audit |
| Custom role explosion | Cap at 20 active; archive, never delete; show unused roles |
| Google account duplication | Verified-email linking only; refuse auto-merge on conflict |
| Migration changes effective access | Matrix tests per existing role; dual-read/dual-write; rollback flag |
| Timezone mistakes in 24h expiry | Store UTC; compute `access_expires_at` server-side; test DST boundaries |
| EVENT and DTR data mix | `context` on sessions, records and reports; separate filters and exports |
| Tenant Admin cannot recover a rogue Owner | Superadmin god mode is the recovery path; ownership transfer is explicit and audited |

## 18. Operational settings (tenant policy, not RBAC)

These are settings, not capabilities:

- Early check-in window.
- Photo confirmation requirement.
- Walk-in allowed/denied.
- Self check-in allowed/denied.
- Geo mode and required evidence.
- Event access grace period (default 24h, maximum 72h).
- Masked exports for read-only roles.
- Owner/Tenant Admin MFA requirement.
- Session absolute and idle lifetime.
- Audit and data retention window.
- Anomaly thresholds and alert recipients.

## 19. System invariants

1. No platform role is derived from a tenant membership; no tenant role is
   derived from a platform grant.
2. No client-declared role, capability, tenant or scope is trusted.
3. Deny wins over allow.
4. A capability outside the base ceiling cannot be granted by an override.
5. Protected capabilities cannot be granted to a custom role or removed from the
   Owner except by a Superadmin with an audit reason.
6. No actor can escalate their own access or approve their own elevation.
7. At least one Owner per tenant; at least one Superadmin globally.
8. An identity QR is not an access grant. A valid QR with no active grant is
   denied online; offline, the snapshot rules in section 12.7 apply.
9. Event access expires immediately on close/cancel and 24 hours after an
   unclosed end, online. Offline devices enforce the downloaded snapshot and
   reconcile at sync (section 12.7).
10. Every role, override, scope, access-grant and Superadmin action is audited
    with the actor, reason and before/after state.
11. Role and grant rows are archived/expired, never hard-deleted while audit
    retention applies.
12. Static QR deployment always includes name display (photo when available),
    anomaly detection, revocation and rate limits.
13. A Google account with no tenant membership has no tenant access.
14. An `ASSIGNED` or `SELF` scope is enforced server-side on every read and
    write; the UI only reflects it.
15. Exactly one active identity credential per user. Reissue invalidates the old
    one.
16. The QR secret is never exposed to a Tenant Admin or Superadmin, never logged
    and never rendered as text.
17. A Superadmin action inside a tenant is visible in that tenant's audit log.
18. A tenant deletion is a status change with a retention window, not an
    immediate hard delete.

## 20. Change control

- A change to a capability key, base ceiling, protected capability, identity
  format or access-expiry rule requires an ADR.
- The SSOT, the policy module, the UI matrix and the tests change in the same
  task.
- Deprecations keep the old key readable for at least one release and log a
  warning.
- The SSOT is the review artifact for product, security and engineering. Code
  that diverges is a defect, not an alternative implementation.
