import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { evaluateSessionAdmission, type SessionAdmissionInput } from "@/modules/attendance/engine";

// M1-5/M1-6 admission rules. The pure policy is the contract; the scan service
// applies it between the idempotency lookup and the duplicate window, which the
// source-order test below locks down (no DB harness needed).

const openUnlisted: SessionAdmissionInput = {
  status: "OPEN",
  rosterEnforced: false,
  walkInAllowed: false,
  onRoster: false,
};

const deny = (code: "EVENT_CLOSED" | "NOT_ON_ROSTER") => ({ allowed: false, code });

describe("M1 session admission", () => {
  it("refuses a valid, listed person when the event is closed", () => {
    expect(evaluateSessionAdmission({ ...openUnlisted, status: "CLOSED", onRoster: true })).toEqual(deny("EVENT_CLOSED"));
  });

  it("refuses a walk-in when the event is closed", () => {
    expect(
      evaluateSessionAdmission({ status: "CLOSED", rosterEnforced: true, walkInAllowed: true, onRoster: false }),
    ).toEqual(deny("EVENT_CLOSED"));
  });

  it("allows a listed person while the event is open", () => {
    expect(
      evaluateSessionAdmission({ status: "OPEN", rosterEnforced: true, walkInAllowed: false, onRoster: true }),
    ).toEqual({ allowed: true });
  });

  it("denies an unlisted person when the roster is enforced and walk-ins are off", () => {
    expect(
      evaluateSessionAdmission({ status: "OPEN", rosterEnforced: true, walkInAllowed: false, onRoster: false }),
    ).toEqual(deny("NOT_ON_ROSTER"));
  });

  it("denies against an empty roster", () => {
    const emptyRoster = { status: "OPEN" as const, rosterEnforced: true, walkInAllowed: false, onRoster: false };
    expect(evaluateSessionAdmission(emptyRoster)).toEqual(deny("NOT_ON_ROSTER"));
  });

  it("allows an unlisted person when walk-ins are enabled", () => {
    expect(
      evaluateSessionAdmission({ status: "OPEN", rosterEnforced: true, walkInAllowed: true, onRoster: false }),
    ).toEqual({ allowed: true });
  });

  it("does not enforce a roster when the session opted out", () => {
    expect(
      evaluateSessionAdmission({ status: "OPEN", rosterEnforced: false, walkInAllowed: false, onRoster: false }),
    ).toEqual({ allowed: true });
  });

  it("closed wins over the roster, even for an unlisted person", () => {
    const result = evaluateSessionAdmission({
      status: "CLOSED",
      rosterEnforced: true,
      walkInAllowed: false,
      onRoster: false,
    });
    expect(result).toEqual(deny("EVENT_CLOSED"));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.code).not.toBe("NOT_ON_ROSTER");
  });

  it("keeps the refusal name-free and code-only", () => {
    const result = evaluateSessionAdmission({ ...openUnlisted, rosterEnforced: true, onRoster: false });
    expect(result).toEqual({ allowed: false, code: "NOT_ON_ROSTER" });
    expect(JSON.stringify(result)).not.toMatch(/displayName|personName|photo|Maria/i);
  });
});

describe("M1 scan-service gate order", () => {
  const service = readFileSync("modules/attendance/scan-service.ts", "utf8");

  it("checks idempotency first, then the gate, then the duplicate window", () => {
    const idempotency = service.indexOf("const existingKey");
    const gate = service.indexOf("evaluateSessionAdmission({");
    const duplicate = service.indexOf("// 3. Duplicate window");
    expect(idempotency).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(idempotency);
    expect(duplicate).toBeGreaterThan(gate);
  });

  it("keeps an accepted pre-close replay accepted by returning the idempotent event first", () => {
    const idempotencyReturn = service.indexOf("if (existingKey) {");
    const gateCall = service.indexOf("evaluateSessionAdmission({");
    expect(idempotencyReturn).toBeGreaterThan(-1);
    expect(gateCall).toBeGreaterThan(idempotencyReturn);
    const replayBranch = service.slice(idempotencyReturn, gateCall);
    expect(replayBranch).toContain("dedupe: true");
    expect(replayBranch).not.toContain("EVENT_CLOSED");
  });

  it("returns 409 EVENT_CLOSED and 403 NOT_ON_ROSTER", () => {
    expect(service).toContain('status: 409, code: "EVENT_CLOSED"');
    expect(service).toContain('status: 403, code: "NOT_ON_ROSTER"');
  });

  it("uses the pure policy rather than an inline copy of the rules", () => {
    expect(service).toContain("evaluateSessionAdmission({");
    expect(service).not.toContain('session.status === "CLOSED"');
  });
});

describe("M1 session defaults", () => {
  const sessionRoute = readFileSync("app/api/v1/orgs/[orgId]/sessions/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/0009_m1_events.sql", "utf8");

  it("defaults a new EVENT to roster enforcement unless explicitly disabled", () => {
    expect(sessionRoute).toContain('input.rosterEnforced ?? input.type === "EVENT"');
  });

  it("keeps the database default false so existing sessions keep working", () => {
    expect(migration).toContain("roster_enforced boolean not null default false");
    expect(migration).toContain("walk_in_allowed boolean not null default false");
    expect(migration).toContain('"AttendanceSessionStatus" not null default \'OPEN\'');
  });
});
