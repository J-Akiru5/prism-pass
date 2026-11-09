import { describe, expect, it } from "vitest";
import {
  buildPublicVerification,
  isCertificateVerification,
  isVerificationTokenCandidate,
  signatureRequestsChainValid,
  VERIFY_TOKEN_MAX_LENGTH,
  VERIFY_TOKEN_MIN_LENGTH,
  type PublicVerificationChainEvent,
  type PublicVerificationDocument,
  type PublicVerificationSignatureRequest,
} from "../modules/certificates/public";
import {
  buildCertificatePayload,
  certificateContentHash,
  type BuildCertificatePayloadInput,
} from "../modules/certificates/payload";
import { CERTIFICATE_TEMPLATE_KEY } from "../modules/certificates/schema";
import { chainHash } from "../modules/documents/service";

const baseInput: BuildCertificatePayloadInput = {
  organization: { id: "org_syntaxure", name: "Syntaxure Labs" },
  event: {
    sessionId: "sess_orientation",
    title: "Safety Orientation",
    type: "TRAINING",
    // 09:00–13:00 on 9 November 2026 in Manila (UTC+8).
    startsAt: "2026-11-09T01:00:00.000Z",
    endsAt: "2026-11-09T05:00:00.000Z",
    timezone: "Asia/Manila",
  },
  recipient: { personId: "person_maria", displayName: "Maria Clara Santos" },
  signatory: {
    userId: "user_jose",
    personId: "person_jose",
    displayName: "Jose Rizal",
    roleLabel: "Training Director",
  },
  statement: "This certifies that Maria Clara Santos attended Safety Orientation.",
  issuedOn: "2026-11-09",
};

const basePayload = buildCertificatePayload(baseInput);
const baseHash = certificateContentHash(basePayload);

const REQUEST_ID = "req_certificate";
const SIGNER_USER_ID = "user_jose";
const SIGNER_PERSON_ID = "person_jose";
const CONSENT_VERSION = "certificate-v1";
const SEALED_AT = "2026-11-09T06:00:00.000Z";
const CREATED_AT = "2026-11-09T05:30:00.000Z";

