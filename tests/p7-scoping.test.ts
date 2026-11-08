import { describe, expect, it } from "vitest";
import {
  allowsPerson,
  evaluateReportScope,
  filterRowsByScope,
  isAssignmentActive,
  managerProgramIds,
  scopeLabel,
  type ScopeAssignment,
} from "../modules/reports/scope";
import { maskDtrRows } from "../modules/reports/masking";
import type { DtrRow } from "../modules/reports/dtr";
import {
  DEVICE_ERROR_CODES,
  deviceSyncRejection,
  evaluateDeviceRevocation,
  isDeviceRevoked,
  toDeviceSummary,
} from "../modules/devices/revocation";

const NOW = new Date("2026-11-08T12:00:00.000Z");
const ORG = "org-scope";

// p-manager is assigned to the OJT program; p-alice/p-ben are OJT participants.
// p-carol is in the events program, which the manager does not supervise.
// p-dave's OJT assignment expired; p-eve belongs to another organization.
const assignments: ScopeAssignment[] = [
  { personId: "p-manager", programId: "prog-ojt", role: "mentor", startsAt: "2026-01-01T00:00:00.000Z", organizationId: ORG },
  { personId: "p-alice", programId: "prog-ojt", role: "participant", organizationId: ORG },
  { personId: "p-ben", programId: "prog-ojt", role: "participant", organizationId: ORG },
  { personId: "p-carol", programId: "prog-events", role: "participant", organizationId: ORG },
  {
    personId: "p-dave",
    programId: "prog-ojt",
    role: "participant",
    startsAt: "2025-01-01T00:00:00.000Z",
    endsAt: "2025-12-31T00:00:00.000Z",
    organizationId: ORG,
  },
  { personId: "p-eve", programId: "prog-ojt", role: "participant", organizationId: "org-other" },
];

function managerScope(overrides: { assignments?: ScopeAssignment[]; callerPersonId?: string | null } = {}) {
  return evaluateReportScope({
    role: "MANAGER",
    callerPersonId: "p-manager",
    assignments,
    organizationId: ORG,
    now: NOW,
    ...overrides,
  });
}

describe("P7 report scope", () => {
  it("gives OWNER and ADMIN the whole organization, unmasked", () => {
    for (const role of ["OWNER", "ADMIN"] as const) {
      const scope = evaluateReportScope({ role, organizationId: ORG });
      expect(scope.visibility).toBe("org");
      expect(scope.orgWide).toBe(true);
      expect(scope.masked).toBe(false);
      expect(scope.personIds).toEqual([]);
      expect(allowsPerson(scope, "p-anyone")).toBe(true);
      expect(scopeLabel(scope)).toBe("org");
    }
  });

  it("scopes a MANAGER to the active programs they are assigned to", () => {
    const scope = managerScope();
    expect(scope.visibility).toBe("people");
    expect(scope.programIds).toEqual(["prog-ojt"]);
    expect(scope.personIds).toEqual(["p-alice", "p-ben", "p-manager"]);
    expect(scope.masked).toBe(false);
    expect(scope.reason).toBe("manager_programs");
    expect(scopeLabel(scope)).toBe("programs");
    expect(allowsPerson(scope, "p-alice")).toBe(true);
    expect(allowsPerson(scope, "p-carol")).toBe(false);
    expect(allowsPerson(scope, "p-dave")).toBe(false);
  });

  it("excludes expired assignments and assignments from another organization", () => {
    expect(isAssignmentActive(assignments[4], NOW)).toBe(false);
    expect(isAssignmentActive(assignments[1], NOW)).toBe(true);
    expect(managerProgramIds({ assignments, callerPersonId: "p-manager", organizationId: ORG, now: NOW })).toEqual([
      "prog-ojt",
    ]);
    const scope = managerScope();
    expect(scope.personIds).not.toContain("p-dave");
    expect(scope.personIds).not.toContain("p-eve");
    expect(managerProgramIds({ assignments, callerPersonId: "p-manager", organizationId: "org-other", now: NOW })).toEqual([]);
  });

  it("denies a MANAGER with no program assignment instead of falling back to org-wide", () => {
    const scope = evaluateReportScope({
      role: "MANAGER",
      callerPersonId: "p-manager",
      assignments: [{ personId: "p-manager", programId: null, role: "mentor", organizationId: ORG }],
      organizationId: ORG,
      now: NOW,
    });
    expect(scope.visibility).toBe("people");
    expect(scope.personIds).toEqual([]);
    expect(scope.reason).toBe("manager_unassigned");
    expect(scopeLabel(scope)).toBe("none");
    expect(allowsPerson(scope, "p-manager")).toBe(false);

    const unlinked = managerScope({ callerPersonId: null });
    expect(unlinked.personIds).toEqual([]);
    expect(unlinked.reason).toBe("manager_unassigned");
  });

  it("applies the same program scope to SUPERVISOR", () => {
    const scope = evaluateReportScope({
      role: "SUPERVISOR",
      callerPersonId: "p-manager",
      assignments,
      organizationId: ORG,
      now: NOW,
    });
    expect(scope.personIds).toEqual(["p-alice", "p-ben", "p-manager"]);
    expect(scope.reason).toBe("manager_programs");
  });

  it("limits MEMBER and SCANNER to their own person row", () => {
    const member = evaluateReportScope({ role: "MEMBER", callerPersonId: "p-alice", organizationId: ORG });
    expect(member.visibility).toBe("people");
    expect(member.personIds).toEqual(["p-alice"]);
    expect(member.reason).toBe("member_self");
    expect(scopeLabel(member)).toBe("self");
    expect(allowsPerson(member, "p-ben")).toBe(false);

    const scanner = evaluateReportScope({ role: "SCANNER", callerPersonId: "p-alice", organizationId: ORG });
    expect(scanner.personIds).toEqual(["p-alice"]);
    expect(scanner.reason).toBe("scanner_self");

    const unlinked = evaluateReportScope({ role: "MEMBER", callerPersonId: null, organizationId: ORG });
    expect(unlinked.personIds).toEqual([]);
    expect(unlinked.reason).toBe("no_person_link");
  });

  it("gives VIEWER a masked org-wide scope only when reports.export was granted", () => {
    const granted = evaluateReportScope({ role: "VIEWER", organizationId: ORG, exportGranted: true });
    expect(granted.visibility).toBe("org");
    expect(granted.masked).toBe(true);
    expect(granted.reason).toBe("viewer_granted");
    expect(scopeLabel(granted)).toBe("org");

    const denied = evaluateReportScope({ role: "VIEWER", organizationId: ORG, exportGranted: false });
    expect(denied.visibility).toBe("people");
    expect(denied.personIds).toEqual([]);
    expect(denied.masked).toBe(true);
    expect(denied.reason).toBe("viewer_not_granted");
    expect(allowsPerson(denied, "p-alice")).toBe(false);
  });

  it("filters rows by the scope allow-list", () => {
    const rows = [{ personId: "p-alice" }, { personId: "p-ben" }, { personId: "p-carol" }];
    const scoped = filterRowsByScope(rows, managerScope());
    expect(scoped.map((row) => row.personId)).toEqual(["p-alice", "p-ben"]);
    expect(filterRowsByScope(rows, evaluateReportScope({ role: "OWNER", organizationId: ORG }))).toHaveLength(3);
    expect(filterRowsByScope(rows, evaluateReportScope({ role: "MEMBER", callerPersonId: null }))).toHaveLength(0);
  });

  it("uses the scope's masked decision even when an unmasked role is supplied", () => {
    const row: DtrRow = {
      date: "2026-11-03",
      personId: "p-alice",
      displayName: "Alice Rivera",
      externalId: "S-001",
      firstIn: null,
      lastOut: null,
      firstInLocal: null,
      lastOutLocal: null,
      minutes: 0,
      status: "PRESENT",
      approvalStatus: "NONE",
      exceptionFlags: [],
      sessionIds: [],
    };
    const viewer = evaluateReportScope({ role: "VIEWER", organizationId: ORG, exportGranted: true });
    const masked = maskDtrRows([row], { role: "ADMIN", masked: viewer.masked, organizationSalt: ORG });
    expect(masked[0].displayName).toBe("A.R.");
    expect(masked[0].externalId).toMatch(/^ext_[0-9a-f]{12}$/);

    const manager = managerScope();
    const open = maskDtrRows([row], { role: "VIEWER", masked: manager.masked, organizationSalt: ORG });
    expect(open[0].displayName).toBe("Alice Rivera");
    expect(open[0].externalId).toBe("S-001");
  });
});

