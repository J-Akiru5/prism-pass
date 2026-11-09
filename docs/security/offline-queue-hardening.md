# Offline queue hardening

Status: implemented on `harden/offline-queue`. Scope: the browser-side P6 queue
(`modules/offline/queue-state.ts`, `modules/offline/at-rest.ts`,
`lib/offline-queue.ts`, `lib/sync-client.ts`, scanner queue panel). The server
sync contract (`POST /api/v1/sync/batches`, receipt shapes and statuses) is
unchanged.

## 1. State machine

Each queued scan is one Dexie row keyed by its stable client-generated
`idempotencyKey`.

| State | Meaning | Selected by `peek` | Leaves the state when |
| --- | --- | --- | --- |
| `pending` | Waiting for the next sync attempt. | Yes, when due. | `peek` claims it, the user clears it, or a receipt arrives. |
| `inflight` | Claimed by a tab and being sent under a lease. | No. | Ack (delete), transient fail, terminal reject, explicit release, or lease recovery. |
| `failed` | Transient failure (network, 5xx, 429, malformed response, missing receipt, signing/auth problem). | Yes, after `nextAttemptAt`. | Retry, ack, terminal reject, or clear. |
| `rejected` | Permanent server rejection, or an unreadable sealed credential. | **No, never.** | Explicit user **Retry** (back to `pending`, attempts reset) or **Remove/Clear**. |

```text
capture
  └─ enqueue ──► pending
                   │ peek (due)
                   ▼
                inflight ── receipt accept/duplicate ──► deleted (recorded)
                   │
                   ├─ transient failure ──► failed ── backoff + jitter ──► peek
                   │
                   ├─ receipt reject / batch 4xx ──► rejected (terminal)
                   │
                   └─ crash / stale lease ──► pending (lease recovery)
```

`rejected` is terminal in the automated loop only. It remains stored and visible
with the server's reason, is counted in the panel, and can be retried by an
explicit user action. `fail()` and `release()` refuse to move a rejected row
back to `failed`/`pending`, so a late completion from another tab cannot silently
resurrect it.

Rejection sources:

- A per-item receipt with `status: "reject"` (for example `unknown_session`,
  `clock_too_old`, `clock_future`, `clock_out_of_order`, credential refusal).
- A whole-batch `400`/other 4xx decision from `decideBatchResponse` (structural
  batch rejection; resending the same rows cannot help).
- A sealed credential whose local key is missing (`credential_unreadable`).

A `401`/`403`/`404` device/auth problem and a repeated `409` replay remain
`failed`, because correcting the device key or retrying under a new batch id can
succeed.

## 2. Idempotent enqueue

`enqueue()` first looks up the `&idempotencyKey` unique index. If the key already
exists it returns that row id and does not write anything, even if the caller
supplies a different credential for the same key. The check is repeated inside
the write transaction, and a unique-index `ConstraintError` from a concurrent
tab is resolved by reading the winner. A duplicate key therefore produces one
row, not two and not an error.

## 3. Crash and multi-tab behavior

`peek` claims rows in two phases:

1. Read candidates and decrypt credentials **outside** the Dexie transaction, so
   awaiting WebCrypto cannot let the transaction auto-commit.
2. In a readwrite transaction, re-read every row and claim it only if it is
   still `pending`/`failed` and due. Another tab that claimed it first wins.

Claiming stamps `inflightAt = Date.now()`. On mount the scanner applies
`releaseInflight()`, which releases only rows where:

```text
state === "inflight" && (inflightAt missing  ||  now - inflightAt >= 2 minutes)
```

- A fresh row is left alone: another tab may be actively sending it.
- A stale row is returned to `pending` without incrementing `attempts`.
- A legacy row without `inflightAt` (schema v1) is treated as stale, because no
  live writer from the old schema can exist after the upgrade.

The scanner also schedules a wake-up at the earliest `inflightAt + lease` for any
row shown as sending, and sweeps the lease once a minute while online (syncing
only when a device key is configured). When a sweep releases rows it refreshes
the panel and attempts a sync, so a crashed tab does not leave a scan stuck on
"Sending" forever even if another tab stays open.

A lease expiry can overlap a slow send in another tab. That is safe: both sends
use the same idempotency key, and the server resolves the second as a duplicate.
The lease only bounds how long a row is invisible to other tabs; it is not a
mutex that can guarantee exactly one network request.

## 4. Capacity and quota

- `MAX_QUEUE_ITEMS = 2000`. `enqueue` refuses a new key with
  `OfflineQueueError("capacity")` when the stored row count reaches the bound.
  Existing rows are never evicted to make room.
- IndexedDB `QuotaExceededError` (DOMException name, legacy code `22`, wrapped
  Dexie error, or a "quota"/"storage full" message) becomes
  `OfflineQueueError("quota")`.
- The scanner surfaces the typed message verbatim and explicitly says the scan
  was **not** saved and must not be treated as captured. No code path deletes a
  row in response to a quota failure.
- `size()` counts rows awaiting a server decision (`pending`, `inflight`,
  `failed`) and excludes terminal `rejected` rows. The panel shows an accurate
  breakdown of all four states plus the total stored for the selected
  organization.

## 5. Retry jitter

`backoffDelayMs(attempts, seed?)` keeps the existing 1s, 2s, 4s … schedule capped
at 5 minutes. When the queue adapter calls it, the seed is the row's
`idempotencyKey`, which adds deterministic jitter of `[0, base × 25%)`, clamped
to the 5-minute cap. Two devices with different keys no longer retry in lockstep,
and a replay/test of the same row gets the same delay. Response-policy callers
that do not pass a seed keep the exact un-jittered schedule.

