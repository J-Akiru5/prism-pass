# ADR-05 — RLS + server-side authorization mandatory

Status: Accepted. Both layers required: centralized `requireOrganizationPermission()` + Postgres RLS with txn-scoped org context. Service-role server-only behind platform auth. Never trust client org claim. Refs: tenancy-isolation.md.
