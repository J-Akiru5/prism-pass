import { z } from "zod";
import { ok, fail, handleRouteError, readJson, BODY_LIMITS } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/tenant";
import { getSessionUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
const body = z.object({ slug: z.string().min(2).max(64), name: z.string().min(2).max(120), timezone: z.string().min(1).max(60).default("Asia/Manila") });

// Organizations the signed-in user can actually enter. This is what the console
// chooser and the standalone consoles use instead of asking for a raw org UUID.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return fail(401, "UNAUTHENTICATED", "Sign in required");
    const internal = await prisma.user.findUnique({
      where: { authId: user.id },
      select: {
        memberships: {
          select: {
            status: true,
            role: true,
            organization: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
      },
    });
    const orgs = (internal?.memberships ?? [])
      .filter((m) => m.status === "ACTIVE" && m.organization.status === "ACTIVE")
      .map((m) => ({ ...m.organization, role: m.role }));
    return ok(orgs);
  } catch (e) { return handleRouteError(e); }
}

export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    if (!process.env.DATABASE_URL) return fail(503, "DB_NOT_CONFIGURED", "Set DATABASE_URL (Supabase pooled URL) to provision orgs.");
    const input = body.parse(await readJson(req, BODY_LIMITS.tiny));
    const org = await prisma.organization.create({ data: { slug: input.slug, name: input.name, timezone: input.timezone } });
    await prisma.auditLog.create({ data: { organizationId: org.id, action: "org.create", resource: `org:${org.id}`, result: "ok" } });
    return ok(org);
  } catch (e) { return handleRouteError(e); }
}
