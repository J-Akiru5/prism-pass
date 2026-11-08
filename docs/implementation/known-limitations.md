# Known limitations (P2 + P3-foundational, 2026-11-04)
- **Pooler prepared statements (fixed 2026-11-08):** Prisma + the transaction pooler (`:6543`) failed
  with `prepared statement "s0" already exists`. `lib/db.ts` now appends `pgbouncer=true` and
  `connection_limit=1` for Supabase pooler URLs; DDL and seeding use the session pooler (`:5432`).
- **Legacy PascalCase tables:** 24 empty PascalCase tables remain from an early unmapped push. They hold
  no data and are unused; dropping them needs a backup review first.
- **Demo credentials are weak by design:** `admin@syntaxure.dev` and `user@syntaxure.dev` use
  `password123` for demos. The production URL is public, so these must be rotated or gated before any
  real pilot. Tracked for P9 hardening.
- Authenticated browser click-through not yet performed — protected routes correctly redirect to `/login`; needs a signed-in session (user handoff).
- `prisma db push` still unusable on pooler (schema-engine); DDL via `pg` + reviewed SQL files (0003 applied this way). No destructive ops run.
- Stray PascalCase tables from an early unmapped push remain in live DB (untouched, unused); future cleanup migration may drop them after backup review.
- Scanner offline queue is UI-provisional (ADR-09); sync-batch API (P6) not built.
- Geo capture stored but `geoResult` always `NOT_CAPTURED` v1 (P4 PostGIS validation pending).
- Manager scoping (`scoped*` in permission matrix) enforced as same-org only; assignment-scoped checks land with P7 workflows.
- No ESLint config (`next lint` prompts for setup) — typecheck + tests + build are the gates.
- VIEWER PII masking for reports export not yet implemented (P7/P8).
- `prisma generate` hits EPERM renaming the engine DLL on this machine (lock held outside the project); generated client matches the unchanged schema, builds run via `next build`. Re-run `pnpm build` if the schema changes.
- A ghost listener held :3200 with stale content during QA; final verification used :3300. If :3200 misbehaves, use a fresh port.
- Authenticated org/member screens verified by code + API, not by signed-in screenshots (no session available); public/login/gallery shots are in `screenshots/`.
