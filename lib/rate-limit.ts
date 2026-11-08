// In-memory token bucket. No dependencies, no timers, no Next.js imports:
// callers pass the clock so every boundary is testable.
//
// Scope: one process/instance. Serverless platforms run many instances, so this
// is a cheap first line of defence, not a global quota. A shared store (Redis /
// Upstash) is the upgrade path; see docs/security/rate-limiting.md.

export type TokenBucketOptions = {
  /** Maximum burst size. */
  capacity: number;
  /** Tokens restored per second (fractional values are allowed). */
  refillPerSecond: number;
  /** Hard bound on the number of tracked keys (default 10_000). */
  maxKeys?: number;
  /** Idle entries older than this are swept (default 10 minutes). */
  idleTtlMs?: number;
  /** How often the opportunistic sweep runs (default 60 seconds). */
  sweepIntervalMs?: number;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Burst capacity for this bucket. */
  limit: number;
  /** Whole tokens left after this call (never negative). */
  remaining: number;
  /** Seconds until the next token is available; 0 when allowed. */
  retryAfterSec: number;
  /** Epoch milliseconds when the bucket would be full again. */
  resetAtMs: number;
};

export type TokenBucketLimiter = {
  take(key: string, cost?: number, nowMs?: number): RateLimitResult;
  /** Tracked keys, for tests and operational introspection. */
  size(): number;
  reset(): void;
};

type Entry = { tokens: number; updatedAtMs: number };

const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_IDLE_TTL_MS = 10 * 60_000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const EVICT_FRACTION = 0.1;

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number`);
}

export function createTokenBucketLimiter(options: TokenBucketOptions): TokenBucketLimiter {
  const capacity = options.capacity;
  const refillPerSecond = options.refillPerSecond;
  const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  const idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
  const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  const clock = options.now ?? Date.now;

  assertPositive("capacity", capacity);
  assertPositive("refillPerSecond", refillPerSecond);
  assertPositive("maxKeys", maxKeys);
  assertPositive("idleTtlMs", idleTtlMs);
  assertPositive("sweepIntervalMs", sweepIntervalMs);

  const entries = new Map<string, Entry>();
  let lastSweepMs = clock();

  function sweep(nowMs: number): void {
    if (nowMs - lastSweepMs < sweepIntervalMs) return;
    lastSweepMs = nowMs;
    for (const [key, entry] of entries) {
      if (nowMs - entry.updatedAtMs >= idleTtlMs) entries.delete(key);
    }
  }

  function makeRoom(nowMs: number): void {
    if (entries.size < maxKeys) return;
    // Prefer dropping idle keys, then the oldest tracked keys. This keeps the
    // map bounded under key-flooding without a background timer.
    for (const [key, entry] of entries) {
      if (nowMs - entry.updatedAtMs >= idleTtlMs) entries.delete(key);
    }
    if (entries.size < maxKeys) return;
    const oldest = [...entries.entries()].sort((a, b) => a[1].updatedAtMs - b[1].updatedAtMs);
    const toDrop = Math.max(1, Math.ceil(maxKeys * EVICT_FRACTION));
    for (let i = 0; i < toDrop && entries.size >= maxKeys; i += 1) entries.delete(oldest[i][0]);
  }

  function refill(entry: Entry, nowMs: number): void {
    // Clamp backwards clock moves to zero: a negative elapsed time must never
    // mint tokens.
    const elapsedMs = Math.max(0, nowMs - entry.updatedAtMs);
    if (elapsedMs > 0) {
      entry.tokens = Math.min(capacity, entry.tokens + (elapsedMs / 1000) * refillPerSecond);
      entry.updatedAtMs = nowMs;
    }
  }

  function result(allowed: boolean, tokens: number, cost: number, nowMs: number): RateLimitResult {
    const remaining = Math.max(0, Math.floor(tokens));
    const retryAfterSec = allowed ? 0 : Math.max(1, Math.ceil((cost - tokens) / refillPerSecond));
    const resetAtMs = nowMs + Math.ceil(((capacity - tokens) / refillPerSecond) * 1000);
    return { allowed, limit: capacity, remaining, retryAfterSec, resetAtMs };
  }

  return {
    take(key: string, cost = 1, nowMs = clock()): RateLimitResult {
      if (!Number.isFinite(cost) || cost <= 0) throw new RangeError("cost must be a positive finite number");
      if (cost > capacity) throw new RangeError("cost cannot exceed capacity");
      if (!key) throw new RangeError("key is required");

      sweep(nowMs);

      let entry = entries.get(key);
      if (!entry) {
        makeRoom(nowMs);
        entry = { tokens: capacity, updatedAtMs: nowMs };
        entries.set(key, entry);
      }
      refill(entry, nowMs);

      if (entry.tokens >= cost) {
        entry.tokens -= cost;
        return result(true, entry.tokens, cost, nowMs);
      }
      return result(false, entry.tokens, cost, nowMs);
    },
    size: () => entries.size,
    reset: () => entries.clear(),
  };
}

/**
 * Best-effort client address. On Vercel the platform overwrites
 * `x-forwarded-for`; on other deployments a proxy must do the same. A value
 * that does not look like an IP becomes "unknown" so spoofed text cannot create
 * an unbounded set of buckets.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  const candidate = (forwarded?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
  if (!candidate || candidate.length > 64) return "unknown";
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : "unknown";
}
