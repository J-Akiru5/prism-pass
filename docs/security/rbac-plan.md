# RBAC and identity — implementation plan

Status: **Proposed.** Normative rules live in
[rbac-ssot.md](rbac-ssot.md); this document is the delivery plan. Replaces the
earlier five-role platform proposal and the seven-role tenant matrix.

## 1. Summary

Ship a four-role mental model with real customization underneath:

- **Platform:** one `SUPERADMIN` role. God mode, audited.
- **Tenant defaults:** `OWNER`, `TENANT_ADMIN`, `STAFF`, `ATTENDEE`.
- **Customization:** the Superadmin creates tenant-specific named roles from a
  global capability catalogue. A Tenant Admin assigns roles and tunes per-user
  overrides within the base-role ceiling.
- **Identity:** one stable QR per account, usable across events and tenants.
  The QR identifies; an event access grant or DTR eligibility authorizes.
- **Event access:** closes immediately when the event closes; expires 24 hours
  after an event ends if it is never closed.

The result is simple for the agency (four levels they already understand) and
flexible enough for “my secretary is called a Coordinator and can do X but not
Y” without inventing a new role model per customer.

## 2. What this replaces

| Current | Target |
|---|---|
| 7 tenant roles with a fixed permission matrix | 4 base roles + tenant custom roles + per-user overrides |
| `memberships.role` enum as the single role | `membership_roles` join table (multi-role) |
| 11 org permissions | 24 capabilities across org, people, events, attendance, credentials, documents, reports, audit, billing, ownership |
| Binary `platform_admins` | One `SUPERADMIN` role with status, MFA, last-superadmin guard |
| Org-scoped `PRISM1` passes only | One global `PRISMID1` identity QR + event access grants; legacy accepted during migration |
| Password-only login | Google OAuth + password; event-only attendees can self-serve |
| Audit without role snapshots | Audit carries actor role, reason, request id and on-behalf-of |

## 3. Current state (verified)

| Fact | Evidence |
|---|---|
| Tenant RBAC is a 7-role enum with 11 permissions | `packages/authorization/permissions.ts` |
| Overrides are per membership, deny wins | `membership_permissions`; `lib/tenant.ts` |
| Platform access is presence-only | `platform_admins`; `requirePlatformAdmin` (`lib/tenant.ts:60`) |
| Platform card is shown to everyone | `app/consoles/page.tsx` |
| QR is org-scoped and opaque | `modules/passes/service.ts`; `PRISM1` payload |
| QR is hash-only and shown once | `DigitalPassCard` says “shown once at issuance”; no encrypted copy exists for re-display |
| Scanner resolves pass inside one org | `modules/attendance/scan-service.ts` |
| Sessions have no lifecycle or context | `attendance_sessions` has only `startsAt`/`endsAt`/`type` |
| No event access grants | no table; passes are org-scoped |
| Login is password-only | `app/(auth)/login/page.tsx` |
| Provisioning exists but no OAuth callback | `app/api/v1/auth/provision/route.ts`; no `/auth/callback` |
| Audit lacks role snapshots, reasons, request ids | `audit_logs` model |
| DB failures can look like 403 | `requirePlatformAdmin` catch converts unexpected errors |

## 4. Workstreams

### Phase 1 — Access model and Superadmin foundation

**Schema**

- `roles`: global defaults (`organization_id = null`) and tenant custom roles.
- `role_capabilities`: capability rows per role.
- `membership_roles`: many-to-many between membership and role, with `scope`
  (`TENANT`, `ASSIGNED`, `SELF`).
- `membership_event_assignments`: the events/programs an `ASSIGNED` staff
  membership can access.
- `membership_permissions`: add `granted_by_user_id`, `reason`, `updated_at`.
- `platform_admins`: add `status`, `revoked_at`; stop deleting grants.
- `audit_logs`: add `actor_role`, `reason`, `request_id`,
  `on_behalf_of_user_id`.

**Policy**

- New pure module `packages/authorization/rbac.ts`:
  - `CAPABILITIES`, `BASE_ROLES`, `ROLE_CEILINGS`
  - `effectiveCapabilities({ roles, overrides })`
  - `canAssignRole(actor, target)`
  - `canOverride(actor, target, capability)`
  - `isProtected(capability)`
  - `assertLastOwner`, `assertLastSuperadmin`
- Unit-test the matrix and every guard without a database.

**Gates**

- `requireTenantCapability(capability, organizationId)` replaces
  `requireOrganizationPermission` at route boundaries.
- `requireSuperadmin()` replaces `requirePlatformAdmin`.
- Both resolve from the verified session; neither trusts a client role or tenant.
- Resolve per request. If a short cache is added, key it by membership and
  assignment version, and invalidate on any role, override or scope change.
