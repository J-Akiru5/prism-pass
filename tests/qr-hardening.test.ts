import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { constantTimeEqualHex, verifyCredentialHash } from "../modules/passes/credential";
import { hashCredential, newCredentialPair } from "../modules/passes/service";
import { parseQrPayload, verifyPassStatus } from "../modules/passes/verify";

// Deterministic pass-QR derivation requires a master key; tests use a fixed one.
process.env.PASS_QR_SECRET = "test-pass-qr-secret-".padEnd(64, "a");

const PASS_ID = "pp_0123456789abcdef";
const LOWER = "a".repeat(64);
const UPPER = "A".repeat(64);

describe("constant-time credential comparison", () => {
  it("matches identical hex", () => {
    expect(constantTimeEqualHex(LOWER, LOWER)).toBe(true);
    expect(constantTimeEqualHex("0123456789abcdef", "0123456789abcdef")).toBe(true);
  });

  it("treats uppercase and lowercase hex as the same bytes", () => {
    expect(constantTimeEqualHex(UPPER, LOWER)).toBe(true);
    expect(constantTimeEqualHex("AbCdEf", "abcdef")).toBe(true);
  });

  it("rejects a same-length value that differs anywhere", () => {
    expect(constantTimeEqualHex(LOWER, "b".repeat(64))).toBe(false);
    expect(constantTimeEqualHex(LOWER, LOWER.slice(0, -1) + "b")).toBe(false);
  });

  it("rejects length mismatches", () => {
    expect(constantTimeEqualHex(LOWER, LOWER.slice(0, 62))).toBe(false);
    expect(constantTimeEqualHex("ab", "abcd")).toBe(false);
    expect(constantTimeEqualHex("abc", "abc")).toBe(false); // odd length is not valid hex
    expect(constantTimeEqualHex("", "")).toBe(false);
  });

  it("rejects invalid hex and non-strings without calling timingSafeEqual", () => {
    expect(constantTimeEqualHex("z".repeat(64), "z".repeat(64))).toBe(false);
    expect(constantTimeEqualHex(LOWER, "g".repeat(64))).toBe(false);
    expect(constantTimeEqualHex(LOWER, `${LOWER.slice(0, 63)} `)).toBe(false);
    expect(constantTimeEqualHex(null as never, LOWER)).toBe(false);
    expect(constantTimeEqualHex(LOWER, undefined as never)).toBe(false);
  });
});

describe("credential hash verification", () => {
  it("accepts the secret that matches the stored hash", () => {
    const { qrPayload, credentialHash } = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(qrPayload);
    expect(parsed).not.toBeNull();
    expect(verifyCredentialHash(parsed!.passPublicId, parsed!.secret, credentialHash)).toBe(true);
  });

  it("rejects a tampered secret and the wrong pass id", () => {
    const { qrPayload, credentialHash } = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(qrPayload)!;
    const tampered = (parsed.secret[0] === "a" ? "b" : "a") + parsed.secret.slice(1);

    expect(verifyCredentialHash(parsed.passPublicId, tampered, credentialHash)).toBe(false);
    expect(verifyCredentialHash("pp_ffffffffffffffff", parsed.secret, credentialHash)).toBe(false);
  });

  it("preserves the exact hash scheme: sha256('<passPublicId>:<secret>')", () => {
    const secret = "0123456789abcdef".repeat(4);
    const expected = createHash("sha256").update(`${PASS_ID}:${secret}`).digest("hex");

    expect(hashCredential(PASS_ID, secret)).toBe(expected);
    expect(verifyCredentialHash(PASS_ID, secret, expected)).toBe(true);
  });

  it("accepts an uppercase representation of the stored hex hash", () => {
    const pair = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(pair.qrPayload)!;

    expect(pair.credentialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyCredentialHash(PASS_ID, parsed.secret, pair.credentialHash.toUpperCase())).toBe(true);
  });

  it("does not normalise the secret: hashing is over the literal issued string", () => {
    const pair = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(pair.qrPayload)!;
    const uppercased = parsed.secret.toUpperCase();

    // Issuance only emits lowercase hex; an uppercased rendering is a different
    // literal string and therefore a different credential, matching the offline
    // scanner's SHA-256(passPublicId:secret) semantics.
    expect(verifyCredentialHash(PASS_ID, uppercased, pair.credentialHash)).toBe(false);
  });

  it("fails closed for malformed or missing stored hashes", () => {
    const { qrPayload } = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(qrPayload)!;

    expect(verifyCredentialHash(PASS_ID, parsed.secret, "")).toBe(false);
    expect(verifyCredentialHash(PASS_ID, parsed.secret, "deadbeef")).toBe(false);
    expect(verifyCredentialHash(PASS_ID, parsed.secret, "a".repeat(63))).toBe(false);
    expect(verifyCredentialHash(PASS_ID, parsed.secret, "z".repeat(64))).toBe(false);
    expect(verifyCredentialHash(PASS_ID, parsed.secret, null as never)).toBe(false);
    expect(verifyCredentialHash(PASS_ID, null as never, hashCredential(PASS_ID, parsed.secret))).toBe(false);
  });
});

describe("combined verification pipeline (pure)", () => {
  it("keeps a valid, unexpired credential valid", () => {
    const pair = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(pair.qrPayload)!;
    expect(verifyCredentialHash(parsed.passPublicId, parsed.secret, pair.credentialHash)).toBe(true);
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: null })).toEqual({ valid: true, reason: "VALID" });
  });

  it("rejects a valid credential whose pass is revoked, expired or corrupt", () => {
    const pair = newCredentialPair(PASS_ID);
    const parsed = parseQrPayload(pair.qrPayload)!;
    const credentialOk = verifyCredentialHash(parsed.passPublicId, parsed.secret, pair.credentialHash);
    expect(credentialOk).toBe(true);

    expect(verifyPassStatus({ status: "REVOKED" }).valid).toBe(false);
    expect(verifyPassStatus({ status: "EXPIRED" }).valid).toBe(false);
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "2020-01-01T00:00:00.000Z" }).valid).toBe(false);
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "invalid" })).toEqual({
      valid: false,
      reason: "INVALID_EXPIRY",
    });
  });

  it("rejects malformed payloads before any credential comparison", () => {
    expect(parseQrPayload(`PRISM1:${PASS_ID}:${"a".repeat(63)}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${"a".repeat(65)}:${"a".repeat(64)}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}:${"a".repeat(64)} `)).toBeNull();
  });
});
