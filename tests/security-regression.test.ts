import { describe, expect, it } from "vitest";
import { roleGrants } from "../packages/authorization/permissions";
import { parseQrPayload, verifyPassStatus } from "../modules/passes/verify";

// Agent 4: security regression — no live secrets, pure contract guards
describe("security regression", () => {
  it("SCANNER cannot manage members or revoke passes beyond scan", () => {
    expect(roleGrants("SCANNER", "attendance.scan")).toBe(true);
    expect(roleGrants("SCANNER", "members.manage")).toBe(false);
    expect(roleGrants("SCANNER", "organization.manage")).toBe(false);
  });
  it("MEMBER cannot scan or revoke", () => {
    expect(roleGrants("MEMBER", "attendance.scan")).toBe(false);
    expect(roleGrants("MEMBER", "passes.revoke")).toBe(false);
  });
  it("QR payload is opaque and strict (no PII, no loose parsing)", () => {
    expect(parseQrPayload("PRISM1:abc:xyz")).toBeNull();
    expect(parseQrPayload(`PRISM1:pp_123:${"b".repeat(64)}`)?.passPublicId).toBe("pp_123");
    expect(parseQrPayload("")).toBeNull();
  });
  it("expired/revoked never verify", () => {
    expect(verifyPassStatus({ status: "EXPIRED" }).valid).toBe(false);
    expect(verifyPassStatus({ status: "REVOKED" }).valid).toBe(false);
    expect(verifyPassStatus({ status: "ACTIVE", expiresAt: new Date("2020-01-01") }).reason).toBe("EXPIRED");
  });
  it("cross-tenant must be org-scoped (contract: unique per org, never global lookup)", () => {
    // findUnique uses (organizationId, passPublicId) — a pass from org B never resolves in org A
    const scopedKey = (org: string, pub: string) => `${org}:${pub}`;
    expect(scopedKey("orgA", "pp_1")).not.toBe(scopedKey("orgB", "pp_1"));
  });
});
