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

## Scoped reads (P7)

`modules/reports/scope.ts` is the single pure policy for "which people may this
caller read?" applied to `GET /reports/dtr` and `GET /records`:

| Role | People visible | Masking |
|---|---|---|
| OWNER, ADMIN | All people in the org. | None. |
| MANAGER, SUPERVISOR | People with an active `person_assignments` row in a program the caller is also actively assigned to. A manager with no program assignment sees no rows. | None. |
| MEMBER, SCANNER | Only the caller's own `people` row (via `Person.userId`). | None. |
| VIEWER | Org-wide **only** when `reports.export` was explicitly granted (role default is empty, so this means an allow override). | Always masked (initials + salted external-id pseudonym). |

`GET /audit` stays org-wide: it requires `organization.manage`, held only by
OWNER/ADMIN (both org-wide above), and `audit_logs` has no `personId` column to
scope on.

**Known limitation:** the schema has no supervisor/mentor link on
`person_assignments`; only `personId`, `programId`, `role` (free text) and the
validity window exist. Scope is therefore program-wide, not per-mentee. A
manager co-assigned to a program sees every active member of that program,
including peers. Adding a `supervisor_person_id` column would allow per-person
delegation without changing this policy's interface.
