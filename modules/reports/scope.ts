// Pure person-scoping for report and record reads.
//
// The permission matrix (docs/security/permission-matrix.md) grants MANAGER and
// SUPERVISOR `reports.export` only **scoped** to their assignments. This module
// turns the caller's role, the person row linked to their user and the
// organization's person_assignments into an explicit allow-list, so a route can
// filter rows without re-implementing the policy.
//
// No Prisma, no network, no implicit clock: callers pass `now` when assignment
// windows matter. The same inputs always produce the same decision.
//
// Schema limitation (documented, not hidden): person_assignments has no
// supervisor/mentor *person* column. A MANAGER/SUPERVISOR is scoped through the
// programs they themselves are assigned to; everyone assigned to those programs
// is visible. See docs/security/permission-matrix.md and modules/reports/README.md.

import type { Role } from "../../packages/authorization/permissions";

export const ORG_WIDE_SCOPE_ROLES = ["OWNER", "ADMIN"] as const;
export const ASSIGNMENT_SCOPE_ROLES = ["MANAGER", "SUPERVISOR"] as const;
export const SELF_SCOPE_ROLES = ["MEMBER", "SCANNER"] as const;
export const MASKED_SCOPE_ROLES = ["VIEWER"] as const;

/** The assignment fields scope evaluation needs; a Prisma `select` can match it. */
export type ScopeAssignment = {
  personId: string;
  programId?: string | null;
  role?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  /** When present, assignments from another organization are ignored. */
  organizationId?: string | null;
};

export type ReportScopeInput = {
  role: Role;
  /** `Person.id` linked to the caller's user (`Person.userId`), or null. */
  callerPersonId?: string | null;
  assignments?: readonly ScopeAssignment[];
  /**
   * True when the trusted authorization layer granted `reports.export`
   * (role default or membership override). VIEWER is org-wide only when true;
   * their output stays masked either way.
   */
  exportGranted?: boolean;
  /** Ignore assignments belonging to another organization. */
  organizationId?: string | null;
  /** Assignment-window instant. Omit to ignore startsAt/endsAt. */
  now?: Date | string | null;
};

export type ReportScopeReason =
  | "owner"
  | "admin"
  | "manager_programs"
  | "manager_unassigned"
  | "member_self"
  | "scanner_self"
  | "viewer_granted"
  | "viewer_not_granted"
  | "no_person_link";

export type ReportScope = {
  role: Role;
  /** `org` = every person in the organization; `people` = explicit allow-list. */
  visibility: "org" | "people";
  /** Names/external ids must be masked regardless of visibility. */
  masked: boolean;
  /** Allow-list when `visibility === "people"`; empty means "no rows". */
  personIds: string[];
  /** Programs that produced a MANAGER/SUPERVISOR scope (empty otherwise). */
  programIds: string[];
  /** Convenience mirror of `visibility === "org"`. */
  orgWide: boolean;
  reason: ReportScopeReason;
};

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function inOrganization(assignment: ScopeAssignment, organizationId?: string | null): boolean {
  if (!organizationId || !assignment.organizationId) return true;
  return assignment.organizationId === organizationId;
}

/**
 * Assignment is active when `now` falls inside its inclusive window. Missing
 * bounds are open-ended; a call without `now` treats every assignment as active
 * (the route always passes `now`).
 */
export function isAssignmentActive(assignment: ScopeAssignment, now?: Date | string | null): boolean {
  if (now == null) return true;
  const nowMs = toTime(now);
  if (nowMs === null) return true;
  const startsAt = toTime(assignment.startsAt);
  const endsAt = toTime(assignment.endsAt);
  if (startsAt !== null && startsAt > nowMs) return false;
  if (endsAt !== null && endsAt < nowMs) return false;
  return true;
}

/**
 * Programs whose membership defines a supervisor's scope: the caller's own
 * active assignments that name a program. Program-less assignments cannot scope
 * anything and are ignored.
 */
