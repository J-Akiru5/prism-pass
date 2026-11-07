# Geo-Verification (Phase 0 — normative)

## 1. Evidence per event
`lat, lng, accuracyM, capturedAt, geofenceId?, geoResult, policyVersion`. Accuracy in meters from OS. Both client + server timestamps retained.

## 2. Geofence v1: circular
`{centerLat, centerLng, radiusM, label, campusId?}`. Default e.g. 100m configurable. Distance computed server-side with PostGIS (`ST_DWithin`) — never trust browser boolean.

## 3. Policy outcomes (explicit, stored)
- `VERIFIED`: accuracy acceptable + inside boundary.
- `NEEDS_REVIEW`: approximate/unavailable/denied permission → flag, allow with review.
- `OUTSIDE_BOUNDARY`: reliable coords outside → per policy `enforce` (reject) or `flag` (accept+flag).
- `MANUAL_EXCEPTION`: supervisor override with reason (`attendance.override`).
- `NOT_CAPTURED`: no location; never auto-reject — route to review.

## 4. Fallbacks & privacy
Denied permission / indoor / poor GPS → NEEDS_REVIEW path, alternative evidence (supervisor attest, kiosk). Collect only at attendance actions, show purpose, retention per `organization_settings.retentionDays`. No background tracking. Map review in org console only.

## 5. Anti-spoof (Phase 1+ tests)
Record accuracy, mock-location flag where available, drift vs last known, impossible-travel heuristic → flag, not silent reject.

## 6. Server evaluation (P4 implementation)
Normative for `modules/geo/evaluate.ts`; the client never supplies an "inside" boolean.

- `AttendancePolicy.geoMode` is exactly `off` | `flag` | `enforce` (unknown values fail safe as `flag`).
- Precedence:
  1. `off` → `NOT_CAPTURED` (verification disabled; location may still be stored).
  2. Missing/invalid coordinates → `NOT_CAPTURED`; never auto-rejected.
  3. No geofences configured → `NEEDS_REVIEW`; **never rejected**, even under `enforce`.
  4. Accuracy missing or worse than 100 m → `NEEDS_REVIEW` (approximate evidence).
  5. Inside any circular fence (distance ≤ radius) → `VERIFIED`, closest containing fence recorded.
  6. Outside all fences → `OUTSIDE_BOUNDARY`.
- Under `enforce`, only a reliable `OUTSIDE_BOUNDARY` scan is rejected: `422 GEO_OUTSIDE`, a `REJECTED` event with the geo evidence, and an audit row (`result=geo_outside`). The attendance record is untouched.
- Under `flag`, an out-of-fence scan is accepted and flagged via `geoResult`.
- Duplicate-window scans persist geo evidence but are never geo-rejected; they do not alter the attendance record.
- The closest containing fence (`attendance_events.geofence_id`) is stored as per-event evidence.
