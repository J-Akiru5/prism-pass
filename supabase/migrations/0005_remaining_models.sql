-- P4/P5/P6 support: create the Prisma models that had no live table.
-- Additive only, idempotent (IF NOT EXISTS). snake_case to match Prisma @@map.
-- Existing columns store enums as text, so new tables follow the same convention.
-- Strict deny-by-default RLS: no policies; the server uses the service role after
-- requireOrganizationPermission().

create extension if not exists "pgcrypto";

-- Organization settings (branding, retention)
create table if not exists organization_settings (
  organization_id text primary key references organizations(id) on delete cascade,
  branding jsonb,
  retention_days int not null default 365
);

-- Plan + entitlements (P8 will extend this)
create table if not exists organization_subscriptions (
  organization_id text primary key references organizations(id) on delete cascade,
  plan text not null default 'pilot',
  entitlements jsonb not null default '{}'::jsonb
);

-- Registered scanners/devices (P6 offline sync prerequisite)
create table if not exists devices (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  device_public_id text not null,
  role text not null default 'scanner',
  key_ref text,
  last_seen_at timestamptz,
  unique (organization_id, device_public_id)
);
create index if not exists devices_org_idx on devices (organization_id);

-- Documents + e-signature chain (P5)
create table if not exists documents (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  template text not null,
  version int not null default 1,
  sha256 text not null,
  storage_ref text not null,
  status text not null default 'DRAFT'
);
create index if not exists documents_org_idx on documents (organization_id);

create table if not exists signature_requests (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  document_id text not null references documents(id) on delete cascade,
  "order" jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  expires_at timestamptz
);
create index if not exists signature_requests_org_idx on signature_requests (organization_id, document_id);

create table if not exists signature_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  request_id text not null references signature_requests(id) on delete cascade,
  signer_user_id text,
  signer_person_id text,
  doc_version int not null,
  doc_hash text not null,
  method text not null,
  consent_version text not null,
  server_ts timestamptz not null default now(),
  auth_evidence jsonb not null default '{}'::jsonb,
  device_id text,
  prev_hash text,
  curr_hash text not null
);
create index if not exists signature_events_org_request_idx on signature_events (organization_id, request_id);

-- Offline sync batches (P6)
create table if not exists offline_sync_batches (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  device_id text not null,
  batch_id text not null,
  received_at timestamptz not null default now(),
  accepted int not null default 0,
  rejected int not null default 0,
  errors jsonb,
  unique (organization_id, batch_id)
);

-- Deny by default; the service role bypasses RLS after server-side authorization.
alter table organization_settings enable row level security;
alter table organization_subscriptions enable row level security;
alter table devices enable row level security;
alter table documents enable row level security;
alter table signature_requests enable row level security;
alter table signature_events enable row level security;
alter table offline_sync_batches enable row level security;
