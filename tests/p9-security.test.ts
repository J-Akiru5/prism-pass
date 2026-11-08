import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  createTokenBucketLimiter,
} from "../lib/rate-limit";
import {
  assertNonce,
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
  buildSecurityHeaders,
  isScannerPath,
} from "../lib/security/headers";
import { demoModeWarning, isDemoMode } from "../lib/security/demo";
import { scanInput } from "../modules/attendance/engine";
import {
  BODY_LIMITS,
  InvalidJsonError,
  PayloadTooLargeError,
  readJson,
} from "../lib/request-body";
import { isScannablePath, redactMatch, scanText } from "../scripts/security/secret-scan.mjs";

function fakeRequest(text: string, contentLength?: string): Request {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "content-length" ? contentLength ?? null : null),
    },
    text: async () => text,
  } as unknown as Request;
}

describe("P9 rate limiter (token bucket)", () => {
  it("allows a burst up to capacity, then denies and reports retryAfter", () => {
    const limiter = createTokenBucketLimiter({ capacity: 3, refillPerSecond: 1, now: () => 1_000 });
    expect(limiter.take("ip:a", 1, 1_000)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.take("ip:a", 1, 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.take("ip:a", 1, 1_000)).toMatchObject({ allowed: true, remaining: 0 });
    const denied = limiter.take("ip:a", 1, 1_000);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSec).toBe(1);
    expect(denied.limit).toBe(3);
  });

  it("refills at the configured rate and never exceeds capacity", () => {
    const limiter = createTokenBucketLimiter({ capacity: 2, refillPerSecond: 1, now: () => 0 });
    limiter.take("k", 1, 0);
    limiter.take("k", 1, 0);
    expect(limiter.take("k", 1, 500).allowed).toBe(false);
    expect(limiter.take("k", 1, 1_000).allowed).toBe(true);
    // Long idle time refills only to capacity.
    const refilled = limiter.take("k", 1, 60_000);
    expect(refilled.allowed).toBe(true);
    expect(refilled.remaining).toBe(1);
  });

  it("uses fractional refill rates for the retry delay", () => {
    const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSecond: 0.5, now: () => 0 });
    expect(limiter.take("k", 1, 0).allowed).toBe(true);
    const denied = limiter.take("k", 1, 0);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(2);
    expect(limiter.take("k", 1, 2_000).allowed).toBe(true);
  });

  it("keeps buckets independent per key (IP vs org)", () => {
    const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSecond: 1, now: () => 0 });
    expect(limiter.take("ip:1", 1, 0).allowed).toBe(true);
    expect(limiter.take("ip:1", 1, 0).allowed).toBe(false);
    expect(limiter.take("org:a", 1, 0).allowed).toBe(true);
  });

  it("does not mint tokens when the clock moves backwards", () => {
    const limiter = createTokenBucketLimiter({ capacity: 1, refillPerSecond: 1, now: () => 10_000 });
    expect(limiter.take("k", 1, 10_000).allowed).toBe(true);
    const backwards = limiter.take("k", 1, 5_000);
    expect(backwards.allowed).toBe(false);
  });

  it("supports weighted costs and rejects impossible costs", () => {
    const limiter = createTokenBucketLimiter({ capacity: 5, refillPerSecond: 1, now: () => 0 });
    expect(limiter.take("k", 3, 0)).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.take("k", 3, 0).allowed).toBe(false);
    expect(() => limiter.take("k", 6, 0)).toThrow(RangeError);
  });

  it("bounds the map by evicting the oldest keys", () => {
    const limiter = createTokenBucketLimiter({
      capacity: 5,
      refillPerSecond: 1,
      maxKeys: 3,
      idleTtlMs: 60_000,
      sweepIntervalMs: 60_000,
      now: () => 1_000,
    });
    for (let i = 0; i < 100; i += 1) limiter.take(`ip:${i}`, 1, 1_000 + i);
    expect(limiter.size()).toBeLessThanOrEqual(3);
  });

  it("sweeps idle keys opportunistically", () => {
    let now = 0;
    const limiter = createTokenBucketLimiter({
      capacity: 5,
      refillPerSecond: 1,
      maxKeys: 100,
      idleTtlMs: 1_000,
      sweepIntervalMs: 1_000,
      now: () => now,
    });
    limiter.take("old", 1, 0);
    now = 5_000;
    limiter.take("new", 1, now);
    expect(limiter.size()).toBe(1);
  });

  it("rejects invalid configuration instead of failing open", () => {
    expect(() => createTokenBucketLimiter({ capacity: 0, refillPerSecond: 1 })).toThrow(RangeError);
    expect(() => createTokenBucketLimiter({ capacity: 1, refillPerSecond: 0 })).toThrow(RangeError);
    expect(() => createTokenBucketLimiter({ capacity: 1, refillPerSecond: 1, maxKeys: -1 })).toThrow(RangeError);
  });
});

