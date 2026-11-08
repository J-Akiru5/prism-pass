import { createHash } from "crypto";

// P5 document + e-signature core. Everything here is pure: no Prisma, no
// network, no clock reads except when the caller passes `now`. Routes own
// persistence; this module owns the integrity rules those routes must not
// re-implement differently.

export const DOCUMENT_STATUSES = ["DRAFT", "SEALED", "SUPERSEDED", "REVOKED"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const SIGNATURE_METHODS = ["drawn", "typed", "credential"] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export type SignatureOrderStep = {
  order: number;
  signerUserId?: string | null;
  signerPersonId?: string | null;
  role?: string | null;
};

export type ChainEvent = {
  requestId: string;
  docHash: string;
  signerKey: string;
  consentVersion: string;
  serverTs: Date | string;
  prevHash: string | null;
  currHash: string;
};

export type ChainVerification = {
  ok: boolean;
  /** Zero-based index of the first event that fails verification. */
  brokenAt: number | null;
  reason?: "genesis_mismatch" | "prev_mismatch" | "hash_mismatch" | "request_mismatch";
};

export type SigningFailureCode =
  | "DOCUMENT_NOT_DRAFT"
  | "REQUEST_EXPIRED"
  | "INVALID_ORDER"
  | "CONSENT_REQUIRED"
  | "CONSENT_VERSION_MISMATCH"
  | "ALL_STEPS_SIGNED"
  | "ALREADY_SIGNED"
  | "NOT_YOUR_TURN";

export type SigningDecision =
  | {
      ok: true;
      step: SignatureOrderStep;
      signerKey: string;
      /** Append position this signature will occupy (0-based). */
      sequence: number;
      sealsDocument: boolean;
    }
  | { ok: false; code: SigningFailureCode; message: string };

export type SigningContext = {
  order: SignatureOrderStep[];
  signedEvents: Array<{ signerUserId?: string | null; signerPersonId?: string | null }>;
  documentStatus: DocumentStatus;
  /** Consent text version the signer was shown; must match the request. */
  consentVersion?: string | null;
  requiredConsentVersion?: string | null;
  /** Every identity key the authenticated actor is allowed to sign as. */
  actorKeys: string[];
  expiresAt?: Date | string | null;
  now?: Date;
};

/**
 * Deterministic JSON: object keys sorted recursively, arrays keep their order,
 * Dates become ISO strings. The same logical payload always yields the same
 * bytes, so the stored SHA-256 is stable across servers and runtimes.
 */
export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(normalizeJson(value));
  if (encoded === undefined) throw new Error("Payload is not JSON-serializable");
  return encoded;
}

function normalizeJson(value: unknown): unknown {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Payload contains a non-finite number");
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const child = source[key];
      if (child === undefined) continue; // JSON.stringify omits undefined members
      out[key] = normalizeJson(child);
    }
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash of the exact document content a signature commits to. */
export function documentContentHash(input: { template: string; version: number; payload: unknown }): string {
  return sha256Hex(
    canonicalJson({
      template: input.template,
      version: input.version,
      payload: input.payload,
    }),
  );
}

export function signerKeyOf(input: {
  signerUserId?: string | null;
  signerPersonId?: string | null;
}): string | null {
  if (input.signerUserId) return `user:${input.signerUserId}`;
  if (input.signerPersonId) return `person:${input.signerPersonId}`;
  return null;
}

export function signerKey(input: {
  signerUserId?: string | null;
  signerPersonId?: string | null;
}): string {
  const key = signerKeyOf(input);
  if (!key) throw new Error("Signature step needs signerUserId or signerPersonId");
  return key;
}

function serverTsIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid server timestamp");
  return date.toISOString();
}

/**
 * Chain link per ADR-10: sha256(prevHash + requestId + docHash + signerKey +
 * consentVersion + serverTs). The first event uses an empty prevHash.
 */
export function chainHash(input: {
  prevHash: string | null;
  requestId: string;
  docHash: string;
  signerKey: string;
  consentVersion: string;
  serverTs: Date | string;
}): string {
  const payload =
    (input.prevHash ?? "") +
    input.requestId +
    input.docHash +
    input.signerKey +
    input.consentVersion +
    serverTsIso(input.serverTs);
  return sha256Hex(payload);
}

/**
 * Recomputes every link and checks prevHash continuity. It does not prove the
 * document bytes beyond `docHash` and cannot detect a fully rewritten suffix
 * when the attacker can also rewrite later hashes (no external anchoring).
 */
export function verifyChain(events: ChainEvent[], options?: { requestId?: string }): ChainVerification {
  let previous: string | null = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (options?.requestId && event.requestId !== options.requestId) {
      return { ok: false, brokenAt: index, reason: "request_mismatch" };
    }
    if (index === 0) {
      if (event.prevHash !== null && event.prevHash !== "") {
        return { ok: false, brokenAt: index, reason: "genesis_mismatch" };
      }
    } else if (event.prevHash !== previous) {
      return { ok: false, brokenAt: index, reason: "prev_mismatch" };
    }
    const expected = chainHash(event);
    if (event.currHash !== expected) {
      return { ok: false, brokenAt: index, reason: "hash_mismatch" };
    }
    previous = event.currHash;
  }
  return { ok: true, brokenAt: null };
}

