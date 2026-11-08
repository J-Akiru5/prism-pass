import { readdir } from "node:fs/promises";
import path from "node:path";
import { handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { healthPayload } from "@/lib/health";
import { requirePlatformAdmin } from "@/lib/tenant";

type MigrationsView = { available: boolean; count: number; files: string[]; note?: string };

async function readMigrations(): Promise<MigrationsView> {
  try {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
    return { available: true, count: files.length, files };
  } catch {
    // A bundled serverless runtime may not ship the SQL folder. Say so instead
    // of implying "zero migrations" means the schema is empty.
    return {
      available: false,
      count: 0,
      files: [],
      note: "Migration files are not readable from this runtime. Check the repository build artefact.",
    };
  }
}

/**
 * Platform health.
 *
 * Everything is measured, never synthesised:
 * - version/phase come from the shared health payload;
 * - the database round trip is a real `SELECT 1` timed with `Date.now()`;
 * - migration files come from the deployed filesystem (or an honest note);
 * - per-organization activity is `MAX(audit_logs.created_at)` grouped by org.
 *
 * A failed database probe returns `ok: false`, a null latency and a generic
 * message — never a guessed number and never a connection string.
 */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const configured = Boolean(process.env.DATABASE_URL);

    let database: {
      configured: boolean;
      ok: boolean | null;
      latencyMs: number | null;
      error: string | null;
    } = { configured, ok: null, latencyMs: null, error: null };
    let organizations: { id: string; name: string; status: string; lastActivityAt: string | null }[] = [];
    let activityError: string | null = null;

    if (configured) {
      const startedAt = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
        database = { configured, ok: true, latencyMs: Date.now() - startedAt, error: null };
      } catch {
        database = {
          configured,
          ok: false,
          latencyMs: null,
          error: "Database round trip failed. Check DATABASE_URL and pooler status.",
        };
      }

      // Activity is a second, independent query: a missing audit table must not
      // turn a successful SELECT 1 into a false "database down" reading.
      if (database.ok) {
        try {
          const groups = await prisma.auditLog.groupBy({
            by: ["organizationId"],
            where: { organizationId: { not: null } },
            _max: { createdAt: true },
          });
          const ids = groups
            .map((group) => group.organizationId)
            .filter((id): id is string => Boolean(id));
          const orgs = ids.length
            ? await prisma.organization.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true, status: true },
              })
            : [];
          const byId = new Map(orgs.map((org) => [org.id, org]));
          organizations = groups
            .map((group) => {
              const org = group.organizationId ? byId.get(group.organizationId) : undefined;
              if (!org) return null;
              return {
                id: org.id,
                name: org.name,
                status: org.status,
                lastActivityAt: group._max.createdAt?.toISOString() ?? null,
              };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
            .slice(0, 20);
        } catch {
          activityError = "Per-organization activity could not be read from audit_logs.";
        }
      }
    }

    return ok({
      app: healthPayload(),
      database,
      migrations: await readMigrations(),
      organizations,
      activityError,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
