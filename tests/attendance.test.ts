import { describe, expect, it } from "vitest";
import { evaluateLateness, isDuplicateScan } from "../modules/attendance/service";
describe("attendance engine", () => {
  it("grace → present, then late", () => {
    const start = new Date("2026-11-04T08:00:00Z");
    expect(evaluateLateness(new Date("2026-11-04T08:05:00Z"), start, 10, 15)).toBe("PRESENT");
    expect(evaluateLateness(new Date("2026-11-04T08:12:00Z"), start, 10, 15)).toBe("LATE");
  });
  it("dedupe window", () => { expect(isDuplicateScan(0, 60_000)).toBe(true); expect(isDuplicateScan(0, 300_000)).toBe(false); });
});
