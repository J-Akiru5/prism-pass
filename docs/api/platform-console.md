# Platform console API (P8 → P9 super-admin)

Platform administration is separate from organization administration (ADR-11).
The console lives under `/platform`; every endpoint below calls
`requirePlatformAdmin` **before** parsing input or touching the database. An
organization OWNER — including an OWNER of every tenant — receives
`403 FORBIDDEN`. UI visibility is never the control: page layouts re-check the
gate server-side, and the API routes are the authority.

> **Planned change:** the platform gate becomes a single `SUPERADMIN` role, and
> tenant permissions move to the role/capability model in
> [rbac-ssot.md](../security/rbac-ssot.md). This file documents the current
> implementation until Phase 1 of the adoption plan in
> [rbac-ssot.md](../security/rbac-ssot.md).

Every response uses the v1 envelope: `{ data, meta? }` on success and
`{ error: { code, message, details? } }` on failure. Mutations validate with
zod, write an audit row in the same transaction as the change, and return the
authoritative row rather than echoing the request.

## Pages

| Page | Route | What it does |
|---|---|---|
| Overview | `/platform` | One hairline stat rail of aggregate counts + recent platform audit |
| Organizations | `/platform/orgs` | Search/status filter, pagination, provision tenant, suspend/reactivate |
| Organization detail | `/platform/orgs/[orgId]` | Status control, plan/entitlements editor, read-only members, counts, last 20 audit rows |
| Platform admins | `/platform/admins` | List grants, grant by e-mail or user id, revoke with reason |
| Audit explorer | `/platform/audit` | Cross-tenant filter/search/pagination + CSV of the current filter |
| Health | `/platform/health` | Version/phase, real DB round trip, migration files, per-org last activity |

The shell has a deep-navy desktop sidebar, sticky paper header with a skip link,
and a five-item mobile bottom nav. All primary targets are ≥44px. No KPI card
grids: counts use a single `<dl>` stat rail with hairline rules and tabular
figures.

## `GET /api/v1/platform/overview`

Platform admin only. No parameters.

```json
{
  "data": {
    "counts": {
      "organizations": { "total": 4, "active": 3, "suspended": 1, "pendingDeletion": 0 },
      "users": 128,
      "activePasses": 97,
      "sessionsToday": 12,
      "eventsToday": 240,
      "pendingApprovals": 6,
      "platformAdmins": 2
    },
    "activity": [
      {
        "id": "…",
        "action": "org.suspend",
        "result": "ok",
        "organizationId": "…",
        "organizationName": "Acme",
        "createdAt": "2026-02-01T10:00:00.000Z"
      }
    ],
    "generatedAt": "2026-02-01T10:05:00.000Z"
  }
}
```

- Every number is a database `count()`; no tenant rows are read.
- `sessionsToday` / `eventsToday` use the **UTC calendar day** because a
  platform-wide aggregate has no single tenant timezone. Tenant reports stay
  local-timezone correct.
- `pendingApprovals` = attendance records with `approval_status = PENDING`.
- `activity` is the newest 12 audit rows whose action starts with `platform.`
  or whose meta declares `scope: "platform"`. It includes provisioning,
  suspension, plan changes, admin grants/revokes and audit exports.
- Without `DATABASE_URL` the endpoint returns `503 DB_NOT_CONFIGURED`; it never
  fabricates zeroes and calls them measurements.

## `GET /api/v1/platform/orgs`

Platform admin only.

| Param | Rule |
|---|---|
| `page` | integer ≥ 1, default 1 |
| `pageSize` | integer 1–100, default 20 (out of range → `400 INVALID_INPUT`, never clamped) |
| `status` | `ACTIVE` \| `SUSPENDED` \| `PENDING_DELETION` |
| `q` | 1–64 chars, case-insensitive match on name or slug |

Response: `{ data: PlatformOrgRow[], meta: { page, pageSize, total, totalPages, hasNext, hasPrevious } }`
where a row is:

```ts
{ id, name, slug, status, memberCount, passCount, createdAt, lastActivityAt }
```

- `memberCount` = ACTIVE memberships, `passCount` = ACTIVE passes.
- `lastActivityAt` = newest `audit_logs.created_at` for the org, or `null`.
- Shaping is an allowlist (`shapePlatformOrgRow`): member names, e-mails,
  credentials and any org-scoped row are dropped even if the query widens.
- Ordering is `createdAt desc, id desc` so pages cannot repeat or skip a row when
  seed timestamps tie.
