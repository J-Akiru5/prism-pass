import { NextResponse } from "next/server";
import { fail, handleRouteError } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { aggregateDtr } from "@/modules/reports/dtr";
import { dtrToCsv } from "@/modules/reports/csv";
import { maskDtrRows } from "@/modules/reports/masking";
import { dayRangeUtc, parseDtrRange } from "@/modules/reports/range";

type P = { params: Promise<{ orgId: string }> };

const DAY_MS = 86_400_000;

// GET /api/v1/orgs/:orgId/reports/dtr?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
// reports.export. Tenant-scoped, bounded to 92 inclusive days, CSV only.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId } = await params;
    const ctx = await requireOrganizationPermission("reports.export", orgId);

    const { searchParams } = new URL(req.url);
    const parsed = parseDtrRange(searchParams.get("from"), searchParams.get("to"));
    if (!parsed.ok) return fail(400, "INVALID_INPUT", parsed.message);

    const format = (searchParams.get("format") ?? "csv").toLowerCase();
    if (format !== "csv") return fail(400, "INVALID_INPUT", "Only format=csv is supported");

    const { from, to } = parsed.range;
    const headers = {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="dtr-${from}_${to}.csv"`,
      "cache-control": "no-store",
    };

    // Offline/demo mode: keep the export shape usable without fabricating rows.
    if (!process.env.DATABASE_URL) return new NextResponse(dtrToCsv([]), { headers });

    const organization = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { timezone: true },
    });
    const timezone = organization?.timezone ?? "Asia/Manila";

    // Widen the UTC window by a day on each side: the org timezone can place a
    // session's local shift date outside the naive UTC window. The pure
    // aggregator then filters precisely on the local date.
    const window = dayRangeUtc(parsed.range);
    const sessions = await prisma.attendanceSession.findMany({
      where: {
        organizationId: ctx.organizationId,
        startsAt: { lt: new Date(window.end.getTime() + DAY_MS) },
        endsAt: { gt: new Date(window.start.getTime() - DAY_MS) },
      },
      select: { id: true, type: true, title: true, startsAt: true, endsAt: true, timezone: true },
    });

    const sessionIds = sessions.map((session) => session.id);
    const [records, events] = sessionIds.length
      ? await Promise.all([
          prisma.attendanceRecord.findMany({
            where: { organizationId: ctx.organizationId, sessionId: { in: sessionIds } },
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
            where: { organizationId: ctx.organizationId, sessionId: { in: sessionIds } },
            select: { id: true, sessionId: true, personId: true, type: true, clientTs: true, serverTs: true, status: true },
          }),
        ])
      : [[], []];

    const personIds = [...new Set(records.map((record) => record.personId))];
    const people = personIds.length
      ? await prisma.person.findMany({
          where: { organizationId: ctx.organizationId, id: { in: personIds } },
          select: { id: true, displayName: true, externalId: true },
        })
      : [];

    const rows = aggregateDtr({ from, to, timezone, people, sessions, records, events });
    const masked = maskDtrRows(rows, { role: ctx.role, organizationSalt: ctx.organizationId });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "reports.export",
        resource: "report:dtr",
        result: "ok",
        meta: { from, to, rows: masked.length, format, masked: ctx.role === "VIEWER" } as never,
      },
    });

    return new NextResponse(dtrToCsv(masked), { headers });
  } catch (e) {
    return handleRouteError(e);
  }
}
