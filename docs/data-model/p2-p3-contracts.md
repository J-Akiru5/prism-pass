# P2/P3 Shared Data Contracts (normative for this phase)

SSOT: `docs/roadmap/PLAN.md`. ERD: `docs/data-model/erd.md`. Permissions: `docs/security/permission-matrix.md`.

## 1. One attendance engine (no per-group engines)
Employees, interns, and event participants are ALL `people` rows distinguished ONLY by
`person_assignments` → `programs.kind` (`employee | intern | event | class | visitor | training`).
There is exactly one scan path: `POST /sessions/:id/scans` → verify pass → append
`attendance_events` → reconcile `attendance_records`. No separate tables, routes, or logic per group.

## 2. Person (People Directory)
- `people`: `{ id, organizationId, userId?, displayName(1..120), externalId?(≤64, unique per org when set), status: active|inactive, createdAt }`.
- `person_assignments`: `{ id, organizationId, personId, programId?, role default participant, startsAt?, endsAt? }`.
- `programs`: `{ id, organizationId, name, kind }` — kind is a free label in v1 (`employee|intern|event|...`).
- Rules: person + assignment + program all in SAME org (composite enforcement at API; FK + org check).
  `externalId` collide in same org → 409. Status `inactive` → scans rejected (like revoked pass path).
- Permissions: list/create/update/assign = `members.manage` (scoped for MANAGER in P3+; v1 = same-org check).

## 3. Pass (Digital Identity)
- `passes`: `{ id, organizationId, personId, passPublicId unique/org, version, status ACTIVE|REVOKED|EXPIRED, credentialHash unique/org, expiresAt?, revokedAt?, createdAt }`.
- QR payload (opaque, no PII): `PRISM1:<passPublicId>:<64-hex-secret>`. Only `sha256(passPublicId:secret)` stored.
- Lifecycle: issue → ACTIVE; rotate → version++, new hash, old secret dead; revoke → REVOKED + revokedAt;
  expiry → EXPIRED by status or past `expiresAt`. Verify checks all + org ACTIVE + person active + same org.
- Permissions: issue/rotate/revoke = `passes.revoke` (per matrix OWNER/ADMIN/MANAGER-scoped); verify/scan = `attendance.scan`.

## 4. Attendance session + policy
- `attendance_policies`: `{ id, organizationId, name, graceMin default 10, lateThresholdMin default 15, duplicateWindowSec default 120, geoMode default flag, evidenceRequired[], approvalSteps[] }`.
- `attendance_sessions`: `{ id, organizationId, policyId (same org), type EVENT|OJT|SHIFT|CLASS|VISITOR|TRAINING, title, startsAt, endsAt, timezone }`.
- Rules: `endsAt > startsAt`; policy must belong to same org; session type is informational — engine behavior identical for all types.

## 5. Scan → event → record (canonical write path)
`POST /orgs/:orgId/sessions/:sessionId/scans { credential, clientTs, direction auto|in|out, idempotencyKey?, geo?, deviceId? }`
1. Auth: `attendance.scan` in explicit org (suspended org / revoked member → 403).
2. Verify pass exactly like verify endpoint (parse → org-scoped lookup → person same org + active → hash → status/expiry). Failure → matching error code, audit, NO event written (except audit).
3. Duplicate: same `(org, idempotencyKey)` → return existing event (200, `dedupe:true`). Same pass re-scan within policy `duplicateWindowSec` → `VALID_DUPLICATE`, event type `DUPLICATE_DETECTED`, no record change.
4. Append `attendance_events`: `{ organizationId, sessionId, personId, passId, passVersion, type CHECK_IN|CHECK_OUT (auto: first=IN, else toggle by existing record), clientTs, lat/lng/accuracy?, geoResult NOT_CAPTURED v1, deviceId?, networkState online, source scanner, idempotencyKey (server-generated uuid if absent), status accepted }`.
5. Reconcile `attendance_records` unique `(org, session, person)`: set checkIn/checkOut event ids, `durationMin`, `status` via lateness (`PRESENT|LATE|ABSENT` from policy grace), `approvalStatus NONE`, `exceptionFlags[]`.
6. Audit `attendance.scan` with `{ sessionId, personId, eventId, direction, duplicate }`.
- `GET /records?sessionId&personId&status` — `attendance.scan` (read own scope; MANAGER scoped later).
- `POST /events/:id/adjust { reason, ... }` — `attendance.override` + reason required + audit `attendance.adjust` (writes compensating event, never mutates history).
- `POST /events/:id/approve|reject` — `attendance.approve` + audit.

## 6. Envelopes + errors (contracts-v1)
Success `{ data, meta? }`; errors `INVALID_INPUT 400 | UNAUTHENTICATED 401 | FORBIDDEN 403 | NOT_FOUND 404 | CONFLICT 409 | RATE_LIMITED 429`.
Cross-org IDs → 403/404, never leak. Every mutation → `audit_logs`.
