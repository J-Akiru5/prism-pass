import { describe, expect, it } from "vitest";
import {
  CERTIFICATE_CONSENT_VERSION,
  CERTIFICATE_MAX_BATCH,
  certificateBatchAuditMeta,
  certificateDedupeKey,
  certificateDocumentTitle,
  certificateRoleLabel,
  defaultCertificateStatement,
  planCertificateBatch,
  previewCertificateBatch,
  type CertificateEventInput,
  type CertificateGenerationRecord,
  type PlanCertificateBatchInput,
} from "../modules/certificates/generate";
import { certificateContentHash } from "../modules/certificates/payload";
import { certificatePayloadV1 } from "../modules/certificates/schema";
import { documentContentHash } from "../modules/documents/service";

const organization = { id: "org_syntaxure", name: "Syntaxure Labs" };

const event: CertificateEventInput = {
  sessionId: "sess_orientation",
  title: "Safety Orientation",
  type: "TRAINING",
  // 09:00–13:00 on 9 November 2026 in Manila (UTC+8).
  startsAt: "2026-11-09T01:00:00.000Z",
  endsAt: "2026-11-09T05:00:00.000Z",
  timezone: "Asia/Manila",
};

const signatory = {
  userId: "user_jose",
  personId: "person_jose",
  displayName: "Jose Rizal",
  roleLabel: "Training Director",
};

function record(
  personId: string,
  overrides: Partial<CertificateGenerationRecord> = {},
): CertificateGenerationRecord {
  return {
    sessionId: event.sessionId,
    personId,
    personDisplayName: `Person ${personId}`,
    checkInEventId: "evt_in",
    checkOutEventId: "evt_out",
    status: "PRESENT",
    approvalStatus: "NONE",
    ...overrides,
  };
}

const baseInput: PlanCertificateBatchInput = {
  organization,
  event,
  signatory,
  issuedOn: "2026-11-09",
  records: [
    record("p_maria", { personDisplayName: "Maria Clara Santos" }),
    record("p_juan", { personDisplayName: "Juan Luna", status: "LATE" }),
  ],
};

