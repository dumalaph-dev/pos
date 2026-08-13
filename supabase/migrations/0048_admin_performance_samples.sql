-- Store bounded, non-sensitive admin performance samples so production
-- percentiles remain queryable even when deployment-log access is unavailable.

create table if not exists admin_performance_samples (
  id uuid primary key default gen_random_uuid(),
  recorded_at timestamptz not null default now(),
  surface text not null check (surface in ('dashboard', 'sales', 'orders', 'shifts', 'inventory', 'promotions', 'variance', 'audit', 'admin')),
  interaction text not null check (interaction in ('open', 'close', 'back', 'navigation')),
  mode text not null check (mode in ('online', 'offline')),
  sample_type text not null check (sample_type in ('initial_document', 'soft_navigation')),
  request_started boolean not null,
  duration_ms integer not null check (duration_ms between 0 and 120000),
  route_changed boolean not null,
  record_cached boolean not null,
  error boolean not null,
  resource_count integer not null check (resource_count between 0 and 500),
  resource_transfer_bytes bigint not null check (resource_transfer_bytes between 0 and 100000000),
  resource_encoded_body_bytes bigint not null check (resource_encoded_body_bytes between 0 and 100000000),
  navigation_transfer_bytes bigint not null check (navigation_transfer_bytes between 0 and 100000000),
  navigation_encoded_body_bytes bigint not null check (navigation_encoded_body_bytes between 0 and 100000000)
);

alter table admin_performance_samples enable row level security;

drop policy if exists admin_performance_samples_insert on admin_performance_samples;
create policy admin_performance_samples_insert
  on admin_performance_samples
  for insert
  to authenticated
  with check (auth.uid() is not null);

revoke select, update, delete on admin_performance_samples from authenticated;
grant insert on admin_performance_samples to authenticated;

create index if not exists admin_performance_samples_recorded_idx
  on admin_performance_samples (recorded_at desc);

create index if not exists admin_performance_samples_dimensions_idx
  on admin_performance_samples (surface, sample_type, recorded_at desc);
