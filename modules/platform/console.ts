import { z } from "zod";
import { MAX_AUDIT_RANGE_DAYS, parseDateRange } from "../reports/range";
import { serializeCsv } from "../reports/csv";
import { PLATFORM_PAGE_SIZE_DEFAULT, PLATFORM_PAGE_SIZE_MAX, buildPageMeta, type PageMeta } from "./ledger";

/**
 * Platform console — pure shaping, validation and policy.
 *
 * Like `./ledger`, this module is dependency-free apart from zod and the
 * report helpers (both already shipped) so the rules run under vitest without a
 * database, a session or Next.js. Route handlers remain thin: gate first, parse
 * with these schemas, query Prisma, shape through these allowlists.
 *
 * Leakage contract: aggregate endpoints return counts and org identity only.
 * The two explicitly documented exceptions are (a) the organization detail
 * member list, which is read-only and carries the member's e-mail/role/status,
 * and (b) the cross-tenant audit explorer, whose rows are the audit ledger
 * itself. Both are allowlist-shaped here so a widened Prisma `select` cannot
 * widen the response by accident.
 */

// ── Plans & entitlements ─────────────────────────────────────────────────────

export const PLATFORM_PLANS = ["pilot", "standard", "enterprise"] as const;
export type PlatformPlan = (typeof PLATFORM_PLANS)[number];

export const PLATFORM_PLAN_LABELS: Record<PlatformPlan, string> = {
  pilot: "Pilot",
  standard: "Standard",
  enterprise: "Enterprise",
};

/**
 * Entitlement keys the console may edit. The JSON column is deliberately
 * flexible, but an operator must not be able to type arbitrary keys through the
 * API: unknown *edits* are rejected, while unknown *stored* keys are preserved
 * untouched by `mergeEntitlements` so legacy data is never silently dropped.
 */
export const ENTITLEMENT_KEYS = ["passes", "attendance", "geofence", "documents", "reports", "offline"] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export type EntitlementMap = Record<EntitlementKey, boolean>;

