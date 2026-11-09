# QR / pass verification hardening

Scope: the two server-side verification paths for opaque Prism Pass QR credentials.

- `POST /api/v1/orgs/:orgId/passes/verify` — verify-only, no attendance write.
- `POST /api/v1/orgs/:orgId/sessions/:sessionId/scans` and the offline batch path
  (`POST /api/v1/sync/batches`) via `performScan` — canonical attendance write path.

The QR format is `PRISM1:<passPublicId>:<64-hex-secret>`. The database stores only
`credentialHash = sha256("<passPublicId>:<secret>")` and the pass status/expiry.

## Threat model

| Threat | Impact | Control |
| --- | --- | --- |
| Remote timing analysis of `credentialHash !== hashCredential(...)` | Byte-by-byte recovery of the stored hash, reducing the secret search space | One shared `crypto.timingSafeEqual` verifier used by both paths |
| Oversized or malformed QR payloads | Regex/DB work amplification, ambiguous parsing, input used as an unbounded lookup key | Hard payload cap, bounded pass-id charset/length, exact secret shape, no trimming |
| Trailing whitespace/newline or garbage accepted as part of a credential | Two different byte strings treated as the same credential; parser/issuer mismatch | Whitespace rejected anywhere; anchored parse with no trailing data |
| Invalid `expiresAt` (for example a corrupt row or bad manual update) | `new Date(x) < now` is `false` for `Invalid Date`, so a corrupt pass verified as VALID | Explicit `INVALID_EXPIRY` failure; only `null`/`undefined` mean "no expiry" |
| Verify endpoint and scan path drifting apart | A pass accepted by one path and rejected by the other | Shared parser, status function, HTTP-status mapping and credential verifier |
| Credential brute force / replay through the verify endpoint | Guessing a 256-bit secret or replaying a captured QR | Existing per-IP and per-org token buckets; see residual risks |
| Secret leakage through logs | Credential replay from audit data | Audit rows record result/reason only; no raw credential or secret is written |

## Changes

### Shared constant-time verifier

New server-only module `modules/passes/credential.ts`:

- `constantTimeEqualHex(a, b)` validates both values as even-length hex, checks equal
  length, then calls `crypto.timingSafeEqual` on the decoded bytes. `Buffer.from(x,
  "hex")` silently truncates malformed hex, so validation happens before comparison.
- `verifyCredentialHash(passPublicId, secret, storedHash)` hashes with the existing
  `hashCredential` function and compares through the helper. The hash scheme is
  unchanged: SHA-256 over the literal `<passPublicId>:<secret>` string.
- `modules/passes/verify.ts` remains free of Node-only imports so the parser is safe
  to import from client code.

Both `passes/verify/route.ts` and `modules/attendance/scan-service.ts` now call
`verifyCredentialHash`; the former `!==` comparisons are gone.

### Strict QR parser

`parseQrPayload` in `modules/passes/verify.ts` now:

- rejects non-string input, empty payloads and payloads longer than 136 characters
  (`PRISM1:` + 64-char id + `:` + 64-char secret);
- rejects any whitespace anywhere (leading, trailing, internal, newline, tab) instead
  of calling `.trim()`. This also closes JavaScript's `$`-matches-before-final-newline
  behavior;
- bounds the pass id to 1–64 characters from `[A-Za-z0-9_-]`. Issued ids are
  `pp_` + 16 hex chars; demo ids are `pp_demo_` + a short slug. The prefix is not
  required because the database column has no constraint and a manually provisioned
  legacy id may exist;
- requires exactly 64 hex characters for the secret (case-insensitive syntax);
- rejects extra colons, trailing garbage, wrong prefixes and partial payloads.

The secret is returned verbatim. Hashing is over the literal issued string, so an
uppercased rendering of a lowercase secret is a different credential (see residual
risks).

### Expiry semantics

`verifyPassStatus` now uses an explicit order:

1. `REVOKED` → fail (`REVOKED`)
2. `EXPIRED` → fail (`EXPIRED`)
3. any other non-`ACTIVE` status → fail (`INVALID_STATUS`)
4. present `expiresAt` that does not parse to a finite timestamp → fail
   (`INVALID_EXPIRY`)
5. past `expiresAt` → fail (`EXPIRED`)
6. otherwise → `VALID`

`null`/`undefined` still mean "no expiry". A finite future expiry is valid. The
existing boundary is preserved: a timestamp exactly equal to `now` is not yet past
(`expiresAt < now`).

`passStatusHttpStatus` centralises the API mapping used by both paths: `REVOKED` is
403; every other failure is 410. This preserves the existing status codes while
making the new `INVALID_EXPIRY` reason usable without inventing per-route behavior.

### Audit behavior

- The verify-only endpoint already recorded `invalid_format` for unparseable
  payloads. It continues to do so, with no credential echoed.
- `performScan` now records `attendance.scan` / `invalid_format` on the session
  resource for a malformed payload. Previously that path returned 400 without an
  audit row. No credential, secret or payload content is stored.
