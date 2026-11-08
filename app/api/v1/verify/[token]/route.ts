import { ok, fail, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/db";

type P = { params: Promise<{ token: string }> };

// Public (unauthenticated) verification, deliberately minimal disclosure.
// It answers "does this document exist, is it sealed, and what is the hash
// prefix" without exposing the organization, title, payload, signer identities,
// attendance history, or any other PII. The token is an unguessable capability.
export async function GET(_req: Request, { params }: P) {
  try {
    const { token } = await params;
    if (!token || token.length < 16) return fail(404, "NOT_FOUND", "Unknown verification token");
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
