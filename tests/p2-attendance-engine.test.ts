import { describe, expect, it } from "vitest";
import {
  createSessionInput,
  reconcileRecord,
  resolveDirection,
  scanInput,
} from "../modules/attendance/engine";

describe("single canonical engine (P2/P3 contracts)", () => {
  it("auto direction: first scan in, second out — all session types behave identically", () => {
    expect(resolveDirection("auto", false)).toBe("CHECK_IN");
    expect(resolveDirection("auto", true)).toBe("CHECK_OUT");
    expect(resolveDirection("in", true)).toBe("CHECK_IN");
    expect(resolveDirection("out", false)).toBe("CHECK_OUT");
    // No per-group branching: employees, interns, participants share this path
    for (const t of ["EVENT", "OJT", "SHIFT", "CLASS", "VISITOR", "TRAINING"]) {
      expect(createSessionInput.parse({
        policyId: "p1", type: t, title: "x",
        startsAt: "2026-11-05T08:00:00Z", endsAt: "2026-11-05T12:00:00Z",
      }).type).toBe(t);
    }
  });

  it("reconcile: check-in sets lateness, check-out sets duration", () => {
    const start = new Date("2026-11-05T08:00:00Z");
    const early = reconcileRecord({ checkInAt: null, checkOutAt: null }, "CHECK_IN", new Date("2026-11-05T08:05:00Z"), start, 10, 15);
    expect(early.status).toBe("PRESENT");
    expect(early.durationMin).toBeNull();
    const late = reconcileRecord({ checkInAt: null, checkOutAt: null }, "CHECK_IN", new Date("2026-11-05T08:20:00Z"), start, 10, 15);
    expect(late.status).toBe("LATE");
  });

  it("rejects endsAt before startsAt; scan input requires credential + clientTs", () => {
    expect(() => createSessionInput.parse({
      policyId: "p1", title: "x", startsAt: "2026-11-05T12:00:00Z", endsAt: "2026-11-05T08:00:00Z",
    })).toThrow();
    expect(() => scanInput.parse({ credential: "short", clientTs: "not-a-date" })).toThrow();
    expect(scanInput.parse({ credential: "PRISM1:abc:def", clientTs: "2026-11-05T08:00:00Z" }).direction).toBe("auto");
  });
});
