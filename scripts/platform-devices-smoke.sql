-- Read-only aggregate inventory check. Does not expose terminal names or IDs.
select json_build_object(
  'registered_devices', (select count(*) from public.devices),
  'active_devices', (select count(*) from public.devices where is_active),
  'registered_with_record_activity', (select count(*) from public.devices where last_seen_at is not null),
  'browser_terminals', (select count(distinct (org_id, store_id, device_key)) from public.admin_sync_health_snapshots),
  'matched_registrations', (
    select count(*) from public.devices d where exists (
      select 1 from public.admin_sync_health_snapshots s
      where s.org_id = d.org_id and s.store_id = d.store_id and s.device_key = d.device_prefix
    )
  ),
  'latest_heartbeat', (select max(recorded_at) from public.admin_sync_health_snapshots),
  'devices_rls_enabled', (select relrowsecurity from pg_class where oid = 'public.devices'::regclass),
  'service_role_can_read_devices', has_table_privilege('service_role', 'public.devices', 'SELECT'),
  'authenticated_can_read_telemetry', has_table_privilege('authenticated', 'public.admin_sync_health_snapshots', 'SELECT')
) as platform_device_inventory;
