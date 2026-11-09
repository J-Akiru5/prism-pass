# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[docs/ops/release-and-versioning.md](docs/ops/release-and-versioning.md).

## [Unreleased]

### Added
- Self-serve account creation at `/signup`: Supabase sign-up with email confirmation, an idempotent
  `POST /api/v1/auth/provision` endpoint that links the auth identity to an internal user, and a
  clear "no organization access yet" boundary. No schema migration.
- Password recovery: `/forgot-password` request form, shared `/auth/confirm` callback for `code` and
  `token_hash` links, and `/reset-password` with a session-gated password update.
- Show/hide password control on login, signup and reset forms, with accessible labels and no layout
  shift.
- Visible "Back to home" links on all public auth pages, plus a pilot Terms of Service page.
- Offline queue: terminal `blocked` state for revoked/unregistered device keys, explicit rebind for
  rows captured under another device, a 30-second sync request timeout, and a single-tab sync lock.
- Member landing: MEMBER accounts skip the console chooser and open their pass; the pass card now
  displays a stable QR derived from `PASS_QR_SECRET`. Legacy random-secret passes can be re-issued
  from the member page. No database migration.

### Fixed
- Login now distinguishes an unconfirmed email from a wrong password, so the user is told to check
  their inbox instead of seeing a generic credential error.
- The member pass card no longer prints the full QR secret as text; only the QR and public pass id
  are shown.
- Device revocation no longer causes an infinite retry loop; queued scans stay intact until the device
  is re-registered and retried explicitly.
- Sync now honours a server `Retry-After` as a floor instead of retrying after the shorter 1-second
  backoff.
- A hung sync request can no longer leave rows `inflight` until the lease expires; it fails into the
  normal backoff path.

### Security
- Login now validates the `next` parameter with the shared same-origin guard, closing an open-redirect
  path.
- Auth callbacks are limited to supported OTP types and safe internal destinations; provisioning is
  session-gated and requires a confirmed email.

## [0.3.1] - 2026-11-09

Hardening release: QR verification, offline queue resilience and deployment governance.

### Added
- Offline queue: terminal `rejected` state with explicit retry/remove, 2-minute inflight
  leases for multi-tab/crash recovery, a 2,000-row capacity bound with typed errors,
  deterministic retry jitter, and AES-GCM at-rest encryption using a non-extractable
  IndexedDB key.
- CI: Node 22 workflow with Corepack pnpm 10.33.3, pnpm store cache, blocking secret scan,
  typecheck, tests and build on `main`/`develop` and pull requests.
- Security docs for QR verification, offline queue hardening and deployment governance.

### Changed
- Deployment allowlist is `main` + `develop`; `staging` is retired and ineligible.
  Branching, release, README and roadmap docs are reconciled with that decision.
- QR payloads are bounded and strict: pass IDs are `[A-Za-z0-9_-]{1,64}`, the payload is
  capped at 136 characters, and whitespace/trailing data is rejected.
- Invalid or unparseable pass expiry now fails closed as `INVALID_EXPIRY` (410).
- Permanent offline rejections no longer auto-retry; rejected rows stay visible until the
  user retries or clears them.

### Fixed
- Credential hashes are compared with a shared `timingSafeEqual` helper in both the
  verify-only endpoint and the attendance scan path.
- Duplicate offline enqueue by idempotency key returns the existing row instead of throwing.
- Stale inflight rows from a crashed tab are reclaimed only after the lease; a live send is
  not stolen by another tab.
- Queue storage failures (quota, capacity, encryption unavailable) surface to the scanner
  instead of silently dropping scans.

### Security
- Constant-time pass-credential comparison.
- AES-GCM encryption of queued scan credentials at rest; capture is refused rather than
  stored as plaintext when secure storage is unavailable.
- `vercel.json` and CI restrict deployment to `main` and `develop`; staging and task
  branches are refused before a build starts.

## [0.3.0] - 2026-11-08

Platform console, security hardening, offline scanner, accessibility and scoping.

### Added
- **Platform (super-admin) console:** overview stat rail, organization ledger with search/status/pagination,
  organization detail with plan + entitlement editor, platform-admin grants/revokes with required reasons,
  cross-tenant audit explorer with CSV export, and a health view with measured DB latency. Every route
  gated by `requirePlatformAdmin`; last-admin and self-revoke guards.
