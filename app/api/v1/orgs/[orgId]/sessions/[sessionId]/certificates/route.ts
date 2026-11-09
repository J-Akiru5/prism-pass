import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { roleGrants, type Role } from "@/packages/authorization/permissions";
import {
  CERTIFICATE_CONSENT_VERSION,
  certificateBatchAuditMeta,
  certificateDedupeKey,
  certificateDocumentTitle,
  certificateRoleLabel,
  planCertificateBatch,
  previewCertificateBatch,
  type CertificateBatchCounts,
  type CertificateBatchRecipient,
  type CertificateGenerationRecord,
  type CertificateSignatoryInput,
} from "@/modules/certificates/generate";
import { isSupportedTimeZone, issueDateInTimeZone } from "@/modules/certificates/payload";
import { CERTIFICATE_TEMPLATE_KEY, certificatePayloadV1 } from "@/modules/certificates/schema";

type P = { params: Promise<{ orgId: string; sessionId: string }> };

// Keep these structurally identical to prisma/schema.prisma Document. The
// generated client now includes the M3 columns; no casts are needed.
type CertificateDocumentRow = {
  id: string;
  sourcePersonId: string | null;
  batchId: string | null;
  status: string;
  createdAt: Date;
};

type CertificateDocumentInsert = Prisma.DocumentCreateManyInput & {
  sourceSessionId: string;
  sourcePersonId: string;
  batchId: string;
};
const generateInput = z
  .object({
    // Internal User.id (membership.userId), never a Supabase auth id.
    signatoryUserId: z.string().trim().min(1).max(120),
    statement: z.string().trim().min(1).max(2_000).optional(),
    requireCheckOut: z.boolean().optional().default(false),
    requireApproval: z.boolean().optional().default(false),
    // Reuse the payload schema's calendar-date rule (real dates only).
    issuedOn: certificatePayloadV1.shape.issuedOn.optional(),
  })
  .strict();

const generateSessionSelect = {
  id: true,
  organizationId: true,
  title: true,
  type: true,
  startsAt: true,
  endsAt: true,
  timezone: true,
  status: true,
  organization: { select: { name: true } },
} as const;

async function loadSession(organizationId: string, sessionId: string) {
  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: generateSessionSelect,
  });
  if (!session || session.organizationId !== organizationId) return null;
  return session;
}

async function loadRecords(organizationId: string, sessionId: string): Promise<CertificateGenerationRecord[]> {
  const records = await prisma.attendanceRecord.findMany({
    where: { organizationId, sessionId },
    select: {
      sessionId: true,
      personId: true,
      checkInEventId: true,
      checkOutEventId: true,
      status: true,
      approvalStatus: true,
    },
    orderBy: { personId: "asc" },
  });
  if (records.length === 0) return [];

  const people = await prisma.person.findMany({
    where: { organizationId, id: { in: records.map((record) => record.personId) } },
    select: { id: true, displayName: true },
  });
  const names = new Map(people.map((person) => [person.id, person.displayName]));
  return records.map((record) => ({
    ...record,
    personDisplayName: names.get(record.personId) ?? "",
  }));
}

