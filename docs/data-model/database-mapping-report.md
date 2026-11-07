# Database Mapping Report — P1 Completion (Agent 1)

## Live tables verified (Supabase, lowercase)
`organizations, users, memberships, membership_permissions, people, passes, platform_admins, audit_logs` — RLS enabled, deny-by-default.

## Prisma alignment
- Added `@@map("...")` for all 21 models and `@map("snake_case")` for every non-identical column (auth_id, organization_id, user_id, display_name, external_id, pass_public_id, credential_hash, expires_at, revoked_at, created_at, etc.).
- Added missing `Person.createdAt` and `Pass.createdAt` to match live `created_at`.
- `prisma validate` PASS, `prisma generate` PASS (v6.19.3).
- New guard: `tests/prisma-mapping.test.ts` (10 tests) fails if a live mapping is removed.

## Mismatches resolved
| Area | Before | After |
|---|---|---|
| Table names | Prisma expected `User`, `Organization` (Pascal) | `@@map` to lowercase live tables |
| Columns | `authId`, `organizationId`, `passPublicId`, `credentialHash`, `createdAt` | `@map` to snake_case |
| Person/Pass | no `createdAt` | added, mapped |
| Future models | unmapped | `@@map` added for additive migrations (campuses, attendance_*, devices, documents, etc.) |

## Models not yet in live DB (documented, not applied)
`organization_settings, organization_subscriptions, campuses, departments, programs, person_assignments, attendance_policies, attendance_sessions, attendance_events, attendance_records, geofences, documents, signature_requests, signature_events, devices, offline_sync_batches` — mapped in Prisma for a future additive migration. No destructive `db push` run; live data preserved.

## Connection strategy (validated)
- `DATABASE_URL` (pooler 6543 + `?pgbouncer=true`) works for Prisma DML (`organization.count()` = 2 live).
- `prisma db push` (DDL) hangs / schema-engine error on pooler — DDL applied via `pg` session pooler (5432) with reviewed SQL. Documented; do not retry destructive push on live.
- Tenant resolver stays service-role REST; Prisma used for org/people/pass/audit routes. Both enforce explicit `organizationId` scoping; no conflict.
