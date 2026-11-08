# Input hardening (P9)

## Request bodies

Every route handler that reads JSON now goes through `readJson(req, limit)` from
`lib/request-body.ts` (re-exported by `lib/api.ts`). It:

1. rejects a declared `content-length` above the ceiling before buffering;
2. reads the body and rejects it if its UTF-8 byte length exceeds the ceiling;
3. rejects empty bodies and malformed JSON with a `400 INVALID_INPUT` instead of letting
   `req.json()` produce an opaque `500`;
4. returns `413 PAYLOAD_TOO_LARGE` with the limit in `details.limitBytes`.

| Ceiling | Bytes | Used by |
| --- | --- | --- |
| `BODY_LIMITS.tiny` | 16 KiB | ids, reasons, status toggles, org/people/passes/geofence/policy/session/program/event/record routes, platform status |
| `BODY_LIMITS.small` | 64 KiB | scan, document signature request, document sign |
| `BODY_LIMITS.medium` | 256 KiB | document create (inline structured payload) |
| `BODY_LIMITS.batch` | 1 MiB | offline sync envelope (up to 500 events + HMAC signature) |

Residual: a chunked request without `content-length` is still buffered in memory before the byte
check. The ceiling bounds what is accepted, not the peak allocation of a hostile stream. At the
platform edge, request-size/timeout limits remain the outer control.

## Query parameters

- `pagination` already capped `pageSize` at 100.
- `records` now validates `status` against the Prisma `RecordStatus` enum and bounds
  `sessionId`/`personId`. Previously an arbitrary `status` string was cast to the enum and could
  surface as a Prisma validation error (500).
- `assignments` and `passes` bound `personId` with `optionalQueryId`.
- `audit` bounds `action`/`result` and requires `from`/`to` to look like `YYYY-MM-DD`; empty strings
  mean "not provided", never an empty lookup key.
- `sync-bundle` bounds `sessionId`.
- `platform/orgs` was already bounded (page size 100, search 64 chars, enum status).

## Zod bounds

- `scanInput.credential`: `8..512` characters (was unbounded above).
- `scanInput.geo`: finite latitude `-90..90`, longitude `-180..180`, accuracy `0..100000`.
- `offlineEventSchema.geo`: same bounds, so a signed batch cannot carry `NaN`/`Infinity`/absurd
  coordinates.
- `POST /passes/verify` credential: `8..512`.
- `POST /orgs/[orgId]/passes` `personId`: bounded to 128.
- Org create `timezone`: `1..60` characters.
- Public verify token: rejected unless `16..128` characters (previously only a lower bound).

No tenant scoping, permission check or write path was changed. The hardening is additive: existing
valid payloads behave identically.

## Not changed (deliberately)

- Document `payload` is still free-form JSON; it is bounded by bytes, not by schema, because the
  document templates are product-defined. A future per-template schema is a separate task.
- No HTML sanitisation layer was added: React escapes rendered strings, and no route accepts raw
  HTML.
- No global request timeout was added; that belongs to the hosting platform.
- `GET` routes with no parameters (health, org list) were left untouched.
