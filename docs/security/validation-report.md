# Security Validation Report — P1 Completion (Agent 4)

## Tenant isolation (live, 2026-11-04)
- Admin `admin@syntaxure.dev` has 1 ACTIVE membership (Syntaxure Labs), 0 in Org B test tenant → PASS.
- Org-scoped pass lookup: pass issued in A resolves in A, misses in B → PASS (cross-tenant rejected).
- Auth sequence verified: session → internal user → explicit org → ACTIVE membership → ACTIVE org → permission → resource → audit. No client org/role trust, no permission union.

## RLS (live)
Enabled on `organizations, memberships, people, passes, audit_logs` (deny-by-default, no public policies). `authorize(org,perm)` helper present; enforcement is server-side via service-role after `requireOrganizationPermission`. Service-role key server-only (`lib/supabase/admin.ts`, `server-only`).

## Lifecycle enforcement (live E2E)
- Pass revoke → status REVOKED, subsequent verify recorded as `revoked` → PASS.
- Membership revoke (temp SCANNER in Org B) → REVOKED + revokedAt → PASS; tenant blocks revoked (403).
- Org suspend/reactivate on Org B → SUSPENDED then ACTIVE, audits written → PASS. Suspend path is platform-admin-only; OWNER cannot self-suspend.
- Duplicate verify within 120s → `valid_duplicate` persisted, no double issuance → PASS.

## Regression suite
- `tests/security-regression.test.ts` (5), `tests/org-lifecycle.test.ts` (5), `tests/prisma-mapping.test.ts` (10) + existing 10 → 30/30 PASS.
- Secrets: `.env*` gitignored; `git status` shows worktree files (repo has no commits yet — do NOT commit secrets). No keys printed in logs.

## Remaining risks
- RLS policies are deny-by-default without granular per-role policies — correct for P1 (server enforces), but P2 should add authenticated read policies if direct client reads are introduced.
- No ESLint config — `next lint` prompts; rely on typecheck + tests + build for now.
- Prisma full 21-model DDL not yet applied (only 8 core tables live) — additive migration needed before attendance engine (P3).

## P9 security-hardening slice (2026-11-08)

- **Headers:** enforced by `middleware.ts` for every document (HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`). Camera/geolocation are delegated
  only on `/scan`. Nonce-based CSP ships as `Content-Security-Policy-Report-Only`; enforcement is
  blocked on a browser pass, documented in `docs/security/security-headers.md`. This is telemetry,
  not XSS mitigation, until promoted.
- **Rate limits:** in-memory token buckets on pass verify, scan, sync batches and public verify
  token lookup; per IP and per org where an authenticated org exists. Per-instance only —
  `docs/security/rate-limiting.md`.
- **Input hardening:** all JSON bodies go through `readJson` with a 16 KiB–1 MiB ceiling; malformed
  JSON is 400 and oversized bodies are 413. `searchParams` ids/dates/status are validated;
  scan credentials and geo coordinates are bounded. Tenant scoping and write logic unchanged.
- **Secrets/dependencies:** `pnpm security:secrets` scans tracked files and is blocking in CI;
  `pnpm security:secrets:all` is the local pre-flight. `pnpm audit --prod` reports 9 advisories
  (7 high, 2 moderate) and stays non-blocking-loud until triaged. No dependency was added.
- **Demo accounts:** `password123` is unchanged by owner decision. `DEMO_MODE` now renders a
  warning banner and logs a startup warning; rotation remains required before any pilot
  (`docs/security/demo-accounts.md`).
- **Verification:** `pnpm typecheck` clean; `pnpm test` 170/170 passing (139 existing + 31 new);
  secret scan clean over 218 working-tree files. No build or deployment was run.
