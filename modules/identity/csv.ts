// Pure RFC 4180 CSV parsing and people-import planning.
//
// The planner never touches the database: the route loads the organization's
// existing external ids, asks for a plan, and creates only the planned rows.
// Error messages describe the problem without echoing cell contents, and the
// audit helper returns counts alone, so no names or CSV text reach audit meta.

export const MAX_IMPORT_ROWS = 500;
export const MAX_DISPLAY_NAME_LENGTH = 120;
export const MAX_EXTERNAL_ID_LENGTH = 64;

export const NAME_HEADERS = ["name", "display_name", "full_name"] as const;
export const EXTERNAL_ID_HEADERS = ["external_id", "staff_id", "id"] as const;

export type ParsedCsvRecord = { cells: string[]; line: number };

export type PeopleImportRow = {
  /** Physical CSV line where the record starts (the header is line 1). */
  row: number;
  displayName: string;
  externalId?: string;
};

export type PeopleImportError = {
  row: number;
  message: string;
};

export type PeopleImportPlan = {
  rows: PeopleImportRow[];
  skipped: number;
  errors: PeopleImportError[];
};

export type PeopleImportCounts = {
  created: number;
  skipped: number;
  invalid: number;
};

export type PlanPeopleImportInput = {
  csv: string;
  existingExternalIds?: Iterable<string>;
};

/**
 * Parse RFC 4180 CSV text.
 *
 * Handles a leading BOM, CRLF/LF/lone-CR records, quoted fields containing
 * commas or newlines, and doubled quotes inside quoted fields. Parsing is
 * lenient: a quote inside an unquoted field is literal text, and an
 * unterminated quoted field ends at EOF instead of throwing. Blank records are
 * left for the planner to ignore.
 */
export function parseCsv(input: string): ParsedCsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: ParsedCsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let inQuotes = false;
  let i = 0;

  const endRecord = () => {
    cells.push(field);
    records.push({ cells, line: recordLine });
    cells = [];
    field = "";
    recordLine = line;
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
        continue;
      }
      if (ch === "\r") {
        if (text[i + 1] === "\n") {
          field += "\r\n";
          i += 2;
        } else {
          field += "\r";
          i += 1;
        }
        line += 1;
        continue;
      }
      if (ch === "\n") {
        field += "\n";
        line += 1;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === "\"" && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      cells.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += text[i + 1] === "\n" ? 2 : 1;
      line += 1;
      endRecord();
      continue;
    }
    if (ch === "\n") {
      i += 1;
      line += 1;
      endRecord();
      continue;
    }
    field += ch;
    i += 1;
  }

  // Flush the final record when the file does not end with a line break. An
  // unterminated quoted field is flushed as-is rather than rejected.
  if (field !== "" || cells.length > 0 || inQuotes) endRecord();

  return records;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isBlankRecord(record: ParsedCsvRecord): boolean {
  return record.cells.every((cell) => cell.trim() === "");
}

/**
 * Turn CSV text into a creation plan.
 *
 * - A name column (`name`, `display_name`, or `full_name`) is required.
 * - The external id column (`external_id`, `staff_id`, or `id`) is optional.
 * - Blank lines are ignored; blank or overlong names and overlong external ids
 *   become row-numbered errors and never block the valid rows around them.
 * - Duplicate external ids — already in the org or repeated in the file — are
 *   skipped. Duplicate display names are allowed on purpose.
 * - At most `MAX_IMPORT_ROWS` data rows are reviewed; one error marks the first
 *   row past the limit.
 */
export function planPeopleImport({ csv, existingExternalIds }: PlanPeopleImportInput): PeopleImportPlan {
  const records = parseCsv(csv).filter((record) => !isBlankRecord(record));
  if (records.length === 0) {
    return { rows: [], skipped: 0, errors: [{ row: 1, message: "CSV is empty." }] };
  }

  const header = records[0];
  const normalizedHeaders = header.cells.map(normalizeHeader);
  const nameIndex = normalizedHeaders.findIndex((value) =>
    (NAME_HEADERS as readonly string[]).includes(value),
  );
  const externalIdIndex = normalizedHeaders.findIndex((value) =>
    (EXTERNAL_ID_HEADERS as readonly string[]).includes(value),
  );

  if (nameIndex === -1) {
    return {
      rows: [],
      skipped: 0,
      errors: [{
        row: header.line,
        message: "Missing a name column. Use name, display_name, or full_name.",
      }],
    };
  }

  const existing = new Set<string>();
  if (existingExternalIds) {
    for (const id of existingExternalIds) existing.add(id);
  }

  const rows: PeopleImportRow[] = [];
  const errors: PeopleImportError[] = [];
  const seenExternalIds = new Set<string>();
  let skipped = 0;
  const dataRecords = records.slice(1);
  const reviewCount = Math.min(dataRecords.length, MAX_IMPORT_ROWS);

  for (let index = 0; index < reviewCount; index += 1) {
    const record = dataRecords[index];
    const displayName = (record.cells[nameIndex] ?? "").trim();
    const externalId = externalIdIndex === -1
      ? ""
      : (record.cells[externalIdIndex] ?? "").trim();

    if (!displayName) {
      errors.push({ row: record.line, message: "Display name is required." });
      continue;
    }
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      errors.push({
        row: record.line,
        message: `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
      });
      continue;
    }
    if (externalId.length > MAX_EXTERNAL_ID_LENGTH) {
      errors.push({
        row: record.line,
        message: `External ID must be ${MAX_EXTERNAL_ID_LENGTH} characters or fewer.`,
      });
      continue;
    }
    if (externalId && (existing.has(externalId) || seenExternalIds.has(externalId))) {
      // A repeated or already-known id is not an error; the person is skipped.
      skipped += 1;
      continue;
    }

    if (externalId) seenExternalIds.add(externalId);
    rows.push({
      row: record.line,
      displayName,
      ...(externalId ? { externalId } : {}),
    });
  }

  if (dataRecords.length > MAX_IMPORT_ROWS) {
    errors.push({
      row: dataRecords[MAX_IMPORT_ROWS].line,
      message: `CSV exceeds the ${MAX_IMPORT_ROWS}-row import limit; later rows were not imported.`,
    });
  }

  return { rows, skipped, errors };
}

/**
 * Counts-only summary, safe to store as audit metadata (no CSV text, names, or ids).
 */
export function peopleImportAuditMeta(plan: PeopleImportPlan): PeopleImportCounts {
  return {
    created: plan.rows.length,
    skipped: plan.skipped,
    invalid: plan.errors.length,
  };
}
