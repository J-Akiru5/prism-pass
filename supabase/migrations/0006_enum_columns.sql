-- Align enum columns with prisma/schema.prisma.
--
-- The live tables stored enum values as `text` while Prisma models them as real
-- enums. Selecting worked, but a filter sent a typed enum parameter and Postgres
-- rejected it: `operator does not exist: text = "MembershipStatus"`. That broke
-- membership lookups and every status filter at runtime.
--
-- The text CHECK constraints compare a text array with the column, so they must be
-- dropped before the type change; the enum type itself enforces the same domain
-- afterwards. Values already match the enum labels, so the cast cannot lose data.
-- Each block is guarded by the current column type, so the file is safe to re-run.

alter table organizations drop constraint if exists organizations_status_check;
alter table memberships drop constraint if exists memberships_status_check;
alter table attendance_sessions drop constraint if exists attendance_sessions_type_check;
alter table attendance_events drop constraint if exists attendance_events_geo_result_check;
alter table attendance_events drop constraint if exists attendance_events_type_check;
alter table attendance_records drop constraint if exists attendance_records_approval_status_check;
alter table attendance_records drop constraint if exists attendance_records_status_check;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='organizations' and column_name='status' and udt_name='text') then
    alter table organizations alter column status drop default;
    alter table organizations alter column status type "OrganizationStatus" using status::"OrganizationStatus";
    alter table organizations alter column status set default 'ACTIVE'::"OrganizationStatus";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='memberships' and column_name='role' and udt_name='text') then
    alter table memberships alter column role drop default;
    alter table memberships alter column role type "MembershipRole" using role::"MembershipRole";
    alter table memberships alter column role set default 'MEMBER'::"MembershipRole";
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='memberships' and column_name='status' and udt_name='text') then
    alter table memberships alter column status drop default;
    alter table memberships alter column status type "MembershipStatus" using status::"MembershipStatus";
    alter table memberships alter column status set default 'ACTIVE'::"MembershipStatus";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='passes' and column_name='status' and udt_name='text') then
    alter table passes alter column status drop default;
    alter table passes alter column status type "PassStatus" using status::"PassStatus";
    alter table passes alter column status set default 'ACTIVE'::"PassStatus";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='attendance_sessions' and column_name='type' and udt_name='text') then
    alter table attendance_sessions alter column type drop default;
    alter table attendance_sessions alter column type type "SessionType" using type::"SessionType";
    alter table attendance_sessions alter column type set default 'EVENT'::"SessionType";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='attendance_events' and column_name='type' and udt_name='text') then
    alter table attendance_events alter column type type "AttendanceEventType" using type::"AttendanceEventType";
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='attendance_events' and column_name='geo_result' and udt_name='text') then
    alter table attendance_events alter column geo_result drop default;
    alter table attendance_events alter column geo_result type "GeoResult" using geo_result::"GeoResult";
    alter table attendance_events alter column geo_result set default 'NOT_CAPTURED'::"GeoResult";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='attendance_records' and column_name='status' and udt_name='text') then
    alter table attendance_records alter column status drop default;
    alter table attendance_records alter column status type "RecordStatus" using status::"RecordStatus";
    alter table attendance_records alter column status set default 'PRESENT'::"RecordStatus";
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='attendance_records' and column_name='approval_status' and udt_name='text') then
    alter table attendance_records alter column approval_status drop default;
    alter table attendance_records alter column approval_status type "ApprovalStatus" using approval_status::"ApprovalStatus";
    alter table attendance_records alter column approval_status set default 'NONE'::"ApprovalStatus";
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='documents' and column_name='status' and udt_name='text') then
    alter table documents alter column status drop default;
    alter table documents alter column status type "DocumentStatus" using status::"DocumentStatus";
    alter table documents alter column status set default 'DRAFT'::"DocumentStatus";
  end if;
end $$;
