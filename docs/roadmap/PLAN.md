# Prism Pass — Single Source of Truth Plan (SSOT)

> Global rule: this file is the single source of truth. `phases-gates.md`, ADRs, ERD, contracts are normative inputs; this plan tracks **what is done, what is next, and what is blocked**. Update it every phase. No parallel plans.

## 0. Where we are (2026-11-04)
- **P0 Spec: DONE** — overview, ERD, permission-matrix, state machines, geo, offline protocol, contracts-v1, ADR-01..12, phases-gates.
- **P1 Foundation: BUILT + TESTED (local)** — Next 15 App Router, Auth (browser/server/middleware), fail-closed `requireOrganizationPermission`, Prisma 21 models, RLS `0001_foundation.sql` (artifact only), attendance/pass helpers, QR + scanner viewport.
  - `pnpm typecheck` PASS, `pnpm test` 7/7 PASS, `pnpm build` PASS (13 routes).
  - Supabase creds now in `.env.local` (anon + service_role), `/auth/v1/health` 200. Migration **not yet applied**, tenant resolver still demo-mode, no seed.
- **Spec drift:** `PlatformAdmin` added to Prisma (justified by ADR-11, platform vs org separation). No other drift. Prism spec wins over OptiFeed/CICT-QR/OJT patterns.

## 1. Next phase scope — CONFIRMED 2026-11-04
Owner decisions:
- Execution: **P1-Completion + P2 in parallel** — people/passes UI+APIs proceed on service layer while live DB wiring lands.
- First org: **Syntaxure Labs**, owner/super-admin: **admin@syntaxure.dev** (org OWNER + PlatformAdmin).
- RLS: **strict deny + service-role** — no public policies, server service-role after `requireOrganizationPermission`, plus `app.org_id` scoping.
- Scanner MVP: **verify-only** — validity check (active/revoked/expired) against DB, no attendance write yet (P3).

### P1-Completion (live DB)
1. Apply `supabase/migrations/0001_foundation.sql` to live project + verify tables + RLS enabled.
2. Wire `lib/tenant.ts` from demo map → Prisma/service-role lookup (users by authId → memberships + org status) with demo fallback for tests.
3. Migration `0002_tenant_rls.sql`: `authorize(org,user,perm)` security-definer, `USING (organization_id = current_setting('app.org_id'))`, audit immutability.
4. Org provisioning APIs per contracts-v1: `POST /orgs`, `GET/PATCH /orgs/:orgId`, memberships list/revoke — via `requireOrganizationPermission` + audit.
5. Live isolation tests: Org A/B zero cross-access, suspension/revocation, 403 on cross-org IDs. Seed Syntaxure Labs + admin.
6. Update `foundation-status.md`, `known-limitations.md`, `README.md`.
- Exit gate: P1 gates in `phases-gates.md` green against live Supabase.

### P2 Identity/Passes (parallel track)
- People directory CRUD, issuance/verify/revoke/rotate, printable IDs. Revoked/expired rejected at scanner.
- Modules: `modules/identity/service.ts`, `modules/passes/service.ts` extended with verify logic; APIs `POST /orgs/:orgId/people`, `POST passes/issue|revoke|rotate`, `GET passes/verify`.
- Exit: revoked/expired rejected, QR opaque (`PRISM1:public:secret`, hash-only).

Out of scope: P3 attendance writes, P4 geo PostGIS, P5 e-sign, P6 offline sync, P7 workflows, P8 billing, P9 hardening.

## 2. Risks / notes
- No `DATABASE_URL` yet — Prisma needs direct Postgres URL; Supabase URL+keys alone support Auth/REST but not Prisma migrate. If session-pooled URL unavailable, P1-Completion uses Supabase SQL editor for migrations + service-role REST for verification.
- `admin@syntaxure.dev` must exist in Supabase Auth before seed can link `users.authId`.

## 3. Links
- Gates: `docs/roadmap/phases-gates.md`
- AuthZ: `docs/security/permission-matrix.md`, `tenancy-isolation.md`
- Data: `docs/data-model/erd.md`, `prisma/schema.prisma`
- API: `docs/api/contracts-v1.md`
- Status: `docs/implementation/foundation-status.md`, `known-limitations.md`, `component-reuse-inventory.md`

