// Request-body reading with a hard size ceiling. Pure Node/Web APIs (no Next,
// no server-only imports) so the boundary tests can run outside the server
// runtime.

/** Request-body ceilings. Route handlers never buffer an unbounded JSON body. */
export const BODY_LIMITS = {
  /** Small control payloads: ids, reasons, status toggles. */
  tiny: 16 * 1024,
  /** Signature requests and other multi-field payloads. */
  small: 64 * 1024,
  /** Document payloads with inline structured content. */
  medium: 256 * 1024,
  /** Offline sync envelopes (MAX_BATCH_EVENTS events + signature). */
  batch: 1024 * 1024,
} as const;

export class PayloadTooLargeError extends Error {
  status = 413;
  constructor(readonly limitBytes: number) {
    super(`Request body exceeds ${limitBytes} bytes`);
  }
}

export class InvalidJsonError extends Error {
  status = 400;
}

/**
 * Read and size-check a JSON body. `content-length` is checked before buffering;
 * a chunked request without it is still read but rejected as soon as the byte
 * length exceeds the ceiling. Parsing happens here so malformed JSON becomes a
 * 400 instead of an opaque 500 from `req.json()`.
 */
export async function readJson(req: Request, maxBytes: number = BODY_LIMITS.medium): Promise<unknown> {
  const declared = req.headers.get("content-length");
  if (declared) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) throw new PayloadTooLargeError(maxBytes);
  }
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new PayloadTooLargeError(maxBytes);
  if (text.trim() === "") throw new InvalidJsonError("Request body is empty");
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidJsonError("Request body is not valid JSON");
  }
}
