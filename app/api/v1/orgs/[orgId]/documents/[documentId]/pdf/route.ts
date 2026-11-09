import { fail, handleRouteError } from "@/lib/api";
import {
  ForbiddenError,
  requireOrganizationPermission,
  type AuthContext,
} from "@/lib/tenant";
import type { Permission } from "@/packages/authorization/permissions";
import { prisma } from "@/lib/db";
import { certificateNumberFor, CERTIFICATE_HASH_PREFIX_LENGTH } from "@/modules/certificates/verify";
import { signatureRequestsChainValid } from "@/modules/certificates/public";
import {
  certificateEventsBindDocument,
  evaluateCertificatePdfGate,
  isCertificateTemplate,
  renderCertificatePdf,
  resolveCertificateVerifyUrl,
} from "@/modules/certificates/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type P = { params: Promise<{ orgId: string; documentId: string }> };

async function tryPermission(permission: Permission, orgId: string): Promise<AuthContext | null> {
  try {
    return await requireOrganizationPermission(permission, orgId);
  } catch (e) {
    // An actor without documents.manage may still download their own
    // certificate; anything that is not an authorization failure (401) must
    // keep propagating.
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}

function downloadFileName(certificateNumber: string | null, documentId: string): string {
  const short = certificateNumber
    ? certificateNumber.replace(/^CERT-/i, "")
    : documentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const safe = short.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `certificate-${safe || "document"}.pdf`;
}

// GET /api/v1/orgs/:orgId/documents/:documentId/pdf
//
// Downloads the sealed attendance certificate as an A4-landscape PDF.
//
// Authorization: documents.manage, or documents.sign when the actor's linked
// Person is the document's sourcePersonId (a member's own certificate). A
// document from another organization, or one the actor may not read, is
// reported as 404 so the endpoint is not an enumeration oracle.
//
// Integrity: the payload hash must still match Document.sha256, the payload
// must parse as CertificatePayloadV1, and every signature request chain must
// verify. A mismatch is refused (409) and audited; a PDF is never rendered from
// suspect content.
export async function GET(_req: Request, { params }: P) {
  try {
    const { orgId, documentId } = await params;

    const managerCtx = await tryPermission("documents.manage", orgId);
    const ctx = managerCtx ?? (await tryPermission("documents.sign", orgId));
    if (!ctx) throw new ForbiddenError("Denied certificate PDF access");

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        organizationId: true,
        template: true,
        status: true,
        sealedAt: true,
        sha256: true,
        payload: true,
        verifyToken: true,
        sourcePersonId: true,
        signatures: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            events: {
              orderBy: { sequence: "asc" },
              select: {
                requestId: true,
                signerUserId: true,
                signerPersonId: true,
                docHash: true,
                consentVersion: true,
                serverTs: true,
                prevHash: true,
                currHash: true,
              },
            },
          },
        },
      },
    });

    if (!document || document.organizationId !== ctx.organizationId) {
      return fail(404, "NOT_FOUND", "Document not found in this organization");
    }
    if (!isCertificateTemplate(document.template)) {
      return fail(404, "NOT_FOUND", "Certificate not found in this organization");
    }

    if (!managerCtx) {
      const ownsCertificate = document.sourcePersonId
        ? (await prisma.person.count({
            where: {
              id: document.sourcePersonId,
              organizationId: ctx.organizationId,
              userId: ctx.internalUserId,
            },
          })) > 0
        : false;
      if (!ownsCertificate) {
        return fail(404, "NOT_FOUND", "Document not found in this organization");
      }
    }

    // A sealed certificate must have at least one signed event, every event
    // must commit to this exact document hash, and each request chain must
    // verify. An internally intact chain for another document (or no chain at
    // all) is not this artifact.
    const signatureEvents = document.signatures.flatMap((request) => request.events);
    const chainValid =
      certificateEventsBindDocument({
        sha256: document.sha256,
        docHashes: signatureEvents.map((event) => event.docHash),
      }) && signatureRequestsChainValid(document.signatures);
    const gate = evaluateCertificatePdfGate({
      status: document.status,
      sealedAt: document.sealedAt,
      sha256: document.sha256,
      payload: document.payload,
      chainValid,
    });

    if (!gate.ok) {
      if (gate.code === "INTEGRITY_FAILED") {
        await prisma.auditLog.create({
          data: {
            organizationId: ctx.organizationId,
            actorUserId: ctx.internalUserId,
            action: "document.integrity_failed",
            resource: `document:${document.id}`,
            result: "failed",
            // Document id and actor role only; no recipient or payload data.
            meta: { documentId: document.id, role: ctx.role } as never,
          },
        });
      }
      return fail(409, gate.code, gate.message, { documentId: document.id });
    }

    if (!document.verifyToken) {
      return fail(409, "NOT_VERIFIABLE", "Certificate has no public verification token", {
        documentId: document.id,
      });
    }

    const certificateNumber =
      certificateNumberFor({ verifyToken: document.verifyToken, sha256: document.sha256 }) ??
      `CERT-${document.sha256.slice(0, 12).toUpperCase()}`;
    const verifyUrl = resolveCertificateVerifyUrl({ verifyToken: document.verifyToken });
    const hashPrefix = document.sha256.slice(0, CERTIFICATE_HASH_PREFIX_LENGTH);

    const bytes = await renderCertificatePdf({
      payload: gate.payload,
      sealedAt: document.sealedAt as Date,
      certificateNumber,
      verifyUrl,
      hashPrefix,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: ctx.organizationId,
        actorUserId: ctx.internalUserId,
        action: "certificate.pdf_download",
        resource: `document:${document.id}`,
        result: "ok",
        // Document id and actor role only; the filename, recipient and QR
        // target (a bearer capability) never enter the audit log.
        meta: {
          documentId: document.id,
          role: ctx.role,
          access: managerCtx ? "manage" : "member",
        } as never,
      },
    });

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${downloadFileName(certificateNumber, document.id)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
