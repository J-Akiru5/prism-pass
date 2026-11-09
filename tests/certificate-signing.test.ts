import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_CONSENT_TEXT,
  CERTIFICATE_CONSENT_VERSION,
  CERTIFICATE_SIGNING_BATCH_MAX,
  actorSignerKeys,
  certificateBatchSignAuditMeta,
  certificateBatchSignInput,
  chainFromEventRows,
  decideCertificateBatchSigning,
  inspectCertificateBatchDocument,
  projectMemberCertificate,
  readSignatureOrder,
  type CertificateBatchDocumentRow,
  type CertificateBatchSigningDocument,
  type MemberCertificateSource,
} from "../modules/documents/sign";
import { chainHash, signerKey, verifyChain } from "../modules/documents/service";
import { buildCertificatePayload } from "../modules/certificates/payload";
import { CERTIFICATE_TEMPLATE_KEY, type CertificatePayloadV1 } from "../modules/certificates/schema";

const CONSENT = "certificate-consent-v1";
const SIGNER = "user:signer-jose";

function batchDocument(
  overrides: Partial<CertificateBatchSigningDocument> = {},
): CertificateBatchSigningDocument {
  return {
    documentId: "doc_1",
    requestId: "req_1",
    documentStatus: "DRAFT",
    requestStatus: "pending",
    orderSignerKeys: [SIGNER],
    signedSignerKeys: [],
    requestConsentVersion: CONSENT,
    chainValid: true,
    ...overrides,
  };
}

function signedDocument(
  overrides: Partial<CertificateBatchSigningDocument> = {},
): CertificateBatchSigningDocument {
  return batchDocument({
    documentStatus: "SEALED",
    requestStatus: "signed",
    signedSignerKeys: [SIGNER],
    ...overrides,
  });
}

function pendingBatch(count: number): CertificateBatchSigningDocument[] {
  return Array.from({ length: count }, (_, index) =>
    batchDocument({ documentId: `doc_${index}`, requestId: `req_${index}` }),
  );
}

