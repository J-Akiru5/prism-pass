# Roadmap & Gates (Phase 0 — normative)

## Phase exits
- **P0 Spec (this)**: all docs below approved; ERD + matrix + state machines + protocols + API + ADRs consistent.
- **P1 SaaS foundation**: fresh repo, CI/CD, Supabase Auth, Prisma, orgs/memberships/permissions, platform admin, tenant resolver, RLS. Exit: Org A/B zero cross-access; suspension/revocation works.
- **P2 Identity/passes**: people directory, issuance, verification, revocation/rotation, printable IDs. Exit: revoked/expired rejected.
- **P3 Attendance engine**: policies, sessions, in/out, events/OJT/shifts, manual corrections, history+audit. Exit: one engine serves all workflows.
- **P4 Geo**: geofence admin, capture, PostGIS validation, exceptions, map review. Exit: accept/reject/review policy-tested.
- **P5 Docs/e-sign**: templates, order, auth, versioning, hashes, chain, PDF, privacy-safe verify. Exit: multi-party verifiable sealed doc.
- **P6 Offline**: device reg, provisioning, IndexedDB queue, device signing, batch sync, idempotency, conflict review. Exit: disconnected→sync with no dup corruption.
- **P7 Org workflows**: internship/DTR review, certs, leave, events, approvals, reports/exports, dashboards. Exit: CICT-QR + OJT workflows via modules.
- **P8 SaaS ops**: plans, entitlements, metering, billing, lifecycle, export/retention, support console, monitoring. Exit: provision/suspend/reactivate/export/retire safely.
- **P9 Hardening/launch**: security+load+pentest, backup/restore drill, a11y, compat, privacy+legal, pilot sign-off.

Dependency: Tenancy → Identity → Attendance → Geo → Docs → Offline → Workflows → Commercialization. No signatures/scanner UI before P1–P3 contracts stable.

## MVP (first pilot)
Must: org create/manage, membership+RBAC, people+QR passes, QR in/out, events+OJT, policies, basic geofence, audit trail, DTR+CSV/PDF, responsive org/member dashboards.
Later: offline sync (P6), e-sign/seal (P5), billing (P8), certificate-backed sigs, native scanner, gov-ID integrations.

## Quality gates (CI from first feature)
Formatting/lint, typecheck, unit, migration validation, RLS/isolation tests, API authz checks, secret/dep scan, build, Playwright critical (scan, pass revoke, seal+verify, sync replay, cross-tenant denial).
Perf budgets: scanner response, dashboard queries. Ops: backup/restore, migration safety, incident runbook. A11y: keyboard/contrast/SR/mobile. Privacy: minimization, access logs, retention/deletion.
