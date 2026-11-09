// Attendance certificate PDF rendering.
//
// The PDF is a presentation artifact, not the integrity proof: the signature
// chain and the payload hash stored on the Document remain authoritative. This
// module therefore only renders fields that are already part of the signed
// payload and deliberately never reads the recipient's Person row. There is no
// email, external id, person id, attendance instant or signer auth evidence on
// the page (RA 10173 / ADR-10).
//
// Determinism: the caller supplies every value, including `sealedAt`; there is
// no clock read. PDF metadata is fixed and pdf-lib's automatic "now" metadata
// (`updateMetadata`) is disabled, so the same inputs produce byte-identical
// output. That keeps the artifact stable across retries and makes download
// responses safely cacheable.
//
// Fonts: pdf-lib's standard fonts are WinAnsi-encoded and cannot represent
// every Unicode name. Unsupported code points are folded to their decomposed
// Latin form when possible and replaced with "?" otherwise; names are
// truncated to fit instead of being allowed to overflow the page.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { env } from "@/lib/env";
import { certificateContentHash } from "./payload";
import {
  CERTIFICATE_TEMPLATE_KEY,
  certificatePayloadV1,
  type CertificatePayloadV1,
} from "./schema";

// qrcode@1.5 ships no type declarations and the project does not depend on
// @types/qrcode. Only the PNG buffer entry point is used here.
// @ts-ignore -- TS7016: qrcode has no bundled or installed type declarations
import QRCode from "qrcode";

export const CERTIFICATE_PDF_PAGE = { width: 841.89, height: 595.28 } as const;

/** Shared by the renderer and the tests that prove the QR target. */
export const CERTIFICATE_QR_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 2,
  width: 512,
} as const;

export const CERTIFICATE_PDF_METADATA = {
  title: "Certificate of Attendance",
  author: "Prism Pass",
  subject: "Attendance certificate",
  creator: "Prism Pass",
  producer: "Prism Pass",
} as const;

const COLORS = {
  ink: rgb(0.07, 0.09, 0.15),
  muted: rgb(0.38, 0.42, 0.49),
  rule: rgb(0.76, 0.78, 0.82),
  accent: rgb(0.12, 0.3, 0.55),
} as const;

const INNER_FRAME = { inset: 32 } as const;
const CONTENT_WIDTH = 620;

export type RenderCertificatePdfInput = {
  payload: CertificatePayloadV1;
  sealedAt: Date | string;
  certificateNumber: string;
  /** Explicit public verification URL. Takes precedence over `verifyToken`. */
  verifyUrl?: string | null;
  /** Fallback for `verifyUrl`: `${APP_URL}/verify/${verifyToken}`. */
  verifyToken?: string | null;
  hashPrefix: string;
};

export type CertificatePdfFailureCode = "NOT_SEALED" | "INTEGRITY_FAILED" | "CHAIN_BROKEN";

export type CertificatePdfGateResult =
  | { ok: true; payload: CertificatePayloadV1 }
  | { ok: false; code: CertificatePdfFailureCode; message: string };

export type CertificatePdfGateInput = {
  status: string;
  sealedAt: Date | string | null;
  sha256: string;
  payload: unknown;
  /** Result of `signatureRequestsChainValid()`; undefined means unchecked. */
  chainValid?: boolean;
};

function toValidDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Certificate PDF requires a valid sealedAt instant");
  }
  return date;
}

function normalizeStatus(status: string): string {
  return typeof status === "string" ? status.trim().toUpperCase() : "";
}

/**
 * Decides whether a stored document may be rendered for download.
 *
 * Precedence is sealed -> content -> chain, so a tampered draft reports
 * NOT_SEALED rather than leaking that its hash also changed. The stored hash is
 * the payload-only value written at generation (`certificateContentHash`), not
 * the generic document-content hash.
 */
export function evaluateCertificatePdfGate(input: CertificatePdfGateInput): CertificatePdfGateResult {
  if (normalizeStatus(input.status) !== "SEALED" || input.sealedAt === null || input.sealedAt === undefined) {
    return { ok: false, code: "NOT_SEALED", message: "Certificate is not sealed" };
  }

  const storedHash = typeof input.sha256 === "string" ? input.sha256.trim().toLowerCase() : "";
  let computedHash: string | null = null;
  try {
    computedHash = certificateContentHash(input.payload);
  } catch {
    computedHash = null;
  }
  if (!computedHash || computedHash !== storedHash) {
    return {
      ok: false,
      code: "INTEGRITY_FAILED",
      message: "Certificate content does not match its recorded fingerprint",
    };
  }

  const parsed = certificatePayloadV1.safeParse(input.payload);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INTEGRITY_FAILED",
      message: "Certificate content does not match the certificate schema",
    };
  }

  if (input.chainValid === false) {
    return {
      ok: false,
      code: "CHAIN_BROKEN",
      message: "Certificate signature chain is broken",
    };
  }

  return { ok: true, payload: parsed.data };
}

