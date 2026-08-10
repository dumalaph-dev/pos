-- Make the free trial a real lifecycle instead of a static subscription label.
-- Trial dates are stored on the organization so every owner-facing surface
-- can calculate the same remaining time and expiry boundary.

alter table organizations
  add column if not exists subscription_trial_started_at timestamptz,
  add column if not exists subscription_trial_ends_at timestamptz;

do $$
declare
  v_trial_days integer := 14;
begin
  select case
    when coalesce(settings ->> 'trialDays', '') ~ '^\d+$'
      then least(greatest((settings ->> 'trialDays')::integer, 0), 365)
    else 14
  end
  into v_trial_days
  from platform_policies
  where policy_key = 'billing'
  limit 1;
  v_trial_days := coalesce(v_trial_days, 14);

  update organizations
  set
    subscription_trial_started_at = coalesce(subscription_trial_started_at, created_at),
    subscription_trial_ends_at = coalesce(
      subscription_trial_ends_at,
      created_at + make_interval(days => v_trial_days)
    ),
    subscription_current_period_end = coalesce(
      subscription_current_period_end,
      created_at + make_interval(days => v_trial_days)
    )
  where subscription_status = 'trialing';
end;
$$;

create index if not exists organizations_trial_ends_idx
  on organizations (subscription_status, subscription_trial_ends_at);

-- Keep the trial start/end on new self-service signups. The function is
-- replaced here because the original signup migration predates platform
-- policies and therefore could only set subscription_status.
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

  return new;
end;
$$;

revoke all on function public.handle_store_owner_signup() from public;

-- One response per organization keeps the platform lead queue focused on the
-- latest reason and whether the owner wants a retention offer.
create table if not exists trial_feedback (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  submitted_by          uuid not null references auth.users(id) on delete cascade,
  reason                text not null,
  details               text not null default '',
  wants_discount        boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint trial_feedback_reason_check check (reason in ('too_expensive', 'still_setting_up', 'missing_feature', 'need_more_time', 'not_ready', 'other')),
  constraint trial_feedback_details_check check (char_length(details) <= 1000),
  unique (org_id)
);

create index if not exists trial_feedback_priority_idx
  on trial_feedback (wants_discount, updated_at desc);

alter table trial_feedback enable row level security;

grant select, insert, update on table trial_feedback to authenticated;
grant all on table trial_feedback to service_role;

drop policy if exists trial_feedback_admin_read on trial_feedback;
create policy trial_feedback_admin_read on trial_feedback
  for select using (auth_is_admin() and org_id = auth_org_id());

drop policy if exists trial_feedback_admin_write on trial_feedback;
create policy trial_feedback_admin_write on trial_feedback
  for insert with check (
    auth_is_admin()
    and org_id = auth_org_id()
    and submitted_by = auth.uid()
  );

drop policy if exists trial_feedback_admin_update on trial_feedback;
create policy trial_feedback_admin_update on trial_feedback
  for update using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id() and submitted_by = auth.uid());
