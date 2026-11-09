import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_DEFAULTS, roleGrants, type Role } from "../packages/authorization/permissions";
import {
  ROLE_PRESET_ORDER,
  ROLE_PRESETS,
  decideMembershipRoleChange,
  defaultRoleForPreset,
  presetForRole,
  presetLabel,
  rolesForPreset,
  type RoleChangeInput,
  type RolePreset,
} from "../packages/authorization/presets";

const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SCANNER", "MEMBER", "VIEWER"];

describe("role presets", () => {
  it("covers all seven raw roles exactly once", () => {
    const assigned = ROLE_PRESET_ORDER.flatMap((preset) => [...rolesForPreset(preset)]);
    expect(assigned).toHaveLength(7);
    expect([...assigned].sort()).toEqual([...ALL_ROLES].sort());
    expect(new Set(assigned).size).toBe(7);
  });

  it("maps every role to the documented preset", () => {
    expect(presetForRole("OWNER")).toBe("OWNER");
    expect(presetForRole("ADMIN")).toBe("ADMIN");
    expect(presetForRole("MANAGER")).toBe("STAFF");
    expect(presetForRole("SUPERVISOR")).toBe("STAFF");
    expect(presetForRole("SCANNER")).toBe("STAFF");
    expect(presetForRole("VIEWER")).toBe("STAFF");
    expect(presetForRole("MEMBER")).toBe("ATTENDEE");
  });

  it("keeps the staff sub-roles in one ordered list", () => {
    expect(rolesForPreset("STAFF")).toEqual(["MANAGER", "SUPERVISOR", "SCANNER", "VIEWER"]);
    expect(rolesForPreset("OWNER")).toEqual(["OWNER"]);
    expect(rolesForPreset("ADMIN")).toEqual(["ADMIN"]);
    expect(rolesForPreset("ATTENDEE")).toEqual(["MEMBER"]);
  });

  it("has a valid default role inside every preset", () => {
    for (const preset of ROLE_PRESET_ORDER) {
      const role = defaultRoleForPreset(preset);
      expect(rolesForPreset(preset)).toContain(role);
      expect(presetForRole(role)).toBe(preset);
    }
    expect(defaultRoleForPreset("STAFF")).toBe("SUPERVISOR");
  });

  it("keeps labels stable for the UI", () => {
    const labels = Object.fromEntries(ROLE_PRESET_ORDER.map((preset) => [preset, presetLabel(preset)]));
    expect(labels).toEqual({ OWNER: "Owner", ADMIN: "Admin", STAFF: "Staff", ATTENDEE: "Attendee" });
  });

  it("exposes the same table it documents", () => {
    expect(ROLE_PRESETS.OWNER.roles).toEqual(["OWNER"]);
    expect(ROLE_PRESETS.ADMIN.roles).toEqual(["ADMIN"]);
    expect(ROLE_PRESETS.STAFF.roles).toEqual(["MANAGER", "SUPERVISOR", "SCANNER", "VIEWER"]);
    expect(ROLE_PRESETS.ATTENDEE.roles).toEqual(["MEMBER"]);
  });

  it("fails closed on a role outside the table", () => {
    expect(() => presetForRole("UNKNOWN" as Role)).toThrow(/not assigned to a preset/);
    expect(() => presetLabel("UNKNOWN" as RolePreset)).toThrow();
  });
});

describe("ROLE_DEFAULTS stays the authorization source of truth", () => {
  it("is unchanged by the preset layer", () => {
    // Touch every preset helper first; the table must not mutate the raw matrix.
    for (const preset of ROLE_PRESET_ORDER) {
      for (const role of rolesForPreset(preset)) presetForRole(role);
      defaultRoleForPreset(preset);
      presetLabel(preset);
    }

    expect(ROLE_DEFAULTS).toEqual({
      OWNER: [...PERMISSIONS],
      ADMIN: [...PERMISSIONS],
      MANAGER: [
        "members.manage",
        "passes.revoke",
        "attendance.scan",
        "attendance.override",
        "attendance.approve",
        "documents.manage",
        "documents.sign",
        "reports.export",
        "geofences.manage",
        "devices.manage",
      ],
      SUPERVISOR: [
        "attendance.scan",
        "attendance.override",
        "attendance.approve",
        "documents.sign",
        "reports.export",
      ],
      SCANNER: ["attendance.scan"],
      MEMBER: ["documents.sign"],
      VIEWER: [],
    });
    expect(Object.keys(ROLE_DEFAULTS).sort()).toEqual([...ALL_ROLES].sort());
    expect(roleGrants("VIEWER", "attendance.scan")).toBe(false);
  });
});

