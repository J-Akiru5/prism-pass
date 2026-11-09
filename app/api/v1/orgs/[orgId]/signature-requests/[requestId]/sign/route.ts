import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requireOrganizationPermission } from "@/lib/tenant";
import { signInput } from "@/modules/documents/schema";
import { signSingleRequest } from "@/modules/documents/sign";

type P = { params: Promise<{ orgId: string; requestId: string }> };

// POST /api/v1/orgs/:orgId/signature-requests/:requestId/sign
// One explicit signature. The shared module owns chain verification, actor key
// derivation, order/consent evaluation, the sequence race guard, sealing on the
// final step and the `document.sign` audit row; this route only authorizes,
// validates the body and maps the result.
export async function POST(req: Request, { params }: P) {
  try {
    const { orgId, requestId } = await params;
    const ctx = await requireOrganizationPermission("documents.sign", orgId);
    const input = signInput.parse(await readJson(req, BODY_LIMITS.small));

    const result = await signSingleRequest({
      actor: {
        organizationId: ctx.organizationId,
        internalUserId: ctx.internalUserId,
        membershipId: ctx.membershipId,
      },
      requestId,
      input,
    });

    if (!result.ok) {
      return fail(result.status, result.code, result.message, result.details);
    }

    return ok({
      event: result.event,
      sealed: result.sealed,
      documentStatus: result.documentStatus,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
