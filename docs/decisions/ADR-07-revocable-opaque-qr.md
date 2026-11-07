# ADR-07 — Revocable, opaque QR credentials

Status: Accepted. QR = opaque `passPublicId + secret`; PII never encoded. Status `active|revoked|expired`, versioned, rotatable. Server verifies hash + status at scan and at sync revalidation. Refs: erd.md, contracts-v1.md.
