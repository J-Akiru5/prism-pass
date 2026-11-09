# Auth login UX

Scope: the public `/login` form's usability and accessibility. Authentication
stays on Supabase `signInWithPassword`; no auth backend, session or redirect
logic was changed.

## Show / hide password

`components/auth/password-input.tsx` wraps the shared `Input` and adds a
toggle button inside the field.

- The input renders as `type="password"` until the user chooses to reveal it,
  then as `type="text"`.
- The button is `type="button"` so it never submits the form.
- The accessible name switches between **Show password** and **Hide
  password**; `aria-pressed` reflects whether the value is currently visible
  and `aria-controls` points at the input id.
- The icon is `Eye` while hidden and `EyeOff` while visible, marked
  `aria-hidden` because the button label carries the meaning.
- The button has a visible `focus-visible` ring, a hover colour and the same
  disabled state as the input.
- Layout does not shift: the wrapper is `relative`, the button is absolutely
  positioned in a fixed `w-11` slot, and the input reserves `pr-11`.
- Props extend `InputHTMLAttributes<HTMLInputElement>`; `id`, `value`,
  `onChange`, `autoComplete`, `required`, `placeholder`, `className` and
  `disabled` pass through to the input. A generated id is used when none is
  supplied.

`FormField` still attaches its label, hint, error text and `aria-invalid` to
the input, so the toggle does not break the existing field semantics.

## Validation and error copy

The form uses `noValidate` and validates on submit:

| Rule | Message |
| --- | --- |
| Email empty | `Enter your email address.` |
| Email does not match the address shape | `Enter a valid email address.` |
| Password empty | `Enter your password.` |

The email is trimmed before validation and before it is sent to Supabase. A
field error clears as soon as that field is edited. The submit button is
disabled while a request is in flight and shows `Signing in…`.

Supabase/auth errors are not rendered verbatim. Fixed copy is used instead:

- rate limiting → `Too many sign-in attempts. Wait a moment, then try again.`
- network/transport failure → `We could not reach the sign-in service. Check
  your connection and try again.`
- every other auth failure, including invalid credentials and unconfirmed
  email → `Email or password is incorrect.`

The generic branch is deliberate: the form must not reveal whether an email
address has an account, including in the unconfirmed-email case. No pre-flight
account lookup is performed.

## Link targets

| Link | Target | Owner |
| --- | --- | --- |
| Back to home (top bar, all viewports) | `/` | this change |
| Brand logo (desktop brand panel) | `/` | existing |
| Book a demo (top bar, desktop) | `/demo` | existing |
| Forgot password → Reset it | `/forgot-password` | another workstream |
| Create account | `/signup` | another workstream |
| Privacy & your rights | `/privacy` | existing |

The top bar keeps `Back to home` on the left and `New to Prism Pass? Book a
demo` on the right, with `justify-between` and a gap so they cannot overlap.
The demo text is hidden below `lg`, where the back link remains visible.

## Post-sign-in provisioning

After `signInWithPassword` succeeds, the page calls:

```ts
await fetch("/api/v1/auth/provision", {
  method: "POST",
  credentials: "include",
});
```

then `router.push(next)`. The call is best-effort by design:

- `fetch` resolves for 404 and 5xx responses; those are ignored.
- a thrown network error is caught locally and ignored.
- sign-in is never blocked or reverted because provisioning failed.

The provision route is owned by another workstream and is expected to exist
after assembly. This page does not create accounts, write tenant data or call
live auth endpoints during tests.

## Security notes

- `mailer_autoconfirm=false` in production: no account is auto-confirmed and
  this change creates no accounts.
- Tests cover only the pure visibility helpers; no live Supabase request, no
  account creation, no DOM testing library.
- Auth error copy avoids account enumeration; the raw Supabase message is not
  shown.
- The `next` query parameter is passed through unchanged, as before this
  change.

## Verification

- `pnpm exec tsc --noEmit`
- `pnpm exec vitest run tests/auth-login-ux.test.ts`

## Assembly notes

- `/forgot-password` and `/signup` must be present after the other
  workstreams merge; until then these links are valid targets with no page.
- `/api/v1/auth/provision` may return 404 until its route lands. That is
  expected and does not affect sign-in.
