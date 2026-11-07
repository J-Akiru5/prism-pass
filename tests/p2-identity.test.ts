import { describe, expect, it } from "vitest";
import { createAssignmentInput, createProgramInput, updatePersonInput } from "../modules/identity/service";

describe("people directory contracts", () => {
  it("update requires at least one field; status is active|inactive", () => {
    expect(() => updatePersonInput.parse({})).toThrow();
    expect(updatePersonInput.parse({ status: "inactive" }).status).toBe("inactive");
    expect(() => updatePersonInput.parse({ status: "banned" })).toThrow();
  });

  it("programs accept employee/intern/event kinds (single directory, no per-group tables)", () => {
    for (const kind of ["employee", "intern", "event", "class", "visitor", "training"]) {
      expect(createProgramInput.parse({ name: "X", kind }).kind).toBe(kind);
    }
  });

  it("assignments default to participant; person link required", () => {
    expect(createAssignmentInput.parse({ personId: "p1" }).role).toBe("participant");
    expect(() => createAssignmentInput.parse({})).toThrow();
  });
});
