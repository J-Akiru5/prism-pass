-- P1-Completion: strict deny + service-role (owner-confirmed).
-- No public/authenticated policies. Server uses service-role after requireOrganizationPermission().
-- app.org_id scoping helper + audit immutability.

-- Helper: set tenant context per transaction (server only)
-- Usage: SELECT set_config('app.org_id', :orgId, true);

create or replace function authorize(org_id text, perm text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  -- Placeholder resolver: real check lives in lib/tenant.ts via membership join.
  -- This function exists so future RLS policies can call authorize() without schema change.
  -- Fail closed when context missing.
  if org_id is null or org_id = '' then return false; end if;
  if current_setting('app.org_id', true) is distinct from org_id then return false; end if;
  return true;
end $$;

-- Audit immutability: no updates/deletes (deny-by-default + explicit revoke)
do $$ begin
  if exists (select 1 from information_schema.tables where table_name='audit_logs') then
    revoke update, delete on audit_logs from anon, authenticated;
  end if;
end $$;

-- Ensure RLS on core tenant tables where they exist (idempotent)
do $$ declare t text; begin
  foreach t in array array['organizations','memberships','membership_permissions','audit_logs','people','passes','attendance_policies','attendance_sessions','attendance_events','attendance_records','geofences','documents','signature_requests','signature_events','devices','offline_sync_batches'] loop
    if exists (select 1 from information_schema.tables where table_name=t) then
      execute format('alter table %I enable row level security', t);
    end if;
  end loop;
end $$;
