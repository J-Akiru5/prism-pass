import { describe, expect, it } from "vitest";
import {
  MAX_QR_PAYLOAD_LENGTH,
  parseQrPayload,
  passStatusHttpStatus,
  verifyPassStatus,
} from "../modules/passes/verify";

const SECRET = "a".repeat(64);
const PASS_ID = "pp_0123456789abcdef";
const payload = (id = PASS_ID, secret = SECRET) => `PRISM1:${id}:${secret}`;

describe("passes verify-only: status and expiry", () => {
  it("accepts an active pass with no expiry", () => {
    expect(verifyPassStatus({ status: "ACTIVE" })).toEqual({ valid: true, reason: "VALID" });
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: null })).toEqual({ valid: true, reason: "VALID" });
  });

  it("accepts an active pass with a future expiry", () => {
    const now = new Date("2026-11-09T08:00:00.000Z");
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "2026-11-10T08:00:00.000Z" }, now)).toEqual({
      valid: true,
      reason: "VALID",
    });
  });

  it("rejects revoked and status-expired passes", () => {
    expect(verifyPassStatus({ status: "REVOKED" })).toEqual({ valid: false, reason: "REVOKED" });
    expect(verifyPassStatus({ status: "EXPIRED" })).toEqual({ valid: false, reason: "EXPIRED" });
  });

  it("rejects a past expiresAt", () => {
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "2020-01-01T00:00:00.000Z" }).reason).toBe("EXPIRED");
  });

  it("fails closed on an unparseable expiresAt instead of accepting it", () => {
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "not-a-date" })).toEqual({
      valid: false,
      reason: "INVALID_EXPIRY",
    });
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "2026-13-45T99:99:99Z" }).reason).toBe("INVALID_EXPIRY");
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: new Date("nonsense") }).reason).toBe("INVALID_EXPIRY");
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: "" }).reason).toBe("INVALID_EXPIRY");
  });

  it("rejects an unknown status", () => {
    expect(verifyPassStatus({ status: "PENDING" })).toEqual({ valid: false, reason: "INVALID_STATUS" });
  });

  it("gives revoked/expired status precedence over corrupt expiry data", () => {
    expect(verifyPassStatus({ status: "REVOKED", expiresAt: "not-a-date" }).reason).toBe("REVOKED");
    expect(verifyPassStatus({ status: "EXPIRED", expiresAt: "not-a-date" }).reason).toBe("EXPIRED");
  });

  it("keeps the established HTTP mapping: revoked 403, all other failures 410", () => {
    expect(passStatusHttpStatus("REVOKED")).toBe(403);
    expect(passStatusHttpStatus("EXPIRED")).toBe(410);
    expect(passStatusHttpStatus("INVALID_STATUS")).toBe(410);
    expect(passStatusHttpStatus("INVALID_EXPIRY")).toBe(410);
  });
});

describe("passes verify-only: QR parsing", () => {
  it("parses issued and seeded pass id shapes", () => {
    expect(parseQrPayload(payload())).toEqual({ passPublicId: PASS_ID, secret: SECRET });
    expect(parseQrPayload(payload("pp_demo_admin"))?.passPublicId).toBe("pp_demo_admin");
    expect(parseQrPayload(payload("pass_with-hyphen_123"))?.passPublicId).toBe("pass_with-hyphen_123");
  });

  it("accepts uppercase hex in the prefix and secret without changing the secret", () => {
    const upper = parseQrPayload(`prism1:${PASS_ID}:${"A".repeat(64)}`);
    expect(upper).toEqual({ passPublicId: PASS_ID, secret: "A".repeat(64) });
  });

  it("accepts a 64-character pass id at the boundary", () => {
    const id = "a".repeat(64);
    const qr = payload(id);
    expect(qr.length).toBe(MAX_QR_PAYLOAD_LENGTH);
    expect(parseQrPayload(qr)?.passPublicId).toBe(id);
  });

  it("rejects an oversized pass id", () => {
    expect(parseQrPayload(payload("a".repeat(65)))).toBeNull();
  });

  it("rejects an oversized payload before parsing", () => {
    expect(parseQrPayload(payload(PASS_ID, SECRET) + "x".repeat(MAX_QR_PAYLOAD_LENGTH))).toBeNull();
    expect(parseQrPayload("PRISM1:" + "a".repeat(10_000) + ":" + SECRET)).toBeNull();
  });

  it("rejects malformed prefixes and separators", () => {
    expect(parseQrPayload("")).toBeNull();
    expect(parseQrPayload(`PRISM2:${PASS_ID}:${SECRET}`)).toBeNull();
    expect(parseQrPayload(`PRISM1${PASS_ID}:${SECRET}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}${SECRET}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}:`)).toBeNull();
    expect(parseQrPayload(`PRISM1::${SECRET}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}:${SECRET}:extra`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}:${SECRET}x`)).toBeNull();
  });

  it("rejects whitespace anywhere instead of trimming it", () => {
    expect(parseQrPayload(` ${payload()}`)).toBeNull();
    expect(parseQrPayload(`${payload()} `)).toBeNull();
    expect(parseQrPayload(`${payload()}\n`)).toBeNull();
    expect(parseQrPayload(`${payload()}\t`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID} :${SECRET}`)).toBeNull();
    expect(parseQrPayload(`PRISM1:${PASS_ID}:${SECRET.slice(0, 32)} ${SECRET.slice(32)}`)).toBeNull();
  });

  it("rejects malformed secrets", () => {
    expect(parseQrPayload(payload(PASS_ID, "a".repeat(63)))).toBeNull();
    expect(parseQrPayload(payload(PASS_ID, "a".repeat(65)))).toBeNull();
    expect(parseQrPayload(payload(PASS_ID, "g".repeat(64)))).toBeNull();
    expect(parseQrPayload(payload(PASS_ID, "PENDING-PROVISIONING"))).toBeNull();
  });

  it("rejects non-string runtime input", () => {
    expect(parseQrPayload(null as never)).toBeNull();
    expect(parseQrPayload(undefined as never)).toBeNull();
    expect(parseQrPayload(123 as never)).toBeNull();
  });
});
