-- Read-only platform sync/outbox-health boundary smoke.
-- Run with:
-- npx supabase db query --linked --file scripts/platform-sync-health-smoke.sql --output json

with snapshots as (
  select snapshot.org_id, snapshot.store_id, snapshot.device_key,
         snapshot.queue, snapshot.recorded_at,
         snapshot.pending_count, snapshot.failed_count, snapshot.conflict_count,
         (to_jsonb(snapshot) ->> 'stuck_count')::integer as stuck_count,
         (to_jsonb(snapshot) ->> 'last_successful_sync_at')::timestamptz as last_successful_sync_at
  from public.admin_sync_health_snapshots as snapshot
)
select json_build_object(
  'schema_has_table', to_regclass('public.admin_sync_health_snapshots') is not null,
  'snapshot_rows', count(*),
  'stores_reporting', count(distinct store_id),
  'devices_reporting', count(distinct device_key),
  'pending_depth', coalesce(sum(pending_count), 0),
  'failed_items', coalesce(sum(failed_count), 0),
  'conflict_items', coalesce(sum(conflict_count), 0),
  'stuck_outbox_depth', coalesce(sum(stuck_count), 0),
  'last_successful_sync_at', max(last_successful_sync_at),
  'schema_has_stuck_count', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_sync_health_snapshots'
      and column_name = 'stuck_count'
  ),
  'schema_has_last_successful_sync_at', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_sync_health_snapshots'
      and column_name = 'last_successful_sync_at'
  ),
  'schema_has_stuck_constraint', exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_sync_health_snapshots'::regclass
      and conname = 'admin_sync_health_stuck_not_above_pending'
  ),
  'schema_has_success_constraint', exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_sync_health_snapshots'::regclass
      and conname = 'admin_sync_health_success_not_after_recorded'
  ),
  'schema_has_success_preserving_trigger', exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.admin_sync_health_snapshots'::regclass
      and tgname = 'admin_sync_health_preserve_success'
      and not tgisinternal
  ),
  'rls_enabled', coalesce((
    select relrowsecurity
    from pg_class
    where oid = 'public.admin_sync_health_snapshots'::regclass
  ), false),
  'service_role_can_select', has_table_privilege('service_role', 'public.admin_sync_health_snapshots', 'SELECT'),
  'authenticated_can_select', has_table_privilege('authenticated', 'public.admin_sync_health_snapshots', 'SELECT'),
  'authenticated_can_delete', has_table_privilege('authenticated', 'public.admin_sync_health_snapshots', 'DELETE'),
  'latest_reported_at', max(recorded_at),
  'read_is_telemetry_only', true
) as platform_sync_health_boundary
from snapshots;
