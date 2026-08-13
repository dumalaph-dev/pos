-- Production admin performance summary for the last 24 hours.
-- Run with:
-- npx supabase db query --linked --file scripts/admin-performance-summary.sql --output json

with samples as (
  select
    surface,
    sample_type,
    recorded_at,
    duration_ms,
    case
      when sample_type = 'initial_document' then navigation_transfer_bytes
      else resource_transfer_bytes
    end as observed_transfer_bytes,
    case
      when sample_type = 'initial_document' then navigation_encoded_body_bytes
      else resource_encoded_body_bytes
    end as observed_encoded_body_bytes
  from public.admin_performance_samples
  where recorded_at >= now() - interval '24 hours'
)
select
  surface,
  sample_type,
  count(*) as samples,
  percentile_cont(0.50) within group (order by duration_ms)::bigint as p50_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms)::bigint as p95_duration_ms,
  percentile_cont(0.50) within group (order by observed_transfer_bytes)::bigint as p50_observed_transfer_bytes,
  percentile_cont(0.95) within group (order by observed_transfer_bytes)::bigint as p95_observed_transfer_bytes,
  percentile_cont(0.50) within group (order by observed_encoded_body_bytes)::bigint as p50_observed_encoded_body_bytes,
  percentile_cont(0.95) within group (order by observed_encoded_body_bytes)::bigint as p95_observed_encoded_body_bytes,
  min(recorded_at) as first_sample_at,
  max(recorded_at) as last_sample_at
from samples
group by surface, sample_type
order by surface, sample_type;
