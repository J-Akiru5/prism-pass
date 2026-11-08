import { describe, expect, it } from "vitest";
import { aggregateDtr, localDateKey, type DtrEvent, type DtrInput, type DtrPerson, type DtrRecord, type DtrSession } from "../modules/reports/dtr";
import { dtrToCsv, escapeCsvCell, serializeCsv } from "../modules/reports/csv";
import { initials, maskDtrRows, pseudonymizeExternalId } from "../modules/reports/masking";
import { MAX_DTR_RANGE_DAYS, parseDateRange, parseDtrRange } from "../modules/reports/range";
import { applyApproval } from "../modules/reports/approval";

// Manila is UTC+8. The fixtures below are written in UTC and asserted in local
// wall-clock time, which is the point of the DTR export.
const people: DtrPerson[] = [
  { id: "p-alice", displayName: "Alice Rivera", externalId: "S-001" },
  { id: "p-ben", displayName: "Ben Cruz", externalId: "E-002" },
];

const sessions: DtrSession[] = [
  // 2026-11-03 08:00–17:00 local (dawn to dusk)
  { id: "s-dawn", type: "EVENT", title: "Dawn block", startsAt: "2026-11-03T00:00:00.000Z", endsAt: "2026-11-03T09:00:00.000Z", timezone: "Asia/Manila" },
  // 2026-11-03 18:00–21:00 local (second session, same person/day)
  { id: "s-dusk", type: "OJT", title: "Dusk block", startsAt: "2026-11-03T10:00:00.000Z", endsAt: "2026-11-03T13:00:00.000Z", timezone: "Asia/Manila" },
  // 2026-11-05 22:00 → 2026-11-06 06:00 local (overnight)
  { id: "s-night", type: "SHIFT", title: "Night shift", startsAt: "2026-11-05T14:00:00.000Z", endsAt: "2026-11-05T22:00:00.000Z", timezone: "Asia/Manila" },
  // 2026-11-06 08:00–12:00 local
  { id: "s-next", type: "SHIFT", title: "Next day", startsAt: "2026-11-06T00:00:00.000Z", endsAt: "2026-11-06T04:00:00.000Z", timezone: "Asia/Manila" },
  // 2026-11-06 08:30–12:30 local (late but complete)
  { id: "s-late", type: "SHIFT", title: "Late block", startsAt: "2026-11-06T00:30:00.000Z", endsAt: "2026-11-06T04:30:00.000Z", timezone: "Asia/Manila" },
];

const events: DtrEvent[] = [
  { id: "e-a-in-1", sessionId: "s-dawn", personId: "p-alice", type: "CHECK_IN", clientTs: "2026-11-03T00:05:00.000Z", serverTs: "2026-11-03T00:05:00.000Z" },
  { id: "e-a-out-1", sessionId: "s-dawn", personId: "p-alice", type: "CHECK_OUT", clientTs: "2026-11-03T09:00:00.000Z", serverTs: "2026-11-03T09:00:00.000Z" },
  { id: "e-a-in-2", sessionId: "s-dusk", personId: "p-alice", type: "CHECK_IN", clientTs: "2026-11-03T10:10:00.000Z", serverTs: "2026-11-03T10:10:00.000Z" },
  { id: "e-a-out-2", sessionId: "s-dusk", personId: "p-alice", type: "CHECK_OUT", clientTs: "2026-11-03T12:40:00.000Z", serverTs: "2026-11-03T12:40:00.000Z" },
  { id: "e-b-in-1", sessionId: "s-dawn", personId: "p-ben", type: "CHECK_IN", clientTs: "2026-11-03T00:20:00.000Z", serverTs: "2026-11-03T00:20:00.000Z" },
  { id: "e-a-in-night", sessionId: "s-night", personId: "p-alice", type: "CHECK_IN", clientTs: "2026-11-05T14:10:00.000Z", serverTs: "2026-11-05T14:10:00.000Z" },
  { id: "e-a-out-night", sessionId: "s-night", personId: "p-alice", type: "CHECK_OUT", clientTs: "2026-11-05T22:00:00.000Z", serverTs: "2026-11-05T22:00:00.000Z" },
  { id: "e-b-in-night", sessionId: "s-night", personId: "p-ben", type: "CHECK_IN", clientTs: "2026-11-05T14:04:00.000Z", serverTs: "2026-11-05T14:04:00.000Z" },
  { id: "e-b-out-night", sessionId: "s-night", personId: "p-ben", type: "CHECK_OUT", clientTs: "2026-11-05T22:03:00.000Z", serverTs: "2026-11-05T22:03:00.000Z" },
  { id: "e-a-in-next", sessionId: "s-next", personId: "p-alice", type: "CHECK_IN", clientTs: "2026-11-06T00:00:00.000Z", serverTs: "2026-11-06T00:00:00.000Z" },
  { id: "e-a-out-next", sessionId: "s-next", personId: "p-alice", type: "CHECK_OUT", clientTs: "2026-11-06T04:00:00.000Z", serverTs: "2026-11-06T04:00:00.000Z" },
  { id: "e-b-in-late", sessionId: "s-late", personId: "p-ben", type: "CHECK_IN", clientTs: "2026-11-06T00:40:00.000Z", serverTs: "2026-11-06T00:40:00.000Z" },
  { id: "e-b-out-late", sessionId: "s-late", personId: "p-ben", type: "CHECK_OUT", clientTs: "2026-11-06T04:00:00.000Z", serverTs: "2026-11-06T04:00:00.000Z" },
];

