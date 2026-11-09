import { describe, expect, it } from "vitest";
import {
  credentialHashForPass,
  hashCredential,
  newCredentialPair,
  passQrSecret,
  qrPayloadForPass,
} from "../modules/passes/service";
import { parseQrPayload } from "../modules/passes/verify";

process.env.PASS_QR_SECRET = "pass-qr-test-master-".padEnd(64, "b");

describe("derived pass QR", () => {
  it("derives a stable 64-hex secret per pass version", () => {
    const first = passQrSecret("pp_test", 1);
    const second = passQrSecret("pp_test", 1);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(passQrSecret("pp_test", 2)).not.toBe(first);
    expect(passQrSecret("pp_other", 1)).not.toBe(first);
  });

  it("builds a payload that parses and matches the stored verifier", () => {
    const pair = newCredentialPair("pp_test", 3);
    const parsed = parseQrPayload(pair.qrPayload);
    expect(parsed).toEqual({ passPublicId: "pp_test", secret: passQrSecret("pp_test", 3) });
    expect(pair.credentialHash).toBe(credentialHashForPass("pp_test", 3));
    expect(pair.credentialHash).toBe(hashCredential("pp_test", parsed!.secret));
    expect(qrPayloadForPass("pp_test", 3)).toBe(pair.qrPayload);
  });

  it("fails closed when the master key is missing or too short", () => {
    const saved = process.env.PASS_QR_SECRET;
    try {
      delete process.env.PASS_QR_SECRET;
      expect(() => passQrSecret("pp_test", 1)).toThrow(/PASS_QR_SECRET/);
      process.env.PASS_QR_SECRET = "short";
      expect(() => passQrSecret("pp_test", 1)).toThrow(/PASS_QR_SECRET/);
    } finally {
      process.env.PASS_QR_SECRET = saved;
    }
  });
});
