# Reports module (P7)

Pure, server-side building blocks for the DTR export and record approvals. Each
file is independently importable; there is no barrel that pulls `node:crypto`
into a client bundle.

| File | Responsibility |
|---|---|
| `dtr.ts` | Aggregates attendance records/events into one row per person per local day. |
| `csv.ts` | RFC 4180 serialization + spreadsheet formula-injection guard. |
| `range.ts` | Calendar-date range validation (92-day DTR cap, 366-day audit cap). |
| `masking.ts` | VIEWER PII minimization (initials + salted external-id hash). |
| `approval.ts` | Record-level approval state transition. |

## DTR aggregation decisions

- **Shift date, not scan date.** A record belongs to the local date on which its
  session starts. A 22:00–06:00 shift is one row on the start date, not two
  partial rows. Sessions that cross local midnight get an `overnight` flag.
- **One row per person per day.** First-in is the earliest check-in, last-out the
  latest check-out, and `minutes` is the sum of each record's reconciled
  `durationMin` (falling back to `lastOut − firstIn` only when the record has no
  duration). Multiple sessions in a day therefore add up.
- **Server time is authoritative.** Event instants use `serverTs`, falling back to
  `clientTs`. Client clocks are untrusted and offline events can sync later.
- **Record event ids first.** `checkInEventId` / `checkOutEventId` are canonical;
  a scan-type fallback by `(sessionId, personId)` covers stale records. This
  keeps manual adjustments and imported/offline events visible.
- **Exception flags** are the union of the record's existing lowercase flags plus
  derived `missing_check_out` and `overnight`.
- **Status rollup:** all `EXCUSED` → `EXCUSED`; any missing check-out or
  `PARTIAL` → `PARTIAL`; no check-in → `ABSENT`; any `LATE` → `LATE`; else
  `PRESENT`. Approval rollup reports a single value, or the most significant of
  `REJECTED` > `PENDING` > `APPROVED` > `MIXED`.
- Timezone formatting uses `Intl` with the organization's IANA zone. An invalid
  zone falls back to UTC, never to the server's zone.

## CSV decisions

- Records are CRLF-terminated (including the last one) per RFC 4180.
- Fields containing `"`, `,`, CR or LF are quoted and embedded quotes doubled.
- Text cells whose first non-space character is `=`, `+`, `-` or `@` are prefixed
  with `'` to prevent formula execution in Excel/LibreOffice/Sheets. Numeric
  values are written as numbers and are not guarded (`-5` stays `-5`).
- The export contains no email column; `Person` has no email field.

## Masking decisions (VIEWER)

`reports.export` is not granted to VIEWER by default. If an override grants it,
the export is still masked because the role — not the endpoint — is the policy
boundary:

- `displayName` → uppercase initials (`Maria Clara Santos` → `M.C.S.`). The raw
  name string never reaches the CSV.
- `externalId` → `ext_` + first 12 hex chars of
  `sha256("<organizationId>\0<externalId>")`. Stable within an organization,
  not reversible from a short student/employee number without the salt.
- OWNER/ADMIN/MANAGER/SUPERVISOR/SCANNER/MEMBER exports remain unmasked, since
  the route has already checked `reports.export`.
