// RFC 4180 CSV serialization with a spreadsheet formula-injection guard.

import type { DtrRow } from "./dtr";

export const DTR_CSV_HEADER = [
  "Date",
  "Person",
  "External ID",
  "First in",
  "Last out",
  "Minutes",
  "Status",
  "Approval",
  "Exceptions",
] as const;

// A leading =, +, -, @ (optionally after spaces/tabs) is interpreted as a formula
// by Excel/LibreOffice/Sheets. Prefix an apostrophe so the cell is inert text.
const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * Serialize one CSV cell.
 *
 * - null/undefined → empty cell
 * - finite numbers → unquoted decimal text (negative numbers stay numeric)
 * - text → formula guard, then RFC 4180 quoting/escaping when needed
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (NEEDS_QUOTES.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** RFC 4180 records: comma-separated, CRLF-terminated (including the last row). */
export function serializeCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [header.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function dtrRowToCsvCells(row: DtrRow): unknown[] {
  return [
    row.date,
    row.displayName,
    row.externalId ?? "",
    row.firstInLocal ?? "",
    row.lastOutLocal ?? "",
    row.minutes,
    row.status,
    row.approvalStatus,
    row.exceptionFlags.join("; "),
  ];
}

export function dtrToCsv(rows: readonly DtrRow[]): string {
  return serializeCsv(DTR_CSV_HEADER, rows.map(dtrRowToCsvCells));
}
