import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  chainHash,
  documentContentHash,
  evaluateSigning,
  isFullySigned,
  isValidSignatureOrder,
  nextDocumentStatus,
  nextDocumentVersion,
  sha256Hex,
  signerKey,
  verifyChain,
  type ChainEvent,
  type SignatureOrderStep,
} from "../modules/documents/service";

const order: SignatureOrderStep[] = [
  { order: 1, signerUserId: "user-employee", role: "employee" },
  { order: 2, signerUserId: "user-supervisor", role: "supervisor" },
  { order: 3, signerPersonId: "person-manager", role: "manager" },
];

function signingContext(overrides: Partial<Parameters<typeof evaluateSigning>[0]> = {}) {
  return {
    order,
    signedEvents: [] as Array<{ signerUserId?: string | null; signerPersonId?: string | null }>,
    documentStatus: "DRAFT" as const,
    consentVersion: "consent-v1",
    requiredConsentVersion: "consent-v1",
    actorKeys: [signerKey({ signerUserId: "user-employee" })],
    now: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const chainSeed = {
  requestId: "req-1",
  docHash: "a".repeat(64),
  consentVersion: "consent-v1",
  serverTs: new Date("2026-01-01T00:00:00.000Z"),
};

function buildChain(links: Array<{ signerKey: string; serverTs: Date }>): ChainEvent[] {
  let previous: string | null = null;
  return links.map((link) => {
    const event = {
      ...chainSeed,
      ...link,
      prevHash: previous,
      currHash: "",
    };
    event.currHash = chainHash(event);
    previous = event.currHash;
    return event;
  });
}

describe("canonical document payload + hash", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(canonicalJson({ b: 1, a: { z: 2, y: [3, { d: 4, c: 5 }] } })).toBe(
      '{"a":{"y":[3,{"c":5,"d":4}],"z":2},"b":1}',
    );
  });

  it("is stable across key insertion order (same bytes, same sha256)", () => {
    const first = { template: "timesheet", version: 1, payload: { hours: 8, person: { id: "p1", name: "A" } } };
    const second = { payload: { person: { name: "A", id: "p1" }, hours: 8 }, version: 1, template: "timesheet" };
    expect(documentContentHash(first)).toBe(documentContentHash(second));
    expect(documentContentHash(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when any committed content changes", () => {
    const base = { template: "timesheet", version: 1, payload: { hours: 8 } };
    expect(documentContentHash({ ...base, payload: { hours: 9 } })).not.toBe(documentContentHash(base));
    expect(documentContentHash({ ...base, version: 2 })).not.toBe(documentContentHash(base));
    expect(documentContentHash({ ...base, template: "certificate" })).not.toBe(documentContentHash(base));
  });

  it("normalizes dates to ISO and rejects non-finite numbers", () => {
    expect(canonicalJson({ at: new Date("2026-01-01T00:00:00.000Z") })).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(/non-finite/);
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("hash-chained signature events", () => {
  it("verifies a genesis event and a linked chain", () => {
    const chain = buildChain([
      { signerKey: "user:user-employee", serverTs: new Date("2026-01-01T00:00:00.000Z") },
      { signerKey: "user:user-supervisor", serverTs: new Date("2026-01-01T00:01:00.000Z") },
      { signerKey: "person:person-manager", serverTs: new Date("2026-01-01T00:02:00.000Z") },
    ]);
    expect(chain[1].prevHash).toBe(chain[0].currHash);
    expect(chain[2].prevHash).toBe(chain[1].currHash);
    expect(verifyChain(chain, { requestId: "req-1" })).toEqual({ ok: true, brokenAt: null });
    expect(verifyChain([])).toEqual({ ok: true, brokenAt: null });
  });

  it("is deterministic across Date and ISO-string timestamps", () => {
    const asDate = chainHash({ ...chainSeed, prevHash: null, signerKey: "user:u1" });
    const asString = chainHash({ ...chainSeed, serverTs: "2026-01-01T00:00:00.000Z", prevHash: "", signerKey: "user:u1" });
    expect(asDate).toBe(asString);
  });

  it("detects a tampered docHash at the exact index", () => {
    const chain = buildChain([
      { signerKey: "user:u1", serverTs: new Date("2026-01-01T00:00:00.000Z") },
      { signerKey: "user:u2", serverTs: new Date("2026-01-01T00:01:00.000Z") },
    ]);
    chain[1] = { ...chain[1], docHash: "b".repeat(64) };
    expect(verifyChain(chain)).toEqual({ ok: false, brokenAt: 1, reason: "hash_mismatch" });
  });

  it("detects a broken prevHash link", () => {
    const chain = buildChain([
      { signerKey: "user:u1", serverTs: new Date("2026-01-01T00:00:00.000Z") },
      { signerKey: "user:u2", serverTs: new Date("2026-01-01T00:01:00.000Z") },
    ]);
    chain[1] = { ...chain[1], prevHash: "c".repeat(64) };
    expect(verifyChain(chain)).toEqual({ ok: false, brokenAt: 1, reason: "prev_mismatch" });
  });

  it("detects reordering, tampered signer identity, and foreign request ids", () => {
    const chain = buildChain([
      { signerKey: "user:u1", serverTs: new Date("2026-01-01T00:00:00.000Z") },
      { signerKey: "user:u2", serverTs: new Date("2026-01-01T00:01:00.000Z") },
    ]);
    expect(verifyChain([chain[1], chain[0]]).ok).toBe(false);
    const tamperedSigner = [{ ...chain[0], signerKey: "user:attacker" }, chain[1]];
    expect(verifyChain(tamperedSigner).brokenAt).toBe(0);
    expect(verifyChain(chain, { requestId: "req-other" })).toEqual({
      ok: false,
      brokenAt: 0,
      reason: "request_mismatch",
    });
  });
});

describe("signing order, consent, duplicate protection and sealing", () => {
  it("allows only the current step to sign", () => {
    expect(evaluateSigning(signingContext()).ok).toBe(true);
    const wrongTurn = evaluateSigning(signingContext({ actorKeys: [signerKey({ signerUserId: "user-supervisor" })] }));
    expect(wrongTurn).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
  });

  it("advances one step at a time in the assigned order", () => {
    const firstSigned = [{ signerUserId: "user-employee" }];
    const second = evaluateSigning(
      signingContext({ signedEvents: firstSigned, actorKeys: [signerKey({ signerUserId: "user-supervisor" })] }),
    );
    expect(second).toMatchObject({ ok: true, sequence: 1, sealsDocument: false });
    const third = evaluateSigning(
      signingContext({
        signedEvents: [...firstSigned, { signerUserId: "user-supervisor" }],
        actorKeys: [signerKey({ signerPersonId: "person-manager" })],
      }),
    );
    expect(third).toMatchObject({ ok: true, sequence: 2, sealsDocument: true });
  });

  it("rejects a signer signing twice (idempotent re-sign protection)", () => {
    const decision = evaluateSigning(signingContext({ signedEvents: [{ signerUserId: "user-employee" }] }));
    expect(decision).toMatchObject({ ok: false, code: "ALREADY_SIGNED" });
  });

  it("requires the explicit consent version and an exact match", () => {
    expect(evaluateSigning(signingContext({ consentVersion: null }))).toMatchObject({
      ok: false,
      code: "CONSENT_REQUIRED",
    });
    expect(evaluateSigning(signingContext({ consentVersion: "consent-v0" }))).toMatchObject({
      ok: false,
      code: "CONSENT_VERSION_MISMATCH",
    });
  });

  it("refuses non-draft documents and expired requests", () => {
    expect(evaluateSigning(signingContext({ documentStatus: "SEALED" }))).toMatchObject({
      ok: false,
      code: "DOCUMENT_NOT_DRAFT",
    });
    expect(
      evaluateSigning(signingContext({ expiresAt: new Date("2025-12-31T23:59:00.000Z") })),
    ).toMatchObject({ ok: false, code: "REQUEST_EXPIRED" });
  });

  it("rejects invalid orders and stored events that skip the first step", () => {
    expect(isValidSignatureOrder([])).toBe(false);
    expect(isValidSignatureOrder([{ order: 2, signerUserId: "u1" }])).toBe(false);
    expect(
      isValidSignatureOrder([
        { order: 1, signerUserId: "u1" },
        { order: 2, signerUserId: "u1" },
      ]),
    ).toBe(false);
    expect(
      evaluateSigning(signingContext({ signedEvents: [{ signerUserId: "user-supervisor" }] })),
    ).toMatchObject({ ok: false, code: "INVALID_ORDER" });
  });

  it("reports all steps signed and seals only when the last step completes", () => {
    const allSigned = [
      { signerUserId: "user-employee" },
      { signerUserId: "user-supervisor" },
      { signerPersonId: "person-manager" },
    ];
    expect(isFullySigned(order, allSigned)).toBe(true);
    expect(isFullySigned(order, allSigned.slice(0, 2))).toBe(false);
    expect(evaluateSigning(signingContext({ signedEvents: allSigned }))).toMatchObject({
      ok: false,
      code: "ALL_STEPS_SIGNED",
    });
    expect(nextDocumentStatus("DRAFT", false)).toBe("DRAFT");
    expect(nextDocumentStatus("DRAFT", true)).toBe("SEALED");
  });

  it("never overwrites a sealed, superseded or revoked document", () => {
    expect(nextDocumentStatus("SEALED", true)).toBe("SEALED");
    expect(nextDocumentStatus("SUPERSEDED", true)).toBe("SUPERSEDED");
    expect(nextDocumentStatus("REVOKED", true)).toBe("REVOKED");
  });

  it("versions corrections as a fresh draft instead of mutating the sealed row", () => {
    expect(nextDocumentVersion({ version: 1, status: "SEALED" })).toEqual({ version: 2, status: "DRAFT" });
    expect(nextDocumentVersion({ version: 7, status: "REVOKED" })).toEqual({ version: 8, status: "DRAFT" });
    expect(() => nextDocumentVersion({ version: 0, status: "DRAFT" })).toThrow(/positive integer/);
  });

  it("builds stable signer keys from user or person identity", () => {
    expect(signerKey({ signerUserId: "u1" })).toBe("user:u1");
    expect(signerKey({ signerPersonId: "p1" })).toBe("person:p1");
    expect(signerKey({ signerUserId: "u1", signerPersonId: "p1" })).toBe("user:u1");
    expect(() => signerKey({})).toThrow(/signerUserId or signerPersonId/);
  });
});