- A row's name links to the organization detail page.

## `POST /api/v1/platform/orgs`

Platform admin only. Body:

```ts
{
  name: string(2–120),
  slug: string(2–64, lowercase letters/numbers/single hyphens),
  timezone?: string(1–64, default "Asia/Manila"),
  plan?: "pilot" | "standard" | "enterprise" (default "pilot")
}
```

Provisions the organization, an `organization_subscriptions` row with the plan's
default entitlements, and one `platform.org.create` audit row in a single
transaction. Response `{ data: { id, name, slug, status, timezone, createdAt, plan } }`.

Failure modes: `400 INVALID_INPUT`, `409 SLUG_TAKEN`, `503 DB_NOT_CONFIGURED`.
This mirrors the existing `POST /api/v1/orgs` semantics, adds the subscription
and records the acting platform admin as the audit actor.

## `GET /api/v1/platform/orgs/options`

Platform admin only. Compact filter list for the audit explorer:

```json
{ "data": [{ "id": "…", "name": "Acme", "status": "ACTIVE" }],
  "meta": { "total": 4, "truncated": false } }
```

Identity only — no counts or members. Capped at 1,000 tenants; `truncated` says
whether more exist rather than silently omitting them.

## `GET /api/v1/platform/orgs/[orgId]`

Platform admin only. Returns:

```ts
{
  organization: { id, name, slug, status, timezone, createdAt },
  subscription: { exists, plan, entitlements: Record<EntitlementKey, boolean> },
  counts: { members, activePasses, sessions, events, records, documents },
  members: { id, email, role, status, revokedAt }[],   // max 200, read-only
  membersTruncated: boolean,
  audit: { id, organizationId, organizationName, actorUserId, action, resource, result, createdAt, reason }[] // last 20
}
```

- `counts.members` = ACTIVE memberships. `members` includes revoked memberships
  so the operator sees status, but it is a **documented, read-only exception** to
  aggregate-only: it carries e-mail, role and status, nothing else (no passes,
  credentials, person rows or permission overrides).
- `audit` is shaped by the same allowlist as the explorer; tenant `meta`
  (person ids, geo results, adjustment notes) is never forwarded. Only a
  platform-scope `reason` is surfaced.
- `404 NOT_FOUND` for an unknown id, `503 DB_NOT_CONFIGURED` without a database.

## `POST /api/v1/platform/orgs/[orgId]/status`

Platform admin only. Body `{ status: "ACTIVE" | "SUSPENDED", reason?: string(3–280) }`.
Response `{ data: { id, name, slug, status, changed } }`.

### Suspend / reactivate rule

1. **Reactivation (`→ ACTIVE`) is never gated.** From `SUSPENDED` or
   `PENDING_DELETION` it always succeeds, so there is always a way back.
2. **Suspension (`→ SUSPENDED`) requires at least one other active platform
   admin.** If the caller is the only platform admin the request is refused
   with `409 LAST_PLATFORM_ADMIN`; grant a second admin first. Rationale: a
   lone operator must not be able to make a platform-wide change that nobody
   else can reverse. `platform_admins` has no status column, so presence is
   the grant.
3. **Repeating the current status is a no-op** (`changed: false`, HTTP 200) and
   writes no audit row.
4. **A tenant pending deletion can only be reactivated**, never suspended
   (`409 INVALID_TRANSITION`).
5. **An ACTIVE org OWNER is deliberately not required.** ADR-11 separates
   platform authority from org membership, so suspending an abandoned or
   OWNER-less tenant must remain possible.

Accepted transitions write one audit row, in the same transaction as the
update: `action: org.suspend | org.reactivate`, `result: ok`,
`meta: { previousStatus, nextStatus, scope: "platform", reason? }`,
`actorUserId` = the acting platform admin. Refusals write `result: denied` with
the reason code (permission-matrix denial rule), except no-ops which write
nothing.

Suspension takes effect on the next request: `requireOrganizationPermission`
already refuses a non-`ACTIVE` organization, so members, scanners and pass
verification fail closed until reactivation.

## `PATCH /api/v1/platform/orgs/[orgId]/plan`

Platform admin only. Body:

```ts
{
  plan: "pilot" | "standard" | "enterprise",
  entitlements?: Partial<Record<"passes" | "attendance" | "geofence" | "documents" | "reports" | "offline", boolean>>,
  reason?: string(3–280)
}
```

