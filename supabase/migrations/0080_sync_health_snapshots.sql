-- Store the latest bounded sync/outbox heartbeat for each terminal queue.
-- The browser outboxes are intentionally device-local, so the platform owner
-- must receive health snapshots rather than tenant order or mutation payloads.

create table if not exists admin_sync_health_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  recorded_at        timestamptz not null default now(),
  org_id             uuid not null references organizations(id) on delete cascade,
  store_id           uuid not null references stores(id) on delete cascade,
  device_key         text not null check (char_length(trim(device_key)) between 8 and 80),
  queue              text not null check (queue in ('orders', 'audit', 'admin_mutations')),
  pending_count      integer not null check (pending_count between 0 and 10000),
  failed_count       integer not null check (failed_count between 0 and 10000),
  conflict_count     integer not null check (conflict_count between 0 and 10000),
  oldest_pending_at  timestamptz,
  online             boolean not null default true,
  unique (org_id, store_id, device_key, queue),
  constraint admin_sync_health_failed_not_above_pending
    check (failed_count <= pending_count),
  constraint admin_sync_health_conflicts_not_above_pending
    check (conflict_count <= pending_count)
);

alter table admin_sync_health_snapshots enable row level security;

-- Browser clients can report only to their own organization and branch. The
-- platform reader uses service_role and never exposes this table directly.
drop policy if exists admin_sync_health_snapshots_insert on admin_sync_health_snapshots;
create policy admin_sync_health_snapshots_insert
  on admin_sync_health_snapshots
  for insert
  to authenticated
  with check (
    org_id = auth_org_id()
    and exists (
      select 1
      from stores
      where stores.id = admin_sync_health_snapshots.store_id
        and stores.org_id = auth_org_id()
        and (stores.id = auth_store_id() or auth_is_admin())
    )
  );

drop policy if exists admin_sync_health_snapshots_update on admin_sync_health_snapshots;
create policy admin_sync_health_snapshots_update
  on admin_sync_health_snapshots
  for update
  to authenticated
  using (
    org_id = auth_org_id()
    and exists (
      select 1
      from stores
      where stores.id = admin_sync_health_snapshots.store_id
        and stores.org_id = auth_org_id()
        and (stores.id = auth_store_id() or auth_is_admin())
    )
  )
  with check (
    org_id = auth_org_id()
    and exists (
      select 1
      from stores
      where stores.id = admin_sync_health_snapshots.store_id
        and stores.org_id = auth_org_id()
        and (stores.id = auth_store_id() or auth_is_admin())
    )
  );

revoke select, delete on admin_sync_health_snapshots from anon, authenticated;
grant insert, update on admin_sync_health_snapshots to authenticated;
grant all on table admin_sync_health_snapshots to service_role;

create index if not exists admin_sync_health_snapshots_recorded_idx
  on admin_sync_health_snapshots (recorded_at desc);

create index if not exists admin_sync_health_snapshots_store_idx
  on admin_sync_health_snapshots (org_id, store_id, recorded_at desc);
