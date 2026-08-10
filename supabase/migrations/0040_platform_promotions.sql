-- Global promotion codes for the platform subscription checkout.
-- The platform console owns these records; checkout reads them through the
-- service-role client so a code cannot be trusted from the browser alone.

create table if not exists platform_promotions (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null,
  name                     text not null,
  description              text not null default '',
  discount_type             text not null,
  discount_percent          numeric(5,2),
  discount_amount_centavos  bigint,
  applies_to                text not null default 'all',
  starts_at                timestamptz,
  ends_at                  timestamptz,
  max_redemptions           integer,
  is_active                 boolean not null default true,
  created_by                uuid,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint platform_promotions_code_check check (code = upper(trim(code)) and char_length(trim(code)) between 3 and 32),
  constraint platform_promotions_name_check check (char_length(trim(name)) between 1 and 80),
  constraint platform_promotions_type_check check (discount_type in ('percentage', 'fixed')),
  constraint platform_promotions_percent_check check (discount_percent is null or discount_percent between 0.01 and 100),
  constraint platform_promotions_amount_check check (discount_amount_centavos is null or discount_amount_centavos between 1 and 1000000),
  constraint platform_promotions_value_shape_check check (
    (discount_type = 'percentage' and discount_percent is not null and discount_amount_centavos is null)
    or (discount_type = 'fixed' and discount_amount_centavos is not null and discount_percent is null)
  ),
  constraint platform_promotions_scope_check check (applies_to in ('all', 'monthly', 'annual')),
  constraint platform_promotions_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint platform_promotions_max_check check (max_redemptions is null or max_redemptions > 0)
);

create unique index if not exists platform_promotions_code_idx
  on platform_promotions (code);

create index if not exists platform_promotions_active_window_idx
  on platform_promotions (is_active, starts_at, ends_at);

create table if not exists platform_promotion_redemptions (
  id                       uuid primary key default gen_random_uuid(),
  promotion_id             uuid not null references platform_promotions(id) on delete cascade,
  organization_id          uuid not null references organizations(id) on delete cascade,
  billing_variant_id       text not null,
  checkout_mode            text not null,
  status                   text not null default 'started',
  base_amount_centavos     bigint not null,
  discount_amount_centavos bigint not null default 0,
  final_amount_centavos    bigint not null,
  provider_reference       text,
  created_at               timestamptz not null default now(),
  converted_at             timestamptz,
  constraint platform_promotion_redemptions_mode_check check (checkout_mode in ('recurring', 'temporary_qrph')),
  constraint platform_promotion_redemptions_status_check check (status in ('started', 'converted', 'failed', 'cancelled')),
  constraint platform_promotion_redemptions_amount_check check (
    base_amount_centavos >= 0
    and discount_amount_centavos between 0 and base_amount_centavos
    and final_amount_centavos = base_amount_centavos - discount_amount_centavos
  )
);

create index if not exists platform_promotion_redemptions_promotion_idx
  on platform_promotion_redemptions (promotion_id, status, created_at desc);

create index if not exists platform_promotion_redemptions_organization_idx
  on platform_promotion_redemptions (organization_id, status, created_at desc);

create unique index if not exists platform_promotion_redemptions_provider_unique_idx
  on platform_promotion_redemptions (provider_reference)
  where provider_reference is not null;

create unique index if not exists platform_promotion_redemptions_org_converted_unique_idx
  on platform_promotion_redemptions (promotion_id, organization_id)
  where status = 'converted';

create or replace function public.platform_promotion_performance()
returns table (
  promotion_id uuid,
  started bigint,
  converted bigint,
  discount_given_centavos bigint,
  revenue_centavos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    redemption.promotion_id,
    count(*) filter (where redemption.status <> 'cancelled') as started,
    count(*) filter (where redemption.status = 'converted') as converted,
    coalesce(sum(redemption.discount_amount_centavos) filter (where redemption.status = 'converted'), 0)::bigint as discount_given_centavos,
    coalesce(sum(redemption.final_amount_centavos) filter (where redemption.status = 'converted'), 0)::bigint as revenue_centavos
  from public.platform_promotion_redemptions as redemption
  group by redemption.promotion_id;
$$;

revoke all on function public.platform_promotion_performance() from public;
grant execute on function public.platform_promotion_performance() to service_role;

alter table platform_promotions enable row level security;
alter table platform_promotion_redemptions enable row level security;

grant all on table platform_promotions, platform_promotion_redemptions to service_role;
