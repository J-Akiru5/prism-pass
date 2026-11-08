import { describe, expect, it } from "vitest";
import {
  LAST_ADMIN_SUSPEND_RULE,
  PLATFORM_PAGE_SIZE_MAX,
  buildPageMeta,
  decideOrgStatusChange,
  platformOrgsQuery,
  setOrgStatusInput,
  shapePlatformOrgRow,
  statusTone,
} from "../modules/platform/ledger";

// P8 platform console — pure contract tests (no database, no session, no Next).
describe("platform ledger query validation", () => {
  it("defaults to page 1 / 20 and applies no filters", () => {
    const parsed = platformOrgsQuery.parse({});
    expect(parsed).toEqual({ page: 1, pageSize: 20, status: undefined, q: undefined });
  });

  it("accepts the full page-size range up to 100", () => {
    expect(platformOrgsQuery.parse({ pageSize: String(PLATFORM_PAGE_SIZE_MAX) }).pageSize).toBe(100);
    expect(platformOrgsQuery.parse({ page: "3", pageSize: "50" })).toMatchObject({ page: 3, pageSize: 50 });
  });

  it("rejects out-of-range pagination instead of clamping", () => {
    expect(() => platformOrgsQuery.parse({ page: "0" })).toThrow();
    expect(() => platformOrgsQuery.parse({ page: "-1" })).toThrow();
    expect(() => platformOrgsQuery.parse({ pageSize: "0" })).toThrow();
    expect(() => platformOrgsQuery.parse({ pageSize: "101" })).toThrow();
    expect(() => platformOrgsQuery.parse({ page: "1.5" })).toThrow();
    expect(() => platformOrgsQuery.parse({ page: "abc" })).toThrow();
  });

  it("accepts only known statuses", () => {
    expect(platformOrgsQuery.parse({ status: "SUSPENDED" }).status).toBe("SUSPENDED");
    expect(platformOrgsQuery.parse({ status: "PENDING_DELETION" }).status).toBe("PENDING_DELETION");
    expect(() => platformOrgsQuery.parse({ status: "DELETED" })).toThrow();
  });

  it("normalizes an empty or whitespace search to undefined and bounds its length", () => {
    expect(platformOrgsQuery.parse({ q: "" }).q).toBeUndefined();
    expect(platformOrgsQuery.parse({ q: "   " }).q).toBeUndefined();
    expect(platformOrgsQuery.parse({ q: "  acme  " }).q).toBe("acme");
    expect(() => platformOrgsQuery.parse({ q: "x".repeat(65) })).toThrow();
  });
});

describe("organization status input", () => {
  it("allows only ACTIVE and SUSPENDED writes", () => {
    expect(setOrgStatusInput.parse({ status: "SUSPENDED" }).status).toBe("SUSPENDED");
    expect(setOrgStatusInput.parse({ status: "ACTIVE" }).status).toBe("ACTIVE");
    expect(() => setOrgStatusInput.parse({ status: "PENDING_DELETION" })).toThrow();
    expect(() => setOrgStatusInput.parse({ status: "DELETED" })).toThrow();
  });

  it("keeps an optional reason bounded", () => {
    expect(setOrgStatusInput.parse({ status: "SUSPENDED", reason: "non-payment" }).reason).toBe("non-payment");
    expect(() => setOrgStatusInput.parse({ status: "SUSPENDED", reason: "x" })).toThrow();
    expect(() => setOrgStatusInput.parse({ status: "SUSPENDED", reason: "x".repeat(281) })).toThrow();
  });
});

describe("pagination meta", () => {
  it("reports an empty ledger without phantom pages", () => {
    expect(buildPageMeta({ page: 1, pageSize: 20, total: 0 })).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasNext: false,
      hasPrevious: false,
    });
  });

  it("computes middle, last and first pages", () => {
    const middle = buildPageMeta({ page: 2, pageSize: 20, total: 45 });
    expect(middle).toMatchObject({ totalPages: 3, hasNext: true, hasPrevious: true });
    const last = buildPageMeta({ page: 3, pageSize: 20, total: 45 });
    expect(last).toMatchObject({ totalPages: 3, hasNext: false, hasPrevious: true });
    const first = buildPageMeta({ page: 1, pageSize: 20, total: 45 });
    expect(first).toMatchObject({ totalPages: 3, hasNext: true, hasPrevious: false });
  });

  it("isolates a bad total or page size from the envelope", () => {
    expect(buildPageMeta({ page: 1, pageSize: 20, total: -5 })).toMatchObject({ total: 0, totalPages: 0 });
    expect(buildPageMeta({ page: 0, pageSize: 0, total: 10 })).toMatchObject({ page: 1, pageSize: 20, totalPages: 1 });
  });
});

