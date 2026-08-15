-- Two fixes to admin_performance_samples, both found in the 2026-08-15 audit.
--
-- 1. The API route (src/app/api/admin/performance/route.ts) accepts fifteen
--    surfaces, but 0048 only allowed nine. Samples from customers, suppliers,
--    expenses, branches, employees and products have therefore always failed
--    their insert — visible as `persisted: false` in the deployment log, but
--    never collected. The route's list is the correct one, so widen the check
--    to match it rather than narrowing the route.
--
-- 2. 0048 shipped no retention. Every admin navigation writes a permanent row,
--    so diagnostic telemetry competes indefinitely with the sales ledger for
--    the same database budget. That is tolerable with headroom and not
--    tolerable on the Free plan's 500 MB ceiling, which the owner has chosen
--    to stay on for now.

alter table admin_performance_samples
  drop constraint if exists admin_performance_samples_surface_check;

alter table admin_performance_samples
  add constraint admin_performance_samples_surface_check
  check (surface in (
    'dashboard', 'sales', 'orders', 'shifts', 'inventory', 'promotions',
    'variance', 'audit', 'customers', 'suppliers', 'expenses', 'branches',
    'employees', 'products', 'admin'
  ));

-- Retention is enforced in the database rather than by a scheduler because
-- pg_cron is not enabled on this project and a backup/prune job that only runs
-- when someone remembers to run it is not retention. `authenticated` has no
-- DELETE privilege on this table (0048), so the function is security definer
-- and runs as its owner.
--
-- The prune is probabilistic: a statement-level trigger fires on every insert,
-- but only about one in two hundred pays for the delete. That keeps the cost
-- off the admin navigation path while still bounding the table — at any
-- realistic sampling rate the window is enforced within minutes of drifting.
create or replace function prune_admin_performance_samples()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.005 then
    delete from admin_performance_samples
    where recorded_at < now() - interval '60 days';
  end if;
  return null;
end;
$$;

drop trigger if exists admin_performance_samples_prune on admin_performance_samples;
create trigger admin_performance_samples_prune
  after insert on admin_performance_samples
  for each statement
  execute function prune_admin_performance_samples();

-- Reclaim anything already past the window at apply time, so the first prune
-- is not left to chance.
delete from admin_performance_samples
where recorded_at < now() - interval '60 days';
