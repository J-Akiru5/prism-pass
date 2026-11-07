# ADR-02 — Shared DB, shared schema, tenant discriminator

Status: Accepted. Decision: one Supabase Postgres, every tenant row carries non-null `organizationId`; composite uniques/FKs per org. Rejected: DB-per-tenant / schema-per-tenant (ops cost). Requires RLS + server authz (ADR-05) and A/B isolation test. Refs: erd.md, tenancy-isolation.md.
