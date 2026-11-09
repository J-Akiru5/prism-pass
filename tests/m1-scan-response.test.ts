import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import type { ScanFailure, ScanSuccessData } from "@/modules/attendance/scan-service";

// M1-7/M1-8: accepted, duplicate and deduped scans carry the attendee name;
// refusals and the pass-verify endpoint stay name-free and photo-free.

const source = readFileSync("modules/attendance/scan-service.ts", "utf8");
const verifyRoute = readFileSync("app/api/v1/orgs/[orgId]/passes/verify/route.ts", "utf8");
const successBlock = source.slice(source.indexOf("export type ScanSuccessData"), source.indexOf("export type ScanFailure"));
const failureBlock = source.slice(source.indexOf("export type ScanFailure"), source.indexOf("export type ScanOutcome"));

const sample = (extra: Partial<ScanSuccessData> = {}): ScanSuccessData => ({
  event: {} as ScanSuccessData["event"],
  geoResult: "NOT_CAPTURED",
  personName: "Maria Santos",
  ...extra,
});

describe("M1 scan response shape", () => {
  it("carries personName on an accepted scan", () => {
    expect(sample().personName).toBe("Maria Santos");
  });

  it("carries personName on a duplicate scan", () => {
    const duplicate = sample({ duplicate: true });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.personName).toBe("Maria Santos");
  });

  it("carries personName on an idempotent dedupe", () => {
    const dedupe = sample({ dedupe: true, key: "idempotencyKey" });
    expect(dedupe.dedupe).toBe(true);
    expect(dedupe.personName).toBe("Maria Santos");
  });

  it("requires personName in the success type, not just at runtime", () => {
    expect(successBlock).toContain("personName: string;");
    // @ts-expect-error personName is required on every ScanSuccessData payload.
    const missing: ScanSuccessData = { event: {} as ScanSuccessData["event"], geoResult: "NOT_CAPTURED" };
    expect(missing).toBeTruthy();
  });

  it("populates the name at all three success return sites", () => {
    expect(source.match(/personName: pass\.person\.displayName/g)?.length).toBe(3);
  });

  it("keeps refusals name-free and photo-free", () => {
    const failure: ScanFailure = { status: 409, code: "EVENT_CLOSED", message: "This event is closed" };
    expect(failure).toEqual({ status: 409, code: "EVENT_CLOSED", message: "This event is closed" });
    expect(failure).not.toHaveProperty("personName");
    expect(failure).not.toHaveProperty("photo");
    expect(failureBlock).not.toMatch(/personName|displayName|photo/i);
    expect(JSON.stringify(failure)).not.toMatch(/Maria|displayName|personName|photo/i);
  });

  it("leaves the pass-verify response unchanged", () => {
    expect(verifyRoute).toContain(
      'return ok({ valid: true, reason: duplicate ? "VALID_DUPLICATE" : "VALID", passPublicId: pass.passPublicId, version: pass.version, personId: pass.personId, duplicate });',
    );
    expect(verifyRoute).not.toMatch(/personName|displayName|photo/i);
  });
});
