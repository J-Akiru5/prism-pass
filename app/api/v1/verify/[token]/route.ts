import { ok, fail, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { enforceRateLimits, ipCheck, limiters } from "@/lib/rate-limit-http";

type P = { params: Promise<{ token: string }> };

const TOKEN_MIN_LENGTH = 16;
const TOKEN_MAX_LENGTH = 128;

// Public (unauthenticated) verification, deliberately minimal disclosure.
// It answers "does this document exist, is it sealed, and what is the hash
// prefix" without exposing the organization, title, payload, signer identities,
// attendance history, or any other PII. The token is an unguessable capability.
export async function GET(req: Request, { params }: P) {
  try {
    // Unauthenticated and database-backed: rate-limit before touching the token.
    const denied = enforceRateLimits([ipCheck(limiters.verifyTokenIp, req)]);
    if (denied) return denied;

    const { token } = await params;
    if (!token || token.length < TOKEN_MIN_LENGTH || token.length > TOKEN_MAX_LENGTH) {
      return fail(404, "NOT_FOUND", "Unknown verification token");
    }
    const document = await prisma.document.findUnique({
      where: { verifyToken: token },
      select: { status: true, sha256: true, createdAt: true, sealedAt: true },
    });
    if (!document) return fail(404, "NOT_FOUND", "Unknown verification token");
    return ok({
      exists: true,
      sealed: document.status === "SEALED",
      hashPrefix: document.sha256.slice(0, 16),
      createdAt: document.createdAt,
      sealedAt: document.sealedAt,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
