import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildSessionReport,
  maskSessionRows,
  sessionReportToCsv,
  summarizeSessionRows,
  type SessionReportEvent,
  type SessionReportInput,
  type SessionReportPerson,
  type SessionReportRecord,
  type SessionReportRosterEntry,
  type SessionReportSession,
} from "@/modules/reports/session";
import { evaluateReportScope, filterRowsByScope } from "@/modules/reports/scope";

// M1 per-event report. The pure aggregator is the contract; the route test at
// the bottom locks the tenant/audit/header shape that has no DB harness here.
//
// Session: 2026-11-03 08:00–17:00 Asia/Manila (00:00–09:00 UTC).
// Alice is complete, Ben is a check-in only, Carol never scanned, Dave is late
// and complete, and Walk In scanned without being on the roster.

const session: SessionReportSession = {
  id: "s-event-1",
  title: "OJT Orientation",
  type: "EVENT",
  startsAt: "2026-11-03T00:00:00.000Z",
  endsAt: "2026-11-03T09:00:00.000Z",
  timezone: "Asia/Manila",
  rosterEnforced: true,
  walkInAllowed: true,
};

const people: SessionReportPerson[] = [
  { id: "p-alice", displayName: "Alice Rivera", externalId: "S-001" },
  { id: "p-ben", displayName: "Ben Cruz", externalId: "E-002" },
  { id: "p-carol", displayName: "Carol Diaz", externalId: "E-003" },
  { id: "p-dave", displayName: "Dave Lim", externalId: "E-004" },
  { id: "p-walk", displayName: "Walk In", externalId: "E-005" },
  // A person from another session; must never leak into this report.
  { id: "p-evil", displayName: "Eve Foreign", externalId: "X-999" },
];

const roster: SessionReportRosterEntry[] = [
  { sessionId: "s-event-1", personId: "p-alice", source: "manual" },
  { sessionId: "s-event-1", personId: "p-ben", source: "manual" },
  { sessionId: "s-event-1", personId: "p-carol", source: "manual" },
  { sessionId: "s-event-1", personId: "p-dave", source: "manual" },
  { sessionId: "s-other", personId: "p-evil", source: "manual" },
];

const events: SessionReportEvent[] = [
  {
    id: "e-a-in",
    sessionId: "s-event-1",
    personId: "p-alice",
    type: "CHECK_IN",
    clientTs: "2026-11-03T00:04:00.000Z",
    serverTs: "2026-11-03T00:05:00.000Z",
  },
  {
    id: "e-a-out",
    sessionId: "s-event-1",
    personId: "p-alice",
    type: "CHECK_OUT",
    clientTs: "2026-11-03T08:59:00.000Z",
    serverTs: "2026-11-03T09:00:00.000Z",
  },
  // Ben's client clock says 08:10 local; the server accepted 08:20 first. The
  // second check-in is the duplicate the duplicate window should have dropped.
  {
    id: "e-b-in-1",
    sessionId: "s-event-1",
    personId: "p-ben",
    type: "CHECK_IN",
    clientTs: "2026-11-03T00:10:00.000Z",
    serverTs: "2026-11-03T00:20:00.000Z",
  },
  {
    id: "e-b-in-2",
    sessionId: "s-event-1",
    personId: "p-ben",
    type: "CHECK_IN",
    clientTs: "2026-11-03T00:10:00.000Z",
    serverTs: "2026-11-03T00:25:00.000Z",
  },
  {
    id: "e-d-in",
    sessionId: "s-event-1",
    personId: "p-dave",
    type: "CHECK_IN",
    clientTs: "2026-11-03T00:40:00.000Z",
    serverTs: "2026-11-03T00:40:00.000Z",
  },
  {
    id: "e-d-out",
    sessionId: "s-event-1",
    personId: "p-dave",
    type: "CHECK_OUT",
    clientTs: "2026-11-03T04:00:00.000Z",
    serverTs: "2026-11-03T04:00:00.000Z",
  },
  {
    id: "e-w-in",
    sessionId: "s-event-1",
    personId: "p-walk",
    type: "CHECK_IN",
    clientTs: "2026-11-03T01:00:00.000Z",
    serverTs: "2026-11-03T01:00:00.000Z",
  },
  {
    id: "e-w-out",
    sessionId: "s-event-1",
    personId: "p-walk",
    type: "CHECK_OUT",
    clientTs: "2026-11-03T03:00:00.000Z",
    serverTs: "2026-11-03T03:00:00.000Z",
  },
  {
    id: "e-x-in",
    sessionId: "s-other",
    personId: "p-evil",
    type: "CHECK_IN",
    clientTs: "2026-11-03T00:00:00.000Z",
    serverTs: "2026-11-03T00:00:00.000Z",
  },
];

