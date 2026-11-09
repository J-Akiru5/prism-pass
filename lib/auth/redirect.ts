/**
 * Post-authentication redirect guard.
 *
 * Auth callbacks accept a `next` query parameter so a recovery link can return
 * the visitor to the page that started the flow. That parameter is untrusted:
 * without a guard, `/auth/confirm?next=//evil.com` is an open redirect.
 *
 * This module is deliberately dependency-free and DOM-free so it can be unit
 * tested without Supabase, a browser or Next.js.
 */

/** Where a confirmed sign-in lands when no safe `next` value was supplied. */
export const DEFAULT_NEXT_PATH = "/consoles";

/**
 * Control characters can be stripped by URL parsers, and backslashes are
 * treated as slashes by several browsers (`/\evil.com` becomes `//evil.com`).
 * Reject both instead of trying to normalise them.
 */
const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F\\]/;

/**
 * Returns a safe same-origin path, or `null` when the input cannot be used.
 *
 * A value is accepted only when, after a single percent-decoding pass, it:
 * - starts with exactly one `/`;
 * - is not protocol-relative (`//host`);
 * - contains no backslash or control character;
 * - does not look like an absolute URL (`https://…`, `javascript:…`).
 *
 * Query strings and fragments are preserved, because `?` and `#` cannot change
 * the origin of a relative path.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    // Broken percent-encoding is rejected rather than passed through.
    return null;
  }

  if (!decoded) return null;
  if (UNSAFE_CHARACTERS.test(decoded)) return null;
  if (!decoded.startsWith("/")) return null;
  if (decoded.startsWith("//")) return null;

  return decoded;
}

/**
 * Resolves an untrusted `next` value to a safe path, falling back to
 * `DEFAULT_NEXT_PATH`. The fallback itself is validated so a caller cannot
 * accidentally introduce an unsafe default.
 */
export function resolveNext(
  value: string | null | undefined,
  fallback: string = DEFAULT_NEXT_PATH,
): string {
  const safeFallback = safeNextPath(fallback) ?? DEFAULT_NEXT_PATH;
  return safeNextPath(value) ?? safeFallback;
}
