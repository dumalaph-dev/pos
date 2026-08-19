-- Referral attribution and conversion rewards.
--
-- A referral is captured when the Auth trigger creates the referred
-- organization. It is not considered qualified until a billing webhook
-- confirms that organization has an active paid subscription. The reward is
-- recorded in the same transaction as the referral grant so retries cannot
-- issue duplicate Premium time.

create table if not exists platform_referral_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  referrer_org_id     uuid not null references organizations(id) on delete cascade,
  referrer_profile_id uuid not null references profiles(id) on delete cascade,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint platform_referral_codes_code_check
    check (code = lower(code) and code ~ '^[a-z0-9]{8,32}$'),
  constraint platform_referral_codes_org_unique
    unique (referrer_org_id)
);

create index if not exists platform_referral_codes_profile_idx
  on platform_referral_codes (referrer_profile_id, is_active);

create table if not exists platform_referrals (
  id                  uuid primary key default gen_random_uuid(),
  referral_code_id    uuid not null references platform_referral_codes(id) on delete restrict,
  referrer_org_id     uuid not null references organizations(id) on delete cascade,
  referrer_profile_id uuid not null references profiles(id) on delete restrict,
  referred_user_id    uuid references auth.users(id) on delete set null,
  referred_profile_id uuid references profiles(id) on delete set null,
  referred_org_id     uuid not null unique references organizations(id) on delete cascade,
  status              text not null default 'pending',
  captured_at         timestamptz not null default now(),
  qualified_at        timestamptz,
  rewarded_at         timestamptz,
  reward_grant_id     uuid references platform_access_grants(id) on delete set null,
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint platform_referrals_status_check
    check (status in ('pending', 'qualified', 'rewarded', 'rejected'))
);

create index if not exists platform_referrals_referrer_idx
  on platform_referrals (referrer_org_id, created_at desc);

create index if not exists platform_referrals_status_idx
  on platform_referrals (status, created_at desc);

create table if not exists platform_referral_reward_ledger (
  id              uuid primary key default gen_random_uuid(),
  referral_id     uuid not null unique references platform_referrals(id) on delete cascade,
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  grant_id        uuid references platform_access_grants(id) on delete set null,
  reward_type     text not null default 'complimentary_premium_days',
  reward_days     smallint not null,
  status          text not null default 'issued',
  issued_at       timestamptz not null default now(),
  revoked_at      timestamptz,
  metadata        jsonb not null default '{}',
  constraint platform_referral_reward_days_check
    check (reward_days between 1 and 365),
  constraint platform_referral_reward_status_check
    check (status in ('issued', 'revoked'))
);

create index if not exists platform_referral_rewards_org_idx
  on platform_referral_reward_ledger (referrer_org_id, issued_at desc);

alter table platform_referral_codes enable row level security;
alter table platform_referrals enable row level security;
alter table platform_referral_reward_ledger enable row level security;

revoke all on table platform_referral_codes from anon, authenticated, public;
revoke all on table platform_referrals from anon, authenticated, public;
revoke all on table platform_referral_reward_ledger from anon, authenticated, public;
grant all on table platform_referral_codes to service_role;
grant all on table platform_referrals to service_role;
grant all on table platform_referral_reward_ledger to service_role;

-- Existing owner accounts should be able to start sharing immediately after
-- this migration is applied. A random short code keeps links readable while
-- the unique constraint makes collisions fail safely.
insert into platform_referral_codes (code, referrer_org_id, referrer_profile_id)
select
  lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  organization.id,
  organization.owner_profile_id
from organizations organization
where organization.owner_profile_id is not null
  and exists (
    select 1
    from profiles owner_profile
    where owner_profile.id = organization.owner_profile_id
      and owner_profile.org_id = organization.id
      and owner_profile.role = 'admin'
  )
  and not exists (
    select 1
    from platform_referral_codes existing_code
    where existing_code.referrer_org_id = organization.id
  )
on conflict (referrer_org_id) do nothing;