/** Defaults applied when an organization has no subscription row or key yet. */
export const PLAN_ENTITLEMENTS: Record<PlatformPlan, EntitlementMap> = {
  pilot: { passes: true, attendance: true, geofence: true, documents: false, reports: true, offline: false },
  standard: { passes: true, attendance: true, geofence: true, documents: true, reports: true, offline: true },
  enterprise: { passes: true, attendance: true, geofence: true, documents: true, reports: true, offline: true },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function planDefaults(plan: string): EntitlementMap {
  return PLAN_ENTITLEMENTS[plan as PlatformPlan] ?? PLAN_ENTITLEMENTS.pilot;
}

/**
 * Read only the known boolean keys, falling back to the plan defaults.
 * Unknown keys are ignored here (display surface) but retained on write.
 */
export function readEntitlements(plan: string, raw: unknown): EntitlementMap {
  const defaults = planDefaults(plan);
  const source = isPlainObject(raw) ? raw : {};
  const result = { ...defaults };
  for (const key of ENTITLEMENT_KEYS) {
    const value = source[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

/**
 * Merge approved entitlement edits over the stored JSON. Keys outside
 * `ENTITLEMENT_KEYS` are preserved byte-for-byte; approved keys become booleans.
 */
export function mergeEntitlements(
  raw: unknown,
  updates: Partial<Record<EntitlementKey, boolean>>,
): Record<string, unknown> {
  const base = isPlainObject(raw) ? { ...raw } : {};
  for (const key of ENTITLEMENT_KEYS) {
    const value = updates[key];
    if (typeof value === "boolean") base[key] = value;
  }
  return base;
}

export const planUpdateInput = z
  .object({
    plan: z.enum(PLATFORM_PLANS),
    entitlements: z.record(z.enum(ENTITLEMENT_KEYS), z.boolean()).default({}),
    reason: z.string().trim().min(3).max(280).optional(),
  })
  .strict();

export type PlanUpdateInput = z.infer<typeof planUpdateInput>;

export type PlanUpdateDecision = {
  changed: boolean;
  /** Full JSON to persist (unknown legacy keys retained). */
  nextEntitlements: Record<string, unknown>;
  /** Known keys after the merge, for the response and audit diff. */
  entitlements: EntitlementMap;
};

/**
 * Decide whether a plan edit actually changes anything.
 *
 * A no-op returns `changed: false` and the caller writes no audit row, matching
 * the organization status control. Plan and entitlements are independent: a
 * plan change does not silently reset explicit entitlements.
 */
export function decidePlanUpdate(input: {
  currentPlan: string;
  currentEntitlements: unknown;
  nextPlan: PlatformPlan;
  nextEntitlements: Partial<Record<EntitlementKey, boolean>>;
}): PlanUpdateDecision {
  const nextEntitlements = mergeEntitlements(input.currentEntitlements, input.nextEntitlements);
  const before = readEntitlements(input.currentPlan, input.currentEntitlements);
  const after = readEntitlements(input.nextPlan, nextEntitlements);
  const changed =
    input.currentPlan !== input.nextPlan || ENTITLEMENT_KEYS.some((key) => before[key] !== after[key]);
  return { changed, nextEntitlements, entitlements: after };
}

// ── Organization creation ────────────────────────────────────────────────────

export const createPlatformOrgInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
    timezone: z.string().trim().min(1).max(64).default("Asia/Manila"),
    plan: z.enum(PLATFORM_PLANS).default("pilot"),
  })
  .strict();

export type CreatePlatformOrgInput = z.infer<typeof createPlatformOrgInput>;

/** Deterministic slug suggestion for the create form. Never used as authority. */
export function suggestOrgSlug(name: string, maxLength = 64): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    // Strip combining marks (Á -> A) before the non-alphanumeric collapse,
    // otherwise the accent becomes a stray hyphen.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug || "org";
}

// ── Platform admins ──────────────────────────────────────────────────────────

export const ADMIN_REASON_MIN = 10;
export const ADMIN_REASON_MAX = 280;

export const LAST_PLATFORM_ADMIN_RULE =
  "At least one platform admin must remain. Grant another admin before revoking the last one.";

export const SELF_REVOKE_RULE = "You cannot revoke your own platform admin grant.";

export const ALREADY_PLATFORM_ADMIN_RULE = "That user is already a platform admin.";

export const NO_PLATFORM_ADMIN_GRANT_RULE = "That user has no platform admin grant to revoke.";

export const PLATFORM_ADMIN_NOT_FOUND_RULE =
  "No linked internal user matches that e-mail or id. Invite the user into an organization first.";

const reasonField = z.string().trim().min(ADMIN_REASON_MIN).max(ADMIN_REASON_MAX);

/**
 * Grant by e-mail OR internal user id — exactly one. PlatformAdmin rows key on
 * the internal user id; e-mail is resolved server-side, never trusted as id.
 */
export const grantPlatformAdminInput = z
  .object({
    userId: z.string().trim().min(1).max(64).optional(),
    email: z.string().trim().email().max(200).optional(),
    reason: reasonField,
  })
  .strict()
  .refine((value) => Boolean(value.userId) !== Boolean(value.email), {
    message: "Provide exactly one of userId or email",
    path: ["userId"],
  });

export type GrantPlatformAdminInput = z.infer<typeof grantPlatformAdminInput>;

export const revokePlatformAdminInput = z
  .object({ reason: reasonField })
  .strict();

export type RevokePlatformAdminInput = z.infer<typeof revokePlatformAdminInput>;

export type AdminGrantDecision =
  | { allowed: true }
  | { allowed: false; code: "USER_NOT_FOUND" | "ALREADY_PLATFORM_ADMIN"; message: string };

/** Grant policy: the user must exist and must not already hold a grant. */
export function decideAdminGrant(input: { userExists: boolean; alreadyAdmin: boolean }): AdminGrantDecision {
  if (!input.userExists) {
    return { allowed: false, code: "USER_NOT_FOUND", message: PLATFORM_ADMIN_NOT_FOUND_RULE };
  }
  if (input.alreadyAdmin) {
    return { allowed: false, code: "ALREADY_PLATFORM_ADMIN", message: ALREADY_PLATFORM_ADMIN_RULE };
  }
  return { allowed: true };
}

export type AdminRevokeDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "NO_GRANT" | "CANNOT_REVOKE_SELF" | "LAST_PLATFORM_ADMIN";
      message: string;
    };

/**
 * Revoke policy, evaluated inside the transaction by the caller:
 * - no grant → 404-style refusal;
 * - self-revoke → refused (it would immediately strip your own console);
 * - last remaining admin → refused with the shared rule message.
 */
export function decideAdminRevoke(input: {
  targetHasGrant: boolean;
  targetIsSelf: boolean;
  activePlatformAdmins: number;
}): AdminRevokeDecision {
  if (!input.targetHasGrant) {
    return { allowed: false, code: "NO_GRANT", message: NO_PLATFORM_ADMIN_GRANT_RULE };
  }
  if (input.targetIsSelf) {
    return { allowed: false, code: "CANNOT_REVOKE_SELF", message: SELF_REVOKE_RULE };
  }
  const active = Number.isFinite(input.activePlatformAdmins) ? Math.trunc(input.activePlatformAdmins) : 0;
  if (active <= 1) {
    return { allowed: false, code: "LAST_PLATFORM_ADMIN", message: LAST_PLATFORM_ADMIN_RULE };
  }
  return { allowed: true };
}