- Preserve `401`/`403`/`409`/`503` semantics; a DB outage is not a 403.

**Surfaces**

- Superadmin console: tenant list, role catalogue, create/rename/archive custom
  role, assign role, inspect overrides.
- Tenant console: staff list, role assignment, per-user overrides, access review,
  “reset to role defaults.”
- Nav and page controls render from the effective capability set. API routes
  remain the authority.
- `/consoles` shows the Platform card only for a Superadmin.

**Exit criteria**

- Every tenant route names a capability; every platform route requires
  Superadmin.
- Existing users are backfilled without losing access.
- A Tenant Admin can assign a Superadmin-created “Secretary” role and toggle a
  capability for one person; a Staff user cannot see the role editor.
- A Staff user cannot suspend a tenant or read another tenant.

### Phase 2 — Google sign-in and global identity QR

**Auth**

- Enable the Google provider in Supabase; add `Continue with Google` to login
  and signup.
- Add `/auth/callback` to exchange the OAuth code and provision the internal
  user.
- Account linking: verified email only; no auto-merge of conflicting accounts.
- Keep email/password for staff and admins.

**Identity**

- `identity_credentials` table: one active credential per user.
- Store the verification hash plus an encrypted secret (`secret_ciphertext`,
  AES-256-GCM with a managed key) so the owner can re-display the same QR on any
  device.
- QR payload `PRISMID1:<publicId>:<secret>`; never render the raw payload as
  text in the UI, only the public id.
- Member portal shows the identity QR, with show/hide, print and reissue; every
  reveal is audited and rate-limited.
- Revoke/reissue invalidates the old QR and overwrites the encrypted secret.
- Scanner accepts `PRISMID1` and legacy `PRISM1` during migration.

**Event-only attendees**

- Add `event_invites` (email, token hash, expiry, accepted_by) for email invites
  and claim links.
- After Google sign-in, match the verified email to the invite and create/link
  the person and an `INVITED`/`ACTIVE` access grant.
- The account persists after the event; the grant expires.

**Exit criteria**

- A new attendee signs in with Google, claims an event, and sees a stable QR.
- The same QR is accepted at a second event where the person has a grant.
- A valid QR with no grant is denied and audited.
- A revoked QR fails immediately.

### Phase 3 — Event lifecycle, access grants and DTR

**Schema**

- `attendance_sessions`: `status`, `context`, `started_at`, `ended_at`,
  `closed_at`, `access_expires_at`.
- `event_access_grants`: `(org, session, person)`, status, source, expiry.
- Extend `event_invites` with acceptance/claim state where Phase 2 needs it.

**Behaviour**

- Create event → `SCHEDULED`; start → `ACTIVE`; end → `ENDED`; close → `CLOSED`;
  cancel → `CANCELLED`.
- Close expires all grants immediately.
- End sets `access_expires_at = ends_at + 24h`; a sweeper expires later.
- Cancel revokes immediately.
- Reopen requires `events.manage` and a reason; issues new grants, never revives
  expired ones silently.
- `attendance.context.assign` controls EVENT vs DTR.
- DTR eligibility uses active `person_assignments` until a work-schedule table
  exists.
- Reports and exports separate EVENT and DTR.

**Exit criteria**

- Closing an event denies the next scan immediately.
- An event ended but not closed allows scans for 24 hours, then denies.
- A cancelled event denies immediately.
- An EVENT report never includes DTR records, and vice versa.

### Phase 4 — Migration close-out and hardening

- Remove the legacy `memberships.role` enum after one release.
- Remove the `PRISM1` verification path after the migration window.
- Add access-review report: roles, overrides, last use, unused roles.
- Add anomaly detection for repeated/cross-location QR use.
- Add optional person photo storage and scanner display; add the
  photo-confirmation policy and optional live challenge for high-assurance
  events.
- Add SIEM/export for audit.
- Finalize the SSOT and delete superseded docs.

## 5. Data migration

1. Seed the four global roles and their capabilities.
2. For each tenant, create the custom roles listed in the SSOT migration table
   (`Manager`, `Supervisor`, `Scanner`, `Viewer`) with the closest capability
   set. `Manager` uses the `TENANT_ADMIN` base because the legacy role held
   device/geofence management; the others use `STAFF`.
3. Backfill `membership_roles` from `memberships.role`.
4. Preserve `membership_permissions`; map old keys to new capabilities. Unknown
   keys are dropped with an audit row naming the old key.
5. Keep `memberships.role` for one release; dual-read and dual-write during the
   transition.
