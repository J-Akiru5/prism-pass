# Platform console API (P8)

Platform administration is separate from organization administration (ADR-11).
The console lives under `/platform`; every endpoint below requires
`requirePlatformAdmin` in the route handler. An organization OWNER — including
an OWNER of every tenant — receives `403 FORBIDDEN`. UI visibility is never the
control: the ledger also re-reads the gate server-side before rendering, but the
API routes are the authority.

## `GET /api/v1/platform/orgs`

Platform admin only. Query:

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
  Platform reads are aggregate-only by contract.

Ordering is `createdAt desc, id desc` so pages cannot repeat or skip a row when
seed timestamps tie.

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
`actorUserId` = the acting platform admin. Refusals write
`result: denied` with the reason code (permission-matrix denial rule), except
no-ops which write nothing.

Suspension takes effect on the next request: `requireOrganizationPermission`
already refuses a non-`ACTIVE` organization, so members, scanners and pass
verification fail closed until reactivation.
