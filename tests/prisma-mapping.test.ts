import { describe, expect, it } from "vitest";
import * as fs from "fs";

// Agent 1: Prisma ↔ live schema mapping guard.
// Live tables are lowercase snake_case; Prisma must carry @@map/@map (never rename live tables).
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const LIVE_TABLES = ["organizations", "users", "memberships", "membership_permissions", "people", "passes", "platform_admins", "audit_logs"];

describe("prisma mapping to live schema", () => {
  for (const t of LIVE_TABLES) {
    it(`maps @@map("${t}")`, () => {
      expect(schema).toContain(`@@map("${t}")`);
    });
  }
  it("maps snake_case columns", () => {
    for (const col of ['@map("auth_id")', '@map("organization_id")', '@map("user_id")', '@map("pass_public_id")', '@map("credential_hash")', '@map("display_name")', '@map("created_at")', '@map("revoked_at")', '@map("closed_at")', '@map("roster_enforced")', '@map("walk_in_allowed")', '@map("added_by_user_id")']) {
      expect(schema).toContain(col);
    }
  });
  it("maps the M1 session roster to session_roster", () => {
    expect(schema).toContain('@@map("session_roster")');
    expect(schema).toContain("@@unique([organizationId, sessionId, personId])");
    expect(schema).toContain("enum AttendanceSessionStatus");
    expect(schema).toContain("AttendanceSessionStatus @default(OPEN)");
  });
  it("documents pending models separately", () => {
    // Future tables (not yet in live DB) still carry @@map for additive migrations
    for (const t of ["campuses", "attendance_policies", "attendance_sessions", "attendance_events", "devices", "session_roster"]) {
      expect(schema).toContain(`@@map("${t}")`);
    }
  });
});