6. Backfill session `status` from `startsAt`/`endsAt`; default `context` to
   `EVENT`, with `SHIFT`/`OJT` mapped to `DTR` pending review.
7. Issue identity credentials for every existing `users` row with a linked
   person; leave legacy passes valid until the migration window closes.
8. Rollback: keep the new tables additive; do not drop old columns until one
   clean release has passed. A feature flag can switch the gate back to the old
   resolver.

## 6. Test plan

**Policy and matrix**

- Every base role × every capability snapshot.
- Ceiling test: a Staff override cannot grant `billing.manage` or
  `tenant.admin.appoint`.
- Deny-wins test.
- Multi-role union test.
- Scope test: `ASSIGNED` staff cannot read an unassigned event; `TENANT` staff
  can; `SELF` attendee sees only own records.
- Rank test: Tenant Admin cannot assign Tenant Admin or Owner.
- Self-escalation test.
- Last-owner and last-superadmin tests.

**Route contracts**

- Table-driven: role/capability → expected status and one audit row.
- Org Owner gets 403 on every platform route.
- Staff gets 403 on every admin route.
- A tenant-scoped request never reads another tenant.

**Identity and QR**

- Valid identity + active grant → accepted.
- Valid identity + no grant → denied.
- Revoked/reissued credential → old QR fails.
- Legacy `PRISM1` accepted during migration, rejected after.
- Static QR copied to a second device → anomaly/audit path (policy-dependent).

**Event lifecycle**

- Scheduled → early window denied by default.
- Active → accepted.
- Closed → denied immediately.
- Ended but not closed → accepted, then denied after 24h.
- Cancelled → denied immediately.
- Reopened → new grants only.

**Auth**

- Google first sign-in provisions one internal user.
- Repeated sign-in is idempotent.
- Verified-email link works; unverified/conflicting email is refused.
- Event invite claim matches the verified email.
- Staff Google account with no membership gets no tenant access.

**Migration**

- Role mapping preserves effective access for every existing membership.
- Overrides map or are dropped with audit.
- Existing pass scans still work during the window.

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Static QR can be copied and shared | Access still requires a grant; name/photo on scanner, anomaly detection, revoke/reissue, optional live challenge |
| Encrypted QR secret store becomes a high-value target | AES-256-GCM envelope encryption, key rotation, owner-only reveal, audit and rate limits; never log plaintext |
| Superadmin god mode is a single point of abuse | MFA, full audit in both planes, tenant-visible actions, at least two Superadmins |
| Per-user overrides drift from roles | Show role + overrides, “reset to defaults,” access-review report, audit before/after |
| Custom role explosion | Cap at 20 active per tenant; archive instead of delete; show unused roles |
| Google account duplication | Verified-email linking only; refuse auto-merge on conflict |
| Migration changes effective access | Matrix tests per existing role; dual-read/dual-write; rollback flag |
| Timezone mistakes in 24h expiry | Store UTC, compute `access_expires_at` server-side, test DST boundaries |
| EVENT and DTR data mix | `context` column on sessions/records/reports; separate filters and exports |
| Tenant Admin cannot recover a rogue Owner | Superadmin god mode is the recovery path; ownership transfer is explicit and audited |

## 8. Out of scope

- Additional platform roles (support, billing, auditor) — Superadmin covers them
  until real separation is needed.
- Custom capabilities invented by tenants.
- A full ABAC/policy engine (Cedar/OPA/SpiceDB). The pure policy module is the
  seam.
- Payroll integration for DTR.
- Billing-provider implementation.
- Cross-tenant identity merging beyond verified-email linking.

## 9. Acceptance criteria

1. A Superadmin can create a tenant, seed the four defaults, and add a custom
   “Secretary” role based on Staff.
2. A Tenant Admin can assign that role, grant one extra capability to one
   secretary, and see the override in an access review.
3. A Staff user can record attendance and self check-in, but cannot manage roles,
   billing or another tenant.
4. An Attendee signs in with Google, sees one stable QR, and uses it at multiple
   events where they hold grants.
5. A valid QR with no grant is denied; a closed event denies immediately; an
   ended-but-unclosed event denies after 24 hours.
6. A Tenant Owner sees Superadmin actions that touched their tenant in the
   tenant audit.
7. Existing users retain equivalent access after migration.
8. No route trusts a client-declared role, capability or tenant.

## 10. Immediate next steps

1. Review and accept [rbac-ssot.md](rbac-ssot.md).
2. Freeze the capability keys and the base-role ceilings.
3. Implement Phase 1 policy module and schema migration.
4. Add the matrix/route-contract tests before converting routes.
5. Convert the platform and tenant gates, then the UI surfaces.
