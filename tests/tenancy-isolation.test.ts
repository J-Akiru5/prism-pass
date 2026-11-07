import { describe, expect, it } from "vitest";
// Pure tenant-scoping contract: every tenant row carries organizationId; cross-org joins forbidden.
// Simulates the DB rule without requiring live Supabase.
type Row = { id: string; organizationId: string };
function scopeByOrg<T extends Row>(rows: T[], org: string): T[] { return rows.filter((r) => r.organizationId === org); }
describe("tenant isolation contract", () => {
  const rows = [{ id: "p1", organizationId: "orgA" }, { id: "p2", organizationId: "orgB" }];
  it("org A cannot see org B", () => {
    expect(scopeByOrg(rows, "orgA").map((r) => r.id)).toEqual(["p1"]);
    expect(scopeByOrg(rows, "orgB").map((r) => r.id)).toEqual(["p2"]);
  });
  it("missing org fails closed", () => { expect(scopeByOrg(rows, "")).toEqual([]); });
});
