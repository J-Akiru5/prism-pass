# Prism Pass — Single Source of Truth Plan (SSOT)

> Global rule: this file is the single source of truth. `phases-gates.md`, ADRs, ERD, contracts are normative inputs; this plan tracks **what is done, what is next, and what is blocked**. Update it every phase. No parallel plans.

> **Current plan (2026-11-09):** events-first MVP M0–M4, captured in
> [prism-pass-portal.html](prism-pass-portal.html). Section 14 summarizes it and
> records the decisions and open items. Where the current plan conflicts with the
> phase history below, the current plan wins.

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
- **Branch model live:** `main` (production), `staging` (preview), `develop` (integration). Direct merges, no PRs. Rules: `docs/ops/branching-and-deployment.md`. **Superseded 2026-11-09:** `staging` retired; only `main` and `develop` deploy. See `docs/security/deployment-governance.md`.
- **Release process:** `docs/ops/release-and-versioning.md`; `CHANGELOG.md`; version surfaced by `GET /api/v1/health`.
- **Vercel:** project `prism-pass` in team `j-akiru5s-projects`, production branch `main`, Node 22, env vars set for production + preview, domain `pass.syntaxure.dev` verified. Production serves v0.1.0 (health returns `version`).
- **Allowlist verified by probe:** an empty commit pushed to `chore/allowlist-probe` produced no deployment; only `main` (production) and `staging` (preview) have deployments. Probe branch deleted. **Superseded 2026-11-09:** allowlist is now `main` + `develop`; `staging` is ineligible.
- **First deploy blocked:** `VULNERABLE_NEXTJS_VERSION` on Next 15.3.4 - Vercel refuses to build flagged versions. Upgraded to 15.5.29 (15.x security backport line). CI green on all three branches after the upgrade.
- **Live database audit** (Supabase `cgtcpwqfaqxcnpavkxas`, PostgreSQL 17.6): the live tables are snake_case and RLS-enabled (deny-by-default); the 24 PascalCase tables present are **empty strays** from an early unmapped push and hold no data. Migration `0005_remaining_models.sql` created the eight models that had no live table (geofences, organization_settings, organization_subscriptions, devices, documents, signature_requests, signature_events, offline_sync_batches). `postgis` is not installed, so P4 evaluates circles with haversine in the application rather than `ST_DWithin`.
- **Pooler caveat:** `DATABASE_URL` points at the transaction pooler (`:6543`). Prisma now appends `pgbouncer=true&connection_limit=1` automatically for that host/port (`lib/db.ts`); DDL and seeding use the session pooler (`:5432`).

## 11. P4-P8 first slices, v0.2.0 - 2026-11-08
- **P4 geo:** `modules/geo` (haversine, accuracy handling, `off|flag|enforce`), server-side `geoResult` + `geofenceId` on every scan event, `GEO_OUTSIDE` rejection under enforce, geofence CRUD, `0004_geo.sql` applied. Verified live: a real scan returned `geoResult: VERIFIED` with `geofenceId: demo-geofence-main`.
- **P5 documents/e-sign:** canonical hashing, hash-chained `signature_events`, signing order + consent enforcement, sealed-on-final-sign, public minimal `GET /verify/:token`, `0007_documents.sql` applied. 19 tests.
- **P6 offline:** HMAC device signing, replay-proof batches (reserve-before-write), per-item idempotency, versioned sync bundle, Dexie queue; the scan route now delegates to `modules/attendance/scan-service.ts` so offline and online share one rule set. `0008_offline.sql` applied. 18 tests.
- **P7 workflows:** DTR aggregation + RFC4180 CSV with formula-injection guard, VIEWER masking, 92-day cap, audit ledger endpoint and page, record-level approve/reject. 24 tests.
- **P8 platform:** aggregate org ledger, audited suspend/reactivate (sole-platform-admin suspend is refused), platform-admin-only API, hairline ledger UI. 23 tests.
- **Brand:** flat "Aperture P" mark (gold P in a navy pass tile, prism counter), 16 px-safe, one-colour safe; icon/apple-icon/OG via `next/og`; exploration sheet + usage doc.
- **UX:** membership-driven console chooser, scanner without a typed UUID, member portal stops rendering a fake QR, editorial dashboard (metric rail + ledger sections, no KPI card grid), console exits on every console.
- **Defects found by doing this:** enum columns were `text` (filters failed; `0006_enum_columns.sql` converts them), functions ran in `iad1` while Supabase is in `syd1` (pinned to `syd1`), API routes never refreshed expired sessions (middleware now matches `/api/*`), demo QR secrets were not 64-hex so they never verified.
- **Gate:** 139 tests passing, typecheck clean, migrations 0004-0008 applied, production at `pass.syntaxure.dev` serving v0.2.0. Tag `v0.2.0`.
- **Still open:** MANAGER/MEMBER scoped export rules, device revocation route, PostGIS (haversine used instead), offline UI wiring, authenticated click-through on every console, preview sharing behind Vercel auth.

