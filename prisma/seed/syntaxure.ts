// Seed: Syntaxure Labs + admin@syntaxure.dev as OWNER + PlatformAdmin.
// Run after user exists in Supabase Auth: pnpm seed:syntaxure <authUuid> <email>
// Requires DATABASE_URL (pooled Supabase URL).
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const [authId, email] = process.argv.slice(2);
  if (!authId || !email) throw new Error("Usage: pnpm seed:syntaxure <authUuid> <email>");
  const org = await prisma.organization.upsert({ where: { slug: "syntaxure-labs" }, update: {}, create: { slug: "syntaxure-labs", name: "Syntaxure Labs", timezone: "Asia/Manila" } });
  const user = await prisma.user.upsert({ where: { authId }, update: { email }, create: { authId, email } });
  const membership = await prisma.membership.upsert({ where: { organizationId_userId: { organizationId: org.id, userId: user.id } }, update: { role: "OWNER", status: "ACTIVE" }, create: { organizationId: org.id, userId: user.id, role: "OWNER", status: "ACTIVE" } });
  await prisma.platformAdmin.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, organizationId: org.id } });
  await prisma.auditLog.create({ data: { organizationId: org.id, actorUserId: user.id, action: "seed.syntaxure", resource: `org:${org.id}`, result: "ok", meta: { membership: membership.id } } });
  console.log(JSON.stringify({ org: org.slug, user: user.email, membership: membership.id }, null, 2));
}
main().finally(() => prisma.$disconnect());
