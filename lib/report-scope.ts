import "server-only";
import { prisma } from "@/lib/db";
import type { AuthContext } from "@/lib/tenant";
import {
  evaluateReportScope,
  managerProgramIds,
  type ReportScope,
  type ReportScopeInput,
  type ScopeAssignment,
} from "@/modules/reports/scope";

// Server-side bridge between the verified membership context and the pure scope
// policy. Only the reads the policy needs are loaded: the caller's linked person
// row, their own assignments and (for MANAGER/SUPERVISOR only) assignments in
// the programs those define. No cross-org rows are read.

const assignmentSelect = {
  personId: true,
  programId: true,
  role: true,
  startsAt: true,
  endsAt: true,
} as const;

export type LoadReportScopeOptions = {
  now?: Date;
  /** The caller already passed `requireOrganizationPermission("reports.export")`. */
  exportGranted?: boolean;
};

export async function loadReportScope(ctx: AuthContext, options: LoadReportScopeOptions = {}): Promise<ReportScope> {
  const now = options.now ?? new Date();
  const exportGranted = options.exportGranted ?? true;
  const base: ReportScopeInput = {
    role: ctx.role,
    organizationId: ctx.organizationId,
    now,
    exportGranted,
  };

  // Roles that need no assignment lookup can be decided without touching the DB.
  if (ctx.role === "OWNER" || ctx.role === "ADMIN" || (ctx.role === "VIEWER" && exportGranted)) {
    return evaluateReportScope(base);
  }

  const caller = await prisma.person.findFirst({
    where: { organizationId: ctx.organizationId, userId: ctx.internalUserId },
    select: { id: true },
  });
  const callerPersonId = caller?.id ?? null;

  if ((ctx.role !== "MANAGER" && ctx.role !== "SUPERVISOR") || !callerPersonId) {
    return evaluateReportScope({ ...base, callerPersonId });
  }

  const ownAssignments = await prisma.personAssignment.findMany({
    where: { organizationId: ctx.organizationId, personId: callerPersonId },
    select: assignmentSelect,
  });
  const programIds = managerProgramIds({
    assignments: ownAssignments as ScopeAssignment[],
    callerPersonId,
    organizationId: ctx.organizationId,
    now,
  });

  const scopedAssignments = programIds.length
    ? await prisma.personAssignment.findMany({
        where: { organizationId: ctx.organizationId, programId: { in: programIds } },
        select: assignmentSelect,
      })
    : [];

  // Own assignments are included so a manager assigned to a program sees their
  // own row along with the program's other members.
  return evaluateReportScope({
    ...base,
    callerPersonId,
    assignments: [...ownAssignments, ...scopedAssignments] as ScopeAssignment[],
  });
}
