# Demo accounts (P9)

## Current decision

The demo seed no longer ships a default password. `prisma/seed/demo.ts` requires
`DEMO_SEED_PASSWORD` (12+ characters, not a known-weak value) and prints no password. The local
seed is therefore safe to run without publishing a credential.

Production demo accounts created before this change still need rotation, disabling or removal
before a real pilot. That is an owner action because it changes live Supabase Auth credentials.

Seeded demo identities:

- `admin@syntaxure.dev` — OWNER of the demo organization
- `user@syntaxure.dev` — seeded member

Both accounts use the same value supplied through `DEMO_SEED_PASSWORD` for a local demo seed.
Because the production URL is public, a leaked or weak production credential still lets anyone
sign in. Treat the demo tenant as public and disposable until it is rotated.

**Rotation is required before any real pilot, paid customer, or real personal data.** See the
checklist below.

## Guard: `DEMO_MODE`

`lib/security/demo.ts` is the single source of truth:

- `isDemoMode(env)` accepts `1`, `true`, `yes`, `on` (case-insensitive, trimmed). Anything else,
  including an unset variable, is off. Default is off.
- When on:
  - the root layout renders a server-rendered warning banner (`components/demo-mode-banner.tsx`)
    on every page, with no extra client JavaScript;
  - `instrumentation.ts` logs a one-line warning at server start, naming both accounts and the
    `DEMO_MODE` flag.

The guard is intentionally a **warning**, not an authentication gate: it must not break the demo.
It does not read, store or check the password.

Environment:

```dotenv
# Local/demo deployments only. Never enable in production.
DEMO_MODE=true
```

Any production environment must have `DEMO_MODE` unset or `false`, so the banner and startup
warning disappear.

## Rotation checklist (required before a real pilot)

1. Set `DEMO_MODE=false` (or remove it) in the deployment environment.
2. In Supabase Auth, set strong unique passwords for both demo identities, or delete/disable them.
3. Set `DEMO_SEED_PASSWORD` in `.env.local` for local seeds only. Never commit it; distribute it out
   of band. The seed refuses a missing or known-weak value.
4. Re-run the demo flow with the new credentials.
5. Confirm the banner is gone (`/` contains no "Demo mode" text) and the startup log has no
   `[prism-pass][security]` warning.
6. Keep `docs/implementation/known-limitations.md` and this file in sync.

## What this guard does not do

- It does not stop a known production password from working until that account is rotated in
  Supabase Auth.
- It does not detect a rotated password that is still weak.
- It does not hide the accounts from Supabase Auth or the public login page.

Those are authentication-provider and product decisions, not header/rate-limit hardening.