- **Security:** HSTS/nosniff/referrer/frame headers, nonce CSP in `Report-Only` with a promotion
  checklist, token-bucket rate limiting (per IP and per org) on verify/scan/sync/public-verify,
  `readJson` body ceilings on every JSON route, bounded query params, blocking secret scan in CI,
  `DEMO_MODE` warning banner.
- **Offline scanner:** queue on offline/fetch failure/transient 5xx, explicit "Queued offline — not
  recorded" state, signed batch flush with replay retry and backoff, queue panel with per-item reasons.
- **Reports/records scoping:** OWNER/ADMIN org-wide, MANAGER/SUPERVISOR program-scoped, MEMBER/SCANNER
  self-only, VIEWER masked and only with an explicit grant.
- **Device revocation:** idempotent, audited, clears the stored secret; revoked devices are rejected by
  `sync/batches` with a distinct code.
- **Error boundaries:** `app/error.tsx` and `app/global-error.tsx` with support references.

### Changed
- Accessibility: focus rings restored at 14.6:1, dialog focus trap + restore, single `h1` per page,
  `aria-invalid`/`aria-describedby` on form errors, table captions and keyboard-scrollable regions,
  success contrast raised to 4.85:1.

### Fixed
- API routes now refresh expired sessions (middleware matches `/api/*`).
- Non-blocking dependency audit no longer raises a red CI annotation.

## [0.2.0] - 2026-11-08

First slices of P4–P8 shipped in one batch (phase numbers and versions are independent).

### Added
- P4 geo verification: server-side `geoResult`/`geofenceId` on every scan, `off|flag|enforce` policies,
  `GEO_OUTSIDE` rejection, geofence CRUD, migration `0004_geo.sql`.
- P5 documents and e-signature: canonical hashing, hash-chained signature events, signing order,
  consent version, sealed-on-final-sign, public minimal verify, migration `0007_documents.sql`.
- P6 offline sync: HMAC device signing, replay-proof batches with per-item idempotency, versioned
  sync bundle, Dexie queue, shared `scan-service` used by both online and offline writes,
  migration `0008_offline.sql`.
- P7 workflows: DTR aggregation with RFC4180 CSV export, formula-injection guard, VIEWER masking,
  92-day cap, audit ledger endpoint and page, record-level approve/reject.
- P8 platform console: aggregate org ledger, audited suspend/reactivate with a sole-admin guard.
- Brand system: flat "Aperture P" mark, icon/apple-icon/OG assets, exploration sheet, usage doc.
- UX: membership-driven console chooser, scanner and member portal without pasted org UUIDs,
  editorial organization dashboard, console exits everywhere.

### Fixed
- Enum columns stored as text broke every enum filter; migration `0006_enum_columns.sql` converts them.
- Supabase pooler needed `pgbouncer=true` for Prisma prepared statements (`lib/db.ts`).
- Functions ran in `iad1` against a Sydney database (seconds per request); pinned to `syd1`.
- API routes never refreshed expired sessions; middleware now matches `/api/*`.
- Demo QR payloads used a non-hex secret and could never verify; the seed now derives 64-hex secrets.

## [0.1.0] - 2026-11-04

Foundation through P3, built and verified before this changelog existed; reconstructed from
`docs/roadmap/PLAN.md`.

### Added
- Phase 0 specification: architecture overview, ERD, permission matrix, tenancy isolation model,
  attendance state machine, signature lifecycle, geo verification, offline sync protocol, API
  contracts v1, ADR-01…12.
- Next.js 15 App Router application: marketing site, `/login`, `/consoles`, org console
  (`/org/[orgId]/{people,passes,attendance,reports,settings}`), member portal, `/scan`, `/platform`.
- Supabase auth (browser/server/middleware), fail-closed `requireOrganizationPermission`, Prisma
  schema (24 models), tenant resolver.
- Migrations: `0001_foundation`, `0002_tenant_rls`, `0003_attendance_engine`.
- Identity and passes: people directory CRUD, pass issue/verify/revoke/rotate, opaque
  `PRISM1:public:secret` QR with hash-only storage, printable IDs.
- Attendance engine: policies, sessions, scans, records, adjustments, approvals.
- Design system on navy/gold/paper tokens, light and dark themes, 36 vitest tests.
