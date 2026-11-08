import { fail, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requirePlatformActor } from "@/lib/platform";
import { requirePlatformAdmin } from "@/lib/tenant";
import { decidePlanUpdate, planUpdateInput, readEntitlements } from "@/modules/platform/console";

type P = { params: Promise<{ orgId: string }> };

/**
 * Platform plan + entitlement editor.
 *
 * Gate first (`requirePlatformAdmin`). Plan and entitlement keys are validated
 * against the allowlists in `modules/platform/console.ts`; an unknown key is a
 * 400, never a silent write. The JSON column is merged, not replaced, so legacy
 * keys the console does not manage survive an edit.
 *
 * A no-op writes no audit row. A real change writes one row in the same
 * transaction as the upsert: `org.plan.update`, `scope: "platform"`, with the
 * previous and next plan/entitlements and an optional operator reason.
 */
export async function PATCH(req: Request, { params }: P) {
  try {
    const actor = await requirePlatformActor();
    const { orgId } = await params;
    const input = planUpdateInput.parse(await req.json());

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, status: true, subscription: { select: { plan: true, entitlements: true } } },
    });
    if (!org) return fail(404, "NOT_FOUND", "Organization not found");
    if (org.status === "PENDING_DELETION") {
      return fail(
        409,
        "INVALID_STATE",
        "A tenant pending deletion cannot change plans. Reactivate it first or complete the deletion.",
      );
    }

    const currentPlan = org.subscription?.plan ?? "pilot";
    const decision = decidePlanUpdate({
      currentPlan,
      currentEntitlements: org.subscription?.entitlements,
      nextPlan: input.plan,
      nextEntitlements: input.entitlements,
    });

    if (!decision.changed) {
      return ok({
        plan: currentPlan,
        entitlements: readEntitlements(currentPlan, org.subscription?.entitlements),
        changed: false,
      });
    }

    const saved = await prisma.$transaction(async (tx) => {
      const subscription = await tx.organizationSubscription.upsert({
        where: { organizationId: org.id },
        update: { plan: input.plan, entitlements: decision.nextEntitlements as never },
        create: {
          organizationId: org.id,
          plan: input.plan,
          entitlements: decision.nextEntitlements as never,
        },
        select: { plan: true, entitlements: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          actorUserId: actor.internalUserId,
          action: "org.plan.update",
          resource: `org:${org.id}`,
          result: "ok",
          meta: {
            scope: "platform",
            previousPlan: currentPlan,
            nextPlan: input.plan,
            entitlements: decision.entitlements,
            ...(input.reason ? { reason: input.reason } : {}),
          } as never,
        },
      });
      return subscription;
    });

    return ok({
      plan: saved.plan,
      entitlements: readEntitlements(saved.plan, saved.entitlements),
      changed: true,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
