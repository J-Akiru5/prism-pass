# API Contracts v1 (Phase 0 — normative)

Base: `/api/v1`. Auth: Supabase session cookie (server verified). Org context from **verified membership**, not client-supplied authority. `X-Org-Id` is a selector hint only.

## Envelopes
Success: `{ data, meta? {page, pageSize, total} }`. Error: `{ error: { code, message, details? } }` with `INVALID_INPUT(400) | UNAUTHENTICATED(401) | FORBIDDEN(403) | NOT_FOUND(404) | CONFLICT(409) | RATE_LIMITED(429)`.
Validation: Zod on server. Pagination: `?page&pageSize (max 100)`. Rate-limit scanners/sync strictly.

## Endpoints (all org-scoped unless noted)
- `POST /orgs` (platform or bootstrap) / `GET /orgs/:orgId` / `PATCH /orgs/:orgId` (`organization.manage`)
- `GET/POST /orgs/:orgId/memberships`, `PATCH /orgs/:orgId/memberships/:id`, `POST .../revoke` (`members.manage`)
- `GET/POST /orgs/:orgId/people`, `GET/PATCH /orgs/:orgId/people/:id`, `POST .../assignments`
- `POST /orgs/:orgId/passes` (issue), `POST /orgs/:orgId/passes/:id/revoke`, `POST /orgs/:orgId/passes/:id/rotate`, `GET /orgs/:orgId/passes/verify?credential=...` (scanner)
- `GET/POST /orgs/:orgId/policies`, `GET/POST /orgs/:orgId/sessions`, `GET /orgs/:orgId/sessions/:id`
- `POST /orgs/:orgId/sessions/:id/scans {credentialId, clientTs, geo?, idempotencyKey}` → `{event, record, geoResult}` (`attendance.scan`)
- `POST /orgs/:orgId/events/:id/adjust {reason,...}` (`attendance.override`), `POST .../approve|reject` (`attendance.approve`)
- `GET /orgs/:orgId/records?sessionId&personId&status`
- `GET/POST /orgs/:orgId/geofences`
- `POST /orgs/:orgId/documents (template+payload)` → `POST .../signature-requests`, `POST .../sign {consentVersion, method, artifact}`, `GET /verify/:token` (public minimal)
- `POST /orgs/:orgId/devices/register`, `GET .../sync-bundle`, `POST /api/v1/sync/batches`
- `GET /orgs/:orgId/reports/dtr?from&to` (CSV/PDF snapshot), `GET /orgs/:orgId/audit`

All mutations require permission per matrix + write `audit_logs`. Cross-org IDs → 403.
