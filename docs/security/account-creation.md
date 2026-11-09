# Account creation (`/signup`)

## Scope

Self-serve account creation is limited to **authentication and identity linkage**:

1. Supabase Auth creates the user and stores an optional `full_name` in user metadata.
2. After the email is confirmed, `POST /api/v1/auth/provision` upserts the matching row in the
   internal `users` table, keyed by the Supabase auth id.

It deliberately does **not** create:

- an organization;
- an organization membership;
- a platform administrator;
- an organization-scoped audit row;
- any other tenant data.

A newly created account therefore has no organization access. `/consoles` already tells such users
to ask an administrator, and an administrator grants access through the existing membership flow.
Self-serve organization creation is out of scope for this slice.

## What the account owns

| Created | Where | Notes |
| --- | --- | --- |
| Auth identity | Supabase `auth.users` | Email + password; optional `user_metadata.full_name` |
| Internal identity | Prisma `users` | `auth_id` (unique) and `email` only |
| Memberships | — | None. An administrator adds them later |

No database migration is required. The existing `users` model already has a unique `auth_id`,
an optional `email`, and the relations used by the rest of the application.

## Flow

### Email confirmation enabled (this project)

`mailer_autoconfirm=false`, so `supabase.auth.signUp()` returns a user but no session.

1. `/signup` validates the form and calls `supabase.auth.signUp()` with
   `emailRedirectTo = ${window.location.origin}/auth/confirm?next=/consoles`.
2. The page shows "Check your email" with the submitted address and a link back to `/login`.
   There is no resend button in this slice: an immediate resend path cannot reliably respect
   Supabase's auth rate limits, so the UI directs the user to wait, check spam, or contact an
   administrator.
3. The user opens the email link. `/auth/confirm` exchanges or verifies the token and then calls
   `POST /api/v1/auth/provision`.
4. The API creates the internal user and the user is sent to `/consoles`.

### Email confirmation disabled (defensive path)

If a deployment changes `mailer_autoconfirm` to `true`, `signUp()` returns a session. The page then
calls the provisioning endpoint immediately and routes to `/consoles`. This path is supported but
not the configured production behavior.

## Provisioning API

`POST /api/v1/auth/provision`

- Requires a verified Supabase session (`getSessionUser()`); otherwise `401 UNAUTHENTICATED`.
- Requires a confirmed email (`email_confirmed_at`, falling back to `confirmed_at`); otherwise
  `403 EMAIL_NOT_CONFIRMED`.
- Reads **no values from the request body**. The auth id and email come only from the verified
  session, so a caller cannot provision another identity.
- Upserts by `authId`:
  `update: { email }`, `create: { authId, email }`. Repeated calls are safe and do not duplicate
  rows or grant access.
- Responds with the standard success envelope:
  `{ "data": { "internalUserId": "...", "email": "..." } }`.
- Uses the shared `fail` and `handleRouteError` helpers for errors.

The endpoint creates no membership, organization, platform admin, or audit row.

## Supabase configuration

In **Authentication → URL Configuration**, set the site URL and add the callback URLs used by this
flow:

```text
https://pass.syntaxure.dev/auth/confirm
http://localhost:3000/auth/confirm
```

The client appends `?next=/consoles` to the callback. If the project's allowlist matches the full
redirect string rather than the base URL, also add the exact callback with its query string or a
wildcard entry such as `https://pass.syntaxure.dev/auth/confirm**`. Verify the production entry
before launch.

Keep the production URL in the allowlist and remove stale preview or temporary domains. Auth
redirect allowlists are evaluated by Supabase, not by this application, so the repository cannot
enforce them.

## Abuse controls

- **Signup rate limits live in Supabase Auth.** Supabase limits auth requests (including sign-up and
  confirmation emails) per project and per email/IP. The app does not add a second signup form
  throttle; a client-side "resend" button is intentionally omitted so the UI cannot encourage
  repeated email sends.
- **Provisioning requires a confirmed session.** Unauthenticated and unconfirmed callers get `401` /
  `403` before any database work. The endpoint is idempotent and body-free, so repeated calls with a
  valid session only rewrite the same email value.
- **Client validation is UX, not the security boundary.** The form enforces a valid email, an
  8-character minimum, matching passwords, and explicit terms acceptance. Supabase's project-level
  password policy remains the server-side authority.
- **No privilege grant.** Creating an auth user or internal user row does not grant organization or
  platform access.

## Residual risks

- **Open signup creates dormant auth users.** `disable_signup=false` means anyone can create a
  Supabase Auth user and an internal `users` row. They still see no tenant data, but the project
  accumulates identities that no organization has accepted. If that becomes a problem, restrict
  signup (invite-only, CAPTCHA, or disabling public signup) at the Supabase project level.
- **Administrator follow-up is manual.** A user who confirms their email but is never added to an
  organization reaches `/consoles` and sees the existing "ask an administrator" message. There is no
  self-serve request queue in this slice.
- **Terms acceptance is not persisted server-side.** The checkbox is required before the form calls
  Supabase, but this slice does not write a terms-acceptance timestamp. Add a durable record if
  legal review requires one.
- **Email enumeration is bounded by Supabase's own response.** The page shows a safe message for
  "already registered" and other Supabase errors, but it does not add any additional lookup that
  could reveal whether an address exists.
- **Auth email delivery depends on Supabase's SMTP configuration.** A misconfigured sender or
  redirect allowlist can strand a user after Supabase has already created the auth identity.
