# Permission Matrix (Phase 0 — normative)

Role defaults. Overrides in `membership_permissions` apply **only inside that membership**.

| Capability | OWNER | ADMIN | MANAGER | SUPERVISOR | SCANNER | MEMBER | VIEWER |
|---|---|---|---|---|---|---|---|
| organization.manage | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| members.manage | ✅ | ✅ | scoped* | ❌ | ❌ | ❌ | ❌ |
| passes.issue/revoke (`passes.revoke`) | ✅ | ✅ | ✅ scoped | ❌ | ❌ | ❌ | ❌ |
| attendance.scan | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| attendance.override (manual adjust) | ✅ | ✅ | ✅ scoped + reason | ✅ + reason | ❌ | ❌ | ❌ |
| attendance.approve | ✅ | ✅ | ✅ scoped | ✅ | ❌ | ❌ | ❌ |
| documents.manage (template/create) | ✅ | ✅ | ✅ scoped | ❌ | ❌ | ❌ | ❌ |
| documents.sign | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ own | ❌ |
| reports.export | ✅ | ✅ | ✅ scoped | ✅ | ❌ | own | ✅ read-only** |
| geofences.manage | ✅ | ✅ | ✅ scoped | ❌ | ❌ | ❌ | ❌ |
| devices.manage | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

*scoped = only within assigned campus/department/program/session (enforced via assignment table, Phase 1).
**VIEWER cannot export PII bulk; masked summary only unless `reports.export` explicitly granted.

Permissions list (canonical strings): `organization.manage, members.manage, passes.revoke, attendance.scan, attendance.override, attendance.approve, documents.sign, documents.manage, reports.export, geofences.manage, devices.manage`.

Rules:
- `requireOrganizationPermission("attendance.scan")` resolves role default ∪ overrides for **current org only**.
- Overrides are allow/deny rows; deny wins. Admin cannot escalate beyond own grant (cannot grant `organization.manage` unless OWNER).
- No cross-org aggregation. Switching org requires fresh resolution.
- Every denial writes `audit_logs(result=denied)`.
