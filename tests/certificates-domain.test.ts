import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_KIND,
  CERTIFICATE_TEMPLATE_KEY,
  certificatePayloadV1,
  type CertificatePayloadV1,
} from "../modules/certificates/schema";
import {
  decideCertificateCandidates,
  describeCertificateSkipReason,
  evaluateCertificateEligibility,
  isCertificateEligible,
  type CertificateEligibilityRecord,
} from "../modules/certificates/eligibility";
import {
  buildCertificatePayload,
  certificateContentHash,
  issueDateInTimeZone,
  renderEventDateLabel,
  type BuildCertificatePayloadInput,
} from "../modules/certificates/payload";
import {
  buildCertificateVerification,
  certificateNumberFor,
  CERTIFICATE_HASH_PREFIX_LENGTH,
  type CertificateVerificationDocument,
} from "../modules/certificates/verify";

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

function payloadWith(overrides: Partial<BuildCertificatePayloadInput> = {}): CertificatePayloadV1 {
  return buildCertificatePayload({ ...baseInput, ...overrides });
}

function sealedDocument(overrides: Partial<CertificateVerificationDocument> = {}): CertificateVerificationDocument {
  return {
    template: CERTIFICATE_TEMPLATE_KEY,
    title: "Certificate of Attendance",
    version: 1,
    sha256: certificateContentHash(basePayload),
    payload: basePayload,
    status: "SEALED",
    sealedAt: "2026-11-09T06:00:00.000Z",
    verifyToken: "abcdefgh12345678",
    createdAt: "2026-11-09T05:30:00.000Z",
    ...overrides,
  };
}

const eligibleRecord = (overrides: Partial<CertificateEligibilityRecord> = {}): CertificateEligibilityRecord => ({
  sessionId: "sess_orientation",
  personId: "person_maria",
  checkInEventId: "evt_in",
  checkOutEventId: "evt_out",
  status: "PRESENT",
  approvalStatus: "NONE",
  ...overrides,
});

describe("certificate eligibility", () => {
  it("accepts PRESENT and LATE records with a check-in", () => {
    expect(isCertificateEligible(eligibleRecord())).toBe(true);
    expect(isCertificateEligible(eligibleRecord({ status: "LATE" }))).toBe(true);
    expect(evaluateCertificateEligibility(eligibleRecord())).toEqual({ eligible: true });
  });

  it("rejects records without a check-in event", () => {
    expect(evaluateCertificateEligibility(eligibleRecord({ checkInEventId: null }))).toMatchObject({
      eligible: false,
      reason: "missing_check_in",
    });
    expect(evaluateCertificateEligibility(eligibleRecord({ checkInEventId: "   " }))).toMatchObject({
      eligible: false,
      reason: "missing_check_in",
    });
  });

  it("excludes ABSENT, EXCUSED and PARTIAL by default", () => {
    expect(evaluateCertificateEligibility(eligibleRecord({ status: "ABSENT" }))).toMatchObject({
      eligible: false,
      reason: "record_absent",
    });
    expect(evaluateCertificateEligibility(eligibleRecord({ status: "EXCUSED" }))).toMatchObject({
      eligible: false,
      reason: "record_excused",
    });
    expect(evaluateCertificateEligibility(eligibleRecord({ status: "PARTIAL" }))).toMatchObject({
      eligible: false,
      reason: "record_partial",
    });
  });

  it("never certifies a rejected record, even without requireApproval", () => {
    expect(
      evaluateCertificateEligibility(eligibleRecord({ approvalStatus: "REJECTED" }), { requireApproval: false }),
    ).toMatchObject({ eligible: false, reason: "approval_rejected" });
  });

  it("treats missing approvals as NONE and unknown statuses as ineligible", () => {
    expect(isCertificateEligible(eligibleRecord({ approvalStatus: null }))).toBe(true);
    expect(evaluateCertificateEligibility(eligibleRecord({ status: "present" }))).toEqual({ eligible: true });
    expect(evaluateCertificateEligibility(eligibleRecord({ status: "WALK_IN" }))).toMatchObject({
      eligible: false,
      reason: "unknown_status",
    });
  });

  it("requires APPROVED only when asked", () => {
    expect(isCertificateEligible(eligibleRecord({ approvalStatus: "PENDING" }))).toBe(true);
    expect(
      evaluateCertificateEligibility(eligibleRecord({ approvalStatus: "PENDING" }), { requireApproval: true }),
    ).toMatchObject({ eligible: false, reason: "approval_required" });
    expect(
      isCertificateEligible(eligibleRecord({ approvalStatus: "APPROVED" }), { requireApproval: true }),
    ).toBe(true);
  });

  it("requires a check-out only when asked", () => {
    expect(isCertificateEligible(eligibleRecord({ checkOutEventId: null }))).toBe(true);
    expect(
      evaluateCertificateEligibility(eligibleRecord({ checkOutEventId: null }), { requireCheckOut: true }),
    ).toMatchObject({ eligible: false, reason: "check_out_required" });
    expect(
      isCertificateEligible(eligibleRecord({ checkOutEventId: "evt_out" }), { requireCheckOut: true }),
    ).toBe(true);
  });

  it("splits candidates into eligible and skipped with stable order and reasons", () => {
    const present = eligibleRecord({ personId: "p_present" });
    const absent = eligibleRecord({ personId: "p_absent", status: "ABSENT" });
    const late = eligibleRecord({ personId: "p_late", status: "LATE" });
    const partial = eligibleRecord({ personId: "p_partial", status: "PARTIAL" });

    const decision = decideCertificateCandidates([present, absent, late, partial]);
    expect(decision.eligible.map((record) => record.personId)).toEqual(["p_present", "p_late"]);
    expect(decision.skipped.map((entry) => [entry.record.personId, entry.reason])).toEqual([
      ["p_absent", "record_absent"],
      ["p_partial", "record_partial"],
    ]);
    expect(decision.skipped[0].message).toBe(describeCertificateSkipReason("record_absent"));
  });
});