export function sortSignatureOrder(order: SignatureOrderStep[]): SignatureOrderStep[] {
  return [...order].sort((a, b) => a.order - b.order);
}

/** Order steps must be contiguous from 1 and name exactly one signer each. */
export function isValidSignatureOrder(order: SignatureOrderStep[]): boolean {
  if (!Array.isArray(order) || order.length === 0) return false;
  const sorted = sortSignatureOrder(order);
  const seen = new Set<string>();
  for (let index = 0; index < sorted.length; index += 1) {
    const step = sorted[index];
    if (step.order !== index + 1) return false;
    const key = signerKeyOf(step);
    if (!key || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export function signedSignerKeys(
  events: Array<{ signerUserId?: string | null; signerPersonId?: string | null }>,
): string[] {
  return events.map((event) => signerKeyOf(event) ?? "");
}

export function isFullySigned(
  order: SignatureOrderStep[],
  signedEvents: Array<{ signerUserId?: string | null; signerPersonId?: string | null }>,
): boolean {
  return isValidSignatureOrder(order) && signedEvents.length === order.length;
}

/**
 * Decides whether this actor may append the next signature now.
 *
 * Rules: the document must still be DRAFT, the request must not be expired, the
 * signer must present the exact consent version, only the current (lowest
 * unsigned) step may sign, and a signer who already signed cannot sign again.
 */
export function evaluateSigning(context: SigningContext): SigningDecision {
  if (context.documentStatus !== "DRAFT") {
    return { ok: false, code: "DOCUMENT_NOT_DRAFT", message: `Document is ${context.documentStatus.toLowerCase()}` };
  }
  if (context.expiresAt) {
    const expiresAt = context.expiresAt instanceof Date ? context.expiresAt : new Date(context.expiresAt);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= (context.now ?? new Date()).getTime()) {
      return { ok: false, code: "REQUEST_EXPIRED", message: "Signature request has expired" };
    }
  }
  if (!isValidSignatureOrder(context.order)) {
    return { ok: false, code: "INVALID_ORDER", message: "Signature order is invalid" };
  }
  if (!context.consentVersion) {
    return { ok: false, code: "CONSENT_REQUIRED", message: "Explicit consent is required" };
  }
  if (!context.requiredConsentVersion) {
    return { ok: false, code: "CONSENT_REQUIRED", message: "Signature request has no consent version" };
  }
  if (context.consentVersion !== context.requiredConsentVersion) {
    return { ok: false, code: "CONSENT_VERSION_MISMATCH", message: "Consent version does not match the request" };
  }

  const steps = sortSignatureOrder(context.order);
  const signedKeys = signedSignerKeys(context.signedEvents);
  if (signedKeys.some((key) => key === "")) {
    return { ok: false, code: "INVALID_ORDER", message: "A signature event has no signer identity" };
  }
  if (new Set(signedKeys).size !== signedKeys.length) {
    return { ok: false, code: "ALREADY_SIGNED", message: "A signer has already signed this request" };
  }
  // Stored events must be the contiguous prefix of the assigned order.
  for (let index = 0; index < signedKeys.length; index += 1) {
    if (signedKeys[index] !== signerKey(steps[index])) {
      return { ok: false, code: "INVALID_ORDER", message: "Signed events do not follow the assigned order" };
    }
  }
  if (signedKeys.length >= steps.length) {
    return { ok: false, code: "ALL_STEPS_SIGNED", message: "Every signature step is already signed" };
  }
  if (context.actorKeys.some((key) => signedKeys.includes(key))) {
    return { ok: false, code: "ALREADY_SIGNED", message: "You have already signed this request" };
  }

  const currentStep = steps[signedKeys.length];
  const currentKey = signerKey(currentStep);
  if (!context.actorKeys.includes(currentKey)) {
    return { ok: false, code: "NOT_YOUR_TURN", message: "Only the current signer may sign right now" };
  }

  return {
    ok: true,
    step: currentStep,
    signerKey: currentKey,
    sequence: signedKeys.length,
    sealsDocument: signedKeys.length + 1 === steps.length,
  };
}

/**
 * Corrections never mutate a signed artifact. A new version starts as DRAFT at
 * version + 1; the prior row is superseded by the caller/route that creates it.
 */
export function nextDocumentVersion(current: { version: number; status: DocumentStatus }): {
  version: number;
  status: DocumentStatus;
} {
  if (!Number.isInteger(current.version) || current.version < 1) {
    throw new Error("Document version must be a positive integer");
  }
  return { version: current.version + 1, status: "DRAFT" };
}

/**
 * Sealing is a one-way transition. A sealed/superseded/revoked document is
 * never mutated in place; corrections create a new version or a revocation
 * event instead (signature-lifecycle.md).
 */
export function nextDocumentStatus(current: DocumentStatus, sealsDocument: boolean): DocumentStatus {
  if (current !== "DRAFT") return current;
  return sealsDocument ? "SEALED" : "DRAFT";
}
