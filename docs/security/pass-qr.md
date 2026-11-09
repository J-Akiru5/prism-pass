# Pass QR derivation and member display

Status: implemented 2026-11-09. No database migration.

## Why

The original pass design stored only `sha256("<passPublicId>:<secret>")` and
returned the QR payload once at issuance. A member could not reopen their pass,
so the member portal had no usable QR after the first print.

## Design

The QR secret is now **derived** from a server-held master key instead of being
random and lost:

```text
secret        = HMAC-SHA256(PASS_QR_SECRET, "prism-pass:pass-qr:v1:<passId>:<version>")
qrPayload     = "PRISM1:<passId>:<secret>"
credentialHash= SHA-256("<passId>:<secret>")   // stored in passes.credential_hash
```

- `PASS_QR_SECRET` is a 32+ byte hex secret in the server environment, never in
  the database or the browser.
- A pass is redisplayable by its owner because the server can derive the same
  secret from `passId + version`. The database still stores only the verifier.
- Rotating a pass increments `version` and changes the secret. Rotating the
  master key invalidates **every** derived pass QR and requires re-issuance.
- The QR remains opaque: it contains no name, email or organization.

## Member flow

- `GET /api/v1/orgs/[orgId]/my-pass` returns `qrPayload` for a pass only when the
  stored verifier matches the derived secret for that version. The response is
  scoped to the signed-in user's linked person.
- `POST /api/v1/orgs/[orgId]/my-pass/reissue` lets the owner re-issue their own
  ACTIVE pass. It advances the version, derives a new secret, audits
  `pass.rotate` with `meta.self = true`, and returns the new payload. This is the
  migration path for passes issued with the old random-secret scheme.
- The member page passes `qrPayload` to `DigitalPassCard` and does **not** render
  the raw secret as text; only the QR image and public pass id are shown.

## Deployment requirements

- Set `PASS_QR_SECRET` (32+ byte hex) in the local environment and in Vercel for
  every environment that serves member passes.
- Without it, derivation fails closed: member QR display is unavailable and reissue
  returns a server error. Scanning existing passes still works against their stored
  hashes.
- Back up the key securely. Losing it requires re-issuing every derived pass;
  leaking it allows QR forgery for every derived pass.

## Residual risks

- The master key is a single high-value secret. Treat it like a signing key and
  rotate deliberately (invalidates all derived QRs).
- A member can re-issue their own pass, invalidating a previously printed QR. This
  is intended self-service recovery, but it means a printed pass is not permanent.
- Legacy passes keep working for verification; they show a “Re-issue my QR” state
  in the member portal until re-issued.
- The QR is still a bearer credential; shoulder-surfing or screenshotting a valid
  pass is possible. Revocation and version rotation are the controls.
