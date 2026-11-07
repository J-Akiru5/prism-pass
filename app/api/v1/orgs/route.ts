import { z } from "zod";
import { ok, fail, handleRouteError } from "@/lib/api";
import { requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
const body = z.object({ slug: z.string().min(2).max(64), name: z.string().min(2).max(120), timezone: z.string().default("Asia/Manila") });
export async function POST(req: Request) {
  try {
    await requirePlatformAdmin();
    if (!process.env.DATABASE_URL) return fail(503, "DB_NOT_CONFIGURED", "Set DATABASE_URL (Supabase pooled URL) to provision orgs.");
    const input = body.parse(await req.json());
    const org = await prisma.organization.create({ data: { slug: input.slug, name: input.name, timezone: input.timezone } });
    await prisma.auditLog.create({ data: { organizationId: org.id, action: "org.create", resource: `org:${org.id}`, result: "ok" } });
    return ok(org);
  } catch (e) { return handleRouteError(e); }
}
