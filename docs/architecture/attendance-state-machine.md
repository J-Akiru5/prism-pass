# Attendance State Machine (Phase 0 — normative)

## 1. Two-tier model

- `attendance_events`: append-only attempts/facts. Never updated. Corrections = new events.
- `attendance_records`: reconciled view per `(organizationId, sessionId, personId)`. Derived transactionally from events.

## 2. Event types
`SCAN → CHECK_IN | CHECK_OUT | OFFLINE_RECEIVED | MANUAL_ADJUST | APPROVED | REJECTED | DUPLICATE_DETECTED`

Statuses: `accepted | flagged | duplicate | revoked | conflict`.

## 3. Reconciliation rules

- Pair check-in/out by session window + policy `duplicateWindowSec` (default 120s dedupe on same credential+session+idempotency).
- Late = check-in after `startsAt + graceMin`; `lateThresholdMin` → `LATE` vs `PRESENT`.
- Impossible checkout-before-checkin without `MANUAL_EXCEPTION` (requires `attendance.override` + reason + audit).
- Idempotency: `(organizationId, idempotencyKey)` unique; replay returns original result, no second record.
- Concurrency: `INSERT ... ON CONFLICT (org, session, person) DO UPDATE` inside serializable txn; race-safe creation.
- Time: store UTC `clientTs` + `serverTs`; evaluate against session `timezone` (historical preserved).
- Credential check at reconcile: pass `revoked|expired` → event `revoked`, record flagged, never silently accepted.
- Geo/policy evaluation feeds `exceptionFlags[]` (e.g. `geo_outside`, `low_accuracy`, `offline_provisional`, `duplicate`).

## 4. Session types (one engine, policy-configured)

| Type | Policy example |
|---|---|
| EVENT | one check-in per event |
| OJT | AM + PM blocks, timesheet link |
| SHIFT | shift check-in/out, overtime flag |
| CLASS | per-subject session |
| VISITOR | time-limited entry/exit |
| TRAINING | multi-session completion |

Policy fields: grace, late threshold, duplicate window, geo mode (`enforce|flag|off`), authorized scanners/devices, required evidence, approval steps.

## 5. Record lifecycle
`NONE → PENDING (if approvalSteps) → APPROVED | REJECTED`, plus `status: PRESENT|LATE|ABSENT|EXCUSED|PARTIAL`.

Manual adjustments require `attendance.override`, reason, and link to superseding event — original events retained.
