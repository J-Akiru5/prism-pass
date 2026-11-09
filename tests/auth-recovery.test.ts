import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_PATH, resolveNext, safeNextPath } from "../lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/reset-password", "/consoles", "/", "/org/acme?tab=people#top"])(
    "accepts the same-origin path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it("accepts an encoded relative path and decodes it once", () => {
    expect(safeNextPath("%2Freset-password")).toBe("/reset-password");
    expect(safeNextPath("%2Freset-password%3Fsource%3Demail%23form")).toBe(
      "/reset-password?source=email#form",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(safeNextPath("  /consoles  ")).toBe("/consoles");
  });

  it.each([null, undefined, "", "   "])("rejects an empty value (%s)", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it.each(["//evil.com", "///evil.com", "%2F%2Fevil.com", "/%2F%2Fevil.com"])(
    "rejects the protocol-relative target %s",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

  it.each([
    "https://evil.com",
    "http://evil.com",
    "https%3A%2F%2Fevil.com",
    "javascript:alert(1)",
    "data:text/html,hi",
  ])("rejects the absolute target %s", (value) => {
    expect(safeNextPath(value)).toBeNull();
  });

  it.each(["\\\\evil", "\\evil", "/\\evil.com", "/%5Cevil.com", "%5C%5Cevil.com"])(
    "rejects backslash variants (%s)",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

  it.each(["/%0A/evil", "/%09/evil", "/%00/evil", "/reset%0D%0ASet-Cookie:%20x"])(
    "rejects encoded control characters (%s)",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

  it.each(["/%E0%A4%A", "%E0%A4%A", "/reset-password?x=%"])(
    "rejects malformed percent-encoding (%s)",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

  it.each(["reset-password", "#top", "?next=/consoles", "evil.com/path"])(
    "rejects non-path values (%s)",
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );
});

describe("resolveNext", () => {
  it("defaults to /consoles", () => {
    expect(DEFAULT_NEXT_PATH).toBe("/consoles");
    expect(resolveNext(null)).toBe("/consoles");
    expect(resolveNext(undefined)).toBe("/consoles");
    expect(resolveNext("")).toBe("/consoles");
  });

  it("keeps a safe requested path", () => {
    expect(resolveNext("/reset-password")).toBe("/reset-password");
    expect(resolveNext("/consoles?org=acme#passes")).toBe("/consoles?org=acme#passes");
  });

  it.each(["//evil.com", "https://evil.com", "\\\\evil", "%2F%2Fevil.com"])(
    "falls back for the unsafe target %s",
    (value) => {
      expect(resolveNext(value)).toBe("/consoles");
    },
  );

  it("uses a caller-provided safe fallback", () => {
    expect(resolveNext(null, "/reset-password")).toBe("/reset-password");
    expect(resolveNext("//evil.com", "/reset-password")).toBe("/reset-password");
  });

  it("ignores an unsafe caller-provided fallback", () => {
    expect(resolveNext(null, "//evil.com")).toBe("/consoles");
    expect(resolveNext(null, "https://evil.com")).toBe("/consoles");
    expect(resolveNext("/reset-password", "//evil.com")).toBe("/reset-password");
  });
});