## 4. Progress log 2026-11-04
- SSOT created. Owner confirmed parallel P1+P2, Syntaxure Labs + admin@syntaxure.dev, strict RLS, verify-only scanner.
- Built: admin client, db client, tenant live wiring, 0002 RLS, org/people/verify APIs, seed script, 3 new verify tests.
- Verified: typecheck PASS, 10/10 tests PASS, build PASS (16 routes). Live DB pending DATABASE_URL.

## 5. Live completion 2026-11-04
- DATABASE_URL stored (pooler). Auth user admin@syntaxure.dev created by agent as requested.
- 0001 + 0002 + people/passes/platform_admins applied via `pg` session pooler (Prisma engine hangs on pooler — bypassed, documented).
- Seeded Syntaxure Labs + OWNER + PlatformAdmin. Isolation live PASS. RLS enabled verified.
- Tenant resolver now service-role REST. Remaining: Prisma schema alignment (@@map/lowercase), full 21-model DDL, suspension/revocation API, live scan verify end-to-end with real QR.

## 6. P1 Completion Sprint — DONE 2026-11-04
- Agent 1 (DB/Prisma): schema mapped, validate+generate PASS, mapping tests (10), report `docs/data-model/database-mapping-report.md`. Pending models documented for additive migration.
- Agent 2 (Lifecycle): org suspend/reactivate (platform-only), membership revoke (last-OWNER guard), audits; behavior `docs/api/lifecycle-behavior.md`.
- Agent 3 (QR): issue/revoke/rotate + verify with persistence + duplicate window; full checks (org, person, hash, status, expiry).
- Agent 4 (Security): isolation + RLS + lifecycle live PASS; regression 30/30; report `docs/security/validation-report.md`.
- E2E acceptance 15 steps: all executed live against Syntaxure Labs + Org B (controlled test records). Scanner UI exists at /scan; server verify proven via API + Prisma (browser scan-through pending user session).
- Gates: typecheck PASS, 30/30 tests PASS, build PASS, live E2E PASS. P1 EXIT: COMPLETE.

## 7. P2 + P3-Foundational — DONE 2026-11-04
- Shared contracts first: `docs/data-model/p2-p3-contracts.md` — ONE attendance engine (group identity via person_assignments/programs.kind; no per-group engines/tables/routes).
- Migration `0003_attendance_engine.sql` applied live (8 tables, RLS). Additive only; stray PascalCase tables untouched.
- Workstreams (main session, sequential ownership): identity service + people/program/assignment APIs + directory UI; passes list/my-pass/printable ID + member experience; scanner wired verify→scan with shared ScannerViewport; engine module + policies/sessions/scans/records/adjust/approve APIs + attendance UI.
- Reuse validated: CICT-QR camera pattern (no auth/fetch in component), OJT-Qr-Pass card (opaque QR, hash-only, own-records-only). Inventory updated with validation notes.
- Gates: typecheck PASS, 36/36 tests PASS (6 new: engine direction/reconcile/validation, identity contracts), build PASS, live E2E (check-in/duplicate/check-out/idempotency/cross-tenant/inactive/adjust/approve) ALL PASS, browser home renders + auth gates verified.
- Open: authenticated browser click-through (needs signed-in session); P4 geo, P6 offline sync, P7 scoping/workflows remain per phases-gates.

## 8. Design System Extraction & Visual Transformation — DONE 2026-11-04
- Honest reference finding: CICT Attendance original source NOT locatable on this machine (searched project, workspace, sibling checkouts). No tokens fabricated. Actually inspected: `S:\Dev\Vue\usc-attendance` (real Nuxt+Supabase attendance portal — navy/gold/paper tokens, sidebar/header/scan/login/banners extracted from source) + OptiFeed shadcn theme (token-name architecture) + vendored CICT-QR/OJT-Qr-Pass patterns. Report: `docs/design/extracted-tokens.md`; mapping: `docs/design/token-mapping.md`.
- Tokens: `app/globals.css` rewritten (paper light + deliberate deep-navy dark, focus ring navy+gold halo); `tailwind.config.ts` extended (navy/gold/sidebar/success/warning/info, display/mono, shadow scale). No new dependencies.
- Components: `ui/{button,card,badge,input,form-field,avatar}`, `app-shell` (navy sidebar + paper header + mobile bottom nav + skip link), `page-header`, `stat-card`, `data-table`, `ui-states`, `confirmation-dialog`, `scan-result`, `digital-pass-card`, `attendance-timeline`, `theme-toggle`. Removed superseded duplicates: `kpi-card`, `empty-state`, `status-badge`, `qr-display`.
- Screens: landing hero, login auth shell, org dashboard (REAL totals from APIs — mock demo numbers deleted), people, passes (+confirmations, printable ID), scan (tiered outcome banners), attendance, reports/settings hubs, member portal. No API/business-logic changes; tenant gates untouched.
- Validation: typecheck PASS, 36/36 tests PASS, `next build` PASS (prisma generate EPERM worked around — generated client matches unchanged schema), browser QA light+dark desktop+mobile with screenshots in `screenshots/`.
- Open: authenticated click-through of org screens needs a signed-in session; gallery QA scaffold deleted; ghost process on :3200 noted (used :3300 for final verification).