describe("ledger row shaping (aggregate only)", () => {
  const createdAt = new Date("2026-01-02T03:04:05.000Z");
  const lastActivity = new Date("2026-02-03T04:05:06.000Z");

  it("shapes counts, status and ISO timestamps", () => {
    const row = shapePlatformOrgRow({
      id: "org_1",
      name: "Acme",
      slug: "acme",
      status: "SUSPENDED",
      createdAt,
      _count: { memberships: 12, passes: 34 },
      auditLogs: [{ createdAt: lastActivity }],
    });
    expect(row).toEqual({
      id: "org_1",
      name: "Acme",
      slug: "acme",
      status: "SUSPENDED",
      memberCount: 12,
      passCount: 34,
      createdAt: createdAt.toISOString(),
      lastActivityAt: lastActivity.toISOString(),
    });
  });

  it("is null-safe when counts or activity are absent", () => {
    const row = shapePlatformOrgRow({
      id: "org_2",
      name: "Empty",
      slug: "empty",
      status: "ACTIVE",
      createdAt,
      _count: null,
      auditLogs: null,
    });
    expect(row).toMatchObject({ memberCount: 0, passCount: 0, lastActivityAt: null });
  });

  it("never emits negative, fractional or NaN counts", () => {
    const row = shapePlatformOrgRow({
      id: "org_3",
      name: "Bad counts",
      slug: "bad",
      status: "ACTIVE",
      createdAt,
      _count: { memberships: -4, passes: Number.NaN },
    });
    expect(row.memberCount).toBe(0);
    expect(row.passCount).toBe(0);
  });

  it("drops identities and tenant rows even when the source carries them", () => {
    const source = {
      id: "org_4",
      name: "Leaky",
      slug: "leaky",
      status: "ACTIVE" as const,
      createdAt,
      email: "owner@example.com",
      credentialHash: "deadbeef",
      members: [{ id: "m1", email: "member@example.com" }],
      _count: { memberships: 1, passes: 1 },
    };
    const row = shapePlatformOrgRow(source);
    expect(Object.keys(row).sort()).toEqual(
      ["createdAt", "id", "lastActivityAt", "memberCount", "name", "passCount", "slug", "status"].sort(),
    );
    expect(JSON.stringify(row)).not.toContain("owner@example.com");
    expect(JSON.stringify(row)).not.toContain("member@example.com");
    expect(row).not.toHaveProperty("credentialHash");
    expect(row).not.toHaveProperty("members");
  });

  it("treats an invalid date as absent rather than crashing", () => {
    const row = shapePlatformOrgRow({
      id: "org_5",
      name: "Bad date",
      slug: "bad-date",
      status: "ACTIVE",
      createdAt: "not-a-date",
      auditLogs: [{ createdAt: "also-not-a-date" }],
    });
    expect(row.createdAt).toBe("");
    expect(row.lastActivityAt).toBeNull();
  });
});

describe("suspend / reactivate policy", () => {
  it("suspends when another platform admin can reverse it", () => {
    const decision = decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "SUSPENDED", otherActivePlatformAdmins: 1 });
    expect(decision).toMatchObject({ allowed: true, changed: true, action: "org.suspend" });
  });

  it("refuses suspension when the caller is the only platform admin", () => {
    const decision = decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "SUSPENDED", otherActivePlatformAdmins: 0 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.code).toBe("LAST_PLATFORM_ADMIN");
      expect(decision.message).toBe(LAST_ADMIN_SUSPEND_RULE);
    }
  });

  it("treats a negative or NaN admin count as zero", () => {
    expect(decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "SUSPENDED", otherActivePlatformAdmins: -1 }).allowed).toBe(false);
    expect(decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "SUSPENDED", otherActivePlatformAdmins: Number.NaN }).allowed).toBe(false);
  });

  it("never gates reactivation — there is always a way back", () => {
    for (const currentStatus of ["SUSPENDED", "PENDING_DELETION"] as const) {
      const decision = decideOrgStatusChange({ currentStatus, nextStatus: "ACTIVE", otherActivePlatformAdmins: 0 });
      expect(decision).toMatchObject({ allowed: true, changed: true, action: "org.reactivate" });
    }
  });

  it("treats repeated transitions as no-ops without an audit action", () => {
    expect(decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "ACTIVE", otherActivePlatformAdmins: 0 })).toMatchObject({
      allowed: true,
      changed: false,
      action: null,
    });
    expect(decideOrgStatusChange({ currentStatus: "SUSPENDED", nextStatus: "SUSPENDED", otherActivePlatformAdmins: 3 })).toMatchObject({
      allowed: true,
      changed: false,
      action: null,
    });
  });

  it("refuses suspending a tenant that is pending deletion", () => {
    const decision = decideOrgStatusChange({ currentStatus: "PENDING_DELETION", nextStatus: "SUSPENDED", otherActivePlatformAdmins: 5 });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("INVALID_TRANSITION");
  });

  it("does not require an org OWNER — platform authority is separate (ADR-11)", () => {
    // The rule only reads platform-admin supply; no membership/OWNER input exists.
    const decision = decideOrgStatusChange({ currentStatus: "ACTIVE", nextStatus: "SUSPENDED", otherActivePlatformAdmins: 1 });
    expect(decision.allowed).toBe(true);
  });
});

describe("status tone mapping", () => {
  it("maps every known status to a badge tone", () => {
    expect(statusTone("ACTIVE")).toBe("success");
    expect(statusTone("SUSPENDED")).toBe("danger");
    expect(statusTone("PENDING_DELETION")).toBe("warning");
  });
});
