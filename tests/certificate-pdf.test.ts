import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { env } from "../lib/env";
import {
  buildCertificatePayload,
  certificateContentHash,
  type BuildCertificatePayloadInput,
} from "../modules/certificates/payload";
import {
  CERTIFICATE_PDF_METADATA,
  CERTIFICATE_QR_OPTIONS,
  createCertificateQrPng,
  evaluateCertificatePdfGate,
  renderCertificatePdf,
  resolveCertificateVerifyUrl,
  sanitizeCertificateText,
  type RenderCertificatePdfInput,
} from "../modules/certificates/pdf";

// qrcode@1.5 has no bundled type declarations; this is the same entry point
// and options the module uses, so the comparison below proves the QR content.
const require = createRequire(import.meta.url);
const QRCode = require("qrcode") as {
  toBuffer(text: string, options?: Record<string, unknown>): Promise<Uint8Array>;
};

const SEALED_AT = "2026-11-09T06:00:00.000Z";
const VERIFY_URL = "https://pass.example.test/verify/dv_abcdefgh12345678";

const baseInput: BuildCertificatePayloadInput = {
  organization: { id: "org_syntaxure", name: "Syntaxure Labs" },
  event: {
    sessionId: "sess_orientation",
    title: "Safety Orientation",
    type: "TRAINING",
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

function renderInput(overrides: Partial<RenderCertificatePdfInput> = {}): RenderCertificatePdfInput {
  return {
    payload: basePayload,
    sealedAt: SEALED_AT,
    certificateNumber: "CERT-7F3K9QAZ",
    verifyUrl: VERIFY_URL,
    hashPrefix: certificateContentHash(basePayload).slice(0, 16),
    ...overrides,
  };
}

/**
 * Recover the text a PDF page draws, for a privacy assertion pdf-lib does not
 * expose directly. Content streams are Flate-compressed and standard-font text
 * is stored as WinAnsi hex strings, so inflate every stream and decode the hex
 * runs. Metadata values are read through the pdf-lib API in the metadata test.
 */
function extractPdfStrings(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const raw = buffer.toString("latin1");
  const parts: string[] = [raw];

  let cursor = 0;
  while (cursor < raw.length) {
    const streamStart = raw.indexOf("stream", cursor);
    if (streamStart === -1) break;
    let dataStart = streamStart + "stream".length;
    if (raw[dataStart] === "\r") dataStart += 1;
    if (raw[dataStart] === "\n") dataStart += 1;
    const end = raw.indexOf("endstream", dataStart);
    if (end === -1) break;

    let dataEnd = end;
    while (dataEnd > dataStart && (buffer[dataEnd - 1] === 0x0a || buffer[dataEnd - 1] === 0x0d)) {
      dataEnd -= 1;
    }
    try {
      parts.push(inflateSync(buffer.subarray(dataStart, dataEnd)).toString("latin1"));
    } catch {
      // Image/font streams are not all Flate; the raw fallback above still
      // covers uncompressed dictionaries.
    }
    cursor = end + "endstream".length;
  }

  return parts.join("\n").replace(/<([0-9A-Fa-f]+)>/g, (match, hex: string) => {
    if (hex.length % 2 !== 0) return match;
    return Buffer.from(hex, "hex").toString("latin1");
  });
}

describe("certificate PDF rendering", () => {
  it("renders one A4 landscape page with fixed metadata", async () => {
    const bytes = await renderCertificatePdf(renderInput());

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");

    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);

    const page = pdf.getPage(0);
    expect(page.getWidth()).toBeCloseTo(841.89, 1);
    expect(page.getHeight()).toBeCloseTo(595.28, 1);
    expect(page.getWidth()).toBeGreaterThan(page.getHeight());

    expect(pdf.getTitle()).toBe(CERTIFICATE_PDF_METADATA.title);
    expect(pdf.getAuthor()).toBe(CERTIFICATE_PDF_METADATA.author);
    expect(pdf.getSubject()).toBe(CERTIFICATE_PDF_METADATA.subject);
    expect(pdf.getCreator()).toBe(CERTIFICATE_PDF_METADATA.creator);
    expect(pdf.getProducer()).toBe(CERTIFICATE_PDF_METADATA.producer);

    // Metadata dates come from the caller-provided seal instant, never "now".
    expect(pdf.getCreationDate()?.toISOString()).toBe(SEALED_AT);
    expect(pdf.getModificationDate()?.toISOString()).toBe(SEALED_AT);
  });

  it("encodes exactly the public verify URL in the QR image", async () => {
    const actual = await createCertificateQrPng(VERIFY_URL);
    const expected = await QRCode.toBuffer(VERIFY_URL, {
      type: "png",
      ...CERTIFICATE_QR_OPTIONS,
    });
    expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);

    const other = await createCertificateQrPng("https://pass.example.test/verify/dv_other");
    expect(Buffer.from(actual).equals(Buffer.from(other))).toBe(false);

    expect(resolveCertificateVerifyUrl({ verifyUrl: ` ${VERIFY_URL} ` })).toBe(VERIFY_URL);
    expect(resolveCertificateVerifyUrl({ verifyToken: "dv_token12345678" })).toBe(
      `${env.APP_URL.replace(/\/+$/, "")}/verify/dv_token12345678`,
    );
    expect(() => resolveCertificateVerifyUrl({})).toThrow(/verifyUrl or verifyToken/);
  });

  it("survives long and accented names and is byte-deterministic", async () => {
    const longRecipient = `${"María Ñúñez de la Cruz ".repeat(10).slice(0, 190)}李`;
    const longTitle =
      "Annual Safety and Compliance Orientation for All Staff and Volunteers ".repeat(5).slice(0, 300);
    const payload = buildCertificatePayload({
      ...baseInput,
      organization: { id: "org_syntaxure", name: "Syntaxure Labs — Žilina 🎓" },
      event: { ...baseInput.event, title: longTitle },
      recipient: { personId: "person_long", displayName: longRecipient },
      signatory: {
        ...baseInput.signatory,
        displayName: "Žofia Łukasiewicz Ñúñez",
        roleLabel: "Director of Safety, Compliance and Volunteer Operations",
      },
    });

    const first = await renderCertificatePdf(renderInput({ payload }));
    const second = await renderCertificatePdf(renderInput({ payload }));

    expect(first.byteLength).toBeGreaterThan(1_000);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);

    const pdf = await PDFDocument.load(first, { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);

    expect(sanitizeCertificateText("  Maria\nClara\tSantos  ", 40)).toBe("Maria Clara Santos");
    const truncated = sanitizeCertificateText("x".repeat(40), 12);
    expect(truncated.endsWith("...")).toBe(true);
    expect(Array.from(truncated).length).toBeLessThanOrEqual(12);
  });

  it("does not print email, external id, person id or attendance fields", async () => {
    const leaky = {
      ...basePayload,
      recipient: {
        ...basePayload.recipient,
        email: "leak@example.com",
        externalId: "EXT-SECRET-9",
      },
      event: {
        ...basePayload.event,
        checkInAt: "2026-11-09T00:30:00.000Z",
        attendanceRecordId: "record-secret",
      },
      signatory: {
        ...basePayload.signatory,
        email: "signer@example.com",
        authEvidence: { ip: "203.0.113.9" },
      },
    } as unknown as RenderCertificatePdfInput["payload"];

    const bytes = await renderCertificatePdf(renderInput({ payload: leaky }));
    const text = extractPdfStrings(bytes);

    // The extractor must see real content, otherwise the negative assertions
    // below would pass vacuously.
    expect(text).toContain("Maria Clara Santos");
    expect(text).toContain("SYNTAXURE LABS");
    expect(text).toContain("Safety Orientation");

    expect(text).not.toContain("leak@example.com");
    expect(text).not.toContain("EXT-SECRET-9");
    expect(text).not.toContain("record-secret");
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("person_maria");
    expect(text).not.toContain("user_jose");

    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    const metadata = [
      pdf.getTitle(),
      pdf.getAuthor(),
      pdf.getSubject(),
      pdf.getCreator(),
      pdf.getProducer(),
      pdf.getKeywords(),
    ].join(" ");
    expect(metadata).not.toContain("leak@example.com");
    expect(metadata).not.toContain("EXT-SECRET-9");
  });
});