function certificateDocument(
  overrides: Partial<PublicVerificationDocument> = {},
): PublicVerificationDocument {
  return {
    template: CERTIFICATE_TEMPLATE_KEY,
    title: "Certificate of Attendance",
    version: 1,
    sha256: baseHash,
    payload: basePayload,
    status: "SEALED",
    sealedAt: SEALED_AT,
    verifyToken: "dv_abcdefgh12345678",
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function signedRequest(
  overrides: {
    requestId?: string;
    docHash?: string;
    currHash?: string;
    signerUserId?: string | null;
    signerPersonId?: string | null;
  } = {},
): PublicVerificationSignatureRequest {
  const requestId = overrides.requestId ?? REQUEST_ID;
  const docHash = overrides.docHash ?? baseHash;
  const signerUserId = overrides.signerUserId === undefined ? SIGNER_USER_ID : overrides.signerUserId;
  const signerPersonId =
    overrides.signerPersonId === undefined ? SIGNER_PERSON_ID : overrides.signerPersonId;
  const signerKey = signerUserId
    ? `user:${signerUserId}`
    : signerPersonId
      ? `person:${signerPersonId}`
      : "";
  const serverTs = SEALED_AT;
  const currHash = chainHash({
    prevHash: null,
    requestId,
    docHash,
    signerKey,
    consentVersion: CONSENT_VERSION,
    serverTs,
  });

  const event: PublicVerificationChainEvent = {
    requestId,
    signerUserId,
    signerPersonId,
    docHash,
    consentVersion: CONSENT_VERSION,
    serverTs,
    prevHash: null,
    currHash: overrides.currHash ?? currHash,
  };
  return { id: requestId, events: [event] };
}

function expectCertificate(payload: ReturnType<typeof buildPublicVerification>) {
  expect(payload).not.toBeNull();
  if (!payload || !isCertificateVerification(payload)) {
    throw new Error("expected a certificate verification payload");
  }
  return payload;
}

describe("public certificate response allowlist", () => {
  it("returns only the allowlisted certificate keys and no recipient or signer PII", () => {
    const projection = expectCertificate(buildPublicVerification(certificateDocument(), [signedRequest()]));

    expect(Object.keys(projection).sort()).toEqual(
      [
        "certificateNumber",
        "eventDateLabel",
        "eventTitle",
        "exists",
        "hashPrefix",
        "integrity",
        "organizationName",
        "sealed",
        "sealedAt",
        "signatoryRoleLabel",
        "status",
        "title",
      ].sort(),
    );
    expect(projection.integrity).toBe("verified");
    expect(projection.certificateNumber).toBe("CERT-12345678");

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("Maria Clara Santos");
    expect(serialized).not.toContain("person_maria");
    expect(serialized).not.toContain("Jose Rizal");
    expect(serialized).not.toContain("user_jose");
    expect(serialized).not.toContain("person_jose");
    expect(serialized).not.toContain("statement");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("authEvidence");
    expect(serialized).not.toContain("consentVersion");
    expect(serialized).not.toContain("prevHash");
    expect(serialized).not.toContain("currHash");
    // Attendance instants are not part of the public projection.
    expect(serialized).not.toContain("2026-11-09T01:00:00.000Z");
    expect(serialized).not.toContain("2026-11-09T05:00:00.000Z");
    expect(serialized).not.toContain("createdAt");
  });

  it("keeps the original minimal shape for a non-certificate document", () => {
    const sha256 = "f".repeat(64);
    const generic = buildPublicVerification(
      certificateDocument({
        template: "timesheet.v1",
        title: "November timesheet",
        payload: { hours: 8, person: { id: "person_maria", displayName: "Maria Clara Santos" } },
        sha256,
      }),
      [],
    );

    expect(generic).toEqual({
      exists: true,
      sealed: true,
      hashPrefix: sha256.slice(0, 16),
      createdAt: CREATED_AT,
      sealedAt: SEALED_AT,
    });
    expect(generic && isCertificateVerification(generic)).toBe(false);
    expect(Object.keys(generic ?? {}).sort()).toEqual(
      ["createdAt", "exists", "hashPrefix", "sealed", "sealedAt"].sort(),
    );
    expect(JSON.stringify(generic)).not.toContain("timesheet");
    expect(JSON.stringify(generic)).not.toContain("Maria Clara Santos");
  });

  it("preserves the generic draft status semantics", () => {
    const generic = buildPublicVerification(
      certificateDocument({
        template: "approval.v1",
        status: "DRAFT",
        sealedAt: null,
        sha256: "a".repeat(64),
      }),
      [],
    );
    expect(generic).toMatchObject({ exists: true, sealed: false, sealedAt: null });
  });
});

describe("public certificate integrity mapping", () => {
  it("reports a sealed, hash-matching certificate with an intact chain as verified", () => {
    const projection = expectCertificate(buildPublicVerification(certificateDocument(), [signedRequest()]));
    expect(projection).toMatchObject({
      exists: true,
      status: "SEALED",
      sealed: true,
      integrity: "verified",
      organizationName: "Syntaxure Labs",
      eventTitle: "Safety Orientation",
      eventDateLabel: "November 9, 2026",
      signatoryRoleLabel: "Training Director",
      sealedAt: SEALED_AT,
    });
  });

  it("reports a payload changed after sealing as hash_mismatch", () => {
    const tampered = buildCertificatePayload({
      ...baseInput,
      recipient: { personId: "person_maria", displayName: "Someone Else" },
    });
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument({ payload: tampered }), [signedRequest()]),
    );
    expect(projection).toMatchObject({ exists: true, integrity: "hash_mismatch", sealed: true });
  });

  it("reports a tampered signature event as chain_broken", () => {
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument(), [signedRequest({ currHash: "0".repeat(64) })]),
    );
    expect(projection).toMatchObject({ exists: true, integrity: "chain_broken", sealed: true });
  });

  it("fails closed when a chain event has no signer identity", () => {
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument(), [
        signedRequest({ signerUserId: null, signerPersonId: null }),
      ]),
    );
    expect(projection).toMatchObject({ exists: true, integrity: "chain_broken" });
  });

  it("reports a draft as not_sealed", () => {
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument({ status: "DRAFT", sealedAt: null }), []),
    );
    expect(projection).toMatchObject({ exists: true, sealed: false, integrity: "not_sealed" });
  });

  it("reports a superseded document as not_sealed", () => {
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument({ status: "SUPERSEDED" }), [signedRequest()]),
    );
    expect(projection).toMatchObject({ exists: true, sealed: false, integrity: "not_sealed" });
  });

  it("reports a revoked certificate as revoked even when the sealed row is intact", () => {
    const projection = expectCertificate(
      buildPublicVerification(certificateDocument({ status: "REVOKED" }), [signedRequest()]),
    );
    expect(projection).toMatchObject({ exists: true, sealed: false, integrity: "revoked" });
  });
});

describe("signature request chain checks", () => {
  it("accepts every independently valid request and rejects one broken request", () => {
    expect(signatureRequestsChainValid([signedRequest(), signedRequest({ requestId: "req_second" })])).toBe(
      true,
    );
    expect(
      signatureRequestsChainValid([
        signedRequest(),
        signedRequest({ requestId: "req_second", currHash: "1".repeat(64) }),
      ]),
    ).toBe(false);
  });

  it("rejects an event transplanted from another request", () => {
    expect(signatureRequestsChainValid([{ id: "req_other", events: signedRequest().events }])).toBe(false);
  });

  it("treats an empty request list as unchecked, not broken", () => {
    expect(signatureRequestsChainValid([])).toBe(true);
    expect(signatureRequestsChainValid(null)).toBe(true);
  });
});

describe("verification token handling", () => {
  it("accepts only tokens inside the route bounds", () => {
    expect(isVerificationTokenCandidate("a".repeat(VERIFY_TOKEN_MIN_LENGTH - 1))).toBe(false);
    expect(isVerificationTokenCandidate("a".repeat(VERIFY_TOKEN_MIN_LENGTH))).toBe(true);
    expect(isVerificationTokenCandidate("a".repeat(VERIFY_TOKEN_MAX_LENGTH))).toBe(true);
    expect(isVerificationTokenCandidate("a".repeat(VERIFY_TOKEN_MAX_LENGTH + 1))).toBe(false);
    expect(isVerificationTokenCandidate("")).toBe(false);
    expect(isVerificationTokenCandidate(null)).toBe(false);
    expect(isVerificationTokenCandidate(undefined)).toBe(false);
  });

  it("returns null (route 404) for an unknown token", () => {
    expect(buildPublicVerification(null)).toBeNull();
    expect(buildPublicVerification(undefined, [])).toBeNull();
  });
});