export function managerProgramIds(input: {
  assignments: readonly ScopeAssignment[];
  callerPersonId?: string | null;
  organizationId?: string | null;
  now?: Date | string | null;
}): string[] {
  const callerPersonId = input.callerPersonId;
  if (!callerPersonId) return [];
  const ids = new Set<string>();
  for (const assignment of input.assignments) {
    if (assignment.personId !== callerPersonId) continue;
    if (!assignment.programId) continue;
    if (!inOrganization(assignment, input.organizationId)) continue;
    if (!isAssignmentActive(assignment, input.now)) continue;
    ids.add(assignment.programId);
  }
  return [...ids].sort();
}

function decide(input: ReportScopeInput, decision: Omit<ReportScope, "role" | "orgWide">): ReportScope {
  return { role: input.role, orgWide: decision.visibility === "org", ...decision };
}

function orgScope(input: ReportScopeInput, reason: ReportScopeReason, masked = false): ReportScope {
  return decide(input, { visibility: "org", masked, personIds: [], programIds: [], reason });
}

function peopleScope(
  input: ReportScopeInput,
  personIds: readonly string[],
  reason: ReportScopeReason,
  options: { programIds?: readonly string[]; masked?: boolean } = {},
): ReportScope {
  const unique = [...new Set(personIds.filter((id): id is string => typeof id === "string" && id.length > 0))].sort();
  return decide(input, {
    visibility: "people",
    masked: options.masked ?? false,
    personIds: unique,
    programIds: [...new Set(options.programIds ?? [])].sort(),
    reason,
  });
}

/**
 * Decide which people a report may include for a caller.
 *
 * - OWNER/ADMIN: the whole organization.
 * - MANAGER/SUPERVISOR: people assigned to the same active programs as the
 *   caller. No assignments (or no caller person row) means no rows.
 * - MEMBER/SCANNER: only the caller's own person row.
 * - VIEWER: org-wide but masked, and only when `reports.export` was explicitly
 *   granted; otherwise no rows. Masking applies even with the grant.
 */
export function evaluateReportScope(input: ReportScopeInput): ReportScope {
  const { role } = input;

  if (role === "OWNER") return orgScope(input, "owner");
  if (role === "ADMIN") return orgScope(input, "admin");

  if (role === "VIEWER") {
    return input.exportGranted
      ? orgScope(input, "viewer_granted", true)
      : peopleScope(input, [], "viewer_not_granted", { masked: true });
  }

  if (role === "MANAGER" || role === "SUPERVISOR") {
    const callerPersonId = input.callerPersonId ?? null;
    const programIds = managerProgramIds({
      assignments: input.assignments ?? [],
      callerPersonId,
      organizationId: input.organizationId,
      now: input.now,
    });
    if (!callerPersonId || programIds.length === 0) {
      return peopleScope(input, [], "manager_unassigned", { programIds });
    }

    const programSet = new Set(programIds);
    const personIds: string[] = [];
    for (const assignment of input.assignments ?? []) {
      if (!assignment.programId || !programSet.has(assignment.programId)) continue;
      if (!inOrganization(assignment, input.organizationId)) continue;
      if (!isAssignmentActive(assignment, input.now)) continue;
      personIds.push(assignment.personId);
    }
    return peopleScope(input, personIds, "manager_programs", { programIds });
  }

  // MEMBER and SCANNER: least privilege. SCANNER has no default
  // `reports.export`; if an override grants it, self-only is still the safe read.
  if (!input.callerPersonId) return peopleScope(input, [], "no_person_link");
  return peopleScope(input, [input.callerPersonId], role === "SCANNER" ? "scanner_self" : "member_self");
}

/** True when the scope permits this person's data. */
export function allowsPerson(scope: ReportScope, personId: string): boolean {
  if (scope.visibility === "org") return true;
  return scope.personIds.includes(personId);
}

/** Keep only rows whose `personId` is inside the scope. Org scopes pass through. */
export function filterRowsByScope<T extends { personId: string }>(rows: readonly T[], scope: ReportScope): T[] {
  if (scope.visibility === "org") return [...rows];
  const allowed = new Set(scope.personIds);
  return rows.filter((row) => allowed.has(row.personId));
}

/** Stable label for audit metadata, response headers and documentation. */
export function scopeLabel(scope: ReportScope): "org" | "programs" | "self" | "none" {
  if (scope.visibility === "org") return "org";
  if (scope.personIds.length === 0) return "none";
  if (scope.reason === "member_self" || scope.reason === "scanner_self") return "self";
  return "programs";
}
