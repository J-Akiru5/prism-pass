import { createHash, randomBytes } from "crypto";
export function newCredentialPair(passPublicId: string) {
  const secret = randomBytes(32).toString("hex");
  const credentialHash = createHash("sha256").update(`${passPublicId}:${secret}`).digest("hex");
  return { qrPayload: `PRISM1:${passPublicId}:${secret}`, credentialHash };
}
export function hashCredential(passPublicId: string, secret: string) {
  return createHash("sha256").update(`${passPublicId}:${secret}`).digest("hex");
}