- All existing audit rows, results and HTTP codes are unchanged for existing
  scenarios.

### Deliberately unchanged

- The person-active (`person.status`) check remains only in the attendance scan
  path, in its original position. The verify-only endpoint still reports credential
  validity without redefining attendance eligibility.
- Hash algorithm, stored hash format, rotation, issuance and the QR wire format.
- Rate-limit policies and limiters. No shared rate-limit file was edited.
- Database schema, dependencies, API success/error contracts for valid passes.

## Behavior table

| Scenario | Before | After | HTTP / reason |
| --- | --- | --- | --- |
| Correct secret, active, no expiry | valid | valid | 200 |
| Correct secret, active, future expiry | valid | valid | 200 |
| Correct secret, past expiry | rejected | rejected | 410 / `EXPIRED` |
| Correct secret, revoked | rejected | rejected | 403 / `REVOKED` |
| Correct secret, status `EXPIRED` | rejected | rejected | 410 / `EXPIRED` |
| Correct secret, unknown status | rejected | rejected | 410 / `INVALID_STATUS` |
| Correct secret, unparseable `expiresAt` | **accepted** (NaN comparison) | rejected | 410 / `INVALID_EXPIRY` |
| Wrong secret | rejected | rejected | 403 / `FORBIDDEN` (`credential_mismatch`) |
| Unknown pass id | rejected | rejected | 404 / `NOT_FOUND` |
| Malformed / oversized / whitespace payload | 400 | 400 | 400 / `INVALID_INPUT`, audit `invalid_format` |
| Uppercase stored hash bytes | equal | equal (hex compared by byte) | normal validity |
| Uppercased secret rendering | mismatch | mismatch | 403 (literal-string hashing) |

Valid passes continue to verify and write attendance exactly as before. Revoked and
expired passes still fail.

## Tests

Added/extended pure tests (no database, no network):

- `tests/passes-verify.test.ts` — status/expiry matrix, HTTP mapping, charset,
  length boundaries, casing, whitespace, trailing data, malformed separators and
  oversized inputs.
- `tests/qr-hardening.test.ts` — constant-time helper equal/unequal/length-mismatch/
  invalid-hex, credential verification, literal hash scheme, tampered secrets,
  malformed stored hashes and the combined parse → verify → status pipeline.

Command and result:

```text
pnpm exec vitest run tests/passes-verify.test.ts tests/qr-hardening.test.ts

Test Files  2 passed (2)
Tests       31 passed (31)
```

Related regression suites:

```text
pnpm exec vitest run tests/security-regression.test.ts tests/org-lifecycle.test.ts \
  tests/p9-security.test.ts tests/p2-attendance-engine.test.ts \
  tests/p6-offline.test.ts tests/offline-ui.test.ts

Test Files  6 passed (6)
Tests       82 passed (82)
```

`pnpm exec tsc --noEmit` also passes.

## Residual risks

1. **Hash scheme.** The stored hash is a single unsalted SHA-256 of
   `passPublicId:secret` with no server-side pepper. A database disclosure permits
   offline guessing, but the secret is 32 random bytes (256 bits), so exhaustive
   search is infeasible. Changing to HMAC/Argon2 or adding a pepper would alter the
   stored format, rotation and the offline scanner contract; that is a separate
   schema/contract decision, not part of this change.
2. **Secret casing is literal.** Issuance and the offline scanner hash the exact
   issued lowercase string. The parser accepts uppercase hex syntactically, but an
   uppercased secret does not match the lowercase-issued hash. Making secrets
   case-insensitive would require a coordinated change to issuance, server
   verification and the offline client.
3. **Pass-id charset tightening.** Ids outside `[A-Za-z0-9_-]` or longer than 64
   characters are now rejected. All known issuance (`pp_` + 16 hex) and seed
   (`pp_demo_` + slug) ids fit. A manually inserted legacy id outside that shape
   would stop verifying and would need migration or a parser policy decision.
4. **Rate limiting is per instance.** `lib/rate-limit.ts` token buckets live in
   process memory, so they bound bursts on one instance, not a global quota. The
   verify endpoint has per-IP and per-org buckets, and the scan path has its own.
   There is no per-pass limiter. With a 256-bit secret, online guessing is not
   practical; a shared-store, per-pass limiter would be a separate infrastructure
   change and was not attempted here.
5. **Existence oracle.** An authenticated caller can distinguish an unknown pass
   (404) from a known pass with a bad secret (403). This is existing, org-scoped
   behavior and is required for useful scanner UX. It does not expose the secret.
6. **Audit write amplification.** A malformed scan now writes one audit row, bounded
   by the existing scan rate limits. This is intentional for investigation, but it
   is an additional database write per malformed attempt.
7. **No live-database route test.** Verification of route wiring is by type check
   and code inspection; the tests cover the pure parser, status matrix and hash
   verifier. Route-level behavior with Prisma/Supabase remains covered by the
   project's existing integration process.
