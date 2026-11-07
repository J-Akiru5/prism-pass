import { describe, expect, it } from "vitest";
import { roleGrants } from "../packages/authorization/permissions";
describe("permission matrix (Phase 0)", () => {
  it("scanner can scan but not override", () => {
    expect(roleGrants("SCANNER", "attendance.scan")).toBe(true);
    expect(roleGrants("SCANNER", "attendance.override")).toBe(false);
  });
  it("viewer has no scan", () => expect(roleGrants("VIEWER", "attendance.scan")).toBe(false));
  it("owner has all", () => expect(roleGrants("OWNER", "organization.manage")).toBe(true));
});
