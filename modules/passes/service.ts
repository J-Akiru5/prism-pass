import { createHash, createHmac } from "crypto";

// Pass QR derivation.
//
// The database stores only a hash/verifier. To let a member re-open their own
// pass on any device, the QR secret is derived from a server-held master key
// (`PASS_QR_SECRET`) and the pass identity/version. This keeps the secret out of
// the database while making the QR stable and redisplayable. Rotating the pass
// increments `version`; rotating the master key invalidates every derived pass.

const QR_SECRET_ENV = "PASS_QR_SECRET";
const QR_SECRET_CONTEXT = "prism-pass:pass-qr:v1";

/** Derive the 64-hex secret for one pass version. */
export function passQrSecret(passPublicId: string, version = 1): string {
  const master = process.env[QR_SECRET_ENV];
  if (!master || master.length < 32) {
    throw new Error(`${QR_SECRET_ENV} must be set to at least 32 characters`);
  }
  return createHmac("sha256", master)
    .update(`${QR_SECRET_CONTEXT}:${passPublicId}:${version}`)
    .digest("hex");
}

/** Opaque QR payload (`PRISM1:<id>:<secret>`). */
export function qrPayloadForPass(passPublicId: string, version = 1): string {
  return `PRISM1:${passPublicId}:${passQrSecret(passPublicId, version)}`;
}

/** Verifier stored in `Pass.credentialHash` for a derived pass version. */
export function credentialHashForPass(passPublicId: string, version = 1): string {
  return hashCredential(passPublicId, passQrSecret(passPublicId, version));
}

/** Issuance/rotation pair. Version must match the row being written. */
export function newCredentialPair(passPublicId: string, version = 1) {
  const secret = passQrSecret(passPublicId, version);
  return {
    qrPayload: `PRISM1:${passPublicId}:${secret}`,
    credentialHash: hashCredential(passPublicId, secret),
  };
}

export function hashCredential(passPublicId: string, secret: string) {
  return createHash("sha256").update(`${passPublicId}:${secret}`).digest("hex");
}
