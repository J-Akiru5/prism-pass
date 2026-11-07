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