/**
 * Resolves the public verification target encoded in the QR code. An explicit
 * URL wins; otherwise the unguessable verify token is appended to APP_URL.
 */
export function resolveCertificateVerifyUrl(input: {
  verifyUrl?: string | null;
  verifyToken?: string | null;
  appUrl?: string;
}): string {
  const explicit = typeof input.verifyUrl === "string" ? input.verifyUrl.trim() : "";
  if (explicit) return explicit;

  const token = typeof input.verifyToken === "string" ? input.verifyToken.trim() : "";
  if (!token) {
    throw new Error("Certificate PDF requires verifyUrl or verifyToken");
  }

  const base = (input.appUrl ?? env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/verify/${encodeURIComponent(token)}`;
}

/** QR PNG for the verification URL. Exported so tests can prove the content. */
export async function createCertificateQrPng(verifyUrl: string): Promise<Uint8Array> {
  const target = verifyUrl.trim();
  if (!target) throw new Error("Certificate QR requires a verification URL");
  const buffer: Uint8Array = await QRCode.toBuffer(target, {
    type: "png",
    ...CERTIFICATE_QR_OPTIONS,
  });
  return new Uint8Array(buffer);
}

function canEncode(font: PDFFont, text: string): boolean {
  if (text.length === 0) return true;
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Replace characters the WinAnsi standard fonts cannot encode. */
function fontSafeText(font: PDFFont, text: string): string {
  const safe: string[] = [];
  for (const character of Array.from(text)) {
    if (canEncode(font, character)) {
      safe.push(character);
      continue;
    }
    const folded = character.normalize("NFD").replace(/\p{M}/gu, "");
    if (folded.length > 0 && canEncode(font, folded)) {
      safe.push(folded);
      continue;
    }
    safe.push("?");
  }
  return safe.join("");
}

/** Collapse whitespace, make the text font-safe, and hard-cap its length. */
export function sanitizeCertificateText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const collapsed = value
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const characters = Array.from(collapsed);
  if (characters.length <= maxLength) return collapsed;
  return `${characters.slice(0, Math.max(1, maxLength - 3)).join("").trimEnd()}...`;
}

type FittedText = { text: string; size: number };

function fitSingleLine(
  font: PDFFont,
  text: string,
  maxWidth: number,
  preferredSize: number,
  minimumSize: number,
): FittedText {
  const safe = fontSafeText(font, text);
  let size = preferredSize;
  while (size > minimumSize && font.widthOfTextAtSize(safe, size) > maxWidth) {
    size -= 1;
  }
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return { text: safe, size };

  const characters = Array.from(safe);
  while (
    characters.length > 0 &&
    font.widthOfTextAtSize(`${characters.join("").trimEnd()}...`, size) > maxWidth
  ) {
    characters.pop();
  }
  return { text: `${characters.join("").trimEnd()}...`, size };
}

function wrapText(
  font: PDFFont,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = fontSafeText(font, text).split(" ").filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
    }

    let remaining = word;
    while (font.widthOfTextAtSize(remaining, size) > maxWidth && lines.length < maxLines) {
      let splitAt = remaining.length - 1;
      while (
        splitAt > 1 &&
        font.widthOfTextAtSize(`${remaining.slice(0, splitAt)}-`, size) > maxWidth
      ) {
        splitAt -= 1;
      }
      lines.push(`${remaining.slice(0, splitAt)}-`);
      remaining = remaining.slice(splitAt);
    }
    if (lines.length >= maxLines) break;
    current = remaining;
  }

  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;

  if (lines.length === maxLines && lines.join(" ").length < text.length) {
    const last = lines.length - 1;
    let truncated = lines[last];
    while (truncated.length > 0 && font.widthOfTextAtSize(`${truncated}...`, size) > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[last] = `${truncated.trimEnd()}...`;
  }

  return lines;
}

function drawCentred(
  page: PDFPage,
  text: string,
  options: { y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> },
): void {
  const width = options.font.widthOfTextAtSize(text, options.size);
  page.drawText(text, {
    x: (CERTIFICATE_PDF_PAGE.width - width) / 2,
    y: options.y,
    size: options.size,
    font: options.font,
    color: options.color,
  });
}

function formatSealedAt(value: Date): string {
  const iso = value.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function formatIssuedOn(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day} ${month} ${year}`;
}

/**
 * Renders a single A4-landscape attendance certificate.
 *
 * `payload` is expected to have passed `evaluateCertificatePdfGate()` in the
 * route. Only allowlisted payload fields are drawn; unknown runtime properties
 * are ignored, which is what keeps a malformed or over-shaped payload from
 * leaking extra data into the artifact.
 */
export async function renderCertificatePdf(input: RenderCertificatePdfInput): Promise<Uint8Array> {
  const sealedAt = toValidDate(input.sealedAt);
  const verifyUrl = resolveCertificateVerifyUrl({
    verifyUrl: input.verifyUrl,
    verifyToken: input.verifyToken,
  });
  const qrPng = await createCertificateQrPng(verifyUrl);

  const pdf = await PDFDocument.create({ updateMetadata: false });
  pdf.setTitle(CERTIFICATE_PDF_METADATA.title);
  pdf.setAuthor(CERTIFICATE_PDF_METADATA.author);
  pdf.setSubject(CERTIFICATE_PDF_METADATA.subject);
  pdf.setCreator(CERTIFICATE_PDF_METADATA.creator);
  pdf.setProducer(CERTIFICATE_PDF_METADATA.producer);
  pdf.setCreationDate(sealedAt);
  pdf.setModificationDate(sealedAt);

  const page = pdf.addPage([CERTIFICATE_PDF_PAGE.width, CERTIFICATE_PDF_PAGE.height]);
  const timesRoman = await pdf.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const timesRomanItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const width = CERTIFICATE_PDF_PAGE.width;
  const height = CERTIFICATE_PDF_PAGE.height;

  // Double rule frame. The outer frame is the visual border; the inner frame
  // gives the certificate its printed-document margin.
  page.drawRectangle({
    x: 26,
    y: 26,
    width: width - 52,
    height: height - 52,
    borderColor: COLORS.ink,
    borderWidth: 1.4,
  });
  page.drawRectangle({
    x: INNER_FRAME.inset,
    y: INNER_FRAME.inset,
    width: width - INNER_FRAME.inset * 2,
    height: height - INNER_FRAME.inset * 2,
    borderColor: COLORS.rule,
    borderWidth: 0.6,
  });

  const payload = input.payload;

  const organization = fitSingleLine(
    helveticaBold,
    sanitizeCertificateText(payload.organization.name, 140).toUpperCase(),
    640,
    11,
    8,
  );
  drawCentred(page, organization.text, {
    y: 526,
    size: organization.size,
    font: helveticaBold,
    color: COLORS.accent,
  });

  drawCentred(page, "Certificate of Attendance", {
    y: 476,
    size: 34,
    font: timesRomanBold,
    color: COLORS.ink,
  });

  page.drawLine({
    start: { x: width / 2 - 118, y: 462 },
    end: { x: width / 2 + 118, y: 462 },
    thickness: 1,
    color: COLORS.accent,
  });

  drawCentred(page, "This is to certify that", {
    y: 428,
    size: 10.5,
    font: helvetica,
    color: COLORS.muted,
  });

  const recipient = fitSingleLine(
    timesRomanBold,
    sanitizeCertificateText(payload.recipient.displayName, 140),
    CONTENT_WIDTH,
    30,
    17,
  );
  drawCentred(page, recipient.text, {
    y: 380,
    size: recipient.size,
    font: timesRomanBold,
    color: COLORS.ink,
  });

  page.drawLine({
    start: { x: width / 2 - 190, y: 364 },
    end: { x: width / 2 + 190, y: 364 },
    thickness: 0.7,
    color: COLORS.rule,
  });

  const statementLines = wrapText(
    timesRomanItalic,
    sanitizeCertificateText(payload.statement, 600),
    11.5,
    CONTENT_WIDTH,
    4,
  );
  statementLines.forEach((line, index) => {
    drawCentred(page, line, {
      y: 338 - index * 15,
      size: 11.5,
      font: timesRomanItalic,
      color: COLORS.ink,
    });
  });

  const eventTitle = fitSingleLine(
    timesRomanBold,
    sanitizeCertificateText(payload.event.title, 160),
    CONTENT_WIDTH,
    15,
    10,
  );
  drawCentred(page, eventTitle.text, {
    y: 272,
    size: eventTitle.size,
    font: timesRomanBold,
    color: COLORS.ink,
  });

  drawCentred(page, sanitizeCertificateText(payload.event.dateLabel, 80), {
    y: 250,
    size: 10.5,
    font: helvetica,
    color: COLORS.muted,
  });

  page.drawLine({
    start: { x: 60, y: 208 },
    end: { x: width - 60, y: 208 },
    thickness: 0.7,
    color: COLORS.rule,
  });

  // Signature block: the accountable signatory, never the recipient.
  page.drawLine({
    start: { x: 90, y: 150 },
    end: { x: 330, y: 150 },
    thickness: 0.8,
    color: COLORS.ink,
  });
  const signatory = fitSingleLine(
    timesRomanBold,
    sanitizeCertificateText(payload.signatory.displayName, 80),
    230,
    12,
    8,
  );
  const signatoryWidth = timesRomanBold.widthOfTextAtSize(signatory.text, signatory.size);
  page.drawText(signatory.text, {
    x: 210 - signatoryWidth / 2,
    y: 132,
    size: signatory.size,
    font: timesRomanBold,
    color: COLORS.ink,
  });
  const role = fitSingleLine(
    helvetica,
    sanitizeCertificateText(payload.signatory.roleLabel, 80),
    230,
    8.5,
    6.5,
  );
  const roleWidth = helvetica.widthOfTextAtSize(role.text, role.size);
  page.drawText(role.text, {
    x: 210 - roleWidth / 2,
    y: 116,
    size: role.size,
    font: helvetica,
    color: COLORS.muted,
  });
  const authorizedLabel = "Authorized Signatory";
  const authorizedWidth = helvetica.widthOfTextAtSize(authorizedLabel, 7);
  page.drawText(authorizedLabel, {
    x: 210 - authorizedWidth / 2,
    y: 100,
    size: 7,
    font: helvetica,
    color: COLORS.muted,
  });

  // Footer metadata + QR. The QR is the only bearer capability on the page; it
  // points at the public verification page, never at a document download.
  const qrImage = await pdf.embedPng(qrPng);
  const qrSize = 90;
  const qrX = width - INNER_FRAME.inset - qrSize - 18;
  const qrY = 78;
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  const scanLabel = "Scan to verify";
  const scanWidth = helveticaBold.widthOfTextAtSize(scanLabel, 7);
  page.drawText(scanLabel, {
    x: qrX + qrSize / 2 - scanWidth / 2,
    y: qrY + qrSize + 5,
    size: 7,
    font: helveticaBold,
    color: COLORS.muted,
  });

  const urlLines = wrapText(helvetica, verifyUrl, 6, qrSize + 16, 3);
  const urlX = qrX + qrSize / 2;
  urlLines.forEach((line, index) => {
    const lineWidth = helvetica.widthOfTextAtSize(line, 6);
    page.drawText(line, {
      x: urlX - lineWidth / 2,
      y: qrY - 10 - index * 8,
      size: 6,
      font: helvetica,
      color: COLORS.muted,
    });
  });

  const footerX = 60;
  const sealedLabel = `Sealed ${formatSealedAt(sealedAt)}`;
  page.drawText(sealedLabel, {
    x: footerX,
    y: 88,
    size: 8,
    font: helvetica,
    color: COLORS.muted,
  });
  page.drawText(`Issued ${formatIssuedOn(payload.issuedOn)}`, {
    x: footerX,
    y: 74,
    size: 8,
    font: helvetica,
    color: COLORS.muted,
  });
  const certificateNumber = fitSingleLine(
    helveticaBold,
    sanitizeCertificateText(input.certificateNumber, 40),
    260,
    8,
    6.5,
  );
  page.drawText(`Certificate ${certificateNumber.text}`, {
    x: footerX,
    y: 60,
    size: certificateNumber.size,
    font: helveticaBold,
    color: COLORS.ink,
  });
  const hash = sanitizeCertificateText(input.hashPrefix, 32).toLowerCase();
  page.drawText(`SHA-256 ${hash}`, {
    x: footerX,
    y: 46,
    size: 7,
    font: helvetica,
    color: COLORS.muted,
  });

  return pdf.save();
}

/**
 * True when a document template is the attendance certificate renderer's
 * template. Exported so the route and tests agree on the same predicate.
 */
export function isCertificateTemplate(template: string | null | undefined): boolean {
  return template === CERTIFICATE_TEMPLATE_KEY;
}
