-- P4: geo verification (circular geofences, server-side evaluation).
-- Additive only, idempotent (IF NOT EXISTS). snake_case to match Prisma @@map.
-- Semantics: docs/architecture/geoverification.md. Strict deny-by-default RLS:
-- no anon/authenticated policies; server uses service-role after requireOrganizationPermission().

create extension if not exists "pgcrypto";

-- Geofence v1: circular {centerLat, centerLng, radiusM}. Synced with prisma/schema.prisma.
create table if not exists geofences (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  campus_id text references campuses(id) on delete set null,
  label text not null,
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  radius_m int not null check (radius_m > 0)
);
create index if not exists geofences_org_idx on geofences (organization_id);

-- Evidence per event: which configured fence (if any) matched. NULL = no fence matched.
alter table attendance_events add column if not exists geofence_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_events_geofence_id_fkey') then
    alter table attendance_events
      add constraint attendance_events_geofence_id_fkey
      foreign key (geofence_id) references geofences(id) on delete set null;
  end if;
end $$;

-- RLS: enabled, no policies (deny by default). 0002 also covers geofences when it already exists.
alter table geofences enable row level security;
