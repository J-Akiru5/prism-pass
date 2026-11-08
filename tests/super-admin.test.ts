import { describe, expect, it } from "vitest";
import {
  ADMIN_REASON_MIN,
  AUDIT_CSV_HEADER,
  AUDIT_EXPORT_MAX_ROWS,
  LAST_PLATFORM_ADMIN_RULE,
  PLATFORM_PLANS,
  auditRowsToCsv,
  decideAdminGrant,
  decideAdminRevoke,
  decidePlanUpdate,
  mergeEntitlements,
  parsePlatformAuditQuery,
  planUpdateInput,
  readEntitlements,
  revokePlatformAdminInput,
  shapeOrganizationCounts,
  shapeOrganizationMemberRow,
  shapePlatformAdminRow,
  shapePlatformAuditRow,
  shapePlatformOverview,
  suggestOrgSlug,
} from "../modules/platform/console";

// Super admin console — pure contract tests (no database, no session, no Next).
describe("plan validation", () => {
  it("accepts every allowed plan and rejects unknown or legacy values", () => {
    for (const plan of PLATFORM_PLANS) {
      expect(planUpdateInput.parse({ plan }).plan).toBe(plan);
    }
    expect(() => planUpdateInput.parse({ plan: "free" })).toThrow();
    expect(() => planUpdateInput.parse({ plan: "PILOT" })).toThrow();
  });

  it("rejects unknown entitlement keys instead of writing them", () => {
    const parsed = planUpdateInput.parse({ plan: "standard", entitlements: { passes: false } });
    expect(parsed.entitlements).toEqual({ passes: false });
    expect(() => planUpdateInput.parse({ plan: "standard", entitlements: { everything: true } })).toThrow();
    expect(() => planUpdateInput.parse({ plan: "standard", entitlements: { passes: "yes" } })).toThrow();
  });

  it("requires a bounded reason when one is supplied", () => {
    expect(planUpdateInput.parse({ plan: "pilot", reason: "renewal" }).reason).toBe("renewal");
    expect(() => planUpdateInput.parse({ plan: "pilot", reason: "x" })).toThrow();
    expect(() => planUpdateInput.parse({ plan: "pilot", reason: "x".repeat(281) })).toThrow();
  });

  it("rejects extra top-level fields", () => {
    expect(() => planUpdateInput.parse({ plan: "pilot", organizationId: "org_2" })).toThrow();
  });
});

describe("entitlement shaping", () => {
  it("falls back to plan defaults for missing or non-boolean keys", () => {
    const pilot = readEntitlements("pilot", { documents: "true", unknown: true });
    expect(pilot.documents).toBe(false);
    expect(pilot.passes).toBe(true);
    expect(pilot).not.toHaveProperty("unknown");
  });

  it("keeps unknown stored keys on write but only applies approved boolean edits", () => {
    const merged = mergeEntitlements({ passes: true, experimental: true, documents: "no" }, { documents: true });
    expect(merged).toEqual({ passes: true, experimental: true, documents: true });
    expect(mergeEntitlements(null, { offline: true })).toEqual({ offline: true });
    expect(mergeEntitlements([1, 2], { offline: true })).toEqual({ offline: true });
  });

  it("treats an unchanged plan edit as a no-op without an audit action", () => {
    const decision = decidePlanUpdate({
      currentPlan: "pilot",
      currentEntitlements: { passes: true, attendance: true, geofence: true, documents: false },
      nextPlan: "pilot",
      nextEntitlements: { passes: true },
    });
    expect(decision.changed).toBe(false);
  });

  it("detects a real plan or entitlement change", () => {
    expect(
      decidePlanUpdate({ currentPlan: "pilot", currentEntitlements: {}, nextPlan: "standard", nextEntitlements: {} })
        .changed,
    ).toBe(true);
    expect(
      decidePlanUpdate({
        currentPlan: "pilot",
        currentEntitlements: {},
        nextPlan: "pilot",
        nextEntitlements: { documents: true },
      }).changed,
    ).toBe(true);
  });
});

describe("organization creation helpers", () => {
  it("suggests a safe slug from a display name", () => {
    expect(suggestOrgSlug("San Pablo Fish Farmers Coop")).toBe("san-pablo-fish-farmers-coop");
    expect(suggestOrgSlug("  Ácme & Sons  ")).toBe("acme-sons");
    expect(suggestOrgSlug("!!!")).toBe("org");
    expect(suggestOrgSlug("a".repeat(90))).toHaveLength(64);
  });
});