describe("P9 client address extraction", () => {
  const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name.toLowerCase()] ?? null });

  it("uses the first forwarded hop", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIpFromHeaders(headers({ "x-real-ip": "198.51.100.9" }))).toBe("198.51.100.9");
  });

  it("accepts IPv6 and refuses spoofed or oversized values", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "not-an-ip" }))).toBe("unknown");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1".repeat(80) }))).toBe("unknown");
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
  });
});

describe("P9 security headers", () => {
  const nonce = "testnonce12345678";
  const base = { nonce, pathname: "/" };

  it("ships the enforced baseline and a report-only CSP by default", () => {
    const { enforced, csp, cspHeader } = buildSecurityHeaders(base);
    expect(enforced["strict-transport-security"]).toContain("max-age=");
    expect(enforced["x-content-type-options"]).toBe("nosniff");
    expect(enforced["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(enforced["x-frame-options"]).toBe("DENY");
    expect(enforced["permissions-policy"]).toBeTruthy();
    expect(enforced["content-security-policy-report-only"]).toBe(csp);
    expect(enforced["content-security-policy"]).toBeUndefined();
    expect(cspHeader).toBe("Content-Security-Policy-Report-Only");
  });

  it("can emit an enforcing policy when the browser pass is complete", () => {
    const { enforced, cspHeader } = buildSecurityHeaders({ ...base, reportOnly: false });
    expect(cspHeader).toBe("Content-Security-Policy");
    expect(enforced["content-security-policy"]).toContain("script-src");
    expect(enforced["content-security-policy-report-only"]).toBeUndefined();
  });

  it("binds the nonce and blocks inline script without it", () => {
    const csp = buildContentSecurityPolicy({ ...base, development: false });
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows the dev overlay only in development", () => {
    expect(buildContentSecurityPolicy({ ...base, development: true })).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy({ ...base, development: true })).not.toContain("upgrade-insecure-requests");
  });

  it("scopes camera and geolocation to the scanner route only", () => {
    expect(isScannerPath("/scan")).toBe(true);
    expect(isScannerPath("/scan/")).toBe(true);
    expect(isScannerPath("/scan/session/1")).toBe(true);
    expect(isScannerPath("/scanner")).toBe(false);
    expect(isScannerPath("/org/acme/attendance")).toBe(false);
    expect(buildPermissionsPolicy("/scan")).toContain("camera=(self)");
    expect(buildPermissionsPolicy("/scan")).toContain("geolocation=(self)");
    expect(buildPermissionsPolicy("/org/acme")).toContain("camera=()");
    expect(buildPermissionsPolicy("/org/acme")).toContain("geolocation=()");
    expect(buildPermissionsPolicy("/org/acme")).toContain("microphone=()");
  });

  it("adds the Supabase origin to connect-src", () => {
    const csp = buildContentSecurityPolicy({ ...base, supabaseUrl: "https://demo.supabase.co" });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("https://demo.supabase.co");
    expect(csp).toContain("wss://demo.supabase.co");
    expect(csp).toContain("https://*.supabase.co");
  });

  it("rejects header-injection attempts in the nonce", () => {
    expect(() => assertNonce("short")).toThrow();
    expect(() => assertNonce("validnonce123\r\nX-Injected: 1")).toThrow();
  });
});

describe("P9 demo-account guard", () => {
  it("is opt-in and tolerant of common truthy spellings", () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "false" })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: "0" })).toBe(false);
    for (const value of ["1", "true", "TRUE", " yes ", "on"]) {
      expect(isDemoMode({ DEMO_MODE: value })).toBe(true);
    }
  });

  it("warns only when demo mode is on and names the rotation flag", () => {
    expect(demoModeWarning({})).toBeNull();
    const warning = demoModeWarning({ DEMO_MODE: "true" });
    expect(warning).toContain("Demo mode");
    expect(warning).toContain("DEMO_MODE");
    expect(warning).toContain("Rotate");
  });
});

