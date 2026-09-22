-- Keep heartbeat identity compatible with POS releases that generated
-- seven-character device IDs. The registered `devices.device_prefix` value
-- remains the exact branch-scoped identity used by the platform inventory.

alter table admin_sync_health_snapshots
  drop constraint if exists admin_sync_health_snapshots_device_key_check;

alter table admin_sync_health_snapshots
  add constraint admin_sync_health_snapshots_device_key_check
  check (char_length(trim(device_key)) between 7 and 80);
