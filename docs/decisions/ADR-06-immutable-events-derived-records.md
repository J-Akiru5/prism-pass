# ADR-06 — Immutable events, derived records

Status: Accepted. `attendance_events` append-only (incl. offline receipt, duplicates); `attendance_records` reconciled view. No silent overwrites; corrections are new events. Idempotency + txn pairing + UTC storage. Refs: attendance-state-machine.md.
