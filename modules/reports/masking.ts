// PII minimization for report exports.
//
// Server-only: uses node:crypto for a salted SHA-256 pseudonym. Never import
// this module from a client component.
//
// VIEWER policy (docs/security/permission-matrix.md: "VIEWER cannot export PII
// bulk; masked summary only unless reports.export explicitly granted"):
//   - display name is reduced to initials ("Maria Clara Santos" → "M.C.S.")
//   - external id is replaced with "ext_" + the first 12 hex chars of
//     sha256("<organizationId>\0<externalId>")
//   - no email address is ever included in a DTR row (the schema has no email
//     column on Person), so nothing else needs redaction.
//
// Masking is keyed by role, not by endpoint: even if a VIEWER is granted
// reports.export through a membership override, the export stays masked.

import { createHash } from "node:crypto";
import type { DtrRow } from "./dtr";

/** Roles that must never receive raw PII in a bulk export. */
export const MASKED_EXPORT_ROLES = ["VIEWER"] as const;

function isMaskedRole(role: string | null | undefined): boolean {
  return (MASKED_EXPORT_ROLES as readonly string[]).includes(role ?? "");
}

/** Uppercase initials with a trailing period per word: "Maria Clara" → "M.C." */
export function initials(displayName: string | null | undefined): string {
  const words = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  return words
    .map((word) => {
      const first = Array.from(word)[0];
      return first ? `${first.toUpperCase()}.` : "";
    })
    .join("");
}

/** Deterministic, org-salted pseudonym for an external id. */
export function pseudonymizeExternalId(externalId: string, organizationSalt: string): string {
  const digest = createHash("sha256")
    .update(`${organizationSalt}\u0000${externalId}`)
    .digest("hex")
    .slice(0, 12);
  return `ext_${digest}`;
}

/** Apply the export masking policy to DTR rows. Non-VIEWER roles pass through. */
export function maskDtrRows(rows: readonly DtrRow[], options: { role: string; organizationSalt: string }): DtrRow[] {
  if (!isMaskedRole(options.role)) return [...rows];
  return rows.map((row) => ({
    ...row,
    displayName: initials(row.displayName),
    externalId: row.externalId ? pseudonymizeExternalId(row.externalId, options.organizationSalt) : null,
  }));
}
