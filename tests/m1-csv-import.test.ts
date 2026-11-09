import { describe, expect, it } from "vitest";
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EXTERNAL_ID_LENGTH,
  MAX_IMPORT_ROWS,
  peopleImportAuditMeta,
  planPeopleImport,
} from "../modules/identity/csv";

describe("people CSV import planner", () => {
  it("handles a BOM, CRLF, quoted commas and newlines, and escaped quotes", () => {
    const csv =
      "\uFEFFname,external_id\r\n" +
      "\"Cruz, Alex\",EMP-1\r\n" +
      "\"Line\nBreak\",EMP-2\r\n" +
      "\"Quote \"\"Q\"\"\",EMP-3\r\n";

    const plan = planPeopleImport({ csv });

    expect(plan.errors).toEqual([]);
    expect(plan.skipped).toBe(0);
    expect(plan.rows).toEqual([
      { row: 2, displayName: "Cruz, Alex", externalId: "EMP-1" },
      // The embedded newline advances the physical line, so the next row is 5.
      { row: 3, displayName: "Line\nBreak", externalId: "EMP-2" },
      { row: 5, displayName: "Quote \"Q\"", externalId: "EMP-3" },
    ]);
  });

  it("accepts LF-only files and trims surrounding whitespace", () => {
    const plan = planPeopleImport({ csv: "name,external_id\n  Alex Cruz  , EMP-9 \n" });

    expect(plan.rows).toEqual([{ row: 2, displayName: "Alex Cruz", externalId: "EMP-9" }]);
  });

  it("accepts header aliases, including spaced and capitalized headers", () => {
    expect(planPeopleImport({ csv: "display_name,staff_id\nAlex,EMP-1\n" }).rows).toEqual([
      { row: 2, displayName: "Alex", externalId: "EMP-1" },
    ]);
    expect(planPeopleImport({ csv: "Full Name,Staff ID\nBea,EMP-2\n" }).rows).toEqual([
      { row: 2, displayName: "Bea", externalId: "EMP-2" },
    ]);
    expect(planPeopleImport({ csv: "full_name,id\nCasey,EMP-3\n" }).rows).toEqual([
      { row: 2, displayName: "Casey", externalId: "EMP-3" },
    ]);
  });

  it("requires a name header", () => {
    const plan = planPeopleImport({ csv: "external_id\nEMP-1\n" });

    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toBe(0);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].row).toBe(1);
    expect(plan.errors[0].message).toMatch(/name column/i);
  });

  it("rejects blank and overlong names without blocking valid rows", () => {
    const exactLimitName = "y".repeat(MAX_DISPLAY_NAME_LENGTH);
    const csv = [
      "name,external_id",
      "Valid,EMP-1",
      ",EMP-2",
      "   ,EMP-3",
      `${"x".repeat(MAX_DISPLAY_NAME_LENGTH + 1)},EMP-4`,
      `${exactLimitName},EMP-5`,
    ].join("\n");

    const plan = planPeopleImport({ csv });

    expect(plan.rows.map((row) => [row.row, row.displayName])).toEqual([
      [2, "Valid"],
      [6, exactLimitName],
    ]);
    expect(plan.errors.map((error) => error.row)).toEqual([3, 4, 5]);
    expect(plan.errors[0].message).toMatch(/required/i);
    expect(plan.errors[1].message).toMatch(/required/i);
    expect(plan.errors[2].message).toMatch(new RegExp(String(MAX_DISPLAY_NAME_LENGTH)));
  });

  it("rejects an overlong external id but accepts the exact limit", () => {
    const exactLimitId = "E".repeat(MAX_EXTERNAL_ID_LENGTH);
    const csv = [
      "name,external_id",
      "Good,EMP-1",
      `Long,${"E".repeat(MAX_EXTERNAL_ID_LENGTH + 1)}`,
      `Exact,${exactLimitId}`,
    ].join("\n");

    const plan = planPeopleImport({ csv });

    expect(plan.rows.map((row) => [row.row, row.externalId])).toEqual([
      [2, "EMP-1"],
      [4, exactLimitId],
    ]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].row).toBe(3);
    expect(plan.errors[0].message).toMatch(new RegExp(String(MAX_EXTERNAL_ID_LENGTH)));
  });

  it("reviews at most the row cap and reports where review stopped", () => {
    const lines = ["name,external_id"];
    for (let index = 1; index <= MAX_IMPORT_ROWS + 5; index += 1) {
      lines.push(`Person ${index},EMP-${index}`);
    }

    const plan = planPeopleImport({ csv: lines.join("\n") });

    expect(plan.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(plan.rows[MAX_IMPORT_ROWS - 1].displayName).toBe(`Person ${MAX_IMPORT_ROWS}`);
    expect(plan.errors).toHaveLength(1);
    // Header is line 1; the first unreviewed data row is line MAX_IMPORT_ROWS + 2.
    expect(plan.errors[0].row).toBe(MAX_IMPORT_ROWS + 2);
    expect(plan.errors[0].message).toMatch(new RegExp(String(MAX_IMPORT_ROWS)));
  });

  it("skips existing and repeated external ids while allowing duplicate names", () => {
    const csv = [
      "name,external_id",
      "Alex,EMP-1", // already in the organization
      "Alex,EMP-2", // same name, new id: allowed
      "Alex,EMP-2", // repeated id: skipped
      "Alex,",      // no id, duplicate name: allowed
      "Alex,",      // no id, duplicate name: allowed
      "Bea,EMP-3",
    ].join("\n");

    const plan = planPeopleImport({ csv, existingExternalIds: ["EMP-1"] });

    expect(plan.rows).toEqual([
      { row: 3, displayName: "Alex", externalId: "EMP-2" },
      { row: 5, displayName: "Alex" },
      { row: 6, displayName: "Alex" },
      { row: 7, displayName: "Bea", externalId: "EMP-3" },
    ]);
    expect(plan.skipped).toBe(2);
    expect(plan.errors).toEqual([]);
  });

  it("does not reserve an external id for an invalid row", () => {
    const plan = planPeopleImport({ csv: "name,external_id\n,EMP-1\nAlex,EMP-1\n" });

    expect(plan.rows).toEqual([{ row: 3, displayName: "Alex", externalId: "EMP-1" }]);
    expect(plan.errors.map((error) => error.row)).toEqual([2]);
    expect(plan.skipped).toBe(0);
  });

  it("keeps valid rows and reports row-numbered errors for partial success", () => {
    const csv = [
      "name,external_id",
      "Good,EMP-1",
      ",EMP-2",
      "Also good,EMP-3",
      `${"x".repeat(MAX_DISPLAY_NAME_LENGTH + 1)},EMP-4`,
      "Last,EMP-1", // duplicate of the accepted row, so skipped
    ].join("\n");

    const plan = planPeopleImport({ csv });

    expect(plan.rows).toEqual([
      { row: 2, displayName: "Good", externalId: "EMP-1" },
      { row: 4, displayName: "Also good", externalId: "EMP-3" },
    ]);
    expect(plan.errors.map((error) => error.row)).toEqual([3, 5]);
    expect(plan.skipped).toBe(1);
    expect(peopleImportAuditMeta(plan)).toEqual({ created: 2, skipped: 1, invalid: 2 });
  });

  it("reports an empty file and accepts a header-only file", () => {
    const empty = planPeopleImport({ csv: "\r\n   \r\n" });
    expect(empty.rows).toEqual([]);
    expect(empty.errors).toHaveLength(1);
    expect(empty.errors[0].row).toBe(1);
    expect(empty.errors[0].message).toMatch(/empty/i);

    expect(planPeopleImport({ csv: "name\n" })).toEqual({ rows: [], skipped: 0, errors: [] });
  });

  it("produces counts-only audit metadata with no CSV or name content", () => {
    const secretName = "Zephyr Distinctive Surname";
    const secretExternalId = "PRIVATE-9384";
    const csv = [
      "name,external_id",
      `${secretName},${secretExternalId}`,
      `,${secretExternalId}`,
      "Zephyr,PRIVATE-9384-COPY",
    ].join("\n");

    const plan = planPeopleImport({ csv, existingExternalIds: ["PRIVATE-9384-COPY"] });
    const meta = peopleImportAuditMeta(plan);

    expect(meta).toEqual({ created: 1, skipped: 1, invalid: 1 });
    expect(Object.keys(meta).sort()).toEqual(["created", "invalid", "skipped"]);

    const auditText = JSON.stringify(meta);
    expect(auditText).not.toContain("Zephyr");
    expect(auditText).not.toContain("PRIVATE");
    expect(auditText).not.toContain("name");

    // Row errors are numbers plus fixed messages; they never echo cell values.
    const errorText = JSON.stringify(plan.errors);
    expect(errorText).not.toContain("Zephyr");
    expect(errorText).not.toContain("PRIVATE");
  });
});
