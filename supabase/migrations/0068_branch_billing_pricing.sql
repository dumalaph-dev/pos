-- Branch-aware subscription pricing.
--
-- The base plan includes one active branch. Every active branch after that
-- adds the configured monthly amount. Keep these values in the same singleton
-- catalog row so the platform console and future billing flows share one
-- source of truth.

alter table platform_billing_settings
  alter column monthly_price_centavos set default 59900;

alter table platform_billing_settings
  add column if not exists additional_branch_price_centavos bigint not null default 29900,
  add column if not exists included_branch_count smallint not null default 1;

-- The previous application default was ₱799. Move the untouched legacy seed to
-- the requested ₱599 base while preserving any price an operator already set.
update platform_billing_settings
set monthly_price_centavos = 59900,
    updated_at = now()
where id = 'default'
  and monthly_price_centavos = 79900;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_settings_additional_branch_price_check'
      and conrelid = 'public.platform_billing_settings'::regclass
  ) then
    alter table platform_billing_settings
      add constraint platform_billing_settings_additional_branch_price_check
      check (additional_branch_price_centavos > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'platform_billing_settings_included_branch_count_check'
      and conrelid = 'public.platform_billing_settings'::regclass
  ) then
    alter table platform_billing_settings
      add constraint platform_billing_settings_included_branch_count_check
      check (included_branch_count between 1 and 10);
  end if;
end;
$$;

comment on column platform_billing_settings.monthly_price_centavos is 'Monthly base price including the configured number of branches, stored in centavos.';
comment on column platform_billing_settings.additional_branch_price_centavos is 'Monthly price for each active branch above included_branch_count, stored in centavos.';
comment on column platform_billing_settings.included_branch_count is 'Number of active branches included in the base monthly price.';
