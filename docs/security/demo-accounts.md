# Demo accounts (P9)

## Current decision

The owner has explicitly kept the seeded demo credentials usable in this phase. This document does
**not** change, disable or rotate them. It records the risk and the guard that exists today.

Seeded demo identities:

- `admin@syntaxure.dev` — OWNER of the demo organization
- `user@syntaxure.dev` — seeded member

Both currently use the same weak demo password. Because the production URL is public, anyone who
knows or guesses it can sign in. Treat the demo tenant as public and disposable.

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
3. Update any local seed script or handoff note that mentions the shared password. Do not commit a
   new password; distribute it out of band.
4. Re-run the demo flow with the new credentials.
5. Confirm the banner is gone (`/` contains no "Demo mode" text) and the startup log has no
   `[prism-pass][security]` warning.
6. Keep `docs/implementation/known-limitations.md` and this file in sync.

## What this guard does not do

- It does not stop a known demo password from working.
- It does not detect a rotated password that is still weak.
- It does not hide the accounts from Supabase Auth or the public login page.

Those are authentication-provider and product decisions, not header/rate-limit hardening.