describe("certificate batch classification", () => {
  it("accepts PRESENT and LATE records with the default policy (no check-out, no approval)", () => {
    const plan = planCertificateBatch({
      ...baseInput,
      records: [
        record("p_present", { checkOutEventId: null, approvalStatus: "PENDING" }),
        record("p_late", { status: "LATE", checkOutEventId: null }),
      ],
    });
    expect(plan.eligible.map((entry) => entry.personId)).toEqual(["p_present", "p_late"]);
    expect(plan.counts).toEqual({
      records: 2,
      eligible: 2,
      skipped: 0,
      alreadyGenerated: 0,
      duplicates: 0,
    });
    expect(plan.exceedsBatchLimit).toBe(false);
  });

  it("skips incomplete, absent, excused, partial, rejected and unknown records with reasons", () => {
    const plan = planCertificateBatch({
      ...baseInput,
      records: [
        record("p_no_checkin", { checkInEventId: null }),
        record("p_absent", { status: "ABSENT" }),
        record("p_excused", { status: "EXCUSED" }),
        record("p_partial", { status: "PARTIAL" }),
        record("p_rejected", { approvalStatus: "REJECTED" }),
        record("p_unknown", { status: "WALK_IN" }),
        record("p_ok"),
      ],
    });

    expect(plan.eligible.map((entry) => entry.personId)).toEqual(["p_ok"]);
    expect(plan.skipped.map((entry) => [entry.personId, entry.reason])).toEqual([
      ["p_no_checkin", "missing_check_in"],
      ["p_absent", "record_absent"],
      ["p_excused", "record_excused"],
      ["p_partial", "record_partial"],
      ["p_rejected", "approval_rejected"],
      ["p_unknown", "unknown_status"],
    ]);
    expect(plan.counts.skipped).toBe(6);
  });

  it("honours the strict check-out and approval opt-ins", () => {
    const records = [
      record("p_pending", { checkOutEventId: null, approvalStatus: "PENDING" }),
      record("p_complete", { approvalStatus: "APPROVED" }),
    ];

    const strict = planCertificateBatch({
      ...baseInput,
      records,
      eligibility: { requireCheckOut: true, requireApproval: true },
    });
    expect(strict.eligible.map((entry) => entry.personId)).toEqual(["p_complete"]);

    const relaxed = previewCertificateBatch({ records });
    expect(relaxed.eligible.map((entry) => entry.personId)).toEqual(["p_pending", "p_complete"]);
  });

  it("reports one alreadyGenerated per existing key instead of planning a duplicate", () => {
    const plan = planCertificateBatch({
      ...baseInput,
      existingKeys: [certificateDedupeKey(event.sessionId, "p_maria")],
    });

    expect(plan.eligible.map((entry) => entry.personId)).toEqual(["p_juan"]);
    expect(plan.alreadyGenerated).toEqual([
      {
        key: certificateDedupeKey(event.sessionId, "p_maria"),
        sessionId: event.sessionId,
        personId: "p_maria",
        displayName: "Maria Clara Santos",
      },
    ]);
    expect(plan.counts).toMatchObject({ records: 2, eligible: 1, alreadyGenerated: 1, skipped: 0 });
  });

  it("de-duplicates repeated (session, person) keys deterministically, first occurrence wins", () => {
    const first = record("p_maria", { personDisplayName: "Maria Clara Santos" });
    const duplicate = record("p_maria", { personDisplayName: "Maria C. Santos" });

    const plan = planCertificateBatch({ ...baseInput, records: [first, duplicate] });
    expect(plan.eligible.map((entry) => entry.personId)).toEqual(["p_maria"]);
    expect(plan.eligible[0].displayName).toBe("Maria Clara Santos");
    expect(plan.skipped).toEqual([
      expect.objectContaining({ personId: "p_maria", reason: "duplicate_record" }),
    ]);
    expect(plan.counts).toEqual({
      records: 2,
      eligible: 1,
      skipped: 1,
      alreadyGenerated: 0,
      duplicates: 1,
    });

    // Same input, same bytes: a retried plan is stable.
    expect(planCertificateBatch({ ...baseInput, records: [first, duplicate] })).toEqual(plan);
  });

  it("skips blank and over-long recipient names instead of aborting the batch", () => {
    const plan = planCertificateBatch({
      ...baseInput,
      records: [
        record("p_blank", { personDisplayName: "   " }),
        record("p_long", { personDisplayName: "A".repeat(201) }),
        record("p_ok"),
      ],
    });
    expect(plan.eligible.map((entry) => entry.personId)).toEqual(["p_ok"]);
    expect(plan.skipped.map((entry) => entry.reason)).toEqual([
      "invalid_recipient_name",
      "invalid_recipient_name",
    ]);
  });

  it("caps a run at 100 new documents and flags a larger batch", () => {
    const records = Array.from({ length: CERTIFICATE_MAX_BATCH }, (_, index) => record(`p_${index}`));
    const atLimit = previewCertificateBatch({ records });
    expect(atLimit.counts.eligible).toBe(100);
    expect(atLimit.maxBatch).toBe(100);
    expect(atLimit.exceedsBatchLimit).toBe(false);

    const overLimit = previewCertificateBatch({ records: [...records, record("p_extra")] });
    expect(overLimit.counts.eligible).toBe(101);
    expect(overLimit.exceedsBatchLimit).toBe(true);

    // The POST path checks the same flag before building any payload.
    const planOverLimit = planCertificateBatch({
      ...baseInput,
      records: [...records, record("p_extra")],
    });
    expect(planOverLimit.counts.eligible).toBe(101);
    expect(planOverLimit.exceedsBatchLimit).toBe(true);

    // Already-generated rows do not consume the cap for the new batch.
    const mostlyExisting = previewCertificateBatch({
      records,
      existingKeys: records.slice(0, 60).map((entry) => certificateDedupeKey(entry.sessionId, entry.personId)),
    });
    expect(mostlyExisting.counts.eligible).toBe(40);
    expect(mostlyExisting.exceedsBatchLimit).toBe(false);
  });

  it("preview and plan agree on classification", () => {
    const input = {
      ...baseInput,
      existingKeys: [certificateDedupeKey(event.sessionId, "p_juan")],
    };
    const preview = previewCertificateBatch(input);
    const plan = planCertificateBatch(input);

    expect(preview.counts).toEqual(plan.counts);
    expect(preview.eligible.map((entry) => entry.personId)).toEqual(plan.eligible.map((entry) => entry.personId));
    expect(preview.skipped).toEqual(plan.skipped);
    expect(preview.alreadyGenerated).toEqual(plan.alreadyGenerated);
  });
});

