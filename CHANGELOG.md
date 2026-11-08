# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[docs/ops/release-and-versioning.md](docs/ops/release-and-versioning.md).

## [0.2.0] — 2026-11-08

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

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-11-04

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
