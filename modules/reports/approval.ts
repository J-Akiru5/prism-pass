// Record-level approval state machine (P7).
//
// Mirrors the ApprovalStatus enum as a local union so it stays pure and
// testable without the generated Prisma client. The event-level approve/reject
// endpoints remain the append-only history path; this module only decides the
// reconciled record's next approvalStatus.

export const APPROVAL_STATUSES = ["NONE", "PENDING", "APPROVED", "REJECTED"] as const;
export type ApprovalStatusValue = (typeof APPROVAL_STATUSES)[number];
export type ApprovalAction = "approve" | "reject";

export type ApprovalTransition = {
  previous: ApprovalStatusValue;
  next: ApprovalStatusValue;
  changed: boolean;
  /** Audit result string, matching the existing attendance.approve/reject rows. */
  result: "approved" | "rejected";
};

function normalize(current: string | null | undefined): ApprovalStatusValue {
  return (APPROVAL_STATUSES as readonly string[]).includes(current ?? "")
    ? (current as ApprovalStatusValue)
    : "NONE";
}

/**
 * Approve/reject a record.
 *
 * All previous states are actionable so a reviewer can correct a mistaken
 * decision (APPROVED ↔ REJECTED); repeating the same decision is idempotent and
 * reports `changed: false`, while still writing an audit row.
 */
export function applyApproval(current: string | null | undefined, action: ApprovalAction): ApprovalTransition {
  const previous = normalize(current);
  const next: ApprovalStatusValue = action === "approve" ? "APPROVED" : "REJECTED";
  return {
    previous,
    next,
    changed: previous !== next,
    result: action === "approve" ? "approved" : "rejected",
  };
}
