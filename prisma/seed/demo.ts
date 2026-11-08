// Demo seed: auth accounts, Syntaxure Labs org and a realistic attendance dataset.
//
//   pnpm seed:demo
//
// Idempotent: safe to run repeatedly. Uses fixed ids for org-scoped demo rows and
// an idempotency key per event, so re-runs update instead of duplicating.
//
// Demo accounts (password for both): password123
//   admin@syntaxure.dev  OWNER + PlatformAdmin
//   user@syntaxure.dev   MEMBER (own pass, own attendance)
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Minimal .env.local loader (no dotenv dependency; Prisma CLI loads .env itself).
for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: sessionUrl() } } });
const ORG_SLUG = "syntaxure-labs";
const DEMO_PASSWORD = "password123";
const TZ = "Asia/Manila";

// ---------- helpers ----------
// Seed through the session pooler (5432): transaction pooling cannot reuse the
// prepared statements Prisma emits, and bulk seeding is happier in session mode.
function sessionUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") url.port = "5432";
    return url.toString();
  } catch {
    return raw;
  }
}

const hash = (publicId: string, secret: string) =>
  createHash("sha256").update(`${publicId}:${secret}`).digest("hex");

function mnlDay(offsetDays = 0): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+08:00`);

function lateness(checkIn: Date, startsAt: Date, graceMin: number, lateMin: number) {
  const diff = (checkIn.getTime() - startsAt.getTime()) / 60000;
  if (diff <= graceMin) return "PRESENT" as const;
  if (diff <= graceMin + lateMin) return "LATE" as const;
  return "ABSENT" as const;
}

// ---------- supabase auth ----------
const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY: string = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase URL / service role key missing");

async function listAuthUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`list users failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.users ?? [];
}

