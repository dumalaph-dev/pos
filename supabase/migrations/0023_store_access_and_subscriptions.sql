-- Store-scoped staff access links and the first subscription fields.
-- The staff key is a public routing identifier, not an authentication secret.

alter table stores
  add column if not exists staff_login_key text;

update stores
set staff_login_key = gen_random_uuid()::text
where staff_login_key is null or trim(staff_login_key) = '';

alter table stores
  alter column staff_login_key set default gen_random_uuid()::text,
  alter column staff_login_key set not null;

create unique index if not exists stores_staff_login_key_idx
  on stores (staff_login_key);

alter table organizations
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists subscription_plan text not null default 'starter',
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_provider_customer_id text,
  add column if not exists subscription_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_subscription_status_check'
  ) then
    alter table organizations
      add constraint organizations_subscription_status_check
      check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'paused'));
  end if;
end;
$$;

create index if not exists organizations_subscription_status_idx
  on organizations (subscription_status, created_at desc);