## 6. At-rest protection decision

**Chosen: AES-GCM encryption of queued credentials with a non-extractable
device-local key.** Retention-only fallback was not used.

- `modules/offline/at-rest.ts` generates a 256-bit AES-GCM `CryptoKey` with
  `extractable: false` and usages `encrypt`/`decrypt`.
- The key is persisted in a separate IndexedDB database
  (`prism-pass-offline-keys`, object store `keys`, id
  `queue-credential-aes-gcm-v1`). Only the structured-cloned `CryptoKey` is
  stored, never raw key bytes.
- The key is created at most once per origin. The read/conditional-put runs in a
  single readwrite transaction; a candidate key generated by a racing tab is
  discarded when that transaction finds the existing key. Two tabs cannot
  install different keys and strand each other's ciphertext.
- Each credential is sealed as `ppenc:v1:<base64 iv>.<base64 ciphertext>` with a
  12-byte random IV and the AAD `prism-pass:offline-credential:v1`. GCM provides
  confidentiality and integrity.
- `enqueue` seals before writing. `peek` and `list` open sealed values before
  returning them. The wire batch still receives the plaintext credential, so the
  server contract is unchanged.
- If WebCrypto or the key store is unavailable, `enqueue` fails with
  `OfflineQueueError("encryption_unavailable")` and does **not** store the
  credential in plaintext. The scan is reported as not saved.
- If a key is later missing (for example the key database was cleared while the
  queue survived), sealed rows are not sent and are not silently deleted.
  `peek` marks them terminal `rejected` with `credential_unreadable`; `list`
  flags them so the panel can explain the state. The user can clear them.
- Rows written before this change are plaintext. They remain readable and
  syncable; they are not re-encrypted in place (there is no safe read-modify-write
  migration in this scope) and are re-sealed only if captured again with the same
  idempotency key after being removed. This is a residual risk below.

## 7. Migration / upgrade notes

- Dexie database `prism-pass-offline` moves from schema v1 to v2.
- v2 adds the `inflightAt` field/index. The upgrade callback sets
  `inflightAt = 0` for rows currently `inflight` (making them immediately
  recoverable) and `inflightAt = null` otherwise. Existing rows, ids,
  idempotency keys, attempts and errors are preserved. No rows are deleted.
- A new IndexedDB database `prism-pass-offline-keys` is created on the first
  encrypted enqueue. Clearing it is independent of clearing the queue database.
- No package, Prisma, server-route or environment changes are required.

## 8. Residual risks

1. **Same-origin script can decrypt.** The key is non-extractable, so it cannot
   be exported, but any script running in this origin (including an XSS) can call
   `openCredential`/WebCrypto and read queued credentials. Encryption at rest
   protects against offline disk/browser-profile inspection, not an active
   same-origin attacker.
2. **Key loss makes old rows unreadable.** If the key database is cleared, the
   browser evicts it, or the profile is copied without it, sealed rows cannot be
   decrypted. They are flagged and clearable, never silently dropped, but they
   are not recoverable.
3. **Legacy plaintext rows remain.** Rows written before this change were stored
   without encryption and are not migrated in place. They stay in IndexedDB until
   acknowledged or cleared.
4. **Browser storage eviction.** IndexedDB is still subject to browser quota
   policy and user "clear site data". The queue cannot prevent eviction; capacity
   and quota errors make refusal explicit, and the UI never claims a scan is
   recorded before the server acknowledges it.
5. **Lease expiry is not a distributed lock.** A slow send can overlap lease
   recovery. Duplicate delivery is expected and handled by the server-side
   idempotency key; this is safe but may produce a duplicate receipt.
6. **Clock changes affect lease timing.** A large forward clock jump can make a
   fresh row look stale; a backward jump can delay recovery beyond two minutes.
   The idempotency key still prevents duplicate attendance.
7. **No automatic age-based purge.** Rows older than the server's 30-day
   `MAX_OFFLINE_AGE_MS` are not proactively removed. They become terminal
   `rejected` (`clock_too_old`) when a sync is attempted, and the user can clear
   them. This avoids silently deleting a scan that the operator may still need to
   inspect.
8. **Quota detection is heuristic.** Browsers surface storage exhaustion through
   several shapes. Recognised forms are mapped to the typed error; an
   unrecognised storage failure is rethrown and still shown to the user, but may
   not carry the `quota` code.
9. **Key persistence needs structured-clone support.** Browsers that cannot
   store a `CryptoKey` in IndexedDB make `enqueue` fail with
   `encryption_unavailable` instead of downgrading to plaintext. Online scanning
   still works; offline capture is refused visibly.
10. **Capacity counts all stored rows.** Rejected rows count toward the 2,000-row
    bound until the user retries or clears them. This is intentional: the bound is
    about device storage, not only syncable work.

## 9. Verification

Focused suite:

```text
pnpm exec vitest run tests/p6-offline.test.ts tests/offline-ui.test.ts tests/offline-hardening.test.ts
```

Coverage includes terminal rejection and non-reselection, explicit retry,
duplicate enqueue returning the existing id, stale-vs-fresh inflight release,
capacity and quota errors, jitter bounds/determinism, receipt routing through
`syncQueuedScans`, and AES-GCM round-trip/tamper rejection. The adapter tests use
a fake Dexie/IndexedDB surface; no browser or live database is required.