async function ensureAuthUser(email: string, password: string) {
  const existing = (await listAuthUsers()).find(
    (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`update ${email} failed: ${res.status} ${await res.text()}`);
    return existing.id as string;
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`create ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  return body.id as string;
}

// ---------- demo people ----------
type DemoPerson = {
  slug: string;
  name: string;
  role: "staff" | "intern";
  auth?: string;
  lateMin?: number;
  absent?: boolean;
  outsideGeo?: boolean;
  today?: "in" | "late" | null;
};

const PEOPLE: DemoPerson[] = [
  { slug: "admin", name: "Ada Reyes", role: "staff", auth: "admin@syntaxure.dev", lateMin: 0, today: "in" },
  { slug: "user", name: "Mika Santos", role: "staff", auth: "user@syntaxure.dev", lateMin: 6, today: "in" },
  { slug: "marco", name: "Marco Dela Cruz", role: "intern", lateMin: -12, today: "in" },
  { slug: "liza", name: "Liza Bautista", role: "intern", lateMin: 4, today: "late" },
  { slug: "noah", name: "Noah Ramos", role: "staff", lateMin: 14, today: "in" },
  { slug: "priya", name: "Priya Nair", role: "staff", lateMin: 26, outsideGeo: true, today: null },
  { slug: "tomas", name: "Tomas Villanueva", role: "intern", lateMin: 3, today: "late" },
  { slug: "grace", name: "Grace Lim", role: "staff", absent: true, today: null },
];

async function main() {
  const dayPast = mnlDay(-1);
  const dayToday = mnlDay(0);
  const dayEvent = mnlDay(7);

  // 1. Auth accounts
  const authIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    if (!p.auth) continue;
    authIds[p.slug] = await ensureAuthUser(p.auth, DEMO_PASSWORD);
  }

  // 2. Organization + structure
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: "Syntaxure Labs", status: "ACTIVE", timezone: TZ },
    create: { slug: ORG_SLUG, name: "Syntaxure Labs", timezone: TZ },
  });
  const orgId = org.id;

  // Optional models whose DDL is not applied to every environment yet.
  const optional = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2021" || code === "P2010") console.log(`· skipped ${label} (table not in this database yet)`);
      else throw e;
    }
  };

  await optional("organization_settings", () =>
    prisma.organizationSetting.upsert({
      where: { organizationId: orgId },
      update: {},
      create: { organizationId: orgId, branding: { displayName: "Syntaxure Labs", accent: "gold" }, retentionDays: 365 },
    })
  );
  await optional("organization_subscriptions", () =>
    prisma.organizationSubscription.upsert({
      where: { organizationId: orgId },
      update: {},
      create: { organizationId: orgId, plan: "pilot", entitlements: { passes: true, attendance: true, geofence: true, documents: false } },
    })
  );

  const campus = await prisma.campus.upsert({
    where: { organizationId_slug: { organizationId: orgId, slug: "main" } },
    update: { name: "Main Campus" },
    create: { id: "demo-campus-main", organizationId: orgId, slug: "main", name: "Main Campus", timezone: TZ },
  });
  const department = await prisma.department.upsert({
    where: { id: "demo-dept-engineering" },
    update: { name: "Engineering" },
    create: { id: "demo-dept-engineering", organizationId: orgId, campusId: campus.id, name: "Engineering" },
  });
  const programOjt = await prisma.program.upsert({
    where: { id: "demo-program-ojt" },
    update: { name: "OJT Internship", kind: "ojt" },
    create: { id: "demo-program-ojt", organizationId: orgId, name: "OJT Internship", kind: "ojt" },
  });
  const programEvents = await prisma.program.upsert({
    where: { id: "demo-program-events" },
    update: { name: "Institutional Events", kind: "event" },
    create: { id: "demo-program-events", organizationId: orgId, name: "Institutional Events", kind: "event" },
  });

  const policy = await prisma.attendancePolicy.upsert({
    where: { id: "demo-policy-default" },
    update: {},
    create: {
      id: "demo-policy-default",
      organizationId: orgId,
      name: "Default attendance policy",
      graceMin: 10,
      lateThresholdMin: 15,
      duplicateWindowSec: 120,
      geoMode: "flag",
      evidenceRequired: ["pass", "timestamp"],
      approvalSteps: ["supervisor"],
    },
  });

  // Geofence exists only after the P4 migration; seed it when the table is there.
  try {
    await prisma.$executeRawUnsafe(
      `insert into geofences (id, organization_id, campus_id, label, center_lat, center_lng, radius_m)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set label = excluded.label, radius_m = excluded.radius_m`,
      "demo-geofence-main",
      orgId,
      campus.id,
      "Main Campus entrance",
      10.7202,
      122.5621,
      150
    );
  } catch {
    console.log("· geofences table not present yet (P4 migration pending) — skipped geofence seed");
  }

  // 3. People, assignments, passes
  const people: Record<string, { id: string; passId: string; qr: string }> = {};
  for (const p of PEOPLE) {
    const personId = `demo-person-${p.slug}`;
    const userRow = p.auth
      ? await prisma.user.upsert({
          where: { authId: authIds[p.slug] },
          update: { email: p.auth },
          create: { authId: authIds[p.slug], email: p.auth },
        })
      : null;

    await prisma.person.upsert({
      where: { id: personId },
      update: { displayName: p.name, userId: userRow?.id ?? null, status: "active" },
      create: {
        id: personId,
        organizationId: orgId,
        userId: userRow?.id ?? null,
        displayName: p.name,
        externalId: `demo-${p.slug}`,
        status: "active",
      },
    });

    await prisma.personAssignment.upsert({
      where: { id: `demo-assign-${p.slug}` },
      update: {},
      create: {
        id: `demo-assign-${p.slug}`,
        organizationId: orgId,
        personId,
        programId: p.role === "intern" ? programOjt.id : programEvents.id,
        role: p.role === "intern" ? "intern" : "participant",
        startsAt: at(mnlDay(-30), "09:00"),
      },
    });

    const passPublicId = `pp_demo_${p.slug}`;
    // Secrets must match the QR parser (64 hex chars), so derive them
    // deterministically from the slug: stable across reseeds, still opaque.
    const secret = createHash("sha256").update(`prism-pass-demo:${p.slug}`).digest("hex");
    const pass = await prisma.pass.upsert({
      where: { organizationId_passPublicId: { organizationId: orgId, passPublicId } },
      update: { status: "ACTIVE", revokedAt: null, credentialHash: hash(passPublicId, secret) },
      create: {
        id: `demo-pass-${p.slug}`,
        organizationId: orgId,
        personId,
        passPublicId,
        credentialHash: hash(passPublicId, secret),
        version: 1,
        status: "ACTIVE",
      },
    });
    people[p.slug] = { id: personId, passId: pass.id, qr: `PRISM1:${passPublicId}:${secret}` };
  }

  // 3b. Memberships
  const adminUserId = (await prisma.user.findUnique({ where: { authId: authIds.admin } }))!.id;
  const memberUserId = (await prisma.user.findUnique({ where: { authId: authIds.user } }))!.id;
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: adminUserId } },
    update: { role: "OWNER", status: "ACTIVE", revokedAt: null },
    create: { organizationId: orgId, userId: adminUserId, role: "OWNER", status: "ACTIVE" },
  });
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: orgId, userId: memberUserId } },
    update: { role: "MEMBER", status: "ACTIVE", revokedAt: null },
    create: { organizationId: orgId, userId: memberUserId, role: "MEMBER", status: "ACTIVE" },
  });
  await prisma.platformAdmin.upsert({
    where: { userId: adminUserId },
    update: {},
    create: { userId: adminUserId, organizationId: orgId },
  });

  // 4. Sessions
  const sessionPast = await prisma.attendanceSession.upsert({
    where: { id: "demo-session-past" },
    update: {},
    create: {
      id: "demo-session-past",
      organizationId: orgId,
      policyId: policy.id,
      type: "SHIFT",
      title: "Operations shift (yesterday)",
      startsAt: at(dayPast, "09:00"),
      endsAt: at(dayPast, "17:00"),
      timezone: TZ,
    },
  });
  const sessionToday = await prisma.attendanceSession.upsert({
    where: { id: "demo-session-today" },
    update: {},
    create: {
      id: "demo-session-today",
      organizationId: orgId,
      policyId: policy.id,
      type: "OJT",
      title: "OJT internship day (today)",
      startsAt: at(dayToday, "09:00"),
      endsAt: at(dayToday, "17:00"),
      timezone: TZ,
    },
  });
  const sessionEvent = await prisma.attendanceSession.upsert({
    where: { id: "demo-session-event" },
    update: {},
    create: {
      id: "demo-session-event",
      organizationId: orgId,
      policyId: policy.id,
      type: "EVENT",
      title: "Prism Pass Demo Day",
      startsAt: at(dayEvent, "13:00"),
      endsAt: at(dayEvent, "17:00"),
      timezone: TZ,
    },
  });

  // 5. Attendance: yesterday complete, today in progress
  const eventId = async (opts: {
    sessionId: string;
    person: string;
    type: "CHECK_IN" | "CHECK_OUT";
    when: Date;
    geo?: string;
    outside?: boolean;
  }) => {
    const key = `demo:${opts.sessionId}:${opts.person}:${opts.type}`;
    const existing = await prisma.attendanceEvent.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: orgId, idempotencyKey: key } },
    });
    if (existing) return existing;
    return prisma.attendanceEvent.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        sessionId: opts.sessionId,
        personId: people[opts.person].id,
        passId: people[opts.person].passId,
        passVersion: 1,
        type: opts.type,
        clientTs: opts.when,
        serverTs: new Date(opts.when.getTime() + 2500),
        lat: opts.outside ? 10.3157 : 10.7203,
        lng: opts.outside ? 123.8854 : 122.5622,
        accuracyM: opts.outside ? 42 : 8,
        geoResult: (opts.geo ?? (opts.outside ? "OUTSIDE_BOUNDARY" : "VERIFIED")) as never,
        deviceId: "demo-device-scanner-1",
        networkState: "online",
        source: "scanner",
        idempotencyKey: key,
        status: "accepted",
      },
    });
  };

  const startsPast = at(dayPast, "09:00");
  for (const p of PEOPLE) {
    if (p.absent) continue;
    const offset = p.lateMin ?? 0;
    const when = new Date(startsPast.getTime() + offset * 60000);
    const checkIn = await eventId({
      sessionId: sessionPast.id,
      person: p.slug,
      type: "CHECK_IN",
      when,
      outside: p.outsideGeo,
    });
    const outWhen = at(dayPast, "17:00");
    const checkOut = await eventId({
      sessionId: sessionPast.id,
      person: p.slug,
      type: "CHECK_OUT",
      when: outWhen,
      outside: p.outsideGeo,
    });
    const status = lateness(when, startsPast, policy.graceMin, policy.lateThresholdMin);
    await prisma.attendanceRecord.upsert({
      where: {
        organizationId_sessionId_personId: {
          organizationId: orgId,
          sessionId: sessionPast.id,
          personId: people[p.slug].id,
        },
      },
      update: {
        checkInEventId: checkIn.id,
        checkOutEventId: checkOut.id,
        durationMin: Math.round((outWhen.getTime() - when.getTime()) / 60000),
        status,
        approvalStatus: p.outsideGeo ? "PENDING" : "NONE",
        exceptionFlags: p.outsideGeo ? ["GEO_OUTSIDE"] : [],
      },
      create: {
        organizationId: orgId,
        sessionId: sessionPast.id,
        personId: people[p.slug].id,
        checkInEventId: checkIn.id,
        checkOutEventId: checkOut.id,
        durationMin: Math.round((outWhen.getTime() - when.getTime()) / 60000),
        status,
        approvalStatus: p.outsideGeo ? "PENDING" : "NONE",
        exceptionFlags: p.outsideGeo ? ["GEO_OUTSIDE"] : [],
      },
    });
  }

  // Absent demo: a record with no events.
  const gracePerson = people.grace;
  await prisma.attendanceRecord.upsert({
    where: {
      organizationId_sessionId_personId: {
        organizationId: orgId,
        sessionId: sessionPast.id,
        personId: gracePerson.id,
      },
    },
    update: { status: "ABSENT", durationMin: 0 },
    create: {
      organizationId: orgId,
      sessionId: sessionPast.id,
      personId: gracePerson.id,
      status: "ABSENT",
      durationMin: 0,
      exceptionFlags: ["NO_SHOW"],
    },
  });

  const startsToday = at(dayToday, "09:00");
  for (const p of PEOPLE) {
    if (!p.today) continue;
    const offset = p.today === "late" ? 24 : (p.lateMin ?? 0);
    const when = new Date(startsToday.getTime() + offset * 60000);
    const checkIn = await eventId({ sessionId: sessionToday.id, person: p.slug, type: "CHECK_IN", when });
    await prisma.attendanceRecord.upsert({
      where: {
        organizationId_sessionId_personId: {
          organizationId: orgId,
          sessionId: sessionToday.id,
          personId: people[p.slug].id,
        },
      },
      update: { checkInEventId: checkIn.id, status: lateness(when, startsToday, policy.graceMin, policy.lateThresholdMin) },
      create: {
        organizationId: orgId,
        sessionId: sessionToday.id,
        personId: people[p.slug].id,
        checkInEventId: checkIn.id,
        status: lateness(when, startsToday, policy.graceMin, policy.lateThresholdMin),
      },
    });
  }

  // 6. Device + a little audit history
  await optional("devices", () =>
    prisma.device.upsert({
      where: { organizationId_devicePublicId: { organizationId: orgId, devicePublicId: "demo-device-scanner-1" } },
      update: { lastSeenAt: new Date() },
      create: {
        organizationId: orgId,
        devicePublicId: "demo-device-scanner-1",
        role: "scanner",
        lastSeenAt: new Date(),
      },
    })
  );

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: adminUserId,
      action: "seed.demo",
      resource: `org:${orgId}`,
      result: "ok",
      meta: { sessions: [sessionPast.id, sessionToday.id, sessionEvent.id], people: PEOPLE.length },
    },
  });

  // 7. Report
  console.log("\nDemo seed complete\n");
  console.log("  org        ", org.name, orgId);
  console.log("  department ", department.name);
  console.log("  sessions   ", "yesterday (SHIFT), today (OJT), +7d (EVENT)");
  console.log("\n  accounts (password: " + DEMO_PASSWORD + ")");
  console.log("    admin@syntaxure.dev  OWNER + platform admin");
  console.log("    user@syntaxure.dev   MEMBER");
  console.log("\n  demo QR payloads");
  for (const p of PEOPLE) console.log(`    ${p.name.padEnd(20)} ${people[p.slug].qr}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