const records: SessionReportRecord[] = [
  {
    id: "r-alice",
    sessionId: "s-event-1",
    personId: "p-alice",
    checkInEventId: "e-a-in",
    checkOutEventId: "e-a-out",
    durationMin: 535,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
  {
    id: "r-ben",
    sessionId: "s-event-1",
    personId: "p-ben",
    // Null links force the event fallback; that is what collapses the duplicate
    // check-in to the earliest accepted server instant.
    checkInEventId: null,
    checkOutEventId: null,
    durationMin: null,
    status: "LATE",
    approvalStatus: "PENDING",
    exceptionFlags: ["geo_outside"],
  },
  {
    id: "r-dave",
    sessionId: "s-event-1",
    personId: "p-dave",
    checkInEventId: "e-d-in",
    checkOutEventId: "e-d-out",
    durationMin: 200,
    status: "LATE",
    approvalStatus: "APPROVED",
    exceptionFlags: [],
  },
  {
    id: "r-walk",
    sessionId: "s-event-1",
    personId: "p-walk",
    checkInEventId: "e-w-in",
    checkOutEventId: "e-w-out",
    durationMin: 120,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
  {
    id: "r-evil",
    sessionId: "s-other",
    personId: "p-evil",
    checkInEventId: "e-x-in",
    checkOutEventId: null,
    durationMin: null,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
];

function fixture(overrides: Partial<SessionReportInput> = {}): SessionReportInput {
  return { session, roster, records, events, people, ...overrides };
}

function findRow(rows: ReturnType<typeof buildSessionReport>, personId: string) {
  return rows.find((row) => row.personId === personId);
}

describe("M1 per-event report rows", () => {
  const rows = buildSessionReport(fixture());

  it("synthesizes an ABSENT row for a rostered person with no record", () => {
    const carol = findRow(rows, "p-carol");
    expect(carol).toMatchObject({
      onRoster: true,
      walkIn: false,
      recorded: false,
      status: "ABSENT",
      approvalStatus: "NONE",
      minutes: 0,
      checkInAt: null,
      checkOutAt: null,
    });
    expect(carol?.exceptionFlags).toEqual([]);
  });

  it("keeps a recorded person who is not on the roster as a flagged walk-in", () => {
    const walkIn = findRow(rows, "p-walk");
    expect(walkIn).toMatchObject({
      onRoster: false,
      walkIn: true,
      recorded: true,
      status: "PRESENT",
      minutes: 120,
      checkInAt: "09:00",
      checkOutAt: "11:00",
    });
  });

  it("marks a check-in without a check-out PARTIAL and never invents minutes", () => {
    const ben = findRow(rows, "p-ben");
    expect(ben).toMatchObject({
      status: "PARTIAL",
      checkOutAt: null,
      minutes: 0,
      approvalStatus: "PENDING",
    });
    expect(ben?.exceptionFlags).toEqual(["geo_outside", "missing_check_out"]);
  });

  it("keeps LATE when the shift is complete", () => {
    const dave = findRow(rows, "p-dave");
    expect(dave).toMatchObject({
      status: "LATE",
      minutes: 200,
      approvalStatus: "APPROVED",
      checkInAt: "08:40",
      checkOutAt: "12:00",
    });
  });

  it("collapses duplicate roster entries and duplicate scan events into one row", () => {
    const duplicated = buildSessionReport(fixture({ roster: [...roster, roster[0]] }));
    expect(duplicated).toHaveLength(5);
    expect(duplicated.filter((row) => row.personId === "p-alice")).toHaveLength(1);
    expect(duplicated.filter((row) => row.personId === "p-ben")).toHaveLength(1);
    expect(findRow(duplicated, "p-ben")?.checkInAt).toBe("08:20");
  });

  it("renders Asia/Manila wall-clock labels from authoritative server time", () => {
    expect(findRow(rows, "p-alice")?.checkInAt).toBe("08:05");
    expect(findRow(rows, "p-alice")?.checkOutAt).toBe("17:00");
    // Client said 08:10; the accepted server instant is 08:20.
    expect(findRow(rows, "p-ben")?.checkInAt).toBe("08:20");
  });

  it("uses an explicit timezone override instead of the session zone", () => {
    const utc = buildSessionReport(fixture({ timezone: "UTC" }));
    expect(findRow(utc, "p-alice")?.checkInAt).toBe("00:05");
    expect(findRow(utc, "p-alice")?.checkOutAt).toBe("09:00");
  });
});

describe("M1 per-event summary", () => {
  const rows = buildSessionReport(fixture());

  it("counts roster, presence, absences, walk-ins and pending approvals", () => {
    expect(summarizeSessionRows(rows)).toEqual({
      rostered: 4,
      present: 2,
      late: 1,
      absent: 1,
      walkIns: 1,
      recorded: 4,
      pendingApproval: 1,
    });
  });

  it("recomputes from whatever rows the caller may see", () => {
    const carol = rows.filter((row) => row.personId === "p-carol");
    expect(summarizeSessionRows(carol)).toEqual({
      rostered: 1,
      present: 0,
      late: 0,
      absent: 1,
      walkIns: 0,
      recorded: 0,
      pendingApproval: 0,
    });
  });
});

describe("M1 per-event CSV", () => {
  const rows = buildSessionReport(fixture());

  it("writes the event header, CRLF records and numeric minutes", () => {
    const csv = sessionReportToCsv(rows);
    expect(csv.split("\r\n")[0]).toBe(
      "Person,External ID,On roster,Walk-in,Check-in,Check-out,Minutes,Status,Approval,Exceptions",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv).toContain("Alice Rivera,S-001,yes,no,08:05,17:00,535,PRESENT,NONE,");
    expect(csv).toContain(",120,");
  });

  it("guards a formula-looking name so a spreadsheet cannot execute it", () => {
    const guarded = rows.map((row) =>
      row.personId === "p-alice" ? { ...row, displayName: '=HYPERLINK("http://evil")' } : row,
    );
    const csv = sessionReportToCsv(guarded);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/);
  });
});

describe("M1 per-event masking", () => {
  const rows = buildSessionReport(fixture());

  it("masks names and external ids for VIEWER without leaking the raw values", () => {
    const masked = maskSessionRows(rows, { role: "VIEWER", organizationSalt: "org-a" });
    const alice = findRow(masked, "p-alice");
    expect(alice?.displayName).toBe("A.R.");
    expect(alice?.externalId).toMatch(/^ext_[0-9a-f]{12}$/);
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("Alice Rivera");
    expect(serialized).not.toContain("S-001");
    expect(serialized).not.toContain("Walk In");
    expect(serialized).not.toContain("E-005");
  });

  it("uses the scope's masked decision even when the role is unmasked", () => {
    const masked = maskSessionRows(rows, { role: "ADMIN", masked: true, organizationSalt: "org-a" });
    expect(findRow(masked, "p-alice")?.displayName).toBe("A.R.");
    const open = maskSessionRows(rows, { role: "ADMIN", masked: false, organizationSalt: "org-a" });
    expect(open).toEqual(rows);
  });
});

describe("M1 per-event scope", () => {
  const rows = buildSessionReport(fixture());

  it("filters rows first and recomputes the summary from what remains", () => {
    const self = evaluateReportScope({ role: "MEMBER", callerPersonId: "p-alice", organizationId: "org-a" });
    const scoped = filterRowsByScope(rows, self);
    expect(scoped.map((row) => row.personId)).toEqual(["p-alice"]);
    expect(summarizeSessionRows(scoped)).toEqual({
      rostered: 1,
      present: 1,
      late: 0,
      absent: 0,
      walkIns: 0,
      recorded: 1,
      pendingApproval: 0,
    });
  });

  it("counts only people inside a manager's program scope", () => {
    const assignments = [
      { personId: "p-manager", programId: "prog-ojt", role: "mentor", organizationId: "org-a" },
      { personId: "p-alice", programId: "prog-ojt", role: "participant", organizationId: "org-a" },
      { personId: "p-ben", programId: "prog-ojt", role: "participant", organizationId: "org-a" },
    ];
    const manager = evaluateReportScope({
      role: "MANAGER",
      callerPersonId: "p-manager",
      assignments,
      organizationId: "org-a",
    });
    const scoped = filterRowsByScope(rows, manager);
    expect(scoped.map((row) => row.personId)).toEqual(["p-alice", "p-ben"]);
    expect(summarizeSessionRows(scoped)).toEqual({
      rostered: 2,
      present: 1,
      late: 0,
      absent: 0,
      walkIns: 0,
      recorded: 2,
      pendingApproval: 1,
    });
  });
});

describe("M1 per-event tenant isolation", () => {
  it("ignores roster, record and event rows that belong to another session", () => {
    const rows = buildSessionReport(fixture());
    expect(rows).toHaveLength(5);
    expect(rows.some((row) => row.personId === "p-evil")).toBe(false);
    expect(rows.some((row) => row.displayName === "Eve Foreign")).toBe(false);
  });

  it("keeps the route org-scoped, 404s a foreign session and audits the export", () => {
    const route = readFileSync("app/api/v1/orgs/[orgId]/reports/sessions/[sessionId]/route.ts", "utf8");
    expect(route).toContain('requireOrganizationPermission("reports.export"');
    expect(route).toContain("organizationId: ctx.organizationId");
    expect(route).toContain("fail(404");
    expect(route).toContain('resource: `report:session:${sessionId}`');
    expect(route).toContain("event-${sessionId}-attendance.csv");
    expect(route).toContain("x-report-scope");
    expect(route).toContain("x-report-masked");
    expect(route).toContain('"cache-control": "no-store"');
  });
});