const records: DtrRecord[] = [
  {
    id: "r-a-dawn",
    sessionId: "s-dawn",
    personId: "p-alice",
    checkInEventId: "e-a-in-1",
    checkOutEventId: "e-a-out-1",
    durationMin: 535,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
  {
    id: "r-a-dusk",
    sessionId: "s-dusk",
    personId: "p-alice",
    checkInEventId: "e-a-in-2",
    checkOutEventId: "e-a-out-2",
    durationMin: 150,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
  {
    id: "r-b-dawn",
    sessionId: "s-dawn",
    personId: "p-ben",
    checkInEventId: "e-b-in-1",
    checkOutEventId: null,
    durationMin: null,
    status: "LATE",
    approvalStatus: "PENDING",
    exceptionFlags: ["geo_outside"],
  },
  {
    id: "r-a-night",
    sessionId: "s-night",
    personId: "p-alice",
    checkInEventId: "e-a-in-night",
    checkOutEventId: "e-a-out-night",
    durationMin: 470,
    status: "PRESENT",
    approvalStatus: "PENDING",
    exceptionFlags: [],
  },
  {
    id: "r-b-night",
    sessionId: "s-night",
    personId: "p-ben",
    checkInEventId: "e-b-in-night",
    checkOutEventId: "e-b-out-night",
    durationMin: 479,
    status: "PRESENT",
    approvalStatus: "APPROVED",
    exceptionFlags: [],
  },
  {
    id: "r-a-next",
    sessionId: "s-next",
    personId: "p-alice",
    checkInEventId: "e-a-in-next",
    checkOutEventId: "e-a-out-next",
    durationMin: 240,
    status: "PRESENT",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
  {
    id: "r-b-late",
    sessionId: "s-late",
    personId: "p-ben",
    checkInEventId: "e-b-in-late",
    checkOutEventId: "e-b-out-late",
    durationMin: 200,
    status: "LATE",
    approvalStatus: "NONE",
    exceptionFlags: [],
  },
];

function fixture(overrides: Partial<DtrInput> = {}): DtrInput {
  return {
    from: "2026-11-01",
    to: "2026-11-30",
    timezone: "Asia/Manila",
    people,
    sessions,
    records,
    events,
    ...overrides,
  };
}

function findRow(rows: ReturnType<typeof aggregateDtr>, date: string, personId: string) {
  return rows.find((row) => row.date === date && row.personId === personId);
}

describe("localDateKey", () => {
  it("resolves the organization-local calendar date, not the UTC date", () => {
    // 16:30 UTC is already 00:30 on the next day in Manila.
    expect(localDateKey("2026-11-07T16:30:00.000Z", "Asia/Manila")).toBe("2026-11-08");
    expect(localDateKey("2026-11-07T16:30:00.000Z", "UTC")).toBe("2026-11-07");
  });
});

describe("DTR aggregation", () => {
  it("produces one row per person per local day", () => {
    const rows = aggregateDtr(fixture());
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.date)).toEqual([
      "2026-11-03",
      "2026-11-03",
      "2026-11-05",
      "2026-11-05",
      "2026-11-06",
      "2026-11-06",
    ]);
  });

  it("sums dawn and dusk sessions into first-in, last-out and total minutes", () => {
    const rows = aggregateDtr(fixture());
    const alice = findRow(rows, "2026-11-03", "p-alice");
    expect(alice).toBeDefined();
    expect(alice?.firstIn).toBe("2026-11-03T00:05:00.000Z");
    expect(alice?.lastOut).toBe("2026-11-03T12:40:00.000Z");
    expect(alice?.firstInLocal).toBe("08:05");
    expect(alice?.lastOutLocal).toBe("20:40");
    expect(alice?.minutes).toBe(685);
    expect(alice?.sessionIds).toEqual(["s-dawn", "s-dusk"]);
    expect(alice?.status).toBe("PRESENT");
  });

  it("keeps an overnight shift on its start date and flags it", () => {
    const rows = aggregateDtr(fixture());
    const alice = findRow(rows, "2026-11-05", "p-alice");
    expect(alice?.firstInLocal).toBe("22:10");
    expect(alice?.lastOutLocal).toBe("06:00");
    expect(alice?.minutes).toBe(470);
    expect(alice?.exceptionFlags).toContain("overnight");
    expect(findRow(rows, "2026-11-06", "p-alice")?.minutes).toBe(240);
  });

  it("flags a missing check-out and never invents minutes", () => {
    const rows = aggregateDtr(fixture());
    const ben = findRow(rows, "2026-11-03", "p-ben");
    expect(ben?.lastOut).toBeNull();
    expect(ben?.minutes).toBe(0);
    expect(ben?.status).toBe("PARTIAL");
    expect(ben?.approvalStatus).toBe("PENDING");
    expect(ben?.exceptionFlags).toEqual(["geo_outside", "missing_check_out"]);
  });

  it("keeps LATE when the shift is complete", () => {
    const rows = aggregateDtr(fixture());
    const ben = findRow(rows, "2026-11-06", "p-ben");
    expect(ben?.status).toBe("LATE");
    expect(ben?.minutes).toBe(200);
    expect(ben?.firstInLocal).toBe("08:40");
  });

  it("filters strictly by the inclusive local-date range", () => {
    const rows = aggregateDtr(fixture({ from: "2026-11-05", to: "2026-11-05" }));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.date === "2026-11-05")).toBe(true);
  });

  it("rolls mixed approvals up deterministically", () => {
    const rows = aggregateDtr(fixture());
    expect(findRow(rows, "2026-11-05", "p-ben")?.approvalStatus).toBe("APPROVED");
    expect(findRow(rows, "2026-11-03", "p-alice")?.approvalStatus).toBe("NONE");
  });

  it("falls back to check-in events when record event ids are stale", () => {
    const stale = records.map((record) =>
      record.id === "r-a-dawn" ? { ...record, checkInEventId: null, checkOutEventId: null } : record,
    );
    const rows = aggregateDtr(fixture({ records: stale }));
    const alice = findRow(rows, "2026-11-03", "p-alice");
    expect(alice?.firstIn).toBe("2026-11-03T00:05:00.000Z");
    expect(alice?.lastOut).toBe("2026-11-03T12:40:00.000Z");
  });
});

