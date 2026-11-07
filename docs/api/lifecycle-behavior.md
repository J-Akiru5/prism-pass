# Lifecycle API Behavior (Agents 2+3)

## Org lifecycle
- `GET /api/v1/orgs/:orgId` — `organization.manage` in that org OR platform admin. Returns `{ id, slug, name, status, timezone }`. Cross-org → 403/404 (never leaks).
- `PATCH /api/v1/orgs/:orgId { status: ACTIVE|SUSPENDED }` — **platform admin only**. Org OWNER cannot suspend (boundary). Writes audit `org.suspend` / `org.reactivate`.

## Memberships
- `GET /api/v1/orgs/:orgId/memberships` — `members.manage`. Lists `{ id, userId, role, status, revokedAt }`.
- `POST /api/v1/orgs/:orgId/memberships/:membershipId/revoke` — `members.manage`. Sets `REVOKED` + `revokedAt`, audit `membership.revoke`. Refuses last ACTIVE OWNER self-revoke (409). Revoked members fail `requireOrganizationPermission` (403) on next call; no session bypass (status checked per-request + org ACTIVE checked).

## Passes
- `POST /api/v1/orgs/:orgId/passes { personId, expiresAt? }` — `members.manage`. Person must belong to same org. Generates `PRISM1:<passPublicId>:<64-hex-secret>`, stores only `sha256` hash. Returns `qrPayload` ONCE + audit `pass.issue`.
- `POST /api/v1/orgs/:orgId/passes/:passId/revoke` — `passes.revoke`. Sets REVOKED, audit.
- `POST /api/v1/orgs/:orgId/passes/:passId/rotate` — `passes.revoke`. New secret+hash, `version++`, audit `pass.rotate`. Old QR instantly invalid (hash mismatch).
- `POST /api/v1/orgs/:orgId/passes/verify { credential }` — `attendance.scan`. Checks: parse → org-scoped lookup `(org, passPublicId)` → person same org → hash match → status/expiry → org ACTIVE + membership ACTIVE (via tenant) → duplicate window (120s via audit) → persist `pass.verify` audit (`valid` / `valid_duplicate` / `revoked` / `expired` / `credential_mismatch` / `not_found`). Wrong-org → 404 (no cross-tenant oracle). Revoked → 403, expired → 410.

## Scanner outcomes
VALID, VALID_DUPLICATE, INVALID_INPUT(400), NOT_FOUND(404), FORBIDDEN(403 credential), REVOKED(403), EXPIRED(410), suspended org / revoked member / unauthorized → 403 via tenant.
