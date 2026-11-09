import { ok, fail, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { enforceRateLimits, ipCheck, limiters } from "@/lib/rate-limit-http";
import {
  buildPublicVerification,
  isVerificationTokenCandidate,
} from "@/modules/certificates/public";

type P = { params: Promise<{ token: string }> };

// Public (unauthenticated) verification. The token is an unguessable capability.
//
// Certificate documents return the allowlisted public projection: status,
// sealed flag, title, organization/event labels, signatory role, seal time,
// certificate number, hash prefix and integrity. Non-certificate documents
// preserve the original minimal response (exists, sealed, hash prefix,
// timestamps) so existing consumers do not regress.
//
// Neither shape exposes the recipient, payload, email, external id, attendance
// instants or signature auth evidence. ADR-10 / RA 10173.
export async function GET(req: Request, { params }: P) {
  try {
    // Unauthenticated and database-backed: rate-limit before touching the token.
    const denied = enforceRateLimits([ipCheck(limiters.verifyTokenIp, req)]);
    if (denied) return denied;

    const { token } = await params;
    if (!isVerificationTokenCandidate(token)) {
      return fail(404, "NOT_FOUND", "Unknown verification token");
    }

    const document = await prisma.document.findUnique({
      where: { verifyToken: token },
      select: {
        template: true,
        title: true,
        version: true,
        sha256: true,
        payload: true,
        status: true,
        sealedAt: true,
        verifyToken: true,
        createdAt: true,
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

    const payload = buildPublicVerification(document, document?.signatures ?? []);
    if (!payload) return fail(404, "NOT_FOUND", "Unknown verification token");
    return ok(payload);
  } catch (e) {
    return handleRouteError(e);
  }
}