describe("platform admin policy", () => {
  it("refuses a grant for a missing user or an existing admin", () => {
    expect(decideAdminGrant({ userExists: false, alreadyAdmin: false })).toMatchObject({
      allowed: false,
      code: "USER_NOT_FOUND",
    });
    expect(decideAdminGrant({ userExists: true, alreadyAdmin: true })).toMatchObject({
      allowed: false,
      code: "ALREADY_PLATFORM_ADMIN",
    });
    expect(decideAdminGrant({ userExists: true, alreadyAdmin: false })).toEqual({ allowed: true });
  });

  it("refuses revoking a missing grant or your own grant", () => {
    expect(
      decideAdminRevoke({ targetHasGrant: false, targetIsSelf: false, activePlatformAdmins: 4 }),
    ).toMatchObject({ allowed: false, code: "NO_GRANT" });
    expect(
      decideAdminRevoke({ targetHasGrant: true, targetIsSelf: true, activePlatformAdmins: 4 }),
    ).toMatchObject({ allowed: false, code: "CANNOT_REVOKE_SELF" });
  });

  it("refuses to revoke the last platform admin, tolerating a bad count", () => {
    const decision = decideAdminRevoke({ targetHasGrant: true, targetIsSelf: false, activePlatformAdmins: 1 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("LAST_PLATFORM_ADMIN");
      expect(decision.message).toBe(LAST_PLATFORM_ADMIN_RULE);
    }
    expect(decideAdminRevoke({ targetHasGrant: true, targetIsSelf: false, activePlatformAdmins: 0 }).allowed).toBe(false);
    expect(decideAdminRevoke({ targetHasGrant: true, targetIsSelf: false, activePlatformAdmins: 2 }).allowed).toBe(true);
  });

  it("requires a substantive revoke reason and shapes admin rows without secrets", () => {
    expect(() => revokePlatformAdminInput.parse({ reason: "x".repeat(ADMIN_REASON_MIN - 1) })).toThrow();
    const row = shapePlatformAdminRow(
      { userId: "u1", createdAt: new Date("2026-01-01T00:00:00.000Z"), user: { email: "ops@example.com" } },
      "u2",
    );
    expect(row).toEqual({
      userId: "u1",
      email: "ops@example.com",
      grantedAt: "2026-01-01T00:00:00.000Z",
      isSelf: false,
    });
    expect(shapePlatformAdminRow({ userId: "u2" }, "u2").isSelf).toBe(true);
  });
});

describe("audit filter parsing", () => {
  it("defaults to page 1 / 25 and json", () => {
    const parsed = parsePlatformAuditQuery(new URLSearchParams());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.query).toMatchObject({ page: 1, pageSize: 25, format: "json" });
  });

  it("rejects out-of-range pagination and unsupported formats", () => {
    expect(parsePlatformAuditQuery(new URLSearchParams({ page: "0" })).ok).toBe(false);
    expect(parsePlatformAuditQuery(new URLSearchParams({ pageSize: "101" })).ok).toBe(false);
    expect(parsePlatformAuditQuery(new URLSearchParams({ format: "xlsx" })).ok).toBe(false);
  });

  it("requires both dates and honours the 366-day cap", () => {
    expect(parsePlatformAuditQuery(new URLSearchParams({ from: "2026-01-01" })).ok).toBe(false);
    expect(
      parsePlatformAuditQuery(new URLSearchParams({ from: "2026-01-01", to: "2026-01-03" })).ok,
    ).toBe(true);
    expect(
      parsePlatformAuditQuery(new URLSearchParams({ from: "2024-01-01", to: "2026-01-01" })).ok,
    ).toBe(false);
  });

  it("builds an inclusive UTC window for a valid range", () => {
    const parsed = parsePlatformAuditQuery(new URLSearchParams({ from: "2026-02-01", to: "2026-02-02" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.createdAt?.gte.toISOString()).toBe("2026-02-01T00:00:00.000Z");
      expect(parsed.createdAt?.lte.toISOString()).toBe("2026-02-02T23:59:59.999Z");
    }
  });
});

describe("audit row shaping and export", () => {
  it("surfaces a platform reason but never forwards tenant meta", () => {
    const tenant = shapePlatformAuditRow({
      id: "a1",
      action: "attendance.scan",
      resource: "event:e1",
      result: "accepted",
      meta: { personId: "p1", reason: "private note", scope: "tenant" },
      createdAt: "2026-02-01T00:00:00.000Z",
      organization: { name: "Acme" },
    });
    expect(tenant.reason).toBeNull();
    expect(JSON.stringify(tenant)).not.toContain("p1");
    expect(JSON.stringify(tenant)).not.toContain("private note");

    const platform = shapePlatformAuditRow({
      id: "a2",
      action: "org.suspend",
      resource: "org:o1",
      result: "ok",
      meta: { scope: "platform", reason: "non-payment" },
    });
    expect(platform.reason).toBe("non-payment");
    expect(platform.organizationName).toBeNull();
  });

  it("serializes CSV with the formula guard and a stable header", () => {
    const csv = auditRowsToCsv([
      {
        id: "a3",
        organizationId: null,
        organizationName: null,
        actorUserId: null,
        action: "platform.admin.grant",
        resource: "=HYPERLINK(1)",
        result: "ok",
        createdAt: null,
        reason: "ops",
      },
    ]);
    expect(csv.startsWith(AUDIT_CSV_HEADER.join(","))).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(AUDIT_EXPORT_MAX_ROWS).toBeGreaterThan(0);
  });
});

describe("overview and organization detail shaping", () => {
  it("collapses negative, fractional and NaN counts to integers", () => {
    const counts = shapePlatformOverview({
      organizationsTotal: 4.9,
      organizationsActive: 3,
      organizationsSuspended: -1,
      users: Number.NaN,
      activePasses: 7,
    });
    expect(counts.organizations).toEqual({ total: 4, active: 3, suspended: 0, pendingDeletion: 0 });
    expect(counts.users).toBe(0);
    expect(counts.activePasses).toBe(7);
  });

  it("shapes read-only members with role and status but nothing else", () => {
    const member = shapeOrganizationMemberRow({
      id: "m1",
      role: "ADMIN",
      status: "ACTIVE",
      user: { email: "admin@example.com" },
      credentialHash: "deadbeef",
    } as never);
    expect(member).toEqual({ id: "m1", email: "admin@example.com", role: "ADMIN", status: "ACTIVE", revokedAt: null });
    expect(member).not.toHaveProperty("credentialHash");
  });

  it("normalizes organization counts", () => {
    expect(shapeOrganizationCounts({ members: 3.2, activePasses: -2, documents: 1 })).toEqual({
      members: 3,
      activePasses: 0,
      sessions: 0,
      events: 0,
      records: 0,
      documents: 1,
    });
  });
});
