# ADR-14 — One stable identity QR, event-scoped access grants

Status: Proposed. Every account has exactly one identity credential
(`PRISMID1:<publicId>:<secret>`), stable across tenants and events. The QR is an
identifier, not an authorization: a scan resolves the person, then the server
checks an event access grant or DTR eligibility. Event access is granted
separately and expires:

- immediately when the event is closed or cancelled;
- 24 hours after `ends_at` when the event ended but was never closed;
- immediately on credential revoke/reissue or grant revoke.

This intentionally changes the current org-scoped pass model. The existing
`PRISM1` pass remains accepted during migration; no new legacy passes are issued
once identity credentials are live. A static bearer QR has a larger blast radius
than a per-event credential, so deployment requires photo/name display on the
scanner, duplicate/cross-location anomaly detection, revocation and reissue, rate
limits, and device/geo evidence for self check-in.

Rejected alternatives: per-event rotating QR (the user explicitly wants one QR);
embedding event authorization in the QR (cannot expire or revoke per event);
keeping org-scoped passes as the primary identity (does not work across events).

Refs: [rbac-ssot.md](../security/rbac-ssot.md), ADR-07, ADR-11.