async function loadExistingDocuments(organizationId: string, sessionId: string): Promise<CertificateDocumentRow[]> {
  return prisma.document.findMany({
    where: {
      organizationId,
      sourceSessionId: sessionId,
      sourcePersonId: { not: null },
    },
    select: {
      id: true,
      sourcePersonId: true,
      batchId: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

function existingKeysOf(sessionId: string, documents: Array<{ sourcePersonId: string | null }>): string[] {
  const keys: string[] = [];
  for (const document of documents) {
    if (document.sourcePersonId !== null) {
      keys.push(certificateDedupeKey(sessionId, document.sourcePersonId));
    }
  }
  return keys;
}

function documentsByKeyOf<T extends { sourcePersonId: string | null }>(
  sessionId: string,
  documents: T[],
): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const document of documents) {
    if (document.sourcePersonId !== null) {
      byKey.set(certificateDedupeKey(sessionId, document.sourcePersonId), document);
    }
  }
  return byKey;
}

async function loadSignatory(
  organizationId: string,
  userId: string,
): Promise<(CertificateSignatoryInput & { allowed: boolean }) | null> {
  const membership = await prisma.membership.findFirst({
    where: { organizationId, userId, status: "ACTIVE" },
    select: {
      role: true,
      overrides: { where: { permission: "documents.sign" }, select: { allow: true } },
      user: {
        select: {
          peopleLinks: {
            where: { organizationId },
            select: { id: true, displayName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      },
    },
  });
  if (!membership) return null;

  const override = membership.overrides[0];
  const allowed = override ? override.allow : roleGrants(membership.role as Role, "documents.sign");
  const person = membership.user.peopleLinks[0];
  const displayName = person?.displayName?.trim();

  return {
    userId,
    personId: person?.id ?? null,
    // Never put an email in the signed payload: the certificate prints a human
    // name or a neutral role label, and the public projection hides it anyway.
    displayName: displayName && displayName.length > 0 ? displayName : "Authorized Signatory",
    roleLabel: certificateRoleLabel(membership.role),
    allowed,
  };
}

function flag(value: string | null): boolean {
  return value === "true";
}

function recipientRow(recipient: CertificateBatchRecipient) {
  return { personId: recipient.personId, displayName: recipient.displayName };
}

// GET /api/v1/orgs/:orgId/sessions/:sessionId/certificates
// Preview only: classify attendance records for this event without creating a
// Document. documents.manage. Cross-org session ids are 404.
//
// Query: ?requireCheckOut=true|false&requireApproval=true|false (both default
// false). The response carries counts and rows only — no payloads.
export async function GET(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);

    const session = await loadSession(ctx.organizationId, sessionId);
    if (!session) return fail(404, "NOT_FOUND", "Session not found in this organization");
    if (!isSupportedTimeZone(session.timezone)) {
      return fail(409, "CONFLICT", "Event timezone is not a supported IANA zone");
    }

    const { searchParams } = new URL(req.url);
    const requireCheckOut = flag(searchParams.get("requireCheckOut"));
    const requireApproval = flag(searchParams.get("requireApproval"));

    const [records, existing] = await Promise.all([
      loadRecords(ctx.organizationId, session.id),
      loadExistingDocuments(ctx.organizationId, session.id),
    ]);

    const preview = previewCertificateBatch({
      records,
      existingKeys: existingKeysOf(session.id, existing),
      eligibility: { requireCheckOut, requireApproval },
    });

    const documentsByKey = documentsByKeyOf(session.id, existing);

    return ok({
      session: {
        id: session.id,
        title: session.title,
        type: session.type,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        timezone: session.timezone,
        status: session.status,
      },
      issuedOn: issueDateInTimeZone(new Date(), session.timezone),
      requireCheckOut,
      requireApproval,
      maxBatch: preview.maxBatch,
      exceedsBatchLimit: preview.exceedsBatchLimit,
      counts: preview.counts,
      eligible: preview.eligible.map(recipientRow),
      skipped: preview.skipped.map((entry) => ({
        ...recipientRow(entry),
        reason: entry.reason,
        message: entry.message,
      })),
      alreadyGenerated: preview.alreadyGenerated.map((recipient) => {
        const document = documentsByKey.get(recipient.key);
        return {
          ...recipientRow(recipient),
          documentId: document?.id ?? null,
          batchId: document?.batchId ?? null,
          status: document?.status ?? null,
          createdAt: document?.createdAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

// POST /api/v1/orgs/:orgId/sessions/:sessionId/certificates
// { signatoryUserId, statement?, requireCheckOut?, requireApproval?, issuedOn? }
// Creates one DRAFT Document + one pending SignatureRequest per eligible
// attendee. documents.manage; the signatory must be an active member with an
// effective documents.sign grant (role default or explicit allow override).
//
// Idempotent: documents already generated for a (session, person) key are
// reported as alreadyGenerated. A batch larger than 100 is refused with 409
// before anything is written.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, sessionId } = await params;
    const ctx = await requireOrganizationPermission("documents.manage", orgId);
    const input = generateInput.parse(await readJson(req, BODY_LIMITS.small));

    const session = await loadSession(ctx.organizationId, sessionId);
    if (!session) return fail(404, "NOT_FOUND", "Session not found in this organization");
    if (!isSupportedTimeZone(session.timezone)) {
      return fail(409, "CONFLICT", "Event timezone is not a supported IANA zone");
    }

    const signatory = await loadSignatory(ctx.organizationId, input.signatoryUserId);
    if (!signatory) {
      return fail(404, "NOT_FOUND", "Signatory is not an active member of this organization");
    }
    if (!signatory.allowed) {
      return fail(403, "FORBIDDEN", "Signatory does not have documents.sign in this organization");
    }
    if (signatory.displayName.length > 200) {
      return fail(400, "INVALID_INPUT", "Signatory display name is too long for a certificate");
    }

    const [records, existing] = await Promise.all([
      loadRecords(ctx.organizationId, session.id),
      loadExistingDocuments(ctx.organizationId, session.id),
    ]);

    const issuedOn = input.issuedOn ?? issueDateInTimeZone(new Date(), session.timezone);
    const classificationInput = {
      records,
      existingKeys: existingKeysOf(session.id, existing),
      eligibility: {
        requireCheckOut: input.requireCheckOut,
        requireApproval: input.requireApproval,
      },
    };

    // Check the cap before building payloads: a pathological event must be
    // refused cheaply, not after hashing thousands of certificates.
    const preview = previewCertificateBatch(classificationInput);
    if (preview.exceedsBatchLimit) {
      return fail(
        409,
        "BATCH_LIMIT",
        `This event would create ${preview.counts.eligible} certificates; the limit is ${preview.maxBatch} per run`,
        { eligible: preview.counts.eligible, maxBatch: preview.maxBatch },
      );
    }

    const plan = planCertificateBatch({
      ...classificationInput,
      organization: { id: ctx.organizationId, name: session.organization.name },
      event: {
        sessionId: session.id,
        title: session.title,
        type: session.type,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        timezone: session.timezone,
      },
      signatory,
      statement: input.statement,
      issuedOn,
    });

    const batchId = randomUUID();
    const prepared = plan.eligible.map((entry) => ({ entry, documentId: randomUUID() }));

    let generated = 0;
    if (prepared.length > 0) {
      generated = await prisma.$transaction(async (tx) => {
        const documents: CertificateDocumentInsert[] = prepared.map(({ entry, documentId }) => ({
          id: documentId,
          organizationId: ctx.organizationId,
          template: CERTIFICATE_TEMPLATE_KEY,
          title: certificateDocumentTitle(session.title),
          version: 1,
          // Payload-only hash. The public verifier recomputes
          // certificateContentHash(payload); documentContentHash() would fold in
          // template/version and make every certificate fail verification.
          sha256: entry.sha256,
          payload: entry.payload as Prisma.InputJsonValue,
          storageRef: `inline:${documentId}`,
          verifyToken: `dv_${randomUUID().replace(/-/g, "")}`,
          status: "DRAFT",
          sourceSessionId: session.id,
          sourcePersonId: entry.personId,
          batchId,
        }));

        // The unique (organization_id, source_session_id, source_person_id)
        // index is the race backstop: a concurrent run inserts the loser's
        // rows as no-ops instead of failing the whole batch.
        const inserted = await tx.document.createMany({ data: documents, skipDuplicates: true });

        const created = await tx.document.findMany({
          where: { id: { in: prepared.map(({ documentId }) => documentId) } },
          select: { id: true },
        });
        if (created.length > 0) {
          await tx.signatureRequest.createMany({
            data: created.map((document) => ({
              organizationId: ctx.organizationId,
              documentId: document.id,
              order: [{ order: 1, signerUserId: signatory.userId }] as Prisma.InputJsonValue,
              status: "pending",
              consentVersion: CERTIFICATE_CONSENT_VERSION,
            })),
          });
        }
        return inserted.count;
      });
    }

    // A concurrent request may have claimed a key between planning and insert;
    // those rows are not ours, so report them as alreadyGenerated, not failures.
    const alreadyGenerated = plan.counts.alreadyGenerated + Math.max(0, plan.counts.eligible - generated);
    const counts: CertificateBatchCounts & { generated: number } = {
      records: plan.counts.records,
      eligible: plan.counts.eligible,
      skipped: plan.counts.skipped,
      alreadyGenerated,
      duplicates: plan.counts.duplicates,
      generated,
    };

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "certificate.batch_generate",
        resource: `session:${session.id}`,
        result: "ok",
        // Counts only: recipient names and person ids never enter the audit log.
        meta: certificateBatchAuditMeta({
          batchId,
          sessionId: session.id,
          counts,
          requireCheckOut: input.requireCheckOut,
          requireApproval: input.requireApproval,
          issuedOn,
          customStatement: Boolean(input.statement),
        }) as never,
      },
    });

    return ok({
      batchId,
      sessionId: session.id,
      issuedOn,
      signatory: { userId: signatory.userId, roleLabel: signatory.roleLabel },
      counts,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
