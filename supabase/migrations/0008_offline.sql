-- P6 offline sync (additive, idempotent).
-- Existing live tables were created by 0005_remaining_models.sql; this migration
-- only adds the columns/indexes P6 needs. Strictly additive: no drops, no renames,
-- no data rewrites. Existing columns store enums as text, so new columns follow
-- the same convention. House style keeps RLS deny-by-default (no policies); the
-- server uses the service role after requireOrganizationPermission().

-- Device signing + lifecycle. Only the SHA-256 verifier is stored; the raw
-- one-time secret returned by devices/register is never persisted.
alter table devices add column if not exists secret_hash text;
alter table devices add column if not exists revoked_at timestamptz;
alter table devices add column if not exists last_sync_at timestamptz;

-- Batch receipt metadata: the signed payload's HMAC and the client build that
-- produced it. counts/errors already exist from 0005.
alter table offline_sync_batches add column if not exists signature text;
alter table offline_sync_batches add column if not exists client_version text;

create index if not exists offline_sync_batches_org_received_idx
  on offline_sync_batches (organization_id, received_at);

-- Deny by default (idempotent). The service role bypasses RLS after server-side
-- authorization; no client-facing policy is granted.
alter table devices enable row level security;
alter table offline_sync_batches enable row level security;