describe("certificate PDF integrity gate", () => {
  const storedHash = certificateContentHash(basePayload);

  function gateInput(overrides: Record<string, unknown> = {}) {
    return {
      status: "SEALED",
      sealedAt: SEALED_AT,
      sha256: storedHash,
      payload: basePayload,
      chainValid: true,
      ...overrides,
    };
  }

  it("accepts a sealed, hash-matching certificate with an intact chain", () => {
    const result = evaluateCertificatePdfGate(gateInput());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.recipient.displayName).toBe("Maria Clara Santos");
  });

  it("rejects every non-sealed state as NOT_SEALED", () => {
    for (const status of ["DRAFT", "SUPERSEDED", "REVOKED"]) {
      expect(evaluateCertificatePdfGate(gateInput({ status }))).toMatchObject({
        ok: false,
        code: "NOT_SEALED",
      });
    }
    expect(evaluateCertificatePdfGate(gateInput({ sealedAt: null }))).toMatchObject({
      ok: false,
      code: "NOT_SEALED",
    });
  });

  it("rejects a hash mismatch and an unparseable payload as INTEGRITY_FAILED", () => {
    expect(evaluateCertificatePdfGate(gateInput({ sha256: "0".repeat(64) }))).toMatchObject({
      ok: false,
      code: "INTEGRITY_FAILED",
    });

    const malformed = { kind: "not_a_certificate" };
    expect(
      evaluateCertificatePdfGate(
        gateInput({ payload: malformed, sha256: certificateContentHash(malformed) }),
      ),
    ).toMatchObject({ ok: false, code: "INTEGRITY_FAILED" });
  });

  it("rejects a broken signature chain as CHAIN_BROKEN", () => {
    expect(evaluateCertificatePdfGate(gateInput({ chainValid: false }))).toMatchObject({
      ok: false,
      code: "CHAIN_BROKEN",
    });
  });

  it("reports content failures before chain failures", () => {
    expect(
      evaluateCertificatePdfGate(gateInput({ sha256: "f".repeat(64), chainValid: false })),
    ).toMatchObject({ ok: false, code: "INTEGRITY_FAILED" });
  });
});
