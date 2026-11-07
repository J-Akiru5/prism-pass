# ADR-04 — Membership is sole tenant authority

Status: Accepted. No legacy global role fallback. Permissions resolve per selected org from role defaults + `membership_permissions`. No cross-org union. Revoked/suspended → deny + audit. Refs: permission-matrix.md, tenancy-isolation.md.
