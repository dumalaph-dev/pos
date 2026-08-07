-- Policy-first platform operations.
--
-- The platform operator can draft and publish the billing/support rules that
-- must exist before checkout, account suspension, or support mutations are
-- enabled. Billing prices are stored as integer centavos and plan IDs are
-- kept separate so an updated price can map to a new PayMongo plan safely.

create table if not exists platform_billing_settings (
  id                       text primary key default 'default',
  currency                 text not null default 'PHP',
  monthly_price_centavos   bigint not null default 79900,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint platform_billing_settings_singleton check (id = 'default'),
  constraint platform_billing_settings_currency_check check (currency = 'PHP'),
  constraint platform_billing_settings_price_check check (monthly_price_centavos > 0)
);

insert into platform_billing_settings (id, currency, monthly_price_centavos)
values ('default', 'PHP', 79900)
on conflict (id) do nothing;

create table if not exists platform_billing_variants (
  id                  uuid primary key default gen_random_uuid(),
  label               text not null,
  billing_unit        text not null,
  interval_count      smallint not null default 1,
  discount_percent    numeric(5,2) not null default 0,
  paymongo_plan_id    text,
  is_active           boolean not null default true,
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint platform_billing_variants_unit_check check (billing_unit in ('month', 'year')),
  constraint platform_billing_variants_interval_check check (interval_count between 1 and 10),
  constraint platform_billing_variants_discount_check check (discount_percent between 0 and 100),
  constraint platform_billing_variants_label_check check (char_length(trim(label)) between 1 and 80)
);

create unique index if not exists platform_billing_variants_cycle_idx
  on platform_billing_variants (billing_unit, interval_count);

insert into platform_billing_variants (label, billing_unit, interval_count, discount_percent, is_active, sort_order)
values
  ('Monthly', 'month', 1, 0, true, 0),
  ('1 year', 'year', 1, 10, false, 1),
  ('2 years', 'year', 2, 15, false, 2),
  ('3 years', 'year', 3, 20, false, 3)
on conflict (billing_unit, interval_count) do nothing;

create table if not exists platform_policies (
  policy_key       text primary key,
  status           text not null default 'draft',
  version          integer not null default 1,
  summary          text not null default '',
  settings         jsonb not null default '{}',
  published_at     timestamptz,
  updated_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint platform_policies_key_check check (policy_key in ('billing', 'support')),
  constraint platform_policies_status_check check (status in ('draft', 'published')),
  constraint platform_policies_version_check check (version > 0)
);

insert into platform_policies (policy_key, status, summary, settings)
values
  (
    'billing',
    'draft',
    'Define how trials, renewals, refunds, and price changes work before checkout is enabled.',
    '{"trialDays":14,"paymentGraceDays":7,"refundWindowDays":7,"priceChangeNoticeDays":30,"annualRenewal":"auto_renew"}'::jsonb
  ),
  (
    'support',
    'draft',
    'Define response times, coverage, escalation, and the account-recovery path before support actions are enabled.',
    '{"firstResponseHours":24,"supportHours":"Monday to Friday, 9:00 AM to 5:00 PM PHT","supportEmail":"","escalationPath":""}'::jsonb
  )
on conflict (policy_key) do nothing;

alter table organizations
  add column if not exists account_status text not null default 'active',
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid,
  add column if not exists subscription_provider_plan_id text,
  add column if not exists subscription_provider_subscription_id text,
  add column if not exists subscription_provider_payment_intent_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_account_status_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table organizations
      add constraint organizations_account_status_check
      check (account_status in ('active', 'suspended'));
  end if;
end;
$$;

create index if not exists organizations_account_status_idx
  on organizations (account_status, created_at desc);

create table if not exists billing_provider_events (
  id                  uuid primary key default gen_random_uuid(),
  provider             text not null default 'paymongo',
  provider_event_id   text not null,
  event_type          text not null,
  payload             jsonb not null default '{}',
  processed_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table platform_billing_settings enable row level security;
alter table platform_billing_variants enable row level security;
alter table platform_policies enable row level security;
alter table billing_provider_events enable row level security;

grant all on table
  platform_billing_settings,
  platform_billing_variants,
  platform_policies,
  billing_provider_events
to service_role;
