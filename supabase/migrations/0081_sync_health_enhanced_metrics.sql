-- Add exact stuck-outbox depth and a durable last-success marker to the
-- bounded sync-health heartbeat. This migration contains no tenant payloads
-- and does not rewrite or delete existing telemetry.

alter table admin_sync_health_snapshots
  add column if not exists stuck_count integer not null default 0;

alter table admin_sync_health_snapshots
  add column if not exists last_successful_sync_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'admin_sync_health_snapshots'::regclass
      and conname = 'admin_sync_health_stuck_not_above_pending'
  ) then
    alter table admin_sync_health_snapshots
      add constraint admin_sync_health_stuck_not_above_pending
      check (stuck_count between 0 and pending_count);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'admin_sync_health_snapshots'::regclass
      and conname = 'admin_sync_health_success_not_after_recorded'
  ) then
    alter table admin_sync_health_snapshots
      add constraint admin_sync_health_success_not_after_recorded
      check (last_successful_sync_at is null or last_successful_sync_at <= recorded_at);
  end if;
end
$$;

create or replace function public.preserve_admin_sync_health_success()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.last_successful_sync_at is null
      or (old.last_successful_sync_at is not null and new.last_successful_sync_at < old.last_successful_sync_at) then
      new.last_successful_sync_at := old.last_successful_sync_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_admin_sync_health_success() from public;

drop trigger if exists admin_sync_health_preserve_success on admin_sync_health_snapshots;
create trigger admin_sync_health_preserve_success
  before insert or update on admin_sync_health_snapshots
  for each row
  execute function public.preserve_admin_sync_health_success();
