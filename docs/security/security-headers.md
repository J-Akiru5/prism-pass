# Security headers and CSP (P9)

## Where it lives

- `middleware.ts` applies the headers to every document response (and API response).
- `lib/security/headers.ts` is the pure policy builder; no Next.js imports.
- `tests/p9-security.test.ts` covers the header set, nonce binding, scanner scoping and
  `connect-src` construction.

The matcher covers every path except `/_next/static`, `/_next/image` and `favicon.ico`, so
marketing pages, the login page, protected consoles and API routes all receive the baseline
headers. Static chunks carry no document policy and are intentionally skipped.

## Enforced today

| Header | Value | Notes |
| --- | --- | --- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Browsers ignore it over plain HTTP, so localhost is unaffected. Do not submit to the preload list until every subdomain is HTTPS-only. |
| `X-Content-Type-Options` | `nosniff` | |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Cross-origin requests keep the origin but not the path. |
| `X-Frame-Options` | `DENY` | Matches `frame-ancestors 'none'`. |
| `Permissions-Policy` | `camera=(self), geolocation=(self)` **on `/scan` only**; `camera=(), geolocation=()` elsewhere; `microphone=(), payment=(), usb=()` everywhere | The QR scanner is the only page that opens the camera (`components/scanner-viewport.tsx`). |

## CSP: Default is Report-Only

`Content-Security-Policy-Report-Only` is set by default. This is deliberate:

- Next.js App Router stamps its inline bootstrap scripts with a nonce **only when it can read a
  `Content-Security-Policy` request header** containing `'nonce-…'`. The middleware sets that
  request header (and `x-nonce`) in addition to the response header.
- `next-themes` injects a pre-paint theme script. Whether that script receives the nonce depends on
  the installed version and how React emits it; a strict enforced policy could block it and cause a
  flash or a broken first paint.
- The app also uses inline style attributes (Tailwind utilities, framer-motion, Recharts). A nonce
  does not cover style attributes, so `style-src` keeps `'unsafe-inline'` for now.

Shipping an untested enforcing policy would risk a visibly broken app. Report-Only gives the same
policy text, logs violations in the browser console, and cannot block anything.

Current directives:

```
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
form-action 'self';
script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co <NEXT_PUBLIC_SUPABASE_URL origin>;
media-src 'self' blob:;
worker-src 'self' blob:;
manifest-src 'self';
upgrade-insecure-requests;  (production only)
```

`'unsafe-eval'` is added only when `NODE_ENV !== "production"` for the dev overlay. `connect-src`
derives the Supabase origin from the public environment variable, never from request input.

## Limitations (read before claiming CSP protection)

- Report-Only does **not** mitigate XSS. Until it is enforced, CSP is telemetry, not a control.
- There is no `report-uri`/`Report-To` endpoint yet. Violations appear in the browser console and
  in the CSP report collector only if one is configured later.
- Static assets are not middleware-matched, so they receive none of these headers. That is fine for
  scripts/styles but means a direct navigation to a non-HTML asset has no policy.
- Header enforcement is at the app edge. A proxy/CDN that rewrites headers can weaken it; verify the
  deployed response, not just this repository.

## Promotion checklist (enforcing CSP)

1. Deploy this branch (or run `pnpm dev`) with `DEMO_MODE` unset and open every route: `/`, `/login`,
   `/consoles`, `/org/:id/*`, `/member`, `/platform`, `/scan`, `/demo`.
2. In DevTools → Console, collect `Content-Security-Policy-Report-Only` violations. Confirm the
   Next.js bootstrap scripts and the theme script carry the per-request nonce (Elements → script
   tags). A missing nonce on an inline script is a blocker.
3. Confirm the QR scanner still opens the camera on `/scan` and that `Permissions-Policy` does not
   block it.
4. If violations are only expected inline styles, keep `style-src 'unsafe-inline'` and enforce the
   rest.
5. Change the middleware call to `reportOnly: false`. Keep the Report-Only header alongside the
   enforced one for one release if you want a safety net.
6. Run `pnpm typecheck`, `pnpm test` and the CI build; then repeat the browser pass in production
   mode (`next start`, not only dev) because React's dev wrappers change inline script behaviour.

## Verifying locally

```bash
curl -sI http://localhost:3000/ | findstr /i "content-security strict-transport x-frame permissions referrer x-content-type"
curl -sI http://localhost:3000/scan | findstr /i "permissions-policy"
```

`/scan` must show `camera=(self)`; `/` must show `camera=()`.
