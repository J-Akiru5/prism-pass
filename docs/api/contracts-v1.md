# API Contracts v1 (Phase 0 — normative)

Base: `/api/v1`. Auth: Supabase session cookie (server verified). Org context from **verified membership**, not client-supplied authority. `X-Org-Id` is a selector hint only.

## Envelopes
Success: `{ data, meta? {page, pageSize, total, scope?} }`. Error: `{ error: { code, message, details? } }` with `INVALID_INPUT(400) | UNAUTHENTICATED(401) | FORBIDDEN(403) | DEVICE_REVOKED(403) | DEVICE_UNREGISTERED(403) | NOT_FOUND(404) | CONFLICT(409) | RATE_LIMITED(429)`.
Validation: Zod on server. Pagination: `?page&pageSize (max 100)`. Rate-limit scanners/sync strictly.

## Endpoints (all org-scoped unless noted)
- `POST /orgs` (platform or bootstrap) / `GET /orgs/:orgId` / `PATCH /orgs/:orgId` (`organization.manage`)
- `GET/POST /orgs/:orgId/memberships`, `PATCH /orgs/:orgId/memberships/:id`, `POST .../revoke` (`members.manage`)
- `GET/POST /orgs/:orgId/people`, `GET/PATCH /orgs/:orgId/people/:id`, `POST .../assignments`
- `POST /orgs/:orgId/passes` (issue), `POST /orgs/:orgId/passes/:id/revoke`, `POST /orgs/:orgId/passes/:id/rotate`, `GET /orgs/:orgId/passes/verify?credential=...` (scanner)
- `GET/POST /orgs/:orgId/policies`, `GET/POST /orgs/:orgId/sessions`, `GET /orgs/:orgId/sessions/:id`
- `POST /orgs/:orgId/sessions/:id/scans {credentialId, clientTs, geo?, idempotencyKey}` → `{event, record, geoResult}` (`attendance.scan`)
- `POST /orgs/:orgId/events/:id/adjust {reason,...}` (`attendance.override`), `POST .../approve|reject` (`attendance.approve`)
- `GET /orgs/:orgId/records?sessionId&personId&status` (same person scope as reports)
- `GET/POST /orgs/:orgId/geofences`
- `POST /orgs/:orgId/documents (template+payload)` → `POST .../signature-requests`, `POST .../sign {consentVersion, method, artifact}`, `GET /verify/:token` (public minimal)
- `POST /orgs/:orgId/devices/register`, `GET /orgs/:orgId/devices` (list; never includes `secretHash`), `POST /orgs/:orgId/devices/:deviceId/revoke` (idempotent, audited), `GET .../sync-bundle`, `POST /api/v1/sync/batches`
- `GET /orgs/:orgId/reports/dtr?from&to` (CSV/PDF snapshot), `GET /orgs/:orgId/audit`

All mutations require permission per matrix + write `audit_logs`. Cross-org IDs → 403.

## Report scope (`scope`)

`reports.export` is scoped for MANAGER/SUPERVISOR by the permission matrix. The
DTR export, the CSV audit metadata and `GET /records` share one pure policy
(`modules/reports/scope.ts`):

| `scope` | Roles | People included |
|---|---|---|
| `org` | OWNER, ADMIN | Every person in the organization. VIEWER is also `org` (masked) only when `reports.export` was explicitly granted. |
| `programs` | MANAGER, SUPERVISOR | People with an active `person_assignments` row in a program the caller is also actively assigned to. No program assignment → no rows. |
| `self` | MEMBER, SCANNER | Only the caller's own `people` row (`Person.userId`). No linked person → no rows. |
| `none` | any scoped role with no allow-list | No rows. |

- `GET /reports/dtr` returns `x-report-scope: org|programs|self|none` and
  `x-report-masked: true|false`, and writes `scope`, `scopeReason`,
  `scopedPrograms` and `scopedPeople` into `audit_logs.meta`.
- `GET /records` returns the same label in `meta.scope` and applies the
  allow-list to `personId` (an out-of-scope `personId` returns an empty page).
- `GET /audit` stays org-wide deliberately: it requires `organization.manage`,
  which only OWNER/ADMIN hold (both `org` in the table above), and `audit_logs`
  has no `personId` column to filter on. MANAGER/SUPERVISOR cannot read audit.
- VIEWER output stays masked even with an explicit `reports.export` grant
  (initials + salted external-id pseudonym), matching `modules/reports/masking.ts`.
- **Schema limitation:** `person_assignments` has no supervisor/mentor *person*
  column, so the policy cannot express "this manager supervises Alice but not
  Ben inside one program". Scope is program-wide; the assignment `role` string
  is free text and is not treated as an authority boundary.

## Device revocation

- `POST /orgs/:orgId/devices/:deviceId/revoke` (`devices.manage`) accepts the
  internal id or public id. It is idempotent (`already: true` on repeat,
  original `revokedAt` preserved), clears the stored verifier and writes a
  `device.revoke` audit row.
- `POST /api/v1/sync/batches` rejects a revoked device with
  `403 DEVICE_REVOKED` (distinct from a bad-signature `FORBIDDEN`) and an
  unregistered device with `403 DEVICE_UNREGISTERED`.
- `GET /orgs/:orgId/devices` (`devices.manage`, paginated) returns `id`,
  `devicePublicId`, `role`, `lastSeenAt`, `lastSyncAt`, `revoked`, `revokedAt`.
  `secretHash` is never selected or serialized.