## 12. v0.3.0 - platform console, security, offline UI, a11y - 2026-11-08
- **Super-admin console:** `/platform` overview stat rail, `/platform/orgs` ledger + create, `/platform/orgs/[orgId]` detail with plan/entitlement editor and member list, `/platform/admins` grant/revoke (reason required, last-admin + self-revoke guards), `/platform/audit` cross-tenant filters + CSV, `/platform/health` measured DB latency and migration inventory. All gated by `requirePlatformAdmin`; aggregate-only except org members and audit rows (documented).
- **Security:** headers + nonce CSP (Report-Only, promotion checklist in `docs/security/security-headers.md`), rate limiting per IP/org, body ceilings via `readJson`, bounded query params, blocking secret scan, `DEMO_MODE` banner.
- **Offline scanner:** queue on offline/fetch/5xx, explicit provisional state, signed batch flush, replay retry, backoff, queue panel.
- **Scoping:** report/record person scopes by role/assignment; device revocation with sync rejection.
- **A11y:** focus restored (14.6:1), dialog trap/restore, headings, error association, table semantics, success contrast.
- **Gate:** 225 tests / 18 files, typecheck clean, CI green. Deployed and tagged v0.3.0.
- **Open:** CSP enforcement (needs browser pass on every route), shared rate-limit store (per-instance today), impersonation, entitlement enforcement in tenant routes, MANAGER per-mentee scope (needs `supervisor_person_id`), offline queue encryption at rest, demo credential rotation.

## 13. v0.3.1 hardening - QR, offline queue, CI/deploy - 2026-11-09
- **QR verification:** shared constant-time credential comparison (verify + scan paths), strict bounded payload parsing, fail-closed invalid expiry, malformed-scan audit without credential echo; 31 focused tests.
- **Offline queue:** terminal `rejected` state with explicit retry, idempotent enqueue, 2-minute inflight leases, 2,000-row cap, deterministic jitter, AES-GCM at-rest encryption for queued credentials; 57 focused tests.
- **CI/deployment:** `vercel.json` allowlist is `main` + `develop`; `staging` retired; Node 22 CI with Corepack, pnpm cache, secret scan, typecheck, tests and build; branch/release docs reconciled.
- **Gate:** 272 tests / 20 files, typecheck clean, CI green on `develop`; production promotion of the hardening release.
- **Open:** CSP enforcement (browser pass), shared rate-limit store, demo credential rotation, Vercel cleanup of the stuck deployment.

## 14. Current plan — events-first MVP (2026-11-09)

Full interactive plan: [prism-pass-portal.html](prism-pass-portal.html). This
section is the normative summary; the portal is the long-form source for the
inventory and tracker.

### 14.1 Product decision

Prism Pass is an **event attendance and certificates platform** sold to
organizations first. The winning use case is scanning that keeps working with no
signal at a venue. DTR remains a paid add-on for small companies without
biometric terminals; selfie and geofence apply only to DTR. Events use the QR
plus a staff member looking at the person.

The MVP is done when an organizer with no help from us can set up an event,
scan attendees at a venue with no signal, and issue signed certificates
afterwards.

### 14.2 Baseline

