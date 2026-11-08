# Rate limiting (P9)

## Covered endpoints

| Route | Scope | Burst (`capacity`) | Sustained (`refillPerSecond`) |
| --- | --- | --- | --- |
| `POST /api/v1/orgs/[orgId]/passes/verify` | per IP | 120 | 2/s (120/min) |
| `POST /api/v1/orgs/[orgId]/passes/verify` | per org | 600 | 10/s (600/min) |
| `POST /api/v1/orgs/[orgId]/sessions/[sessionId]/scans` | per IP | 120 | 2/s |
| `POST /api/v1/orgs/[orgId]/sessions/[sessionId]/scans` | per org | 600 | 10/s |
| `POST /api/v1/sync/batches` | per IP | 30 | 0.5/s (30/min) |
| `POST /api/v1/sync/batches` | per org | 60 | 1/s |
| `GET /api/v1/verify/[token]` | per IP | 30 | 0.5/s |

Password sign-in is intentionally absent: Supabase Auth owns that path, including its own abuse
controls.

The values live in `RATE_LIMIT_POLICIES` (`lib/rate-limit-http.ts`) so a capacity change is a
reviewable one-line diff. They are starting points for a single-campus pilot, not load-tested
numbers.

## Semantics

- **Token bucket, cost 1 per request.** A bucket starts full (`capacity`), loses one token per
  request, and refills continuously at `refillPerSecond`. A burst is allowed up to capacity; the
  sustained rate is the refill rate.
- **Two independent buckets where both apply.** IP and org buckets are separate maps. A request
  must pass both. A shared campus NAT can exhaust its IP bucket only for the burst window; the org
  bucket is the aggregate ceiling for the tenant.
- **Ordering.** The IP bucket is consumed before authentication (the cheapest thing to flood). The
  org bucket is consumed only after `requireOrganizationPermission` succeeds, so an unauthenticated
  caller cannot drain another tenant's bucket by naming its id.
- **Denial response.** `429` with the standard error envelope:
  ```json
  { "error": { "code": "RATE_LIMITED", "message": "Too many requests…", "details": { "scope": "ip", "retryAfterSec": 2, "limit": 120, "remaining": 0 } } }
  ```
  plus `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` and
  `Cache-Control: no-store`.
- **Clock safety.** A backwards clock move cannot mint tokens (elapsed time is clamped to zero).
- **Bounded memory.** Each limiter tracks at most `maxKeys` (10 000) keys. When full, idle entries
  are swept first, then the oldest 10% are evicted. Entries idle for 10 minutes are removed on an
  opportunistic sweep (at most once per minute). No timers, no background jobs.

## Client identity

`clientIpFromHeaders` uses the first `X-Forwarded-For` hop, then `X-Real-IP`, and only accepts a
value that looks like an IPv4/IPv6 address. Anything else becomes `unknown`, which shares a bucket
instead of creating unbounded keys.

On Vercel the platform overwrites `X-Forwarded-For`. On any other host, the reverse proxy **must**
overwrite it; otherwise a caller can spoof the header and rotate buckets. This is a deployment
responsibility, not something application code can prove.

## Per-instance caveat (important)

The buckets live in module memory. A serverless deployment runs multiple instances (and cold
starts create fresh maps), so:

- the limit is enforced per instance, not globally;
- an attacker spread across instances can exceed the nominal rate by roughly the instance count;
- a restart resets every bucket.

This is still useful: it caps the cost a single connection can impose on one database connection
pool and stops naive floods and scripted retries. It is **not** a billing or abuse quota. Do not
describe it as one.

## Where a shared store goes

`lib/rate-limit.ts` exposes the pure `TokenBucketLimiter` contract; `lib/rate-limit-http.ts` only
wires routes to it. To make the limit global:

1. Add a Redis/Upstash client (new dependency — needs explicit approval and a lockfile change).
2. Implement the same `take(key, cost, nowMs)` contract with an atomic Redis script (token bucket
   or fixed-window `INCR` + `PEXPIRE`). Do not do read-modify-write in JavaScript.
3. Keep the in-memory limiter as a fallback when the shared store errors, and log the degraded
   mode. Failing closed on a store outage would take down scanning.
4. Use keys such as `rl:v1:scan:ip:<ip>` and `rl:v1:scan:org:<orgId>` with a TTL of at least the
   refill horizon.
5. Keep the route-facing `enforceRateLimits` signature stable so route handlers do not change.

## Tests

`tests/p9-security.test.ts` covers burst boundaries, fractional refill, per-key isolation,
weighted cost, denial retry delay, backwards clock, bounded-map eviction, idle sweep and invalid
configuration. The HTTP glue is deliberately thin and untested by unit tests; it is exercised by
typecheck and by the routes that import it.