describe("certificate payload determinism and dates", () => {
  it("builds the same bytes and hash for the same inputs", () => {
    const first = buildCertificatePayload(baseInput);
    const second = buildCertificatePayload(baseInput);
    expect(second).toEqual(first);
    expect(certificateContentHash(second)).toBe(certificateContentHash(first));
    expect(first.kind).toBe(CERTIFICATE_KIND);
    expect(first.templateKey).toBe(CERTIFICATE_TEMPLATE_KEY);
    expect(first.schemaVersion).toBe(1);
  });

  it("normalizes Date objects and ISO strings to the same payload", () => {
    const asDates = buildCertificatePayload({
      ...baseInput,
      event: {
        ...baseInput.event,
        startsAt: new Date("2026-11-09T01:00:00.000Z"),
        endsAt: new Date("2026-11-09T05:00:00.000Z"),
      },
    });
    expect(asDates).toEqual(basePayload);
    expect(asDates.event.startsAt).toBe("2026-11-09T01:00:00.000Z");
  });

  it("hashes canonical JSON independent of key insertion order", () => {
    expect(certificateContentHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      certificateContentHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });

  it("renders the event date in the event timezone, including the midnight boundary", () => {
    expect(renderEventDateLabel("2026-11-09T01:00:00.000Z", "Asia/Manila")).toBe("November 9, 2026");
    // 16:00Z is exactly 00:00 on 10 November in Manila.
    expect(renderEventDateLabel("2026-11-09T16:00:00.000Z", "Asia/Manila")).toBe("November 10, 2026");
    // One millisecond earlier is still 9 November locally.
    expect(renderEventDateLabel("2026-11-09T15:59:59.999Z", "Asia/Manila")).toBe("November 9, 2026");
  });

  it("derives issuedOn from the issuance instant in the event timezone", () => {
    expect(issueDateInTimeZone("2026-11-09T15:59:59.999Z", "Asia/Manila")).toBe("2026-11-09");
    expect(issueDateInTimeZone("2026-11-09T16:00:00.000Z", "Asia/Manila")).toBe("2026-11-10");

    const payload = buildCertificatePayload({
      ...baseInput,
      issuedOn: undefined,
      issuedAt: "2026-11-09T16:00:00.000Z",
    });
    expect(payload.issuedOn).toBe("2026-11-10");
  });

  it("rejects invalid timezones, invalid dates, reversed ranges and a missing issue date", () => {
    expect(() => renderEventDateLabel("2026-11-09T01:00:00.000Z", "Mars/Olympus")).toThrow(/Invalid IANA timezone/);
    expect(() => renderEventDateLabel("not-a-date", "Asia/Manila")).toThrow(/Invalid date/);
    expect(() => issueDateInTimeZone("2026-11-09T01:00:00.000Z", "")).toThrow(/Invalid IANA timezone/);
    expect(() =>
      buildCertificatePayload({
        ...baseInput,
        event: { ...baseInput.event, endsAt: "2026-11-09T00:00:00.000Z" },
      }),
    ).toThrow(/must not precede/);
    expect(() =>
      buildCertificatePayload({ ...baseInput, issuedOn: undefined, issuedAt: undefined }),
    ).toThrow(/requires issuedOn or issuedAt/);
  });

  it("changes the hash when recipient, event or signatory content changes", () => {
    const recipientChanged = payloadWith({
      recipient: { personId: "person_maria", displayName: "Maria C. Santos" },
    });
    const eventChanged = payloadWith({ event: { ...baseInput.event, title: "Safety Orientation (PM)" } });
    const signatoryChanged = payloadWith({
      signatory: { ...baseInput.signatory, roleLabel: "Operations Director" },
    });

    expect(certificateContentHash(recipientChanged)).not.toBe(certificateContentHash(basePayload));
    expect(certificateContentHash(eventChanged)).not.toBe(certificateContentHash(basePayload));
    expect(certificateContentHash(signatoryChanged)).not.toBe(certificateContentHash(basePayload));
  });
});

describe("CertificatePayloadV1 schema", () => {
  it("accepts a built payload", () => {
    expect(certificatePayloadV1.safeParse(basePayload).success).toBe(true);
  });

  it("rejects extra fields at every level", () => {
    expect(certificatePayloadV1.safeParse({ ...basePayload, email: "maria@example.com" }).success).toBe(false);
    expect(
      certificatePayloadV1.safeParse({
        ...basePayload,
        recipient: { ...basePayload.recipient, externalId: "S-001" },
      }).success,
    ).toBe(false);
    expect(
      certificatePayloadV1.safeParse({
        ...basePayload,
        event: { ...basePayload.event, attendanceHistory: ["evt_in", "evt_out"] },
      }).success,
    ).toBe(false);
  });

  it("rejects missing fields, wrong literals and impossible dates", () => {
    const { statement: _statement, ...withoutStatement } = basePayload;
    expect(certificatePayloadV1.safeParse(withoutStatement).success).toBe(false);
    expect(certificatePayloadV1.safeParse({ ...basePayload, schemaVersion: 2 }).success).toBe(false);
    expect(certificatePayloadV1.safeParse({ ...basePayload, templateKey: "certificate.other" }).success).toBe(false);
    expect(certificatePayloadV1.safeParse({ ...basePayload, issuedOn: "2026-02-30" }).success).toBe(false);
    expect(
      certificatePayloadV1.safeParse({
        ...basePayload,
        event: { ...basePayload.event, startsAt: "2026-11-09" },
      }).success,
    ).toBe(false);
    expect(
      certificatePayloadV1.safeParse({
        ...basePayload,
        event: { ...basePayload.event, endsAt: "2026-11-08T01:00:00.000Z" },
      }).success,
    ).toBe(false);
    expect(
      certificatePayloadV1.safeParse({
        ...basePayload,
        signatory: { ...basePayload.signatory, personId: undefined },
      }).success,
    ).toBe(false);
  });
});

describe("certificate public verification projection", () => {
  it("verifies a sealed, hash-matching certificate", () => {
    const projection = buildCertificateVerification(sealedDocument());
    expect(projection).toEqual({
      exists: true,
      status: "SEALED",
      sealed: true,
      title: "Certificate of Attendance",
      organizationName: "Syntaxure Labs",
      eventTitle: "Safety Orientation",
      eventDateLabel: "November 9, 2026",
      signatoryRoleLabel: "Training Director",
      sealedAt: "2026-11-09T06:00:00.000Z",
      certificateNumber: "CERT-12345678",
      hashPrefix: certificateContentHash(basePayload).slice(0, CERTIFICATE_HASH_PREFIX_LENGTH),
      integrity: "verified",
    });
  });

  it("detects a payload changed after sealing", () => {
    const tampered = payloadWith({ recipient: { personId: "person_maria", displayName: "Someone Else" } });
    const projection = buildCertificateVerification(sealedDocument({ payload: tampered }));
    expect(projection).toMatchObject({ exists: true, integrity: "hash_mismatch", sealed: true });
  });

  it("reports a broken signature chain without leaking event data", () => {
    const projection = buildCertificateVerification(sealedDocument(), { chainValid: false });
    expect(projection).toMatchObject({ exists: true, integrity: "chain_broken", sealed: true });
  });

  it("reports unsealed drafts and revoked documents", () => {
    expect(buildCertificateVerification(sealedDocument({ status: "DRAFT", sealedAt: null }))).toMatchObject({
      exists: true,
      sealed: false,
      integrity: "not_sealed",
    });
    expect(buildCertificateVerification(sealedDocument({ status: "REVOKED" }))).toMatchObject({
      exists: true,
      sealed: false,
      integrity: "revoked",
    });
    // A SEALED status with no seal timestamp is inconsistent; fail closed.
    expect(buildCertificateVerification(sealedDocument({ sealedAt: null }))).toMatchObject({
      exists: true,
      sealed: false,
      integrity: "not_sealed",
    });
  });

  it("treats a matching hash over a non-certificate payload as a mismatch", () => {
    const invalidPayload = { ...basePayload, schemaVersion: 2 };
    const projection = buildCertificateVerification(
      sealedDocument({ payload: invalidPayload, sha256: certificateContentHash(invalidPayload) }),
    );
    expect(projection).toMatchObject({ exists: true, integrity: "hash_mismatch" });
    expect(projection).toMatchObject({ organizationName: null, eventTitle: null, eventDateLabel: null });
  });

  it("reports a missing row or another template as absent", () => {
    expect(buildCertificateVerification(null)).toEqual({ exists: false });
    expect(buildCertificateVerification(sealedDocument({ template: "timesheet.v1" }))).toEqual({ exists: false });
  });

  it("derives a stable certificate number from the token, or the hash when absent", () => {
    expect(certificateNumberFor({ verifyToken: "abcdefgh12345678" })).toBe("CERT-12345678");
    const hash = "A".repeat(64);
    expect(certificateNumberFor({ verifyToken: null, sha256: hash })).toBe("CERT-AAAAAAAAAAAA");
    expect(certificateNumberFor({ verifyToken: "!!!", sha256: "short" })).toBeNull();
    const fallback = buildCertificateVerification(
      sealedDocument({ verifyToken: null, sha256: certificateContentHash(basePayload) }),
    );
    expect(fallback.exists && fallback.certificateNumber).toMatch(/^CERT-[0-9A-F]{12}$/);
  });

  it("never projects recipient identity, payload, attendance instants or signer identity", () => {
    const projection = buildCertificateVerification(sealedDocument());
    expect(projection.exists).toBe(true);
    if (!projection.exists) throw new Error("expected an existing certificate");

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

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("Maria Clara Santos");
    expect(serialized).not.toContain("person_maria");
    expect(serialized).not.toContain("user_jose");
    expect(serialized).not.toContain("2026-11-09T01:00:00.000Z");
    expect(serialized).not.toContain("statement");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("createdAt");
  });
});
