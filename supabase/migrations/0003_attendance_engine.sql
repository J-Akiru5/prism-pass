-- P2/P3 foundational: single canonical attendance engine + people assignments.
-- Additive only. Lowercase snake_case to match Prisma @@map. Idempotent (IF NOT EXISTS).
-- People/passes/orgs tables already live; this adds programs, person_assignments,
-- campuses, departments, attendance_policies/sessions/events/records.

create extension if not exists "pgcrypto";

-- Org structure (needed for scoped assignments; single engine references these, not per-group engines)
create table if not exists programs (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'event',
  unique (organization_id, name)
);

create table if not exists campuses (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  timezone text,
  unique (organization_id, slug)
);

create table if not exists departments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  campus_id text references campuses(id) on delete set null,
  name text not null
);

create table if not exists person_assignments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  program_id text references programs(id) on delete set null,
  role text not null default 'participant',
  starts_at timestamptz,
  ends_at timestamptz
);
create index if not exists person_assignments_org_person_idx on person_assignments (organization_id, person_id);

-- Canonical attendance engine (one engine for employees, interns, event participants)
create table if not exists attendance_policies (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  name text not null,
  grace_min int not null default 10,
  late_threshold_min int not null default 15,
  duplicate_window_sec int not null default 120,
  geo_mode text not null default 'flag',
  evidence_required jsonb not null default '[]',
  approval_steps jsonb not null default '[]'
);

create table if not exists attendance_sessions (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  policy_id text not null references attendance_policies(id) on delete restrict,
  type text not null default 'EVENT' check (type in ('EVENT','OJT','SHIFT','CLASS','VISITOR','TRAINING')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Manila',
  check (ends_at > starts_at)
);
create index if not exists attendance_sessions_org_starts_idx on attendance_sessions (organization_id, starts_at);

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  session_id text not null references attendance_sessions(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  pass_id text references passes(id) on delete set null,
  pass_version int,
  type text not null check (type in ('SCAN','CHECK_IN','CHECK_OUT','OFFLINE_RECEIVED','MANUAL_ADJUST','APPROVED','REJECTED','DUPLICATE_DETECTED')),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  geo_result text not null default 'NOT_CAPTURED' check (geo_result in ('VERIFIED','NEEDS_REVIEW','OUTSIDE_BOUNDARY','MANUAL_EXCEPTION','NOT_CAPTURED')),
  device_id text,
  network_state text not null default 'online',
  source text not null default 'scanner',
  idempotency_key text not null,
  payload_hash text,
  status text not null default 'accepted',
  unique (organization_id, idempotency_key)
);
create index if not exists attendance_events_org_session_person_idx on attendance_events (organization_id, session_id, person_id, server_ts);

create table if not exists attendance_records (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  session_id text not null references attendance_sessions(id) on delete cascade,
  person_id text not null references people(id) on delete cascade,
  check_in_event_id uuid references attendance_events(id) on delete set null,
  check_out_event_id uuid references attendance_events(id) on delete set null,
  duration_min int,
  status text not null default 'PRESENT' check (status in ('PRESENT','LATE','ABSENT','EXCUSED','PARTIAL')),
  approval_status text not null default 'NONE' check (approval_status in ('NONE','PENDING','APPROVED','REJECTED')),
  exception_flags text[] not null default '{}',
  unique (organization_id, session_id, person_id)
);

-- RLS (deny-by-default; service-role after requireOrganizationPermission)
do $$ declare t text; begin
  foreach t in array array['programs','campuses','departments','person_assignments','attendance_policies','attendance_sessions','attendance_events','attendance_records'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