Unknown top-level fields and unknown entitlement keys are rejected with
`400 INVALID_INPUT`; the console cannot invent entitlement names. Stored JSON
keys outside the allowlist are **preserved** by the merge, never dropped.

Response `{ data: { plan, entitlements, changed } }`:

- A no-op returns `changed: false` and writes no audit row.
- A real change upserts `organization_subscriptions` and writes
  `org.plan.update` (`scope: "platform"`, previous/next plan, effective
  entitlements, optional reason) in one transaction.
- `409 INVALID_STATE` when the tenant is `PENDING_DELETION`.
- `404 NOT_FOUND` for an unknown tenant.

Plans are an allowlist in `modules/platform/console.ts` (`pilot`, `standard`,
`enterprise`). Adding a plan is a code change plus a test, not a dashboard
mutation. Entitlements are labelled in the console as the effective switch;
enforcement in tenant routes is a later phase and is not implied by this
endpoint.

## `GET /api/v1/platform/admins`

Platform admin only. Returns `{ data: PlatformAdminRow[], meta: { total, selfUserId } }`:

```ts
{ userId, email, grantedAt, isSelf }
```

`email` may be `null` when the linked user has no address. `selfUserId` lets the
UI disable self-revoke; the server enforces the rule regardless.

## `POST /api/v1/platform/admins`

Platform admin only. Body — exactly one of `userId` or `email`, plus a required
reason:

```ts
{ userId?: string, email?: string, reason: string(10–280) }
```

- An e-mail is resolved case-insensitively to the internal user server-side.
  If more than one internal user matches, `409 AMBIGUOUS_EMAIL` asks the
  operator to use the user id.
- Unknown user → `404 USER_NOT_FOUND`.
- Existing grant → `409 ALREADY_PLATFORM_ADMIN` (no silent upsert).
- Success creates `platform_admins` and `platform.admin.grant`
  (`scope: "platform"`, reason, `via: "email" | "userId"`) in one transaction.

## `POST | DELETE /api/v1/platform/admins/[userId]/revoke`

Platform admin only. The reason is required (`10–280`). `POST` reads it from a
JSON body `{ reason }`; `DELETE` accepts `?reason=…` or the same JSON body.

- `404 NO_GRANT` when the user has no platform grant.
- `409 CANNOT_REVOKE_SELF` — revoking yourself would immediately remove your own
  console access.
- `409 LAST_PLATFORM_ADMIN` — at least one admin must remain.
- The count and delete run in a `Serializable` transaction so two concurrent
  revokes cannot both observe "two admins" and leave the platform with zero.
  A serialization failure returns `409 CONFLICT`; retry after refresh.
- Success deletes the grant (the user, membership and tenant data are untouched)
  and writes `platform.admin.revoke` with the reason.

## `GET /api/v1/platform/audit`

Platform admin only. Cross-tenant ledger, newest first.

| Param | Rule |
|---|---|
| `page` | integer ≥ 1, default 1 |
| `pageSize` | integer 1–100, default 25 |
| `organizationId` | exact organization id |
| `action` | 1–100 chars, case-insensitive `contains` |
| `result` | 1–40 chars, case-insensitive exact match |
| `from`, `to` | both or neither, `YYYY-MM-DD`, inclusive, max 366 days |
| `format` | `json` (default) or `csv` |

JSON response: `{ data: PlatformAuditRow[], meta: PageMeta }` where a row is
`{ id, organizationId, organizationName, actorUserId, action, resource, result, createdAt, reason }`.

- `meta` is not forwarded wholesale. Only a string `reason` written with
  `scope: "platform"` is exposed; tenant audit meta stays in the database.
- Missing one date, reversed dates, a non-canonical date or a >366-day range →
  `400 INVALID_INPUT` with a message. Values are rejected, not clamped.
- `format=csv` returns `text/csv` with an attachment filename and the shared
  RFC 4180 writer (`modules/reports/csv.ts`, including the formula-injection
  guard). It exports the current filter, newest first, capped at **5,000** rows.
- An export writes `platform.audit.export` with the filter and row count. Reads
  are not audited; exports are.

Known result values include `ok`, `denied`, `accepted`, `rejected`, `adjusted`,
`pending`, `valid_duplicate`, `invalid_batch`. The result filter is a string,
not an enum, so a new writer's result remains findable.

## `GET /api/v1/platform/health`

Platform admin only. Everything is measured:

