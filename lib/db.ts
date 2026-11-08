import { PrismaClient } from "@prisma/client";

/**
 * Prisma talks to Postgres with prepared statements, which PgBouncer in
 * transaction mode (Supabase pooler, port 6543) cannot reuse across connections.
 * Without this flag the app fails intermittently with
 * `prepared statement "s0" already exists`.
 *
 * We normalize at runtime instead of hard-coding it in the connection string, so
 * any pooler URL pasted into the environment works.
 */
export function resolveDatabaseUrl(raw = process.env.DATABASE_URL): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const isTransactionPooler = url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";
    if (isTransactionPooler) {
      if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
      if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    }
    return url.toString();
  } catch {
    return raw;
  }
}

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  g.prisma ?? new PrismaClient({ datasources: { db: { url: resolveDatabaseUrl() } } });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
