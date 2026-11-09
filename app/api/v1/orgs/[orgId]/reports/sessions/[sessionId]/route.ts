import { NextResponse } from "next/server";
import { fail, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { loadReportScope } from "@/lib/report-scope";
import { requireOrganizationPermission } from "@/lib/tenant";
import { filterRowsByScope, scopeLabel, type ReportScope } from "@/modules/reports/scope";
import {
  buildSessionReport,
  maskSessionRows,
  sessionReportToCsv,
  summarizeSessionRows,
  type SessionReportRow,
  type SessionReportSummary,
} from "@/modules/reports/session";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

function csvHeaders(sessionId: string): Record<string, string> {
  return {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="event-${sessionId}-attendance.csv"`,
    "cache-control": "no-store",
  };
}

async function auditExport(input: {
  organizationId: string;
  actorUserId: string;
  sessionId: string;
  format: "csv" | "json";
  rows: number;
  summary: SessionReportSummary;
  scope: ReportScope;
}): Promise<void> {
  const { organizationId, actorUserId, sessionId, format, rows, summary, scope } = input;
  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId,
      action: "reports.export",
      resource: `report:session:${sessionId}`,
      result: "ok",
      // Counts and scope only: names and external ids never enter the audit log.
      meta: {
        sessionId,
        format,
        rows,
        summary: { ...summary },
        scope: scopeLabel(scope),
        scopeReason: scope.reason,
        scopedPrograms: scope.programIds.length,
        scopedPeople: scope.visibility === "people" ? scope.personIds.length : null,
        masked: scope.masked,
      } as never,
    },
  });
}

// GET /api/v1/orgs/:orgId/reports/sessions/:sessionId?format=csv|json
// reports.export. One event's attendance: the session roster plus every person
// with a record. The session must belong to the caller's organization; a
// cross-org id is a 404. Rows, summary counts and masking follow the same scope
// policy as the DTR export.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("reports.export", orgId);

    const { searchParams } = new URL(req.url);
    const requested = (searchParams.get("format") || "json").toLowerCase();
    if (requested !== "csv" && requested !== "json") {
      return fail(400, "INVALID_INPUT", "format must be csv or json");
    }
    const format: "csv" | "json" = requested;

    // Offline/demo mode: keep the export shape usable without fabricating rows.
    if (!process.env.DATABASE_URL) {
      const rows: SessionReportRow[] = [];
      const summary = summarizeSessionRows(rows);
      if (format === "csv") {
        return new NextResponse(sessionReportToCsv(rows), {
          headers: { ...csvHeaders(sessionId), "x-report-scope": "none", "x-report-masked": "false" },
        });
      }
      return NextResponse.json(
        { data: rows, summary, meta: { sessionId, scope: "none", masked: false } },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, organizationId: ctx.organizationId },
      select: {
        id: true,
        title: true,
        type: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        rosterEnforced: true,
        walkInAllowed: true,
      },
    });
    if (!session) return fail(404, "NOT_FOUND", "Session not found in this organization");

    // The caller already passed `reports.export`; the pure scope decides which
    // people that permission covers. The SQL filter keeps out-of-scope rows from
    // being loaded at all; the in-memory filter below is the belt-and-braces
    // check that also governs the summary counts.
    const scope = await loadReportScope(ctx, { exportGranted: true });
    const scopedPersonIds = scope.visibility === "people" ? scope.personIds : null;
    const personFilter = scopedPersonIds ? { personId: { in: scopedPersonIds } } : {};

    const [roster, records, events] = await Promise.all([
      prisma.sessionRoster.findMany({
        where: { organizationId: ctx.organizationId, sessionId: session.id, ...personFilter },
        select: { sessionId: true, personId: true, source: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { organizationId: ctx.organizationId, sessionId: session.id, ...personFilter },
        select: {
          id: true,
          sessionId: true,
          personId: true,
          checkInEventId: true,
          checkOutEventId: true,
          durationMin: true,
          status: true,
          approvalStatus: true,
          exceptionFlags: true,
        },
      }),
      prisma.attendanceEvent.findMany({
        where: { organizationId: ctx.organizationId, sessionId: session.id, ...personFilter },
        select: { id: true, sessionId: true, personId: true, type: true, clientTs: true, serverTs: true, status: true },
      }),
    ]);

    const personIds = [...new Set([...roster.map((row) => row.personId), ...records.map((row) => row.personId)])];
    const people = personIds.length
      ? await prisma.person.findMany({
          where: { organizationId: ctx.organizationId, id: { in: personIds } },
          select: { id: true, displayName: true, externalId: true },
        })
      : [];

    const rows = filterRowsByScope(
      buildSessionReport({ session, roster, records, events, people }),
      scope,
    );
    const summary = summarizeSessionRows(rows);
    const maskedRows = maskSessionRows(rows, {
      organizationSalt: ctx.organizationId,
      masked: scope.masked,
    });

    const headers: Record<string, string> =
      format === "csv" ? csvHeaders(session.id) : { "cache-control": "no-store" };
    headers["x-report-scope"] = scopeLabel(scope);
    headers["x-report-masked"] = String(scope.masked);

    await auditExport({
      organizationId: ctx.organizationId,
      actorUserId: ctx.internalUserId,
      sessionId: session.id,
      format,
      rows: maskedRows.length,
      summary,
      scope,
    });

    if (format === "csv") {
      return new NextResponse(sessionReportToCsv(maskedRows), { headers });
    }

    return NextResponse.json(
      {
        data: maskedRows,
        summary,
        meta: { sessionId: session.id, scope: scopeLabel(scope), masked: scope.masked },
      },
      { headers },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