```ts
{
  app: { status, service, phase, version, time },
  database: { configured, ok: boolean | null, latencyMs: number | null, error: string | null },
  migrations: { available, count, files: string[], note? },
  organizations: { id, name, status, lastActivityAt }[], // newest 20
  activityError: string | null,
  generatedAt
}
```

- Database latency is one real `SELECT 1` timed server-side. A failure returns
  `ok: false`, `latencyMs: null` and a generic message — never a guessed number,
  and never a connection string.
- Without `DATABASE_URL`, `configured: false`, `ok: null` and no per-org rows.
- Migration files are read from `supabase/migrations` in the runtime. If the
  folder is absent (some serverless bundles), `available: false` with a note —
  the console does not claim "zero migrations".
- Per-org activity is `MAX(audit_logs.created_at)` grouped by organization,
  sorted newest first, capped at 20. It runs as a second, independent query: a
  failure there returns `activityError` without turning the successful database
  probe into a false "down" reading.
- `GET /api/v1/health` remains public and is fetched by the health page so the
  console can show the public probe result alongside the gated measurements.

## Data exposure contract

Aggregate-only is the default for platform reads. Two exceptions are deliberate,
limited and written down here:

1. **Organization detail member list** — e-mail, role, membership status and
   revocation time for up to 200 memberships. Read-only; no member mutation
   endpoint exists in the platform API.
2. **Audit explorer / last-20 list** — the audit ledger itself is cross-tenant by
   definition, including actor user ids, resource ids, actions and results.
   Platform-scope reasons are included; tenant meta is not.

Organization names are also returned by the overview activity feed and the
options endpoint; names are already visible on the organizations ledger.
Platform admin e-mails are returned to platform admins on the admins page. No
pass credentials, credential hashes, person records, membership overrides or
tenant documents are exposed by any platform endpoint.

## What a platform admin can and cannot do

**Can**

- Provision a tenant, set its plan and entitlements, suspend and reactivate it.
- Read aggregate counts for the deployment and the last activity per tenant.
- Read a tenant's member roles/status and its recent audit rows for support.
- Search the cross-tenant audit ledger and export the current filter.
- Grant and revoke platform admin access with a recorded reason.
- Measure application, database and migration health.

**Cannot (deliberately, for now)**

- Edit tenant records, attendance, passes, people or memberships. There is no
  platform endpoint for those mutations; owner-role APIs remain tenant-scoped.
- Impersonate a tenant user. ADR-11 calls for audited, time-boxed break-glass
  impersonation — it is **not implemented yet**.
- Delete an organization. Retirement is a status (`PENDING_DELETION`) and a
  separate operational process; no hard delete endpoint is exposed.
- Run migrations, rotate credentials or manage billing through the console.
- Revoke their own grant or leave the platform with zero admins.
- Bypass `requirePlatformAdmin` by calling an owner API: platform authority and
  organization membership are separate tables checked by different helpers.

## Failure modes

| Status / code | Meaning |
|---|---|
| `401 UNAUTHENTICATED` | No verified session |
| `403 FORBIDDEN` | Signed in, but no `platform_admins` row |
| `400 INVALID_INPUT` | zod validation, bad pagination, bad date range, unknown plan/entitlement key |
| `404 NOT_FOUND` / `USER_NOT_FOUND` / `NO_GRANT` | Unknown tenant, user or grant |
| `409 SLUG_TAKEN` | Provisioning collision |
| `409 LAST_PLATFORM_ADMIN` | Suspend or revoke would remove the only reversal path |
| `409 CANNOT_REVOKE_SELF` | Self-revoke attempted |
| `409 ALREADY_PLATFORM_ADMIN` / `AMBIGUOUS_EMAIL` | Duplicate or ambiguous grant |
| `409 INVALID_TRANSITION` / `INVALID_STATE` | Suspending a pending-deletion tenant; editing its plan |
| `409 CONFLICT` | Serializable transaction lost a race; refresh and retry |
| `503 DB_NOT_CONFIGURED` | No `DATABASE_URL`; the console reports it instead of showing fake data |
| `500 INTERNAL` | Unexpected failure; the route logs it and returns no detail |

## Storage notes

No schema change was required. Plans live in the existing
`organization_subscriptions.plan` string and entitlements in its JSON column.
Admin grants use the existing `platform_admins` table (presence is the grant;
there is no revoked-at column), and platform audit rows use the existing
nullable `audit_logs.organization_id`. No `0009_platform.sql` was added because
adding unused columns would create a second source of truth.
