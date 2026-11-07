# ADR-12 — Modular monolith first

Status: Accepted. Single Next.js deployable, capability modules, shared packages. No microservices until async jobs (PDF/exports/sync) demand a worker. Strict module boundaries + `requireOrganizationPermission()` gate. Refs: overview.md, contracts-v1.md.
