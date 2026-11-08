-- P5 documents + e-signature integrity.
--
-- Additive and idempotent: every statement is guarded so the file can be re-run
-- against a database that already applied it. The feature has not shipped, so
-- the new columns are safe to add without a backfill beyond timestamps.
--
-- Deny-by-default RLS matches 0002_tenant_rls.sql and 0005_remaining_models.sql:
-- no policies, no anon/authenticated privileges. The server uses the service
-- role only after requireOrganizationPermission().

-- Document body, public verification capability, and lifecycle timestamps.
-- payload is the canonical JSON the stored sha256 commits to; storage_ref stays
-- the seam for a private-bucket PDF/rendered artifact.
alter table documents add column if not exists title text;
alter table documents add column if not exists payload jsonb;
alter table documents add column if not exists verify_token text;
alter table documents add column if not exists sealed_at timestamptz;
alter table documents add column if not exists created_at timestamptz not null default now();

-- The exact consent text version a signer must acknowledge.
alter table signature_requests add column if not exists consent_version text;
alter table signature_requests add column if not exists created_at timestamptz not null default now();

-- Append position inside one request. Re-number any pre-existing rows in a
-- deterministic order before the unique index is created, so the migration is
-- safe on a table that already has events.
alter table signature_events add column if not exists sequence int not null default 0;
alter table signature_events add column if not exists artifact_ref text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'signature_events' and column_name = 'sequence'
  ) then
    with ranked as (
      select id, row_number() over (partition by request_id order by server_ts, id) - 1 as rn
      from signature_events
    )
    update signature_events e
    set sequence = r.rn
    from ranked r
    where e.id = r.id and e.sequence is distinct from r.rn;
  end if;
end $$;

create unique index if not exists documents_verify_token_key on documents (verify_token);
create index if not exists documents_org_status_idx on documents (organization_id, status);
create unique index if not exists signature_events_request_id_sequence_key on signature_events (request_id, sequence);
create index if not exists signature_requests_document_idx on signature_requests (document_id);

-- Deny by default. RLS has no policies on these tables, so even a leaked
-- anon/authenticated connection cannot read or write them.
alter table documents enable row level security;
alter table signature_requests enable row level security;
alter table signature_events enable row level security;

revoke all on documents from anon, authenticated;
revoke all on signature_requests from anon, authenticated;
revoke all on signature_events from anon, authenticated;