describe("P7 device revocation", () => {
  const secretHash = "a".repeat(64);

  it("revokes once and is idempotent on repeat", () => {
    const first = evaluateDeviceRevocation({ revokedAt: null }, NOW);
    expect(first).toEqual({ revoked: true, already: false, revokedAt: NOW });

    const second = evaluateDeviceRevocation({ revokedAt: first.revokedAt }, new Date("2026-12-01T00:00:00.000Z"));
    expect(second.already).toBe(true);
    expect(second.revokedAt).toBe(NOW);
    expect(isDeviceRevoked({ revokedAt: NOW })).toBe(true);
    expect(isDeviceRevoked({ revokedAt: null })).toBe(false);
  });

  it("rejects a revoked device with a distinct error code", () => {
    const rejection = deviceSyncRejection({ revokedAt: NOW, secretHash });
    expect(rejection).not.toBeNull();
    expect(rejection?.status).toBe(403);
    expect(rejection?.code).toBe(DEVICE_ERROR_CODES.revoked);
    expect(rejection?.code).toBe("DEVICE_REVOKED");
    expect(rejection?.reason).toBe("device_revoked");
  });

  it("distinguishes unknown, unregistered and healthy devices", () => {
    expect(deviceSyncRejection(null)?.code).toBe(DEVICE_ERROR_CODES.notFound);
    expect(deviceSyncRejection({ revokedAt: null, secretHash: null })?.code).toBe(DEVICE_ERROR_CODES.unregistered);
    expect(deviceSyncRejection({ revokedAt: null, secretHash })).toBeNull();
  });

  it("projects a device summary without the stored secret hash", () => {
    const summary = toDeviceSummary({
      id: "dev-internal",
      devicePublicId: "dev_public",
      role: "scanner",
      secretHash,
      revokedAt: NOW,
      lastSeenAt: NOW,
      lastSyncAt: "2026-11-08T10:00:00.000Z",
    });
    expect(summary).toMatchObject({
      id: "dev-internal",
      devicePublicId: "dev_public",
      role: "scanner",
      revoked: true,
      revokedAt: "2026-11-08T12:00:00.000Z",
      lastSyncAt: "2026-11-08T10:00:00.000Z",
    });
    expect(JSON.stringify(summary)).not.toContain(secretHash);
    expect(Object.keys(summary)).not.toContain("secretHash");
  });
});
