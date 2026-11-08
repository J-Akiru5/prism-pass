// Pure security-header construction. Kept free of Next.js imports so the
// middleware, tests and documentation all describe the same policy.
//
// The CSP ships as `Content-Security-Policy-Report-Only` for now: Next's
// inline bootstrap scripts and next-themes' pre-paint script need a browser
// pass to confirm the nonce reaches every tag. See docs/security/security-headers.md.

export type SecurityHeaderOptions = {
  /** Per-request CSP nonce. Must be a base64-value; CR/LF is rejected. */
  nonce: string;
  /** Request path, used to scope camera/geolocation to the scanner. */
  pathname: string;
  /** Supabase project origin, so the browser client can reach GoTrue. */
  supabaseUrl?: string;
  /** Adds 'unsafe-eval' for the dev overlay; production must not need it. */
  development?: boolean;
  /** Emit CSP as Report-Only (default) or enforcing. */
  reportOnly?: boolean;
};

export const HSTS = "max-age=63072000; includeSubDomains; preload";
export const X_CONTENT_TYPE_OPTIONS = "nosniff";
export const REFERRER_POLICY = "strict-origin-when-cross-origin";
export const X_FRAME_OPTIONS = "DENY";
export const CSP_HEADER = "Content-Security-Policy";
export const CSP_REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";

const NONCE_PATTERN = /^[A-Za-z0-9+/=_-]{8,128}$/;

export function assertNonce(nonce: string): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("Invalid CSP nonce: expected 8-128 base64 characters");
  return nonce;
}

/** The QR-camera UI is the only page that needs camera and geolocation. */
export function isScannerPath(pathname: string): boolean {
  return pathname === "/scan" || pathname.startsWith("/scan/");
}

/**
 * Camera and geolocation are delegated to the same origin only on the scanner
 * route. Every other document gets an explicit empty allowlist, so an injected
 * script cannot silently open the camera from a marketing or admin page.
 */
export function buildPermissionsPolicy(pathname: string): string {
  const device = isScannerPath(pathname) ? "(self)" : "()";
  return [
    `camera=${device}`,
    `geolocation=${device}`,
    "microphone=()",
    "payment=()",
    "usb=()",
    "interest-cohort=()",
    "browsing-topics=()",
  ].join(", ");
}

function normaliseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * connect-src must include the Supabase project because the browser client
 * calls GoTrue directly. The value comes from the public env var, never from a
 * request header, so it cannot be influenced by a caller.
 */
export function buildConnectSources(supabaseUrl?: string): string[] {
  const sources = new Set(["'self'", "https://*.supabase.co", "wss://*.supabase.co"]);
  const origin = normaliseOrigin(supabaseUrl);
  if (origin) {
    sources.add(origin);
    if (origin.startsWith("https://")) sources.add(origin.replace(/^https:/, "wss:"));
    // Local Supabase development uses http://localhost:54321.
    if (origin.startsWith("http://")) sources.add(origin.replace(/^http:/, "ws:"));
  }
  return [...sources];
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions): string {
  const nonce = assertNonce(options.nonce);
  const script = [`'self'`, `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (options.development) script.push("'unsafe-eval'");

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["form-action", ["'self'"]],
    ["script-src", script],
    // Tailwind and framer-motion set style attributes; Next injects a small
    // amount of inline CSS. A nonce does not cover style attributes yet.
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", buildConnectSources(options.supabaseUrl)],
    ["media-src", ["'self'", "blob:"]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
  ];
  if (!options.development) directives.push(["upgrade-insecure-requests", []]);

  return directives
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

export type SecurityHeaders = {
  /** Enforced response headers. */
  enforced: Record<string, string>;
  /** The CSP value that should also be forwarded on the request (Next reads it for its nonce). */
  csp: string;
  /** Header used for the CSP response (Report-Only or enforcing). */
  cspHeader: typeof CSP_HEADER | typeof CSP_REPORT_ONLY_HEADER;
};

export function buildSecurityHeaders(options: SecurityHeaderOptions): SecurityHeaders {
  const csp = buildContentSecurityPolicy(options);
  const enforced: Record<string, string> = {
    "strict-transport-security": HSTS,
    "x-content-type-options": X_CONTENT_TYPE_OPTIONS,
    "referrer-policy": REFERRER_POLICY,
    "x-frame-options": X_FRAME_OPTIONS,
    "permissions-policy": buildPermissionsPolicy(options.pathname),
  };
  const cspHeader = options.reportOnly === false ? CSP_HEADER : CSP_REPORT_ONLY_HEADER;
  return { enforced: { ...enforced, [cspHeader.toLowerCase()]: csp }, csp, cspHeader };
}