describe("P9 request body ceiling", () => {
  it("parses a normal body", async () => {
    await expect(readJson(fakeRequest('{"ok":true}'), 64)).resolves.toEqual({ ok: true });
  });

  it("rejects an oversized content-length before reading", async () => {
    await expect(readJson(fakeRequest("{}", "999999"), 64)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("rejects an oversized chunked body after reading", async () => {
    await expect(readJson(fakeRequest("x".repeat(65)), 64)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });

  it("turns malformed and empty bodies into a 400-class error", async () => {
    await expect(readJson(fakeRequest("{nope"), 64)).rejects.toBeInstanceOf(InvalidJsonError);
    await expect(readJson(fakeRequest("   "), 64)).rejects.toBeInstanceOf(InvalidJsonError);
  });

  it("keeps the documented ceilings ordered", () => {
    expect(BODY_LIMITS.tiny).toBeLessThan(BODY_LIMITS.small);
    expect(BODY_LIMITS.small).toBeLessThan(BODY_LIMITS.medium);
    expect(BODY_LIMITS.medium).toBeLessThan(BODY_LIMITS.batch);
  });
});

describe("P9 input constraints", () => {
  it("bounds scan credentials and geo coordinates", () => {
    expect(() => scanInput.parse({ credential: "x".repeat(513), clientTs: "2026-11-08T08:00:00Z" })).toThrow();
    expect(() =>
      scanInput.parse({ credential: "PRISM1:abc:def", clientTs: "2026-11-08T08:00:00Z", geo: { lat: 91, lng: 0 } }),
    ).toThrow();
    expect(() =>
      scanInput.parse({ credential: "PRISM1:abc:def", clientTs: "2026-11-08T08:00:00Z", geo: { lat: 14.5, lng: 121.0 } }),
    ).not.toThrow();
  });
});

describe("P9 secret scanner", () => {
  // Literal patterns are assembled at runtime so this test file does not itself
  // trip the scanner that runs in CI.
  const fakeAwsKey = ["AKIA", "1234567890ABCDEF"].join("");
  const fakePrivateKey = ["-----BEGIN", "RSA PRIVATE KEY-----"].join(" ");
  const fakeServiceRole = ["SUPABASE_SERVICE_ROLE_KEY=", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  const remoteDb = ["postgresql://app:", "S3cretPassw0rd", "@db.prod.internal:5432/app"].join("");

  it("detects high-signal credential shapes", () => {
    expect(scanText(`const key = "${fakeAwsKey}";`).map((finding) => finding.rule)).toContain("aws-access-key");
    expect(scanText(fakePrivateKey).map((finding) => finding.rule)).toContain("private-key");
    expect(scanText(fakeServiceRole).map((finding) => finding.rule)).toContain("service-role-assignment");
    expect(scanText(remoteDb).map((finding) => finding.rule)).toContain("database-url-with-password");
  });

  it("ignores placeholders, local databases and ordinary text", () => {
    expect(scanText("SUPABASE_SERVICE_ROLE_KEY=service-role-placeholder-never-expose-to-browser")).toEqual([]);
    expect(scanText("postgresql://postgres:postgres@localhost:54322/postgres")).toEqual([]);
    expect(scanText("const message = 'nothing secret here';")).toEqual([]);
  });

  it("never echoes the full credential", () => {
    const findings = scanText(`token ${fakeAwsKey}`);
    expect(findings).toHaveLength(1);
    expect(findings[0].preview).not.toContain(fakeAwsKey);
    expect(redactMatch("abcdefghijklmnop")).toContain("…");
  });

  it("reports file and 1-based line numbers", () => {
    const findings = scanText(`ok\n${fakeAwsKey}\n`, { file: "src/example.ts" });
    expect(findings[0]).toMatchObject({ file: "src/example.ts", line: 2, column: 1 });
  });

  it("skips dependency, build, binary and scanner-source paths", () => {
    expect(isScannablePath("app/page.tsx")).toBe(true);
    expect(isScannablePath("docs/security/secret-scanning.md")).toBe(true);
    expect(isScannablePath("node_modules/pkg/index.js")).toBe(false);
    expect(isScannablePath(".next/server/app.js")).toBe(false);
    expect(isScannablePath("public/logo.png")).toBe(false);
    expect(isScannablePath("pnpm-lock.yaml")).toBe(false);
    expect(isScannablePath("scripts/security/scan-secrets.mjs")).toBe(false);
  });
});
