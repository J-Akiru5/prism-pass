# Known limitations (P2 + P3-foundational, 2026-11-04)
- **Pooler prepared statements (fixed 2026-11-08):** Prisma + the transaction pooler (`:6543`) failed
  with `prepared statement "s0" already exists`. `lib/db.ts` now appends `pgbouncer=true` and
  `connection_limit=1` for Supabase pooler URLs; DDL and seeding use the session pooler (`:5432`).
- **Legacy PascalCase tables:** 24 empty PascalCase tables remain from an early unmapped push. They hold
  no data and are unused; dropping them needs a backup review first.
- **Demo credentials:** the demo seed now requires `DEMO_SEED_PASSWORD` (≥12 chars, no committed
  default) and prints no password. Production demo accounts created before this change still need
  rotation, disabling or removal before a real pilot. See `docs/security/demo-accounts.md`.
- Authenticated browser click-through not yet performed — protected routes correctly redirect to `/login`; needs a signed-in session (user handoff).
- **CSP is Report-Only:** security headers are enforced (`middleware.ts`), but the nonce-based CSP
  ships as `Content-Security-Policy-Report-Only` until a browser pass confirms Next and next-themes
  inline scripts carry the nonce. See `docs/security/security-headers.md` for the promotion
  checklist. Report-Only does not mitigate XSS.
- **Rate limits are per instance:** `lib/rate-limit.ts` is an in-memory token bucket with bounded
  keys. A multi-instance deployment enforces the limit per process, not globally; a shared Redis
  store is the documented upgrade path (`docs/security/rate-limiting.md`).
- **Secret scan is regex-based:** `pnpm security:secrets` is blocking in CI and clean today, but it
  does not scan git history, dependencies or entropy-only secrets. Dependency audit remains
  non-blocking-loud until triaged (`docs/security/secret-scanning.md`).
- `prisma db push` still unusable on pooler (schema-engine); DDL via `pg` + reviewed SQL files (0003 applied this way). No destructive ops run.
- Stray PascalCase tables from an early unmapped push remain in live DB (untouched, unused); future cleanup migration may drop them after backup review.
- Scanner offline queue is built and hardened (encrypted at rest, leased, signed batches). On-device
  bundle verification, bundle-age display and clock-drift warnings are M2. Offline is bounded by the
  downloaded bundle: a pass revoked after download is caught at sync, not at the door.
- Geo is evaluated server-side with haversine circles because PostGIS is not installed. Scanner GPS
  capture, selfie and the geofence admin screen are M5 DTR work.
- Manager/supervisor report scoping is implemented by program assignment; a per-mentee supervisor
  link still needs a schema column.
- No ESLint config (`next lint` prompts for setup) — typecheck + tests + build are the gates.
- VIEWER report exports are masked; a bulk unmasked export requires an explicit `reports.export`
  grant.
- `prisma generate` hits EPERM renaming the engine DLL on this machine (lock held outside the project); generated client matches the unchanged schema, builds run via `next build`. Re-run `pnpm build` if the schema changes.
- A ghost listener held :3200 with stale content during QA; final verification used :3300. If :3200 misbehaves, use a fresh port.
- Authenticated org/member screens verified by code + API, not by signed-in screenshots (no session available); public/login/gallery shots are in `screenshots/`.