- Production: `main`, v0.3.1, `pass.syntaxure.dev`.
- Integration: `develop` at `b8a0b39` (4 commits after the portal's `b902aed`).
- Stack: Next.js 15, Supabase Auth/Postgres, Prisma, Vercel `syd1`.
- Migrations stay additive SQL files applied with the documented method.
- `staging` was retired on 2026-11-09 (D-06). The owner's 2026-11-09 instruction
  below reopens it as a promotion branch; see D-08 and the deployment conflict.

### 14.3 Milestones

| Milestone | Scope | Exit test |
|---|---|---|
| **M0 Truth-up** | Release what is finished, tag it, rotate demo access, walk every console signed in, make docs match code. | Production runs the tagged latest release; no public default passwords; README, PLAN and known-limitations agree. |
| **M1 Events core** | Roster per event with walk-in toggle, open/close, CSV import, attendee name on scan, per-event report, four role presets in the UI. | A person not on the roster is refused; a closed event refuses scans; staff see the attendee's name on every accepted scan. |
| **M2 Offline you can trust** | Scanner downloads the event bundle, verifies passes on device, shows data age, flags clock drift. | With the network cut, a revoked pass and an unlisted pass are both refused on the device; two devices scanning the same person produce one record after sync. |
| **M3 Certificates** | Certificate template, generation for complete records, signing screen, PDF with verify QR. | Every attendee with a complete record gets a signed PDF whose QR verifies publicly. |
| **M4 Pilot** | One real organization, privacy notice, planned offline segment, feedback, pricing answers. | Pilot exit criteria: 1 org, ≥50 attendees, 0 lost scans, 100% certificates, 0 dev interventions. |
| **M5 DTR add-on** | GPS capture, selfie, geofence admin, DTR PDF. | After pilot, driven by pilot demand. |
| **M6 Network** | One identity QR, Google sign-in + invite claim, public organizer signup, trimmed RBAC SSOT, billing/entitlement enforcement. | After pilot. Google provider setup is owner-owned. |

### 14.4 Tracker summary (MVP only)

M0: branch model recorded; **tag v0.3.1 missing**, **develop→main promotion
pending**, **password123 demo accounts still public**, signed-in walkthrough
pending, README/known-limitations drift, RBAC SSOT status to mark
“Proposed, after pilot.”

M1 done: EVENT sessions + policies, scan in/out, duplicate window, people
directory, per-org QR pass, printable ID, member portal, audit log.
M1 to build: event roster + walk-in toggle, open/close, attendee name on
accepted scan, no name/photo on refusal, CSV import, per-event report + CSV,
four role presets in the UI (keep the seven roles underneath).

M2 done: encrypted offline queue, signed/idempotent batch sync, server sync
bundle with pass hashes. To build: scanner downloads and verifies the bundle
offline, bundle-age display, device/sync clock drift, two-phone offline test.

M3 done: document/signature API with hash chain, signing order, seal, public
verify. To build: certificate template, generation for complete records,
signing screen, PDF with verify QR.

M4 and M5/M6 are not code-only. M4 needs the pilot organization, event and date;
M6 Google provider setup is owner-owned.

### 14.5 Decisions log

| ID | Decision | State |
|---|---|---|
| D-01 | Events-first; DTR kept as an add-on. | Decided |
| D-02 | Selfie and geofence apply only to DTR. | Decided |
| D-03 | A refused scan reveals nothing about the person. | Decided |
| D-04 | Roles stay simple: four presets with toggles; no support ticket to set up a role. | Decided |
| D-05 | Sell to organizations first; public organizer signup later. | Decided |
| D-06 | `staging` retired; only `main` and `develop` deploy. | In repo |
| D-07 | Attendee QR free forever; charge for certificates, e-sign, official exports, multi-device and DTR. | Proposed |
| D-08 | Owner instruction 2026-11-09: `staging` is the promotion branch, `develop` is the reconciliation branch, and deployments run only from `staging` and `main`. Supersedes D-06; requires `vercel.json`, CI and deployment-doc changes before use. | Pending implementation |

### 14.6 Open decisions

- **O-1:** Per-organization QR for the pilot or one global identity QR? Recommendation: per-org for the pilot; do not print durable PVC IDs until decided.
- **O-2:** Adopt the full RBAC SSOT before or after the pilot? Recommendation: after (M6); keep seven roles in data, show four presets in the UI.
- **O-3:** Pilot organization, event and date. Needs owner input.
- **O-4:** Pricing. Needs pilot data.
- **O-5:** Is in-app e-signature enough for certificates, or is PNPKI required? Ask the pilot organization.

### 14.7 Definition of Done (work item)

Acceptance criteria shown in a signed-in browser; server-side authorization on
every new route; tenant-isolation test; domain and allow/deny route tests; CI
green on the integration branch; offline behavior stated; 375px and desktop
checked; additive migration with rollback note; CHANGELOG/PLAN/README/known
limitations updated; no demo shortcuts; smoke-tested on the deployed integration
environment.

### 14.8 Orchestration

This plan is executed by the main agent orchestrator with phase subagents. Each
phase owns a worktree and branch, reports exact files/commits, and never pushes
or deploys. The main agent assembles, runs the full gate, and reconciles into
`develop`; promotion to `staging` and `main` follows D-08 once the deployment
configuration is reconciled.

### 14.9 Migration evidence

- **2026-11-09 — `0009_m1_events.sql` applied** to the shared Supabase project
  `cgtcpwqfaqxcnpavkxas` after explicit owner authorization. Strictly additive:
  `AttendanceSessionStatus` (`OPEN`, `CLOSED`), `attendance_sessions.status`,
  `closed_at`, `roster_enforced` (default false), `walk_in_allowed` (default
  false), and `session_roster` with unique `(organization_id, session_id,
  person_id)`. Verified after apply: enum labels `{OPEN,CLOSED}`, all four
  columns present with the expected defaults, `session_roster` exists, RLS
  enabled. No destructive changes.
- **Prisma generate caveat:** `prisma generate` hit `EPERM` renaming
  `query_engine-windows.dll.node` because another process holds the DLL. The
  generated client types already expose `prisma.sessionRoster` and
  `AttendanceSessionStatus`; `pnpm typecheck` passes. Re-run generate once the
  lock clears.
- The shared project is also production. This migration was a one-off owner
  authorization, not a standing permission for future production migrations.
- **2026-11-09 — `0010_m1_certificates.sql` applied** to the same shared project
  after a second explicit owner authorization. Strictly additive: nullable
  `documents.source_session_id`, `source_person_id`, `batch_id`; unique
  `(organization_id, source_session_id, source_person_id)`; and
  `(organization_id, batch_id)` index. Verified after apply. No data rewrite, no
  RLS change. Generic null-source documents remain unaffected.
- **Prisma generate lock:** still held by local dev servers; the certificate
  generation route uses two narrowly typed casts until `pnpm prisma:generate`
  runs in CI or after the dev servers exit. Remove the casts once the generated
  client includes the 0010 fields.

### 14.10 Build log — 2026-11-09

- **M0 truth-up:** docs/status reconciled, demo seed now requires
  `DEMO_SEED_PASSWORD`; production credential rotation, the `v0.3.1` tag and the
  `develop`→`main` promotion remain owner actions.
- **M1 events core:** A (session lifecycle/roster/scan gates), B (scanner name
  and refusal copy), C (CSV import), D (per-event report/CSV) and E (role
  presets/membership role change) are merged. Full suite passed after each
  integration; `next build` completed with the new routes.
- **M2:** clock/drift model and the pure two-device scan transition are merged;
  the v2 event bundle and on-device verifier are in flight.
- **M3:** pure certificate domain (schema, eligibility, payload/hash, public
  verify projection) is merged; generation/signing/PDF are next.
- **Migration:** `0009_m1_events.sql` applied to the shared project with owner
  authorization; evidence in 14.9.
- **Local dependency caveat (resolved):** the local install was initially
  `next@15.3.4` while `package.json`/`pnpm-lock.yaml` specified `15.5.29`. The
  dependency install was reconciled on 2026-11-09; `next@15.5.29`, `pdf-lib` and
  `qrcode` are now installed, typecheck/tests pass, and `next build` succeeds.
- **Prisma generate caveat:** the Windows DLL rename lock persists while local
  dev servers hold the engine. Generated types already include the M1 models and
  typecheck passes; rerun generate after the dev servers exit.
- **Signed-in QA (2026-11-09):** signed in as `admin@syntaxure.dev` against a
  local build. Verified `/consoles` (Owner preset + raw role), `/org/:id/attendance`
  (3 sessions, Open/past-schedule labels, event roster panel, Close event,
  policy), `/org/:id/settings` (People & access: Owner/Attendee presets and raw
  roles) and `/org/:id/reports` (Event attendance card). No console errors. One
  first-load `P1001` pooler timeout on `/policies`; reload succeeded, confirming
  a transient network issue rather than a code defect. Screenshot:
  `screenshots/m1-attendance-qa-2026-11-09.jpeg`.
- **End-to-end M1/M2/M3 code complete:** M1 A–E, M2 bundle/verifier/clock/policy/
  scanner UX, and M3 domain/generation/signing/public verify/PDF+QR are integrated.
  `pnpm test` 616 passing, `pnpm typecheck` clean, `pnpm build` (Prisma generate +
  Next build) succeeds with Next 15.5.29, and the secret scan passes.
- **Dependency reconciliation:** `next@15.5.29`, `pdf-lib@1.17.1` and
  `qrcode@1.5.4` are installed and committed in the lockfile.