// ── Overview ─────────────────────────────────────────────────────────────────

export const OVERVIEW_ACTIVITY_LIMIT = 12;

/**
 * UTC calendar day window for "today" counts.
 *
 * A cross-tenant aggregate has no single local timezone, so the console states
 * its frame plainly instead of pretending to be tenant-local. Tenant reports
 * remain local-timezone correct because they resolve one organization.
 */
export function utcDayWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export type PlatformOverviewCounts = {
  organizations: { total: number; active: number; suspended: number; pendingDeletion: number };
  users: number;
  activePasses: number;
  sessionsToday: number;
  eventsToday: number;
  pendingApprovals: number;
  platformAdmins: number;
};

export type PlatformOverviewSource = Partial<{
  organizationsTotal: number;
  organizationsActive: number;
  organizationsSuspended: number;
  organizationsPendingDeletion: number;
  users: number;
  activePasses: number;
  sessionsToday: number;
  eventsToday: number;
  pendingApprovals: number;
  platformAdmins: number;
}>;

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

/** Counts only. Missing/negative/NaN inputs collapse to zero instead of leaking. */
export function shapePlatformOverview(source: PlatformOverviewSource): PlatformOverviewCounts {
  return {
    organizations: {
      total: nonNegativeInt(source.organizationsTotal),
      active: nonNegativeInt(source.organizationsActive),
      suspended: nonNegativeInt(source.organizationsSuspended),
      pendingDeletion: nonNegativeInt(source.organizationsPendingDeletion),
    },
    users: nonNegativeInt(source.users),
    activePasses: nonNegativeInt(source.activePasses),
    sessionsToday: nonNegativeInt(source.sessionsToday),
    eventsToday: nonNegativeInt(source.eventsToday),
    pendingApprovals: nonNegativeInt(source.pendingApprovals),
    platformAdmins: nonNegativeInt(source.platformAdmins),
  };
}

type DateLike = Date | string | null | undefined;

function isoOrNull(value: DateLike): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export type PlatformActivityRow = {
  id: string;
  action: string;
  result: string;
  organizationId: string | null;
  organizationName: string | null;
  createdAt: string | null;
};

export function shapePlatformActivityRow(source: {
  id: string;
  action: string;
  result: string;
  organizationId?: string | null;
  createdAt?: DateLike;
  organization?: { name?: string | null } | null;
}): PlatformActivityRow {
  return {
    id: source.id,
    action: source.action,
    result: source.result,
    organizationId: source.organizationId ?? null,
    organizationName: source.organization?.name ?? null,
    createdAt: isoOrNull(source.createdAt),
  };
}

// ── Organization detail ──────────────────────────────────────────────────────

export type OrganizationMemberRow = {
  id: string;
  email: string | null;
  role: string;
  status: string;
  revokedAt: string | null;
};

export type OrganizationMemberSource = {
  id: string;
  role: string;
  status: string;
  revokedAt?: DateLike;
  user?: { email?: string | null } | null;
};

/**
 * Read-only member row. Explicit, documented exception to aggregate-only:
 * an operator needs to correlate the member with the tenant. No pass
 * credentials, overrides or person records are ever included.
 */
export function shapeOrganizationMemberRow(source: OrganizationMemberSource): OrganizationMemberRow {
  return {
    id: source.id,
    email: source.user?.email ?? null,
    role: source.role,
    status: source.status,
    revokedAt: isoOrNull(source.revokedAt),
  };
}

export type OrganizationCounts = {
  members: number;
  activePasses: number;
  sessions: number;
  events: number;
  records: number;
  documents: number;
};

export function shapeOrganizationCounts(source: {
  members?: number;
  activePasses?: number;
  sessions?: number;
  events?: number;
  records?: number;
  documents?: number;
}): OrganizationCounts {
  return {
    members: nonNegativeInt(source.members),
    activePasses: nonNegativeInt(source.activePasses),
    sessions: nonNegativeInt(source.sessions),
    events: nonNegativeInt(source.events),
    records: nonNegativeInt(source.records),
    documents: nonNegativeInt(source.documents),
  };
}

export type PlatformAdminRow = {
  userId: string;
  email: string | null;
  grantedAt: string | null;
  isSelf: boolean;
};

export function shapePlatformAdminRow(
  source: { userId: string; createdAt?: DateLike; user?: { email?: string | null } | null },
  selfUserId?: string | null,
): PlatformAdminRow {
  return {
    userId: source.userId,
    email: source.user?.email ?? null,
    grantedAt: isoOrNull(source.createdAt),
    isSelf: Boolean(selfUserId && source.userId === selfUserId),
  };
}