const payloadInput = {
  organization: { id: "org_syntaxure", name: "Syntaxure Labs" },
  event: {
    sessionId: "sess_orientation",
    title: "Safety Orientation",
    type: "TRAINING" as const,
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

const payload: CertificatePayloadV1 = buildCertificatePayload(payloadInput);

describe("certificate batch signing decision", () => {
  it("signs a fully pending batch as the assigned signatory", () => {
    const documents = pendingBatch(3);
    const decision = decideCertificateBatchSigning({
      documents,
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });

    expect(decision).toEqual({
      status: "sign",
      documentIds: ["doc_0", "doc_1", "doc_2"],
      signerKey: SIGNER,
    });
  });

  it("reports an already-signed batch instead of re-signing it", () => {
    const documents = [signedDocument(), signedDocument({ documentId: "doc_2", requestId: "req_2" })];
    const decision = decideCertificateBatchSigning({
      documents,
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });

    expect(decision).toEqual({ status: "already_signed", documentIds: ["doc_1", "doc_2"] });
  });

  it("refuses a partially signed batch and names both sides", () => {
    const documents = [
      signedDocument({ documentId: "doc_signed" }),
      batchDocument({ documentId: "doc_pending_1", requestId: "req_2" }),
      batchDocument({ documentId: "doc_pending_2", requestId: "req_3" }),
    ];
    const decision = decideCertificateBatchSigning({
      documents,
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });

    expect(decision).toEqual({
      status: "partial",
      documentIds: ["doc_signed"],
      pendingDocumentIds: ["doc_pending_1", "doc_pending_2"],
    });
  });

  it("requires the actor to be the assigned signatory", () => {
    const decision = decideCertificateBatchSigning({
      documents: [batchDocument()],
      actorKeys: ["user:someone-else"],
      consentVersion: CONSENT,
    });

    expect(decision).toMatchObject({ status: "invalid", code: "NOT_YOUR_TURN" });
  });

  it("refuses a batch whose certificates were assigned to different signers", () => {
    const decision = decideCertificateBatchSigning({
      documents: [
        batchDocument({ documentId: "doc_a", orderSignerKeys: [SIGNER] }),
        batchDocument({ documentId: "doc_b", requestId: "req_b", orderSignerKeys: ["user:other"] }),
      ],
      actorKeys: [SIGNER, "user:other"],
      consentVersion: CONSENT,
    });

    expect(decision).toMatchObject({ status: "invalid", code: "SIGNER_MISMATCH" });
  });

  it("caps the batch at one hundred certificates", () => {
    const atLimit = decideCertificateBatchSigning({
      documents: pendingBatch(CERTIFICATE_SIGNING_BATCH_MAX),
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(atLimit.status).toBe("sign");
    expect(atLimit.status === "sign" && atLimit.documentIds).toHaveLength(
      CERTIFICATE_SIGNING_BATCH_MAX,
    );

    const overLimit = decideCertificateBatchSigning({
      documents: pendingBatch(CERTIFICATE_SIGNING_BATCH_MAX + 1),
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(overLimit).toMatchObject({ status: "invalid", code: "BATCH_LIMIT" });

    const empty = decideCertificateBatchSigning({
      documents: [],
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(empty).toMatchObject({ status: "invalid", code: "BATCH_EMPTY" });
  });

  it("requires the exact consent version and refuses a mismatch", () => {
    const missing = decideCertificateBatchSigning({
      documents: [batchDocument()],
      actorKeys: [SIGNER],
    });
    expect(missing).toMatchObject({ status: "invalid", code: "CONSENT_REQUIRED" });

    const mismatch = decideCertificateBatchSigning({
      documents: [batchDocument()],
      actorKeys: [SIGNER],
      consentVersion: "certificate-consent-v0",
    });
    expect(mismatch).toMatchObject({ status: "invalid", code: "CONSENT_VERSION_MISMATCH" });

    const requestMissing = decideCertificateBatchSigning({
      documents: [batchDocument({ requestConsentVersion: null })],
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(requestMissing).toMatchObject({ status: "invalid", code: "CONSENT_REQUIRED" });
  });

  it("refuses a broken chain or a non-pending certificate", () => {
    const broken = decideCertificateBatchSigning({
      documents: [batchDocument({ chainValid: false })],
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(broken).toMatchObject({ status: "invalid", code: "CHAIN_BROKEN" });

    const notPending = decideCertificateBatchSigning({
      documents: [batchDocument({ documentStatus: "SEALED", requestStatus: "pending" })],
      actorKeys: [SIGNER],
      consentVersion: CONSENT,
    });
    expect(notPending).toMatchObject({ status: "invalid", code: "NOT_PENDING" });
  });
});

describe("batch signing input", () => {
  it("accepts typed and credential methods only", () => {
    expect(certificateBatchSignInput.safeParse({ consentVersion: CONSENT, method: "typed" }).success).toBe(
      true,
    );
    expect(
      certificateBatchSignInput.safeParse({
        consentVersion: CONSENT,
        method: "credential",
        authEvidence: { stepUp: "session" },
        deviceId: "device-1",
      }).success,
    ).toBe(true);
  });

  it("refuses a drawn signature until artifact storage exists", () => {
    const drawn = certificateBatchSignInput.safeParse({ consentVersion: CONSENT, method: "drawn" });
    expect(drawn.success).toBe(false);
    const withArtifact = certificateBatchSignInput.safeParse({
      consentVersion: CONSENT,
      method: "drawn",
      artifactRef: "private/signature.png",
    });
    expect(withArtifact.success).toBe(false);
  });

  it("rejects missing consent and unknown fields", () => {
    expect(certificateBatchSignInput.safeParse({ method: "typed" }).success).toBe(false);
    expect(
      certificateBatchSignInput.safeParse({
        consentVersion: CONSENT,
        method: "typed",
        signAll: true,
      }).success,
    ).toBe(false);
  });
});

describe("signature chain inspection", () => {
  const docHash = "a".repeat(64);
  const serverTs = new Date("2026-11-09T10:00:00.000Z");

  function eventRow(prevHash: string | null, overrides: Record<string, unknown> = {}) {
    const currHash = chainHash({
      prevHash,
      requestId: "req_1",
      docHash,
      signerKey: SIGNER,
      consentVersion: CONSENT,
      serverTs,
    });
    return {
      requestId: "req_1",
      signerUserId: "signer-jose",
      signerPersonId: null,
      docHash,
      consentVersion: CONSENT,
      serverTs,
      prevHash,
      currHash,
      ...overrides,
    };
  }

  function row(overrides: Partial<CertificateBatchDocumentRow> = {}): CertificateBatchDocumentRow {
    return {
      id: "doc_1",
      status: "DRAFT",
      version: 1,
      sha256: docHash,
      signatures: [
        {
          id: "req_1",
          status: "pending",
          order: [{ order: 1, signerUserId: "signer-jose" }],
          consentVersion: CONSENT,
          events: [],
        },
      ],
      ...overrides,
    };
  }

  it("builds and verifies a valid request chain", () => {
    const first = eventRow(null);
    const included = inspectCertificateBatchDocument(
      row({
        signatures: [
          {
            id: "req_1",
            status: "signed",
            order: [{ order: 1, signerUserId: "signer-jose" }],
            consentVersion: CONSENT,
            events: [first],
          },
        ],
      }),
    );
    expect(included.ok).toBe(true);
    if (!included.ok) return;
    expect(included.document.signedSignerKeys).toEqual([SIGNER]);
    expect(included.document.lastHash).toBe(first.currHash);
    expect(verifyChain(included.document.chain, { requestId: "req_1" })).toEqual({
      ok: true,
      brokenAt: null,
    });
  });

  it("rejects a tampered chain, missing signer and malformed order", () => {
    const tampered = eventRow(null);
    const chainBroken = inspectCertificateBatchDocument(
      row({
        signatures: [
          {
            id: "req_1",
            status: "pending",
            order: [{ order: 1, signerUserId: "signer-jose" }],
            consentVersion: CONSENT,
            events: [{ ...tampered, currHash: "b".repeat(64) }],
          },
        ],
      }),
    );
    expect(chainBroken).toMatchObject({ ok: false, code: "CHAIN_BROKEN" });

    const missingSigner = inspectCertificateBatchDocument(
      row({
        signatures: [
          {
            id: "req_1",
            status: "pending",
            order: [{ order: 1, signerUserId: "signer-jose" }],
            consentVersion: CONSENT,
            events: [{ ...eventRow(null), signerUserId: null }],
          },
        ],
      }),
    );
    expect(missingSigner).toMatchObject({ ok: false, code: "MISSING_SIGNER" });

    const badOrder = inspectCertificateBatchDocument(
      row({
        signatures: [
          {
            id: "req_1",
            status: "pending",
            order: [{ order: 2, signerUserId: "signer-jose" }],
            consentVersion: CONSENT,
            events: [],
          },
        ],
      }),
    );
    expect(badOrder).toMatchObject({ ok: false, code: "INVALID_ORDER" });
  });

  it("rejects documents without exactly one signature request", () => {
    expect(inspectCertificateBatchDocument(row({ signatures: [] }))).toMatchObject({
      ok: false,
      code: "MISSING_REQUEST",
    });
    const one = row().signatures[0];
    expect(
      inspectCertificateBatchDocument(row({ signatures: [one, { ...one, id: "req_2" }] })),
    ).toMatchObject({ ok: false, code: "MULTIPLE_REQUESTS" });
  });

  it("reads only contiguous, identifiable signature orders", () => {
    expect(readSignatureOrder([{ order: 1, signerUserId: "u1" }])).toEqual([
      { order: 1, signerUserId: "u1", signerPersonId: null, role: null },
    ]);
    expect(readSignatureOrder([{ order: 2, signerUserId: "u1" }])).toBeNull();
    expect(readSignatureOrder([{ order: 1 }])).toBeNull();
    expect(readSignatureOrder("nope")).toBeNull();
  });

  it("converts stored events into a chain and refuses a missing signer", () => {
    const first = eventRow(null);
    const built = chainFromEventRows([first]);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(verifyChain(built.chain, { requestId: "req_1" }).ok).toBe(true);
    }
    expect(chainFromEventRows([{ ...first, signerUserId: null, signerPersonId: null }])).toEqual({
      ok: false,
      reason: "missing_signer",
    });
  });
});

describe("member certificate projection", () => {
  const token = "dv_0123456789abcdef0123456789abcdef";
  const source: MemberCertificateSource = {
    id: "doc_member",
    title: "Certificate of Attendance — Safety Orientation",
    template: CERTIFICATE_TEMPLATE_KEY,
    status: "SEALED",
    sealedAt: "2026-11-09T10:00:00.000Z",
    verifyToken: token,
    payload,
  };

  it("returns only the allowlisted fields for a sealed certificate", () => {
    const projected = projectMemberCertificate(source);
    expect(projected).toEqual({
      id: "doc_member",
      title: "Certificate of Attendance — Safety Orientation",
      eventTitle: "Safety Orientation",
      eventDateLabel: "November 9, 2026",
      sealedAt: "2026-11-09T10:00:00.000Z",
      verifyToken: token,
      verifyPath: `/api/v1/verify/${encodeURIComponent(token)}`,
    });
    expect(Object.keys(projected ?? {}).sort()).toEqual([
      "eventDateLabel",
      "eventTitle",
      "id",
      "sealedAt",
      "title",
      "verifyPath",
      "verifyToken",
    ]);
  });

  it("never leaks recipient, organization, person, hash or payload fields", () => {
    const projected = projectMemberCertificate({
      ...source,
      // Extra columns a caller may accidentally select are ignored by the
      // allowlist, not spread into the response.
      sourcePersonId: "person_maria",
      organizationId: "org_syntaxure",
      sha256: "f".repeat(64),
    } as MemberCertificateSource);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("Maria Clara Santos");
    expect(serialized).not.toContain("person_maria");
    expect(serialized).not.toContain("person_jose");
    expect(serialized).not.toContain("org_syntaxure");
    expect(serialized).not.toContain("f".repeat(64));
    expect(serialized).not.toContain("recipient");
    expect(serialized).not.toContain("statement");
  });

  it("returns null for drafts, other templates and documents without sealedAt", () => {
    expect(projectMemberCertificate({ ...source, status: "DRAFT" })).toBeNull();
    expect(projectMemberCertificate({ ...source, template: "timesheet" })).toBeNull();
    expect(projectMemberCertificate({ ...source, sealedAt: null })).toBeNull();
  });

  it("does not copy an unparseable payload or a missing token", () => {
    const projected = projectMemberCertificate({
      ...source,
      verifyToken: null,
      payload: { recipient: { displayName: "Maria Clara Santos" } },
    });
    expect(projected).toEqual({
      id: "doc_member",
      title: "Certificate of Attendance — Safety Orientation",
      eventTitle: null,
      eventDateLabel: null,
      sealedAt: "2026-11-09T10:00:00.000Z",
      verifyToken: null,
      verifyPath: null,
    });
    expect(JSON.stringify(projected)).not.toContain("Maria Clara Santos");
  });
});

describe("signing identity and audit privacy", () => {
  it("derives every allowed actor key, including linked people", () => {
    expect(actorSignerKeys({ userId: "u1", personIds: ["p1", "p2"] })).toEqual([
      signerKey({ signerUserId: "u1" }),
      "person:p1",
      "person:p2",
    ]);
  });

  it("writes counts and hashes only to the batch audit meta", () => {
    const meta = certificateBatchSignAuditMeta({
      batchId: "batch-1",
      documentCount: 2,
      method: "typed",
      consentVersion: CONSENT,
      sealedAt: new Date("2026-11-09T10:00:00.000Z"),
      firstHash: "a".repeat(64),
      lastHash: "b".repeat(64),
    });

    expect(meta).toMatchObject({
      batchId: "batch-1",
      template: CERTIFICATE_TEMPLATE_KEY,
      documentCount: 2,
      method: "typed",
      consentVersion: CONSENT,
      sealedAt: "2026-11-09T10:00:00.000Z",
    });
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("Maria Clara Santos");
    expect(serialized).not.toContain("person_maria");
    expect(serialized).not.toContain("doc_1");
  });

  it("uses the generation consent version and a non-trivial consent text", () => {
    expect(CERTIFICATE_CONSENT_VERSION).toBe(CONSENT);
    expect(CERTIFICATE_CONSENT_TEXT.length).toBeGreaterThan(120);
    expect(CERTIFICATE_CONSENT_TEXT).toContain("I intend to sign");
  });
});
