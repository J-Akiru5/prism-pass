import "server-only";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import {
  clientIpFromHeaders,
  createTokenBucketLimiter,
  type RateLimitResult,
  type TokenBucketLimiter,
} from "@/lib/rate-limit";

/**
 * HTTP glue for the pure token bucket in lib/rate-limit.ts.
 *
 * Every policy is per-instance: a serverless deployment runs N instances, and
 * each one refills its own buckets. That is acceptable for burst/cost control
 * (a single hot instance stops the flood it is serving) but it is NOT a global
 * quota. See docs/security/rate-limiting.md for the shared-store upgrade path.
 *
 * Sizing notes:
 * - `capacity` is a burst, `refillPerSecond` is sustained throughput.
 * - pass verify / scan: a check-in rush may legitimately burst hundreds of
 *   scans from one campus IP, so the IP bucket is generous and the org bucket
 *   is the real ceiling.
 * - sync batches: devices upload on reconnect; low sustained rate is enough.
 * - public verify: unauthenticated, so it is deliberately small.
 */
export const RATE_LIMIT_POLICIES = {
  passVerify: {
    ip: { capacity: 120, refillPerSecond: 2 },
    org: { capacity: 600, refillPerSecond: 10 },
  },
  scan: {
    ip: { capacity: 120, refillPerSecond: 2 },
    org: { capacity: 600, refillPerSecond: 10 },
  },
  syncBatch: {
    ip: { capacity: 30, refillPerSecond: 0.5 },
    org: { capacity: 60, refillPerSecond: 1 },
  },
  verifyToken: {
    ip: { capacity: 30, refillPerSecond: 0.5 },
  },
} as const;

export const limiters = {
  passVerifyIp: createTokenBucketLimiter(RATE_LIMIT_POLICIES.passVerify.ip),
  passVerifyOrg: createTokenBucketLimiter(RATE_LIMIT_POLICIES.passVerify.org),
  scanIp: createTokenBucketLimiter(RATE_LIMIT_POLICIES.scan.ip),
  scanOrg: createTokenBucketLimiter(RATE_LIMIT_POLICIES.scan.org),
  syncBatchIp: createTokenBucketLimiter(RATE_LIMIT_POLICIES.syncBatch.ip),
  syncBatchOrg: createTokenBucketLimiter(RATE_LIMIT_POLICIES.syncBatch.org),
  verifyTokenIp: createTokenBucketLimiter(RATE_LIMIT_POLICIES.verifyToken.ip),
} as const;

export type LimitCheck = {
  /** Human-readable scope used in the error envelope ("ip" | "org"). */
  scope: string;
  limiter: TokenBucketLimiter;
  key: string;
};

export type LimitOutcome =
  | { ok: true; result: RateLimitResult }
  | { ok: false; result: RateLimitResult; scope: string };

export function ipCheck(limiter: TokenBucketLimiter, req: Request, scope = "ip"): LimitCheck {
  return { scope, limiter, key: `ip:${clientIpFromHeaders(req.headers)}` };
}

export function orgCheck(limiter: TokenBucketLimiter, organizationId: string, scope = "org"): LimitCheck {
  return { scope, limiter, key: `org:${organizationId}` };
}

/** Consume one token from every check, in order, with a single clock read. */
export function checkRateLimits(checks: LimitCheck[], nowMs = Date.now()): LimitOutcome {
  let last: RateLimitResult | null = null;
  for (const check of checks) {
    const result = check.limiter.take(check.key, 1, nowMs);
    last = result;
    if (!result.allowed) return { ok: false, result, scope: check.scope };
  }
  if (!last) throw new Error("checkRateLimits requires at least one check");
  return { ok: true, result: last };
}

export function rateLimited(result: RateLimitResult, scope: string): NextResponse {
  const response = fail(429, "RATE_LIMITED", "Too many requests. Retry after the indicated delay.", {
    scope,
    retryAfterSec: result.retryAfterSec,
    limit: result.limit,
    remaining: result.remaining,
  });
  response.headers.set("retry-after", String(result.retryAfterSec));
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-ratelimit-limit", String(result.limit));
  response.headers.set("x-ratelimit-remaining", String(result.remaining));
  const resetSec = Math.max(0, Math.ceil((result.resetAtMs - Date.now()) / 1000));
  response.headers.set("x-ratelimit-reset", String(resetSec));
  return response;
}

/**
 * Convenience guard for route handlers. Returns a 429 response when a bucket is
 * exhausted, otherwise null so the handler can continue.
 */
export function enforceRateLimits(checks: LimitCheck[]): NextResponse | null {
  const outcome = checkRateLimits(checks);
  return outcome.ok ? null : rateLimited(outcome.result, outcome.scope);
}
