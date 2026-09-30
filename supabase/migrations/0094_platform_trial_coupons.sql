-- One-time organization trial coupons. Coupons add calendar months to a
-- currently active trial and never change provider-backed or paid billing.

create table if not exists public.platform_trial_coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  name           text not null,
  months         integer not null,
  starts_at      timestamptz,
  ends_at        timestamptz,
  max_redemptions integer,
  is_active      boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint platform_trial_coupons_code_check check (code = upper(trim(code)) and char_length(trim(code)) between 3 and 32),
  constraint platform_trial_coupons_name_check check (char_length(trim(name)) between 1 and 80),
  constraint platform_trial_coupons_months_check check (months between 1 and 12),
  constraint platform_trial_coupons_dates_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint platform_trial_coupons_max_check check (max_redemptions is null or max_redemptions > 0)
);

create unique index if not exists platform_trial_coupons_code_idx on public.platform_trial_coupons (code);
create index if not exists platform_trial_coupons_active_window_idx on public.platform_trial_coupons (is_active, starts_at, ends_at);

create table if not exists public.platform_trial_coupon_redemptions (
  id               uuid primary key default gen_random_uuid(),
  coupon_id        uuid not null references public.platform_trial_coupons(id) on delete restrict,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  redeemed_by      uuid,
  previous_ends_at timestamptz not null,
  new_ends_at      timestamptz not null,
  redeemed_at      timestamptz not null default now(),
  constraint platform_trial_coupon_redemptions_once_per_org unique (coupon_id, organization_id)
);

create index if not exists platform_trial_coupon_redemptions_coupon_idx
  on public.platform_trial_coupon_redemptions (coupon_id, redeemed_at desc);
create index if not exists platform_trial_coupon_redemptions_org_idx
  on public.platform_trial_coupon_redemptions (organization_id, redeemed_at desc);

alter table public.platform_trial_coupons enable row level security;
alter table public.platform_trial_coupon_redemptions enable row level security;
revoke all on table public.platform_trial_coupons, public.platform_trial_coupon_redemptions from anon, authenticated, public;
grant all on table public.platform_trial_coupons, public.platform_trial_coupon_redemptions to service_role;

create or replace function public.redeem_platform_trial_coupon(
  p_org_id uuid,
  p_code text,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.platform_trial_coupons%rowtype;
  v_org public.organizations%rowtype;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_count integer;
  v_previous_end timestamptz;
  v_new_end timestamptz;
  v_redemption_id uuid;
begin
  if p_org_id is null or char_length(v_code) < 3 or char_length(v_code) > 32 then
    raise exception 'platform_trial_coupon_invalid_request';
  end if;

  select * into v_coupon
  from public.platform_trial_coupons
  where code = v_code
  for update;
  if not found then raise exception 'platform_trial_coupon_not_found'; end if;
  if not v_coupon.is_active then raise exception 'platform_trial_coupon_inactive'; end if;
  if v_coupon.starts_at is not null and v_coupon.starts_at > now() then raise exception 'platform_trial_coupon_not_started'; end if;
  if v_coupon.ends_at is not null and v_coupon.ends_at <= now() then raise exception 'platform_trial_coupon_expired'; end if;

  select * into v_org from public.organizations where id = p_org_id for update;
  if not found then raise exception 'platform_trial_coupon_organization_not_found'; end if;
  if coalesce(v_org.account_status, 'active') <> 'active' then raise exception 'platform_trial_coupon_account_inactive'; end if;
  if v_org.subscription_status <> 'trialing'
    or v_org.subscription_trial_ends_at is null
    or v_org.subscription_trial_ends_at <= now()
    or v_org.subscription_provider_subscription_id is not null
    or v_org.subscription_provider_payment_intent_id is not null then
    raise exception 'platform_trial_coupon_trial_only';
  end if;

  if exists (
    select 1 from public.platform_trial_coupon_redemptions
    where coupon_id = v_coupon.id and organization_id = p_org_id
  ) then raise exception 'platform_trial_coupon_already_redeemed'; end if;

  select count(*)::integer into v_count
  from public.platform_trial_coupon_redemptions
  where coupon_id = v_coupon.id;
  if v_coupon.max_redemptions is not null and v_count >= v_coupon.max_redemptions then
    raise exception 'platform_trial_coupon_limit_reached';
  end if;

  v_previous_end := v_org.subscription_trial_ends_at;
  v_new_end := greatest(now(), v_previous_end) + make_interval(months => v_coupon.months);

  update public.organizations
  set subscription_trial_ends_at = v_new_end, subscription_updated_at = now()
  where id = p_org_id;

  insert into public.platform_trial_coupon_redemptions (
    coupon_id, organization_id, redeemed_by, previous_ends_at, new_ends_at
  ) values (
    v_coupon.id, p_org_id, p_actor_id, v_previous_end, v_new_end
  ) returning id into v_redemption_id;

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    p_org_id, null, 'platform.trial.coupon_redeemed', 'platform_trial_coupon_redemptions', v_redemption_id,
    jsonb_build_object('subscription_trial_ends_at', v_previous_end),
    jsonb_build_object(
      'redemption_id', v_redemption_id,
      'coupon_id', v_coupon.id,
      'coupon_code', v_coupon.code,
      'months', v_coupon.months,
      'subscription_trial_ends_at', v_new_end,
      'platform_actor_id', p_actor_id
    )
  );

  return jsonb_build_object(
    'redemption_id', v_redemption_id,
    'coupon_code', v_coupon.code,
    'months', v_coupon.months,
    'previous_ends_at', v_previous_end,
    'new_ends_at', v_new_end
  );
end;
$$;

revoke all on function public.redeem_platform_trial_coupon(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_platform_trial_coupon(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