## 9. Marketing site, CTA page, split-view login, brand lockups — DONE 2026-11-04
- Public `/` rewritten as a SaaS marketing front (was console chooser; chooser moved to `/consoles`). Sections: sticky nav, parallax hero (framer-motion, already installed — no new deps) with CSS product mock + floating chips, features, how-it-works, metrics band, audiences, FAQ accordion, CTA band, navy footer.
- `/demo` CTA page: pitch panel + validated request form (inline errors, success state composing a `mailto:hello@syntaxure.dev` send). No backend endpoint yet — noted below.
- `/login` rebuilt as modern split view on desktop (navy brand panel with value props + verified-scan chip; form card right), stacked on mobile. Default post-login landing changed to `/consoles`.
- Brand: new inline-SVG `PrismPassLogo` (prism mark + wordmark, `components/brand/`); `SyntaxureCredit` "Powered by Syntaxure Labs" on nav-adjacent hero, demo, login, consoles, footer. No logo file was attached — credit auto-upgrades from `public/syntaxure-labs-logo.svg` when you drop it in (fallback "S" monogram verified; fixed a prerender hydration race where the broken-img swap never fired).
- Validation: typecheck PASS, 36/36 tests PASS, `next build` PASS; browser QA light+dark, form submit + mailto flow verified in-page, screenshots in `screenshots/site-*`.
- Open: demo requests send via the visitor's email client (no server endpoint/ticketing yet); full-desktop screenshots limited by the capture viewport (desktop layout verified via DOM metrics: 1440px, no overflow, desktop nav); signed-in walkthrough still needs a session.

## 10. Environments, deployment and live state - 2026-11-08
- **Branch model live:** `main` (production), `staging` (preview), `develop` (integration). Direct merges, no PRs. Rules: `docs/ops/branching-and-deployment.md`.
- **Release process:** `docs/ops/release-and-versioning.md`; `CHANGELOG.md`; version surfaced by `GET /api/v1/health`.
- **Vercel:** project `prism-pass` in team `j-akiru5s-projects`, production branch `main`, Node 22, env vars set for production + preview, domain `pass.syntaxure.dev` verified. Production serves v0.1.0 (health returns `version`).
- **Allowlist verified by probe:** an empty commit pushed to `chore/allowlist-probe` produced no deployment; only `main` (production) and `staging` (preview) have deployments. Probe branch deleted.
- **First deploy blocked:** `VULNERABLE_NEXTJS_VERSION` on Next 15.3.4 - Vercel refuses to build flagged versions. Upgraded to 15.5.29 (15.x security backport line). CI green on all three branches after the upgrade.
- **Live database audit** (Supabase `cgtcpwqfaqxcnpavkxas`, PostgreSQL 17.6): the live tables are snake_case and RLS-enabled (deny-by-default); the 24 PascalCase tables present are **empty strays** from an early unmapped push and hold no data. Migration `0005_remaining_models.sql` created the eight models that had no live table (geofences, organization_settings, organization_subscriptions, devices, documents, signature_requests, signature_events, offline_sync_batches). `postgis` is not installed, so P4 evaluates circles with haversine in the application rather than `ST_DWithin`.
- **Pooler caveat:** `DATABASE_URL` points at the transaction pooler (`:6543`). Prisma now appends `pgbouncer=true&connection_limit=1` automatically for that host/port (`lib/db.ts`); DDL and seeding use the session pooler (`:5432`).
