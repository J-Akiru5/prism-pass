// Verify-only scanner logic (owner-confirmed): validity check, no attendance write (P3).
export type PassLike = { status: "ACTIVE" | "REVOKED" | "EXPIRED"; expiresAt?: Date | string | null };
export function verifyPassStatus(p: PassLike, now = new Date()): { valid: boolean; reason: string } {
  if (p.status === "REVOKED") return { valid: false, reason: "REVOKED" };
  if (p.status === "EXPIRED") return { valid: false, reason: "EXPIRED" };
  if (p.expiresAt && new Date(p.expiresAt) < now) return { valid: false, reason: "EXPIRED" };
  if (p.status !== "ACTIVE") return { valid: false, reason: "INVALID_STATUS" };
  return { valid: true, reason: "VALID" };
}
export function parseQrPayload(payload: string): { passPublicId: string; secret: string } | null {
  const m = /^PRISM1:([^:]+):([a-f0-9]{64})$/i.exec(payload.trim());
  if (!m) return null;
  return { passPublicId: m[1], secret: m[2] };
}
