import { describe, expect, it } from "vitest";
import { verifyPassStatus, parseQrPayload } from "../modules/passes/verify";
describe("passes verify-only", () => {
  it("revoked rejected", () => { expect(verifyPassStatus({ status: "REVOKED" }).valid).toBe(false); });
  it("expired rejected", () => { expect(verifyPassStatus({ status: "ACTIVE", expiresAt: new Date("2020-01-01") }).reason).toBe("EXPIRED"); });
  it("parses PRISM1 payload", () => { expect(parseQrPayload(`PRISM1:ABC:${"a".repeat(64)}`)?.passPublicId).toBe("ABC"); expect(parseQrPayload("junk")).toBeNull(); });
});
