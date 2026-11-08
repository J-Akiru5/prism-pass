import { NextResponse } from "next/server";
import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformActor } from "@/lib/platform";
import {
  AUDIT_EXPORT_MAX_ROWS,
  auditRowsToCsv,
  buildPageMeta,
  parsePlatformAuditQuery,
  shapePlatformAuditRow,
  type PlatformAuditRow,
} from "@/modules/platform/console";

const SELECT = {
  id: true,
  organizationId: true,
  actorUserId: true,
  action: true,
  resource: true,
  result: true,
  meta: true,
  createdAt: true,
  organization: { select: { name: true } },
} as const;

/**
 * Cross-tenant audit explorer.
 *
 * Gate first. Filters are validated by `parsePlatformAuditQuery`; dates are
 * all-or-nothing and capped at 366 days. JSON is paginated (25 default, 100
 * max) and meta allowlist-shaped. CSV exports the current filter, newest first,
 * capped at `AUDIT_EXPORT_MAX_ROWS` (5,000) so an operator cannot pull the whole
 * ledger by accident; the cap is stated on the page and in the docs.
 *
 * Reading is not audited; exporting is. The export row records the filter, never
 * the rows themselves, and uses the shared RFC 4180 writer with its formula guard.
 */
export async function GET(req: Request) {
  try {
    const actor = await requirePlatformActor();
    const { searchParams } = new URL(req.url);
    const parsed = parsePlatformAuditQuery(searchParams);
    if (!parsed.ok) return fail(400, "INVALID_INPUT", parsed.message, parsed.details);
    if (!process.env.DATABASE_URL) {
      return fail(503, "DB_NOT_CONFIGURED", "The audit explorer needs DATABASE_URL; no rows are fabricated.");
    }

    const { query, createdAt } = parsed;
    const where = {
      ...(query.organizationId ? { organizationId: query.organizationId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: "insensitive" as const } } : {}),
      ...(query.result ? { result: { equals: query.result, mode: "insensitive" as const } } : {}),
      ...(createdAt ? { createdAt } : {}),
    };

    if (query.format === "csv") {
      const rows = await prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: AUDIT_EXPORT_MAX_ROWS,
        select: SELECT,
      });
      const shaped: PlatformAuditRow[] = rows.map(shapePlatformAuditRow);

      await prisma.auditLog.create({
        data: {
          actorUserId: actor.internalUserId,
          action: "platform.audit.export",
          resource: "audit:filter",
          result: "ok",
          meta: {
            scope: "platform",
            rows: shaped.length,
            cappedAt: AUDIT_EXPORT_MAX_ROWS,
            filters: {
              organizationId: query.organizationId ?? null,
              action: query.action ?? null,
              result: query.result ?? null,
              from: query.from ?? null,
              to: query.to ?? null,
            },
          } as never,
        },
      });

      return new NextResponse(auditRowsToCsv(shaped), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="platform-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SELECT,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return ok(
      rows.map(shapePlatformAuditRow),
      buildPageMeta({ page: query.page, pageSize: query.pageSize, total }),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
