import { describe, expect, it } from "vitest";
import { decideProvision, ensureInternalUser, normalizeEmail } from "../lib/auth/provision";

describe("decideProvision", () => {
  it("rejects unauthenticated callers before checking confirmation", () => {
    expect(decideProvision({ authenticated: false, emailConfirmed: false })).toEqual({
      allowed: false,
      code: "UNAUTHENTICATED",
      message: "Sign in required",
    });
    expect(decideProvision({ authenticated: false, emailConfirmed: true })).toMatchObject({
      allowed: false,
      code: "UNAUTHENTICATED",
    });
  });

  it("rejects an authenticated but unconfirmed email", () => {
    expect(decideProvision({ authenticated: true, emailConfirmed: false })).toEqual({
      allowed: false,
      code: "EMAIL_NOT_CONFIRMED",
      message: "Confirm your email address before provisioning an account",
    });
  });

  it("allows confirmed identities to provision", () => {
    expect(decideProvision({ authenticated: true, emailConfirmed: true })).toEqual({
      allowed: true,
      code: "OK",
      message: "Eligible for provisioning",
    });
  });
});

describe("normalizeEmail", () => {
  it("trims surrounding whitespace and lower-cases the address", () => {
    expect(normalizeEmail("  Maria.Santos@Example.EDU ")).toBe("maria.santos@example.edu");
  });

  it("returns an empty string for missing values", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("ensureInternalUser input guards", () => {
  it("rejects an empty auth id before touching the database", async () => {
    await expect(ensureInternalUser({ authId: "  ", email: "student@example.edu" })).rejects.toThrow("authId is required");
  });

  it("rejects an empty email before touching the database", async () => {
    await expect(ensureInternalUser({ authId: "auth-user-1", email: "   " })).rejects.toThrow("email is required");
  });
});
