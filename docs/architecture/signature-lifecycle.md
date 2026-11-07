# E-Signature Lifecycle (Phase 0 — normative)

Workflow: `prepare → assign order → authenticate → review+consent → capture → seal → verify`.

1. **Prepare**: authorized `documents.manage` creates doc from controlled template (timesheet, attendance cert, completion, approval form). Version `v1`, stored in private bucket; DB holds `sha256 + storageRef`.
2. **Assign**: `signature_requests.order` = [{person/user, role, order}]. Expiry set.
3. **Authenticate**: signer must have active membership + pass `documents.sign` (own). Step-up: re-auth / OTP per org policy. Record `authEvidence`.
4. **Review+consent**: signer views exact bytes + consent text version; explicit "I intend to sign" checkbox.
5. **Capture**: drawn / typed / credential per org policy. Image ≠ certificate.
6. **Seal (server-only)**: compute SHA-256, append `signature_events{docVersion, docHash, method, consentVersion, serverTs, authEvidence, deviceId, prevHash→currHash}`. Finalize PDF. Never overwrite sealed doc — corrections = new version or supersede/revoke event.
7. **Verify**: public QR/link reveals minimum: doc title, status, signer role/org, sealed timestamp, hash match. No attendance history. Privacy-gated.

Event fields (all required): signer identity + userId, orgId, docId, docVersion, SHA-256, method, consentVersion, serverTs (server-issued), artifact ref, auth/step-up record, origin/device, geo (optional, consented), prevHash/currHash chain.

Legal note: distinguish (a) electronic signature (intent manifestation), (b) authentication evidence, (c) integrity proof, (d) certificate-backed digital signature (separate tier). Design with PH RA 8792 (E-Commerce Act) + RA 10173 (Data Privacy Act) in mind; validate enforceability with counsel. Do not market drawn signatures as qualified/certified.

Offline: draft + consent evidence may be captured offline; **final seal requires online server** (see offline-sync-protocol).
