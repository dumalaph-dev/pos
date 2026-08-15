-- Throttles password attempts on the public employee login.
--
-- `/staff/{slug}` is a public URL, employee codes are sequential and therefore
-- enumerable (EMP-0001, EMP-0002, ...), and provisioning hands every new
-- account the same EMPLOYEE_INITIAL_PASSWORD. Supabase Auth applies its own
-- per-IP limits, but the application had no per-account throttle at all, which
-- made that combination the weakest link in an otherwise strong posture.
--
-- The offline PIN path already solves the same problem the same way
-- (OFFLINE_PIN_MAX_ATTEMPTS = 5, OFFLINE_PIN_LOCKOUT_MS = 60s in
-- src/lib/offline.ts), so this deliberately mirrors that policy rather than
-- inventing a second one a cashier would have to learn.
--
-- Deliberately NOT tracked: attempts against employee codes that do not resolve
-- to a real active employee. Recording those would let anyone create unbounded
-- rows by trying random codes, turning a security control into a disk-fill.
-- There is no password to brute force on a code that does not exist, and the
-- response is already generic.

create table if not exists employee_login_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  store_id uuid not null references stores (id) on delete cascade,
  employee_code text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  unique (store_id, employee_code)
);

create index if not exists employee_login_attempts_locked_idx
  on employee_login_attempts (locked_until)
  where locked_until is not null;

alter table employee_login_attempts enable row level security;

-- No policies: this table is only ever touched by the login server action
-- through the service-role client. RLS with zero policies denies anon and
-- authenticated entirely, which is the intent — a cashier must never be able to
-- read or reset their own lockout from the browser.
revoke all on employee_login_attempts from anon, authenticated;

-- Stale rows serve no purpose once the window has passed, and the Free plan's
-- 500 MB ceiling is a live constraint. Same probabilistic statement-level prune
-- used for admin_performance_samples in 0050: pg_cron is not enabled here, and
-- a cleanup that depends on someone remembering it is not cleanup.
create or replace function prune_employee_login_attempts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if random() < 0.01 then
    delete from employee_login_attempts
    where last_attempt_at < now() - interval '7 days'
      and (locked_until is null or locked_until < now());
  end if;
  return null;
end;
$$;

drop trigger if exists employee_login_attempts_prune on employee_login_attempts;
create trigger employee_login_attempts_prune
  after insert on employee_login_attempts
  for each statement
  execute function prune_employee_login_attempts();