describe("CSV serialization", () => {
  it("quotes commas, doubles quotes and preserves newlines (RFC 4180)", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
    expect(escapeCsvCell("Rivera, Alice")).toBe('"Rivera, Alice"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(escapeCsvCell(null)).toBe("");
  });

  it("guards every spreadsheet formula prefix in text cells", () => {
    for (const value of ["=SUM(A1:A2)", "+123", "-cmd", "@user", " =1+1"]) {
      expect(escapeCsvCell(value).startsWith('"\'') || escapeCsvCell(value).startsWith("'")).toBe(true);
    }
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    // Numbers stay numeric: a negative duration is not a formula.
    expect(escapeCsvCell(-5)).toBe("-5");
  });

  it("terminates every record with CRLF and writes a header", () => {
    const csv = serializeCsv(["a", "b"], [["1", "x,y"]]);
    expect(csv).toBe('a,b\r\n1,"x,y"\r\n');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports DTR rows with guarded text and a minutes column", () => {
    const rows = aggregateDtr(fixture({ records: [{ ...records[0], id: "r-guard" }] }));
    rows[0] = { ...rows[0], displayName: "=HYPERLINK(\"http://x\")" };
    const csv = dtrToCsv(rows);
    expect(csv.split("\r\n")[0]).toBe("Date,Person,External ID,First in,Last out,Minutes,Status,Approval,Exceptions");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(",535,");
  });
});