describe("membership role-change guard decisions", () => {
  const base: RoleChangeInput = {
    actorMembershipId: "m-owner",
    actorRole: "OWNER",
    organizationId: "org-1",
    target: { id: "m-target", organizationId: "org-1", role: "SUPERVISOR", status: "ACTIVE" },
    nextRole: "MANAGER",
    activeOwnerCount: 2,
  };

  function denied(input: RoleChangeInput) {
    const decision = decideMembershipRoleChange(input);
    if (decision.allowed) throw new Error("expected the role change to be denied");
    return decision;
  }

  it("allows an owner to change a staff role", () => {
    expect(decideMembershipRoleChange(base)).toEqual({ allowed: true, changed: true });
  });

  it("treats a same-role request as a no-op", () => {
    expect(
      decideMembershipRoleChange({ ...base, target: { ...base.target, role: "MANAGER" } }),
    ).toEqual({ allowed: true, changed: false });
  });

  it("does not let anyone change their own role", () => {
    const decision = denied({
      ...base,
      actorMembershipId: "m-target",
      target: { ...base.target, role: "SUPERVISOR" },
      nextRole: "SCANNER",
    });
    expect(decision.reason).toBe("self_role_change");
    expect(decision.status).toBe(409);
    expect(decision.code).toBe("CONFLICT");
  });

  it("allows a same-role self request because nothing changes", () => {
    expect(
      decideMembershipRoleChange({
        ...base,
        actorMembershipId: "m-target",
        target: { ...base.target, role: "OWNER" },
        nextRole: "OWNER",
        activeOwnerCount: 1,
      }),
    ).toEqual({ allowed: true, changed: false });
  });

  it("blocks demoting the last active owner", () => {
    const decision = denied({
      ...base,
      target: { ...base.target, role: "OWNER" },
      nextRole: "MEMBER",
      activeOwnerCount: 1,
    });
    expect(decision.reason).toBe("last_active_owner");
    expect(decision.status).toBe(409);
    expect(decision.code).toBe("CONFLICT");
  });

  it("allows demoting an owner when another active owner remains", () => {
    expect(
      decideMembershipRoleChange({
        ...base,
        target: { ...base.target, role: "OWNER" },
        nextRole: "ADMIN",
        activeOwnerCount: 2,
      }),
    ).toEqual({ allowed: true, changed: true });
  });

  it("does not let an ADMIN grant OWNER", () => {
    const decision = denied({ ...base, actorRole: "ADMIN", nextRole: "OWNER" });
    expect(decision.reason).toBe("owner_or_admin_protected");
    expect(decision.status).toBe(403);
    expect(decision.code).toBe("FORBIDDEN");
  });

  it("does not let an ADMIN remove OWNER", () => {
    const decision = denied({
      ...base,
      actorRole: "ADMIN",
      target: { ...base.target, role: "OWNER" },
      nextRole: "MEMBER",
    });
    expect(decision.reason).toBe("owner_or_admin_protected");
    expect(decision.status).toBe(403);
  });

  it("does not let an ADMIN modify another ADMIN", () => {
    const decision = denied({
      ...base,
      actorRole: "ADMIN",
      target: { ...base.target, role: "ADMIN" },
      nextRole: "MEMBER",
    });
    expect(decision.reason).toBe("owner_or_admin_protected");
    expect(decision.status).toBe(403);
  });

  it("does not let an ADMIN promote staff into ADMIN", () => {
    const decision = denied({ ...base, actorRole: "ADMIN", nextRole: "ADMIN" });
    expect(decision.reason).toBe("owner_or_admin_protected");
    expect(decision.status).toBe(403);
  });

  it("lets an ADMIN manage staff roles", () => {
    expect(
      decideMembershipRoleChange({
        ...base,
        actorRole: "ADMIN",
        target: { ...base.target, role: "SUPERVISOR" },
        nextRole: "SCANNER",
      }),
    ).toEqual({ allowed: true, changed: true });
  });

  it("does not let a MANAGER promote a MEMBER into MANAGER", () => {
    const decision = denied({
      ...base,
      actorRole: "MANAGER",
      target: { ...base.target, role: "MEMBER" },
      nextRole: "MANAGER",
    });
    expect(decision.reason).toBe("rank_protected");
    expect(decision.status).toBe(403);
  });

  it("does not let a MANAGER modify another MANAGER", () => {
    const decision = denied({
      ...base,
      actorRole: "MANAGER",
      target: { ...base.target, role: "MANAGER" },
      nextRole: "SCANNER",
    });
    expect(decision.reason).toBe("rank_protected");
    expect(decision.status).toBe(403);
  });

  it("lets a MANAGER manage roles below their rank", () => {
    expect(
      decideMembershipRoleChange({
        ...base,
        actorRole: "MANAGER",
        target: { ...base.target, role: "SUPERVISOR" },
        nextRole: "SCANNER",
      }),
    ).toEqual({ allowed: true, changed: true });
  });

  it("blocks a non-owner scoped manager from granting OWNER", () => {
    const decision = denied({ ...base, actorRole: "MANAGER", nextRole: "OWNER" });
    expect(decision.reason).toBe("owner_or_admin_protected");
    expect(decision.status).toBe(403);
  });

  it("blocks a revoked membership", () => {
    const decision = denied({
      ...base,
      target: { ...base.target, status: "REVOKED" },
      nextRole: "ATTENDEE" as Role,
    });
    expect(decision.reason).toBe("revoked");
    expect(decision.status).toBe(409);
    expect(decision.code).toBe("CONFLICT");
  });

  it("returns 404 for a membership in another organization", () => {
    const decision = denied({
      ...base,
      target: { ...base.target, organizationId: "org-2" },
    });
    expect(decision.reason).toBe("cross_org");
    expect(decision.status).toBe(404);
    expect(decision.code).toBe("NOT_FOUND");
  });
});
