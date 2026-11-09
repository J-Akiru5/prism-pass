# Prism Pass

Multi-tenant SaaS for verifiable attendance, identity credentials and institutional document
workflows. One platform serves events, OJT/internships, classes, shifts and visitors — a QR scan is
evidence, not approval.

Next.js 15 (App Router) · React 19 · TypeScript · Supabase (Auth + RLS) · Prisma · Tailwind.

## Where to start

The Phase 0 documents are the design authority and `docs/roadmap/PLAN.md` is the single source of
truth for what is done, what is next and what is blocked. Read in this order:

1. `docs/roadmap/PLAN.md` — status and next scope
2. `docs/architecture/overview.md` — product thesis, consoles, domain separation
3. `docs/data-model/erd.md` — entities and invariants
4. `docs/security/permission-matrix.md` + `tenancy-isolation.md` (+ P9: `security-headers.md`, `rate-limiting.md`, `input-hardening.md`, `secret-scanning.md`, `demo-accounts.md`)
5. `docs/api/contracts-v1.md` → `docs/roadmap/phases-gates.md` → `docs/decisions/`

## Status

| Phase | Scope | State |
| --- | --- | --- |
| P0 | Spec: overview, ERD, permission matrix, state machines, geo, offline protocol, API contracts, ADR-01…12 | Done |
| P1 | SaaS foundation: auth (browser/server/middleware), Prisma schema, tenancy + RBAC, RLS, platform admin, org lifecycle | Built, live-verified |
| P2 | Identity/passes: people directory, issue/verify/revoke/rotate, printable IDs, member portal | Built, live-verified |
| P3 | Attendance engine: policies, sessions, scans, records, adjustments, approvals | Foundational slice built, live-verified |
| P4 | Geo verification (PostGIS geofence validation, exceptions, map review) | Not started — capture stored, `geoResult` always `NOT_CAPTURED` |
| P5 | Documents / e-sign | Not started |
| P6 | Offline sync protocol | Not started — scanner queue is UI-provisional (ADR-09) |
| P7 | Org workflows (DTR/internship review, certificates, leave, events, exports) | Not started |
| P8 | SaaS ops (plans, entitlements, metering, billing) | Not started |
| P9 | Hardening / launch | Not started |

Phase exit criteria live in `docs/roadmap/phases-gates.md`. Current gaps and environment quirks are
tracked in `docs/implementation/known-limitations.md`; the design-system and screenshot record is in
`docs/implementation/foundation-status.md`.

Treat earlier "spec only" statements in older notes as historical — the application code in this
repo is real and runnable.

## Layout

```
app/                 App Router: marketing site, login, consoles, API v1 route handlers
  (organization)/    /org/[orgId]/{people,passes,attendance,reports,settings}
  (member)/          /member — own pass and history
  (platform)/        /platform — platform console (separate from org privilege)
  (scanner)/         /scan — verify-first scanner
  api/v1/            health, orgs, memberships, people, passes, policies, programs,
                     sessions, scans, records, assignments, events (adjust/approve/reject)
components/          UI kit (ui/), app shell, scanner, pass card, marketing sections
lib/                 env, Supabase clients (browser/server/admin), Prisma client, tenant resolver
modules/             domain services: identity, organizations, passes, attendance
packages/authorization/  role/permission matrix
prisma/              schema.prisma (24 models) + seed
supabase/migrations/ 0001 foundation · 0002 tenant RLS · 0003 attendance engine
tests/               9 vitest suites (pure — no DB or network required)
docs/                specification, decisions, implementation notes
```

## Getting started

Prerequisites: Node 22 (CI target; 20+ works), pnpm 10 — the exact version is pinned by
`packageManager` in `package.json`, so `corepack enable` is enough.

```bash
pnpm install
cp .env.example .env.local     # then fill in real values
pnpm prisma:generate
pnpm dev                       # http://localhost:3000
```

`.env.local` needs:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (browser/server user sessions) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged access after `requireOrganizationPermission`; never expose to the browser |
| `DATABASE_URL` | Postgres connection string for Prisma |
| `APP_URL` | Base URL used in links |