describe("VIEWER masking", () => {
  const exportRows = aggregateDtr(fixture());

  it("reduces names to initials", () => {
    expect(initials("Maria Clara Santos")).toBe("M.C.S.");
    expect(initials("Alice Rivera")).toBe("A.R.");
    expect(initials("")).toBe("");
  });

  it("masks names and external ids for VIEWER without leaking the raw values", () => {
    const masked = maskDtrRows(exportRows, { role: "VIEWER", organizationSalt: "org-a" });
    const ben = masked.find((row) => row.personId === "p-ben");
    expect(ben?.displayName).toBe("B.C.");
    expect(ben?.externalId).toMatch(/^ext_[0-9a-f]{12}$/);
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain("Ben Cruz");
    expect(serialized).not.toContain("E-002");
  });

  it("is deterministic per organization but not across organizations", () => {
    expect(pseudonymizeExternalId("S-001", "org-a")).toBe(pseudonymizeExternalId("S-001", "org-a"));
    expect(pseudonymizeExternalId("S-001", "org-a")).not.toBe(pseudonymizeExternalId("S-001", "org-b"));
  });

  it("leaves ADMIN exports unmasked", () => {
    const open = maskDtrRows(exportRows, { role: "ADMIN", organizationSalt: "org-a" });
    expect(open.find((row) => row.personId === "p-ben")?.displayName).toBe("Ben Cruz");
    expect(open.find((row) => row.personId === "p-ben")?.externalId).toBe("E-002");
    expect(open).toEqual(exportRows);
  });
});

describe("date range validation", () => {
  it("accepts inclusive ranges and counts days correctly", () => {
    const parsed = parseDtrRange("2026-11-01", "2026-11-30");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.range.days).toBe(30);
      expect(parsed.range.from).toBe("2026-11-01");
      expect(parsed.range.to).toBe("2026-11-30");
    }
  });

  it("accepts exactly 92 days and rejects 93", () => {
    const atLimit = parseDtrRange("2026-01-01", "2026-04-02");
    expect(atLimit.ok).toBe(true);
    if (atLimit.ok) expect(atLimit.range.days).toBe(MAX_DTR_RANGE_DAYS);

    const over = parseDtrRange("2026-01-01", "2026-04-03");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain("92");
  });

  it("rejects reversed, impossible and missing dates", () => {
    expect(parseDtrRange("2026-11-30", "2026-11-01").ok).toBe(false);
    expect(parseDtrRange("2026-02-30", "2026-03-01").ok).toBe(false);
    expect(parseDtrRange(null, "2026-11-01").ok).toBe(false);
    expect(parseDtrRange(undefined, undefined).ok).toBe(false);
  });
});

describe("record approval transitions", () => {
  it("approves a pending record and reports the change", () => {
    const transition = applyApproval("PENDING", "approve");
    expect(transition).toEqual({ previous: "PENDING", next: "APPROVED", changed: true, result: "approved" });
  });

  it("is idempotent when the decision is repeated", () => {
    const repeat = applyApproval("APPROVED", "approve");
    expect(repeat.next).toBe("APPROVED");
    expect(repeat.changed).toBe(false);
  });

  it("allows reversing a decision and normalizes unknown states", () => {
    const reversal = applyApproval("APPROVED", "reject");
    expect(reversal.next).toBe("REJECTED");
    expect(reversal.changed).toBe(true);
    expect(reversal.result).toBe("rejected");

    const unknown = applyApproval("SOMETHING_ELSE", "approve");
    expect(unknown.previous).toBe("NONE");
    expect(unknown.next).toBe("APPROVED");
  });
});

describe("parseDateRange audit cap", () => {
  it("allows a longer audit window than DTR but still caps it", () => {
    expect(parseDateRange("2025-01-01", "2025-12-31", 366).ok).toBe(true);
    expect(parseDateRange("2025-01-01", "2026-12-31", 366).ok).toBe(false);
  });
});
