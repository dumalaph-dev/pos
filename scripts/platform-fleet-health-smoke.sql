-- Read-only platform fleet-health boundary smoke.
-- Run with:
-- npx supabase db query --linked --file scripts/platform-fleet-health-smoke.sql --output json

with recent_samples as (
  select org_id, recorded_at, error
  from public.admin_performance_samples
  where recorded_at >= now() - interval '60 days'
    and recorded_at <= now()
)
select json_build_object(
  'schema_has_org_id', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_performance_samples'
      and column_name = 'org_id'
  ),
  'samples_60d', count(*),
  'attributed_samples_60d', count(*) filter (where org_id is not null),
  'unattributed_samples_60d', count(*) filter (where org_id is null),
  'organizations_with_samples_60d', count(distinct org_id),
  'error_samples_60d', count(*) filter (where error),
  'latest_sample_at', max(recorded_at),
  'read_is_telemetry_only', true
) as platform_fleet_health_boundary
from recent_samples;
