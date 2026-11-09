# ADR-11 — Separate platform administration

Status: Accepted. Platform console (Syntaxure) isolated from org consoles. Org OWNER never grants platform rights. Platform actions use separate `platform_admins` + immutable platform audit + audited break-glass impersonation. Refs: overview.md, tenancy-isolation.md. Platform role model: [ADR-13](ADR-13-platform-rbac.md).
