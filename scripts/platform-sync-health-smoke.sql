-- Read-only platform sync/outbox-health boundary smoke.
-- Run with:
-- npx supabase db query --linked --file scripts/platform-sync-health-smoke.sql --output json

with snapshots as (
  select org_id, store_id, device_key, queue, recorded_at,
         pending_count, failed_count, conflict_count
  from public.admin_sync_health_snapshots
)
select json_build_object(
  'schema_has_table', to_regclass('public.admin_sync_health_snapshots') is not null,
  'snapshot_rows', count(*),
  'stores_reporting', count(distinct store_id),
  'devices_reporting', count(distinct device_key),
  'pending_depth', coalesce(sum(pending_count), 0),
  'failed_items', coalesce(sum(failed_count), 0),
  'conflict_items', coalesce(sum(conflict_count), 0),
  'latest_reported_at', max(recorded_at),
  'read_is_telemetry_only', true
) as platform_sync_health_boundary
from snapshots;