// ── Audit explorer ───────────────────────────────────────────────────────────

export const AUDIT_PAGE_SIZE_DEFAULT = 25;
export const AUDIT_EXPORT_MAX_ROWS = 5000;
export const AUDIT_SEARCH_MAX = 100;

export const KNOWN_AUDIT_RESULTS = [
  "ok",
  "denied",
  "accepted",
  "rejected",
  "adjusted",
  "pending",
  "valid_duplicate",
  "invalid_batch",
] as const;

const auditText = (max: number) => z.string().trim().min(1).max(max);

export const platformAuditQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(PLATFORM_PAGE_SIZE_MAX).default(AUDIT_PAGE_SIZE_DEFAULT),
  organizationId: auditText(64).optional(),
  action: auditText(AUDIT_SEARCH_MAX).optional(),
  result: auditText(40).optional(),
  from: auditText(10).optional(),
  to: auditText(10).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export type PlatformAuditQuery = z.infer<typeof platformAuditQuery>;

export type ParsedPlatformAuditQuery =
  | { ok: true; query: PlatformAuditQuery; createdAt?: { gte: Date; lte: Date } }
  | { ok: false; message: string; details?: unknown };

/**
 * Parse audit filters from the query string.
 *
 * Date range is all-or-nothing and capped at the same 366-day window as the
 * organization audit ledger. Rejecting instead of silently truncating keeps a
 * CSV export honest about what it covers.
 */
export function parsePlatformAuditQuery(searchParams: URLSearchParams): ParsedPlatformAuditQuery {
  const parsed = platformAuditQuery.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return { ok: false, message: "Invalid audit filters", details: parsed.error.flatten() };
  }
  const query = parsed.data;
  if (Boolean(query.from) !== Boolean(query.to)) {
    return { ok: false, message: "from and to must be provided together (YYYY-MM-DD)" };
  }
  if (!query.from || !query.to) return { ok: true, query };

  const range = parseDateRange(query.from, query.to, MAX_AUDIT_RANGE_DAYS);
  if (!range.ok) return { ok: false, message: range.message };
  return {
    ok: true,
    query,
    createdAt: {
      gte: new Date(`${range.range.from}T00:00:00.000Z`),
      lte: new Date(`${range.range.to}T23:59:59.999Z`),
    },
  };
}

export type PlatformAuditRow = {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  actorUserId: string | null;
  action: string;
  resource: string;
  result: string;
  createdAt: string | null;
  /** Only platform-scope reasons are surfaced; tenant meta stays in the DB. */
  reason: string | null;
};

export type PlatformAuditSource = {
  id: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  resource: string;
  result: string;
  meta?: unknown;
  createdAt?: DateLike;
  organization?: { name?: string | null } | null;
};

/**
 * Allowlist shape for one audit row.
 *
 * `meta` is intentionally not forwarded wholesale: tenant audit rows carry
 * person ids, geo results and adjustment details. Only a platform-scope reason
 * (written by this console) is surfaced, and only as a bounded string.
 */
export function shapePlatformAuditRow(source: PlatformAuditSource): PlatformAuditRow {
  const meta = isPlainObject(source.meta) ? source.meta : null;
  const platformScope = meta?.scope === "platform";
  const rawReason = platformScope && typeof meta?.reason === "string" ? meta.reason.trim() : "";
  return {
    id: source.id,
    organizationId: source.organizationId ?? null,
    organizationName: source.organization?.name ?? null,
    actorUserId: source.actorUserId ?? null,
    action: source.action,
    resource: source.resource,
    result: source.result,
    createdAt: isoOrNull(source.createdAt),
    reason: rawReason ? rawReason.slice(0, ADMIN_REASON_MAX) : null,
  };
}

export const AUDIT_CSV_HEADER = [
  "Time",
  "Organization",
  "Organization ID",
  "Action",
  "Resource",
  "Result",
  "Actor user ID",
  "Reason",
] as const;

export function auditRowsToCsv(rows: readonly PlatformAuditRow[]): string {
  return serializeCsv(
    AUDIT_CSV_HEADER,
    rows.map((row) => [
      row.createdAt ?? "",
      row.organizationName ?? (row.organizationId ? "" : "Platform"),
      row.organizationId ?? "",
      row.action,
      row.resource,
      row.result,
      row.actorUserId ?? "",
      row.reason ?? "",
    ]),
  );
}

export { buildPageMeta, PLATFORM_PAGE_SIZE_DEFAULT, PLATFORM_PAGE_SIZE_MAX };
export type { PageMeta };