The app boots with placeholder values: public routes and the login shell render, but protected
consoles redirect to `/login` and server writes are disabled.

### Database

Apply migrations in order (`0001` → `0003`) against a Supabase project, using `psql` on the session
pooler or the Supabase SQL editor, then generate the client. `prisma db push` / `prisma migrate dev`
are known to hang or fail on the pooler — see `docs/implementation/known-limitations.md`; migrations
are applied as reviewed SQL files instead.

Create the owner user in Supabase Auth first, then seed:

```bash
pnpm seed:syntaxure <authUuid> admin@example.com
```

## Demo accounts and data

`pnpm seed:demo` creates the Supabase Auth users, links them to people in **Syntaxure Labs**, and
seeds a full demo dataset. Password for both accounts: `password123`.

| Account | Access |
| --- | --- |
| `admin@syntaxure.dev` | OWNER of Syntaxure Labs + platform admin (org console + `/platform`) |
| `user@syntaxure.dev` | MEMBER of Syntaxure Labs (own pass, own attendance in `/member`) |

Seeded data: campus, department, two programs, an attendance policy, a 150 m geofence on the main
campus, one scanner device, eight people with active passes, three sessions (yesterday complete, today
in progress, one event next week), plus attendance events and records covering PRESENT, LATE, ABSENT
and an out-of-geofence exception awaiting approval.

The seed is idempotent and prints every demo QR payload (`PRISM1:publicId:secret`) so the scanner can
be exercised without issuing passes by hand. Demo credentials are intentionally weak; rotate them
before any real pilot (see `docs/implementation/known-limitations.md`).

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next dev server |
| `pnpm build` | `prisma generate` + production build |
| `pnpm start` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Full vitest suite |
| `pnpm test:isolation` | Tenancy isolation suite only |
| `pnpm prisma:generate` | Regenerate the Prisma client |
| `pnpm db:migrate` | `prisma migrate dev` (see the pooler caveat above) |
| `pnpm seed:syntaxure` | Seed owner org + platform admin |
| `pnpm seed:demo` | Seed demo accounts, org structure, passes, sessions and attendance |

There is no ESLint configuration yet, so `next lint` prompts for setup and is not part of the gate.
Typecheck, tests and build are the enforced checks.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and `develop`, and on pull requests targeting
either branch:

```
pnpm install --frozen-lockfile → pnpm prisma:generate → pnpm typecheck → pnpm test → pnpm build
```

It uses a throwaway `DATABASE_URL`; nothing in the pipeline touches a live database. Lint joins the
gate once an ESLint config exists.

## Branches and deployment

| Branch | Role | Deploys |
| --- | --- | --- |
| `main` | Production | Yes — production |
| `develop` | Integration / reconciliation | Yes — development |
| `staging` | Retired | No |
| `feat/*`, `fix/*`, `chore/*`, `agent/*` | Task work | No |

Task branches merge directly into `develop` (no pull request). `develop` promotes to `main` only on
an explicit owner-authorized production promotion. Only `main` and `develop` are deploy-eligible;
everything else, including `staging`, is refused before a build by the allowlist in `vercel.json`.
Full detail: `docs/ops/branching-and-deployment.md` and `docs/security/deployment-governance.md`.

Releases are tagged `vX.Y.Z` on `main`, one minor per phase exit, with the version surfaced by
`GET /api/v1/health`. See `docs/ops/release-and-versioning.md` and `CHANGELOG.md`.

## Conventions

- Tenant isolation is RLS **plus** server authorization: RLS deny-by-default, then
  `requireOrganizationPermission` with service-role access scoped by `app.org_id`.
- Organization roles never imply platform privilege (ADR-11).
- Passes are opaque, revocable and hash-only at rest (ADR-07).
- Events are immutable; records are derived (ADR-06).
- Whole-numbered SQL migrations in `supabase/migrations/`, additive where possible.
- One engine for every attendance workflow — no per-workflow engines, tables or routes.
