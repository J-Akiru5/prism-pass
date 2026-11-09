-- M1 events core: session open/close, roster enforcement and walk-in policy.
--
-- Strictly additive and idempotent: no renames, no drops of live columns, no
-- data rewrites. Existing sessions keep working because the new columns default
-- to OPEN / roster_enforced = false / walk_in_allowed = false immediately.
-- New EVENT sessions created through the API/UI opt into roster enforcement,
-- but the database default must stay false for backward compatibility.
--
-- Rollback (development only, never production):
--   drop table if exists session_roster;
--   alter table attendance_sessions drop column if exists walk_in_allowed;
--   alter table attendance_sessions drop column if exists roster_enforced;
--   alter table attendance_sessions drop column if exists closed_at;
--   alter table attendance_sessions drop column if exists status;
--   drop type if exists "AttendanceSessionStatus";
--
-- Deny-by-default RLS matches 0002_tenant_rls.sql and 0007_documents.sql: no
-- policies, no anon/authenticated privileges. The server uses the service role
-- only after requireOrganizationPermission().

-- Real enum type, matching prisma/schema.prisma after 0006 converted the live
-- enum columns from text. Guarded because `create type` has no IF NOT EXISTS.
do $$ begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'AttendanceSessionStatus' and n.nspname = 'public'
  ) then
    create type "AttendanceSessionStatus" as enum ('OPEN', 'CLOSED');
  end if;
end $$;

alter table attendance_sessions
  add column if not exists status "AttendanceSessionStatus" not null default 'OPEN';
alter table attendance_sessions add column if not exists closed_at timestamptz;
alter table attendance_sessions add column if not exists roster_enforced boolean not null default false;
alter table attendance_sessions add column if not exists walk_in_allowed boolean not null default false;

-- Per-event roster (M1 pilot implementation of the access grant in RBAC 12.3).
-- One row per (organization, session, person); the composite unique key makes
-- roster adds idempotent. `source` is "manual" today and stays open for CSV
-- import. Deleting a person or session removes the roster rows with it.
create table if not exists session_roster (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  session_id text not null references attendance_sessions(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  source text not null default 'manual',
  added_by_user_id text references users(id) on delete set null,
  added_at timestamptz not null default now(),
  unique (organization_id, session_id, person_id)
);
create index if not exists session_roster_org_session_idx on session_roster (organization_id, session_id);
create index if not exists session_roster_org_person_idx on session_roster (organization_id, person_id);

alter table session_roster enable row level security;
revoke all on session_roster from anon, authenticated;
