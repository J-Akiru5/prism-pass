import { z } from "zod";

/**
 * Platform console — pure shaping and policy.
 *
 * Everything in this module is dependency-free (zod only) so the rules can be
 * unit-tested without a database, a session, or Next.js. The route handlers in
 * `app/api/v1/platform/**` are thin wrappers around `requirePlatformAdmin`,
 * Prisma and these functions.
 *
 * Leakage contract (ADR-11, docs/security/permission-matrix.md): the ledger
 * exports aggregate counts only. No member identities, e-mails, pass
 * credentials or org-scoped rows leave this module. `shapePlatformOrgRow`
 * builds a fresh object from an explicit allowlist, so a caller that widens the
 * Prisma `select` cannot accidentally widen the API response.
 */

export const ORG_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type PlatformOrgStatus = (typeof ORG_STATUSES)[number];

/** Every status the ledger can display (the write surface stays ACTIVE/SUSPENDED). */
export const ORG_LIST_STATUSES = ["ACTIVE", "SUSPENDED", "PENDING_DELETION"] as const;
export type OrgStatusValue = (typeof ORG_LIST_STATUSES)[number];

export const PLATFORM_PAGE_SIZE_DEFAULT = 20;
export const PLATFORM_PAGE_SIZE_MAX = 100;
export const PLATFORM_SEARCH_MAX = 64;

/**
 * Query contract for `GET /api/v1/platform/orgs`. Mirrors the v1 pagination
 * contract (`page`, `pageSize` max 100) and adds the two ledger filters.
 * Out-of-range values are rejected, not silently clamped, so a caller never
 * believes it saw a full page when it did not.
 */
export const platformOrgsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PLATFORM_PAGE_SIZE_MAX).default(PLATFORM_PAGE_SIZE_DEFAULT),
  status: z.enum(ORG_LIST_STATUSES).optional(),
  q: z
    .string()
    .trim()
    .max(PLATFORM_SEARCH_MAX)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type PlatformOrgsQuery = z.infer<typeof platformOrgsQuery>;

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

/** Pagination envelope from `ok(rows, meta)`. Tolerates a bad total instead of emitting NaN. */
export function buildPageMeta(input: { page: number; pageSize: number; total: number }): PageMeta {
  const pageSize = Number.isFinite(input.pageSize) && input.pageSize > 0 ? Math.trunc(input.pageSize) : PLATFORM_PAGE_SIZE_DEFAULT;
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.trunc(input.page) : 1;
  const total = Number.isFinite(input.total) && input.total > 0 ? Math.trunc(input.total) : 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export type PlatformOrgRow = {
  id: string;
  name: string;
  slug: string;
  status: OrgStatusValue;
  /** ACTIVE memberships only — revoked/invited seats are not "members". */
  memberCount: number;
  /** ACTIVE passes only — revoked/expired credentials are not usable passes. */
  passCount: number;
  createdAt: string;
  /** Newest audited activity for the org, or null when it has never acted. */
  lastActivityAt: string | null;
};

type DateLike = Date | string | null | undefined;

/** Minimal shape the ledger needs; extra Prisma fields are ignored, not forwarded. */
export type PlatformOrgSource = {
  id: string;
  name: string;
  slug: string;
  status: OrgStatusValue;
  createdAt: DateLike;
  _count?: { memberships?: number | null; passes?: number | null } | null;
  auditLogs?: { createdAt: DateLike }[] | null;
};

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function isoOrNull(value: DateLike): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Allowlist shaping. Tests assert that a source object carrying identities
 * (`email`, `members`, `credentialHash`, …) produces none of them.
 */
export function shapePlatformOrgRow(org: PlatformOrgSource): PlatformOrgRow {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    memberCount: nonNegativeInt(org._count?.memberships),
    passCount: nonNegativeInt(org._count?.passes),
    createdAt: isoOrNull(org.createdAt) ?? "",
    lastActivityAt: isoOrNull(org.auditLogs?.[0]?.createdAt),
  };
}

export const LAST_ADMIN_SUSPEND_RULE =
  "A suspension needs at least one other active platform admin, so a single operator cannot make a platform-wide change with no peer able to reverse it. Grant a second platform admin first.";

export const PENDING_DELETION_SUSPEND_RULE =
  "A tenant pending deletion cannot be suspended; reactivate it first or complete the deletion.";

/** Body for `POST /api/v1/platform/orgs/[orgId]/status`. */
export const setOrgStatusInput = z.object({
  status: z.enum(ORG_STATUSES),
  reason: z.string().trim().min(3).max(280).optional(),
});

export type SetOrgStatusInput = z.infer<typeof setOrgStatusInput>;

export type StatusChangeDecision =
  | { allowed: true; changed: true; nextStatus: PlatformOrgStatus; action: "org.suspend" | "org.reactivate" }
  | { allowed: true; changed: false; nextStatus: PlatformOrgStatus; action: null }
  | { allowed: false; code: "LAST_PLATFORM_ADMIN" | "INVALID_TRANSITION"; message: string; nextStatus: PlatformOrgStatus };

/**
 * Suspend / reactivate policy (documented in docs/api/platform-console.md).
 *
 * - Reactivation (→ ACTIVE) is never gated. There must always be a way back.
 * - Suspension (→ SUSPENDED) requires one *other* active platform admin.
 *   `platform_admins` rows are active by presence (no status column), so the
 *   caller passes `count - 1`.
 * - Repeated transitions are no-ops (`changed: false`) and write no audit row.
 * - A tenant pending deletion can only be reactivated, never suspended.
 * - Deliberately NOT required: an ACTIVE org OWNER. Per ADR-11 platform
 *   authority is separate from org membership, so suspending an abandoned or
 *   OWNER-less tenant is a legitimate platform action.
 */
export function decideOrgStatusChange(input: {
  currentStatus: OrgStatusValue;
  nextStatus: PlatformOrgStatus;
  otherActivePlatformAdmins: number;
}): StatusChangeDecision {
  const others = nonNegativeInt(input.otherActivePlatformAdmins);

  if (input.nextStatus === "ACTIVE") {
    if (input.currentStatus === "ACTIVE") {
      return { allowed: true, changed: false, nextStatus: "ACTIVE", action: null };
    }
    return { allowed: true, changed: true, nextStatus: "ACTIVE", action: "org.reactivate" };
  }

  if (input.currentStatus === "SUSPENDED") {
    return { allowed: true, changed: false, nextStatus: "SUSPENDED", action: null };
  }
  if (input.currentStatus === "PENDING_DELETION") {
    return { allowed: false, code: "INVALID_TRANSITION", message: PENDING_DELETION_SUSPEND_RULE, nextStatus: "SUSPENDED" };
  }
  if (others < 1) {
    return { allowed: false, code: "LAST_PLATFORM_ADMIN", message: LAST_ADMIN_SUSPEND_RULE, nextStatus: "SUSPENDED" };
  }
  return { allowed: true, changed: true, nextStatus: "SUSPENDED", action: "org.suspend" };
}

/** Shared badge/status tone so the ledger and any future admin view agree. */
export function statusTone(status: OrgStatusValue): "success" | "danger" | "warning" {
  if (status === "ACTIVE") return "success";
  if (status === "SUSPENDED") return "danger";
  return "warning";
}
