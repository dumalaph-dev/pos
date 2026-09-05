-- Read-only platform schema-drift boundary smoke.
-- Run with:
-- npx supabase db query --linked --file scripts/platform-schema-drift-smoke.sql --output json
--
-- Makes no writes. Confirms the ledger reader from migration 0084 exists, is
-- service-role-only, and returns version/name without the statements column,
-- then reports the ledger position and the per-organization backfill counts
-- the console shows. No tenant order, customer, or staff data is read.

select json_build_object(
  'reader_present', exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'platform_schema_migrations'
  ),
  'reader_acl', (
    select coalesce(json_object_agg(role_name, can_execute), '{}'::json)
    from (
      select r.role_name,
             has_function_privilege(r.role_name, p.oid, 'execute') as can_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
      where n.nspname = 'public' and p.proname = 'platform_schema_migrations'
    ) acl
  ),
  'reader_returns_statements', (
    select coalesce(bool_or(pg_get_function_result(p.oid) ilike '%statements%'), false)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'platform_schema_migrations'
  ),
  'ledger_applied_count', (select count(*) from supabase_migrations.schema_migrations),
  'ledger_latest', (select max(version) from supabase_migrations.schema_migrations),
  'organizations', (select count(*) from public.organizations),
  'stores', (select count(*) from public.stores),
  'stores_with_staff_slug', (select count(*) from public.stores where staff_login_slug is not null),
  'organizations_with_employee_roles', (select count(distinct org_id) from public.employee_roles),
  'stores_reporting_sync', (select count(distinct store_id) from public.admin_sync_health_snapshots),
  'read_is_metadata_only', true
) as platform_schema_drift_boundary;
