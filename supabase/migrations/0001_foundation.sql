-- Prism Pass P1 foundation: organizations, users, memberships, RLS skeletons.
-- Apply with Supabase CLI when credentials available. Validated locally via structure only.
create extension if not exists "pgcrypto";
create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  slug text unique not null, name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','PENDING_DELETION')),
  timezone text not null default 'Asia/Manila', created_at timestamptz not null default now()
);
create table if not exists users (
  id text primary key default gen_random_uuid()::text,
  auth_id uuid unique not null, email text, created_at timestamptz not null default now()
);
create table if not exists memberships (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id) on delete cascade,
  organization_id text not null references organizations(id) on delete cascade,
  role text not null default 'MEMBER',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  revoked_at timestamptz,
  unique (organization_id, user_id)
);
create table if not exists membership_permissions (
  id text primary key default gen_random_uuid()::text,
  membership_id text not null references memberships(id) on delete cascade,
  permission text not null, allow boolean not null,
  unique (membership_id, permission)
);
create table if not exists audit_logs (
  id text primary key default gen_random_uuid()::text,
  organization_id text references organizations(id),
  actor_user_id text, action text not null, resource text not null, result text not null,
  meta jsonb, created_at timestamptz not null default now()
);
alter table organizations enable row level security;
alter table memberships enable row level security;
alter table membership_permissions enable row level security;
alter table audit_logs enable row level security;
-- Deny-by-default: no public policies. Service-role + security-definer resolver only (Phase 1-next wires full tenant tables).
-- See docs/security/tenancy-isolation.md for authorize(org,user,perm) + SET LOCAL app.org_id pattern.
