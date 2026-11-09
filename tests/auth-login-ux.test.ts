import { describe, expect, it } from "vitest";
import {
  getPasswordInputType,
  getPasswordToggleLabel,
} from "../components/auth/password-input";

describe("password visibility helpers", () => {
  it("keeps the field masked and offers to show it by default", () => {
    expect(getPasswordInputType(false)).toBe("password");
    expect(getPasswordToggleLabel(false)).toBe("Show password");
  });

  it("reveals the value and offers to hide it once toggled", () => {
    expect(getPasswordInputType(true)).toBe("text");
    expect(getPasswordToggleLabel(true)).toBe("Hide password");
  });

  it("uses the exact accessible labels required by the login UX", () => {
    expect([getPasswordToggleLabel(false), getPasswordToggleLabel(true)]).toEqual([
      "Show password",
      "Hide password",
    ]);
  });
});
