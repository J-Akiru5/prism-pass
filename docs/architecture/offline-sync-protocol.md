# Offline Sync Protocol (Phase 0 — normative)

Principle: **offline capture is possible; offline certainty is not.** Offline scans are `provisional` until server reconciliation.

## 1. Prepare (online)
Scanner device registered (`devices`: org-scoped `devicePublicId + keyRef`). Download scoped bundle: session config + policy version + geofences + scanner credential + **bounded signed pass cache** `{passPublicId, passVersion, statusAtSync, expiresAt, signature}`. Short-lived, least-privilege.

## 2. Capture (offline)
Scan QR → check cached credential (valid/version/expiry) → collect device evidence (clientTs, geo, deviceId) → sign locally (device key where available) → append IndexedDB queue with stable UUID `idempotencyKey`. Queue encrypted at rest where practical. Never hold service-role key.

## 3. Sync (reconnect)
`POST /api/v1/sync/batches {batchId, deviceId, events[]}` → server: verify device+org, signature check, credential **revalidation** (revoked since sync?), policy version check, idempotent insert (`ON CONFLICT (org, idempotencyKey) DO NOTHING`), reconcile to records → statuses `accepted|flagged|duplicate|revoked|conflict`. Returns per-event receipts. Partial batches resumable; `offline_sync_batches` tracks accepted/rejected.

## 4. Security
- Device registration + scoped sessions only.
- Signed credentials, not raw QR trust; stale cache → `provisional` + `offline_provisional` flag.
- Idempotent UUIDs; replay cannot duplicate.
- Server-side conflict resolution (event IDs, policy version, credential state, timestamps, dedupe window). Never blind overwrite.
- Clock-tamper: store `clientTs, serverTs, lastTrustedSync, driftEstimate`; server time authoritative for lateness.

## 5. Signing offline
Final legal seal **online only**. Offline may capture draft intent + consent evidence; seal on reconnect.

## 6. Exit demo (Phase 6)
Disconnected session → reconnect → safe sync; duplicate/replay + stale-credential + clock-drift + partial-batch cases covered.
