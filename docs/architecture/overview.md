# Prism Pass — Architecture Overview (Phase 0)

> Status: Phase 0 specification. Source of truth for all agents before Phase 1 implementation.
> Principle: Unified attendance + verification platform, not separate event/OJT apps.

## 1. Product thesis

Prism Pass is a **multi-tenant SaaS** for verifiable attendance, identity, and institutional document workflows.

Differentiators:
1. Multi-organization attendance (events, OJT, classes, shifts, visitors).
2. Verifiable attendance (QR credential + timestamps + geo + device + tamper-evident log).
3. Digital approvals/signatures (timesheets, certifications, completion docs).
4. Offline-first scanning with controlled sync.
5. SaaS control plane (provisioning, memberships, entitlements, platform oversight).

A QR scan **is not** validity, approval, or certification. Those are separate decisions.

## 2. Domain separation

| Concept | Question | Owned by |
|---|---|---|
| Identity | Who is this person? | `people` + `users` |
| Credential | How do they prove it at a checkpoint? | `passes` |
| Attendance | What happened, when, where? | `attendance_events` → `attendance_records` |
| Workflow | Who reviews/approves/signs? | `signature_requests`, policies |
| Evidence | What supports the record? | geo, device, audit, hashes |
| Organization | Who owns / may access it? | `organizations` + `memberships` |

Flow: `Identity → Credential → Attendance Event → Policy Evaluation → Record → Workflow/Approval → Sealed Document`.

## 3. Consoles

### Prism Platform Console (Syntaxure Labs only)
- Tenant provisioning / suspension / retirement.
- Plans, entitlements, feature flags, global config.
- Usage, health, operational monitoring.
- Platform admins, access grants.
- Audit exploration, incident response.
- Tenant support incl. controlled read-only impersonation (audited, time-boxed).

### Organization Console (per tenant)
- Profile, branding, campuses/branches, departments, programs.
- Members + roles, people directory, QR credentials.
- Attendance policies, geofences, sessions/events/shifts/schedules.
- Signature + approval workflows.
- Analytics, reports, exports.

Rule: organization OWNER/ADMIN **never** implies platform privilege.

### Member / Scanner surfaces
- `(member)`: own pass, attendance history, documents to sign.
- `(scanner)`: scoped check-in/out, kiosk mode, offline queue. No admin queries.

## 4. Modular monolith map

```
prism-pass/
├── apps/web/                  # Next.js App Router (single deployable)
│   ├── app/
│   │   ├── (platform)/        # platform console
│   │   ├── (organization)/    # tenant admin
│   │   ├── (member)/          # member portal
│   │   ├── (scanner)/         # scanner/kiosk PWA
│   │   └── api/v1/            # REST, thin adapters → services
│   ├── modules/               # per-capability: types, zod, service, actions, tests
│   │   ├── identity/ organizations/ memberships/ passes/
│   │   ├── attendance/ geolocation/ signatures/ documents/
│   │   ├── offline/ analytics/ billing/
│   └── lib/auth.ts tenant.ts audit.ts
├── packages/
│   ├── database/ (Prisma + RLS) / authorization/ / contracts/
│   ├── attendance-domain/ / cryptography/ / offline-protocol/ / pdf/ / config/ / ui/
├── supabase/migrations/ policies/ seed/
├── docs/architecture/ decisions/ security/ api/ data-model/ operations/ roadmap/
```

Rules:
- Frontend modules **never** import DB clients directly.
- All mutations go through `requireOrganizationPermission(permission)` → service.
- Shared schema / permission semantics change only via ADR + architecture-lead review.

Conceptual service call:

```ts
const ctx = await requireOrganizationPermission("attendance.scan");
return attendanceService.recordScan({
  organizationId: ctx.organizationId, // from verified membership, NOT body
  actorId: ctx.userId,
  credentialId, sessionId, idempotencyKey, geo, deviceId,
});
```

## 5. Non-goals for Phase 0
No Next.js code, no migrations, no RLS SQL, no PWA implementation, no billing integration. Spec only.
See `docs/roadmap/phases-gates.md` for gates and `docs/decisions/` for locked ADRs.