describe("certificate payload planning", () => {
  it("builds the event, organization, recipient, signatory, statement and issue date into the payload", () => {
    const plan = planCertificateBatch(baseInput);
    const entry = plan.eligible[0];

    expect(entry.payload).toMatchObject({
      schemaVersion: 1,
      kind: "attendance_certificate",
      templateKey: "certificate.attendance.v1",
      organization: { id: organization.id, name: organization.name },
      event: {
        sessionId: event.sessionId,
        title: event.title,
        type: "TRAINING",
        timezone: "Asia/Manila",
        dateLabel: "November 9, 2026",
      },
      recipient: { personId: "p_maria", displayName: "Maria Clara Santos" },
      signatory: {
        userId: "user_jose",
        personId: "person_jose",
        displayName: "Jose Rizal",
        roleLabel: "Training Director",
      },
      statement: "This certifies that Maria Clara Santos attended Safety Orientation.",
      issuedOn: "2026-11-09",
    });
    expect(certificatePayloadV1.safeParse(entry.payload).success).toBe(true);
  });

  it("hashes the payload only, matching the public verifier rather than the P5 document hash", () => {
    const entry = planCertificateBatch(baseInput).eligible[0];

    expect(entry.sha256).toBe(certificateContentHash(entry.payload));
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.sha256).not.toBe(
      documentContentHash({ template: "certificate.attendance.v1", version: 1, payload: entry.payload }),
    );
  });

  it("uses a custom statement verbatim for every recipient and defaults to the recipient name", () => {
    const custom = "Presented for completing the November safety programme.";
    const plan = planCertificateBatch({ ...baseInput, statement: `  ${custom}  ` });
    expect(plan.eligible.map((entry) => entry.payload.statement)).toEqual([custom, custom]);
    expect(defaultCertificateStatement("Maria Clara Santos", event.title)).toBe(
      "This certifies that Maria Clara Santos attended Safety Orientation.",
    );
  });

  it("rejects an impossible issue date instead of planning an unverifiable certificate", () => {
    expect(() => planCertificateBatch({ ...baseInput, issuedOn: "2026-02-30" })).toThrow();
  });

  it("builds the organizer-facing document title and consent constant", () => {
    expect(certificateDocumentTitle("Safety Orientation")).toBe("Certificate of Attendance — Safety Orientation");
    expect(CERTIFICATE_CONSENT_VERSION).toBe("certificate-consent-v1");
  });

  it("maps membership roles to human signatory labels without leaking an enum", () => {
    expect(certificateRoleLabel("OWNER")).toBe("Organization Owner");
    expect(certificateRoleLabel("manager")).toBe("Manager");
    expect(certificateRoleLabel("CUSTOM")).toBe("Authorized Signatory");
  });
});

describe("certificate batch audit", () => {
  it("records counts and batch identity only — no recipient names or person ids", () => {
    const plan = planCertificateBatch(baseInput);
    const meta = certificateBatchAuditMeta({
      batchId: "batch-1234",
      sessionId: event.sessionId,
      counts: { ...plan.counts, generated: 2 },
      requireCheckOut: false,
      requireApproval: false,
      issuedOn: "2026-11-09",
      customStatement: false,
    });

    expect(meta).toMatchObject({
      batchId: "batch-1234",
      sessionId: event.sessionId,
      template: "certificate.attendance.v1",
      records: 2,
      eligible: 2,
      generated: 2,
      skipped: 0,
      alreadyGenerated: 0,
      duplicates: 0,
      issuedOn: "2026-11-09",
      customStatement: false,
    });

    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("Maria Clara Santos");
    expect(serialized).not.toContain("Juan Luna");
    expect(serialized).not.toContain("p_maria");
    expect(serialized).not.toContain("p_juan");
    expect(serialized).not.toContain("person_jose");
  });
});
