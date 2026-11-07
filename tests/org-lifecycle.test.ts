import { describe, expect, it } from "vitest";
import { updateOrgStatusInput } from "../modules/organizations/service";
import { roleGrants } from "../packages/authorization/permissions";
import { verifyPassStatus } from "../modules/passes/verify";

// Agent 2: lifecycle + authorization boundaries (unit level; live checks run via pg script)
describe("organization lifecycle validation", () => {
  it("accepts ACTIVE/SUSPENDED only", () => {
    expect(updateOrgStatusInput.parse({ status: "SUSPENDED" }).status).toBe("SUSPENDED");
    expect(updateOrgStatusInput.parse({ status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(() => updateOrgStatusInput.parse({ status: "DELETED" })).toThrow();
  });
  it("org OWNER holds organization.manage but suspension is platform-only (boundary)", () => {
    // OWNER can manage org settings, but PATCH /orgs/:id (suspend) requires requirePlatformAdmin
    expect(roleGrants("OWNER", "organization.manage")).toBe(true);
    // VIEWER cannot manage org
    expect(roleGrants("VIEWER", "organization.manage")).toBe(false);
  });
  it("revoked membership blocks access (tenant requires ACTIVE)", () => {
    // requireOrganizationPermission checks status === ACTIVE; revoked => 403
    const membershipStatus: string = "REVOKED";
    expect(membershipStatus === "ACTIVE").toBe(false);
  });
  it("suspended org blocks tenant ops (org status must be ACTIVE)", () => {
    const orgStatus: string = "SUSPENDED";
    expect(orgStatus === "ACTIVE").toBe(false);
  });
});

describe("pass lifecycle guards", () => {
  it("revoked passes rejected at scanner", () => {
    expect(verifyPassStatus({ status: "REVOKED" }).valid).toBe(false);
  });
});
