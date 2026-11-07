# Tenant Isolation (Phase 0 — normative)

## 1. Rule
Every server operation derives organization access from **verified session + membership lookup**. The browser never declares its own authority.

## 2. Access sequence (mandatory)

```
Request
 ↓ Verify Supabase Auth session (server, @supabase/ssr)
 ↓ Resolve internal users.id via authId
 ↓ Resolve requested organizationId (route param / selected context, validated)
 ↓ Verify membership: status=ACTIVE, organization.status=ACTIVE
 ↓ Resolve role defaults + membership_permissions overrides (this org only)
 ↓ Check organization status + feature entitlement (subscription)
 ↓ Validate resource ownership (all FKs same organizationId, composite checks)
 ↓ Perform operation (RLS-enforced query)
 ↓ Write audit_logs event
```

Deny closed: revoked membership, suspended / pending_deletion org, missing entitlement, cross-org FK → `403 + audit denied`.

## 3. Scoping rules (adopted from OptiFeed, hardened)

- Resolve permissions in **explicitly selected organization context**. Never union permissions across memberships. A Manager in Org A is not a Manager in Org B.
- No legacy global-role fallback. `membership` is sole tenant authority.
- Every tenant-owned row has non-null `organizationId`.
- Every join validates same-org: `(organizationId, resourceId)` composite FKs or transactional assertion.
- Composite uniques: `(organizationId, passPublicId)`, `(organizationId, idempotencyKey)`, `(organizationId, sessionId, personId)`, etc.
- Selecting org context: server sets `current_org` from verified membership only; never trust `X-Org-Id` header alone without membership check.

## 4. Database enforcement (Phase 1)

- PostgreSQL RLS on all tenant tables: `USING (organization_id = current_setting('app.org_id', true)::text)` + membership check via security-definer resolver, NOT a freely user-set variable as proof.
- Transaction pattern: `BEGIN; SELECT authorize(org, user, perm); SET LOCAL app.org_id; ... COMMIT`.
- Service-role key: server-only, wrapped in platform authorization (`platform_admins` table, Phase 1). Never shipped to browser / scanner PWA.
- Platform audit log immutable (no UPDATE/DELETE grants).

## 5. Test gate (required before Phase 1 exit)

Seed Org A + Org B with distinct users, people, passes, sessions, documents.
Attempt cross-tenant: read, update, delete, export, document download, pass lookup, offline sync batch replay. **All must fail with 403 + audit**. Include:
- Revoked member replaying old token.
- Suspended org member attempting write.
- Scanner from Org A scanning Org B pass.
- Direct `api/v1` org-id tampering.