-- The signup trigger is replaced after the referral tables exist so the
-- attribution row is created in the same transaction as the tenant root.
create or replace function public.handle_store_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_org_name text;
  v_store_name text;
  v_store_address text;
  v_org_id uuid;
  v_store_id uuid;
  v_trial_days integer := 14;
  v_trial_started_at timestamptz := now();
  v_trial_ends_at timestamptz;
  v_referral_code text;
  v_referral_code_id uuid;
  v_referrer_org_id uuid;
  v_referrer_profile_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'store_owner' then
    return new;
  end if;

  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  select case
    when coalesce(settings ->> 'trialDays', '') ~ '^\d+$'
      then least(greatest((settings ->> 'trialDays')::integer, 0), 365)
    else 14
  end
  into v_trial_days
  from public.platform_policies
  where policy_key = 'billing'
  limit 1;
  v_trial_days := coalesce(v_trial_days, 14);

  v_trial_ends_at := v_trial_started_at + make_interval(days => v_trial_days);

  v_full_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 120);
  if v_full_name is null then
    v_full_name := left(coalesce(nullif(trim(new.email), ''), 'Store owner'), 120);
  end if;

  v_org_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), ''), 120);
  if v_org_name is null then
    v_org_name := left(v_full_name || ' POS', 120);
  end if;

  v_store_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_name', '')), ''), 120);
  if v_store_name is null then
    v_store_name := 'Main Branch';
  end if;

  v_store_address := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_address', '')), ''), 240);

  insert into public.organizations (
    name,
    currency,
    settings,
    subscription_status,
    subscription_trial_started_at,
    subscription_trial_ends_at,
    subscription_current_period_end,
    subscription_updated_at
  )
  values (
    v_org_name,
    'PHP',
    jsonb_build_object(
      'admin_dashboard', jsonb_build_object(
        'brand_name', v_org_name,
        'brand_tagline', 'POS WORKSPACE',
        'theme', 'current',
        'low_stock_alerts_enabled', true,
        'default_low_stock_threshold', 2
      )
    ),
    'trialing',
    v_trial_started_at,
    v_trial_ends_at,
    v_trial_ends_at,
    v_trial_started_at
  )
  returning id into v_org_id;

  insert into public.stores (org_id, name, address, currency)
  values (v_org_id, v_store_name, v_store_address, 'PHP')
  returning id into v_store_id;

  insert into public.profiles (id, org_id, store_id, full_name, role)
  values (new.id, v_org_id, v_store_id, v_full_name, 'admin'::public.user_role);

  update public.organizations
  set owner_profile_id = new.id
  where id = v_org_id;

  -- Every owner receives one stable code. Referral attribution is copied from
  -- Auth metadata, which the signup action sets from the shared signup link.
  insert into public.platform_referral_codes (code, referrer_org_id, referrer_profile_id)
  values (lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), v_org_id, new.id)
  on conflict (referrer_org_id) do nothing;

  v_referral_code := lower(left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'referral_code', '')), ''), 32));
  if v_referral_code ~ '^[a-z0-9]{8,32}$' then
    select referral_code.id, referral_code.referrer_org_id, referral_code.referrer_profile_id
    into v_referral_code_id, v_referrer_org_id, v_referrer_profile_id
    from public.platform_referral_codes referral_code
    join public.profiles referrer_profile
      on referrer_profile.id = referral_code.referrer_profile_id
     and referrer_profile.org_id = referral_code.referrer_org_id
     and referrer_profile.role = 'admin'
    where referral_code.code = v_referral_code
      and referral_code.is_active
      and referral_code.referrer_org_id <> v_org_id
    limit 1;

    if v_referral_code_id is not null then
      insert into public.platform_referrals (
        referral_code_id,
        referrer_org_id,
        referrer_profile_id,
        referred_user_id,
        referred_profile_id,
        referred_org_id,
        captured_at
      )
      values (
        v_referral_code_id,
        v_referrer_org_id,
        v_referrer_profile_id,
        new.id,
        new.id,
        v_org_id,
        now()
      )
      on conflict (referred_org_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_store_owner_signup() from public;

-- The webhook calls this function with the service role after it has written
-- the referred organization's active billing state. Row locking plus the
-- unique reward ledger entry make repeated provider events harmless.
create or replace function public.qualify_referral_for_paid_conversion(p_referred_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral record;
  v_account_status text;
  v_subscription_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_grant_id uuid;
  v_reward_id uuid;
  v_reward_days integer := 7;
begin
  select account_status, subscription_status
  into v_account_status, v_subscription_status
  from public.organizations
  where id = p_referred_org_id;

  if not found then
    return jsonb_build_object('rewarded', false, 'message', 'referred_organization_not_found');
  end if;

  if v_account_status is distinct from 'active' or v_subscription_status is distinct from 'active' then
    return jsonb_build_object('rewarded', false, 'message', 'paid_conversion_not_confirmed');
  end if;

  select referral.*
  into v_referral
  from public.platform_referrals referral
  where referral.referred_org_id = p_referred_org_id
    and referral.status in ('pending', 'qualified')
  for update;

  if not found then
    return jsonb_build_object('rewarded', false, 'message', 'no_pending_referral');
  end if;

  if v_referral.referrer_org_id = p_referred_org_id then
    update public.platform_referrals
    set status = 'rejected',
        rejection_reason = 'self_referral',
        updated_at = now()
    where id = v_referral.id;
    return jsonb_build_object('rewarded', false, 'referral_id', v_referral.id, 'message', 'self_referral');
  end if;

  -- Start the reward after the referrer's current paid/trial/grant access so
  -- the benefit extends access instead of disappearing inside an existing
  -- period.
  select greatest(
    now(),
    coalesce((
      select max(grant_record.ends_at)
      from public.platform_access_grants grant_record
      where grant_record.org_id = v_referral.referrer_org_id
        and grant_record.status = 'active'
        and grant_record.ends_at > now()
    ), now()),
    coalesce((select subscription_current_period_end from public.organizations where id = v_referral.referrer_org_id), now()),
    coalesce((select subscription_trial_ends_at from public.organizations where id = v_referral.referrer_org_id), now())
  )
  into v_starts_at;
  v_ends_at := v_starts_at + make_interval(days => v_reward_days);

  insert into public.platform_access_grants (
    org_id,
    source,
    status,
    starts_at,
    ends_at,
    reason,
    metadata
  )
  values (
    v_referral.referrer_org_id,
    'referral',
    'active',
    v_starts_at,
    v_ends_at,
    format('Referral reward for customer organization %s', p_referred_org_id),
    jsonb_build_object(
      'grant_kind', 'referral_reward',
      'referral_id', v_referral.id,
      'referred_org_id', p_referred_org_id,
      'reward_days', v_reward_days
    )
  )
  returning id into v_grant_id;

  insert into public.platform_referral_reward_ledger (
    referral_id,
    referrer_org_id,
    grant_id,
    reward_type,
    reward_days,
    status,
    issued_at,
    metadata
  )
  values (
    v_referral.id,
    v_referral.referrer_org_id,
    v_grant_id,
    'complimentary_premium_days',
    v_reward_days,
    'issued',
    now(),
    jsonb_build_object('starts_at', v_starts_at, 'ends_at', v_ends_at)
  )
  returning id into v_reward_id;

  update public.platform_referrals
  set status = 'rewarded',
      qualified_at = coalesce(qualified_at, now()),
      rewarded_at = now(),
      reward_grant_id = v_grant_id,
      updated_at = now()
  where id = v_referral.id;

  return jsonb_build_object(
    'rewarded', true,
    'referral_id', v_referral.id,
    'reward_id', v_reward_id,
    'grant_id', v_grant_id,
    'reward_days', v_reward_days,
    'starts_at', v_starts_at,
    'ends_at', v_ends_at
  );
end;
$$;

revoke all on function public.qualify_referral_for_paid_conversion(uuid) from public;
grant execute on function public.qualify_referral_for_paid_conversion(uuid) to service_role;
