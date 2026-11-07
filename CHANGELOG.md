# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[docs/ops/release-and-versioning.md](docs/ops/release-and-versioning.md).

## [Unreleased]

### Added
- Branch model `main` (production) / `staging` (preview) / `develop` (integration) with direct merges,
  documented in `docs/ops/branching-and-deployment.md`.
- `vercel.json` deployment allowlist: only `main` and `staging` deploy; every other branch and
  pull-request preview is refused before build.
- Release and versioning process (`docs/ops/release-and-versioning.md`); runtime version exposed by
  `GET /api/v1/health`.
- CI workflow: frozen-lockfile install, Prisma client generation, typecheck, tests and build on
  pushes to `main`, `staging` and `develop`.

### Changed
- README rewritten to match the built state of the repository instead of the stale "spec only" text.
- `package.json` gains the `seed:syntaxure` script that the seed file already documented.

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
