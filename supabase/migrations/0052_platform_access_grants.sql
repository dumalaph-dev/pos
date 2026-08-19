-- Platform-owned complimentary Premium access.
--
-- Grants are deliberately separate from the organization's billing lifecycle.
-- A platform operator can add or revoke temporary access without changing a
-- paid subscription, the original trial dates, or provider reconciliation.

create table if not exists platform_access_grants (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  source      text not null default 'manual',
  status      text not null default 'active',
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  reason      text not null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_by  uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz,
  metadata    jsonb not null default '{}',
  constraint platform_access_grants_source_check
    check (source in ('manual', 'support', 'campaign', 'referral')),
  constraint platform_access_grants_status_check
    check (status in ('active', 'revoked')),
  constraint platform_access_grants_dates_check
    check (ends_at > starts_at),
  constraint platform_access_grants_reason_check
    check (char_length(trim(reason)) between 1 and 500)
);

create index if not exists platform_access_grants_org_dates_idx
  on platform_access_grants (org_id, status, starts_at, ends_at desc);

alter table platform_access_grants enable row level security;

revoke all on table platform_access_grants from anon, authenticated, public;
grant all on table platform_access_grants to service_role;

-- This function is used by tenant RLS policies. It is security definer so the
-- service-role-only grant table never needs to be exposed to tenant clients.
create or replace function public.organization_has_current_access_grant(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_access_grants grant_record
    where grant_record.org_id = p_org_id
      and grant_record.status = 'active'
      and grant_record.starts_at <= now()
      and grant_record.ends_at > now()
  );
$$;

revoke all on function public.organization_has_current_access_grant(uuid) from public;
grant execute on function public.organization_has_current_access_grant(uuid) to authenticated, service_role;

-- Keep the expiry RPC from replacing a trial with `paused` while a current
-- complimentary grant is carrying the organization through the boundary.
create or replace function public.expire_trialing_organization(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organizations
  set
    subscription_status = 'paused',
    subscription_updated_at = now()
  where id = p_org_id
    and subscription_status = 'trialing'
    and coalesce(subscription_trial_ends_at, subscription_current_period_end) <= now()
    and not public.organization_has_current_access_grant(p_org_id);

  return found;
end;
$$;

revoke all on function public.expire_trialing_organization(uuid) from public;
grant execute on function public.expire_trialing_organization(uuid) to service_role;

-- Tenant identity helpers must recognize either ordinary subscription access
-- or a current platform grant. Account suspension remains an independent,
-- higher-priority boundary.
create or replace function public.auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.org_id
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and (
      public.subscription_access_is_current(
        o.subscription_status,
        o.subscription_trial_ends_at,
        o.subscription_current_period_end,
        o.subscription_billing_mode
      )
      or public.organization_has_current_access_grant(o.id)
    )
$$;

create or replace function public.auth_store_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.store_id
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and (
      public.subscription_access_is_current(
        o.subscription_status,
        o.subscription_trial_ends_at,
        o.subscription_current_period_end,
        o.subscription_billing_mode
      )
      or public.organization_has_current_access_grant(o.id)
    )
$$;

create or replace function public.auth_role() returns public.user_role
  language sql stable security definer set search_path = public as $$
  select p.role
  from public.profiles p
  join public.organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and (
      public.subscription_access_is_current(
        o.subscription_status,
        o.subscription_trial_ends_at,
        o.subscription_current_period_end,
        o.subscription_billing_mode
      )
      or public.organization_has_current_access_grant(o.id)
    )
$$;

create or replace function public.auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin'
    from public.profiles p
    join public.organizations o on o.id = p.org_id
    where p.id = auth.uid()
      and o.account_status = 'active'
      and (
        public.subscription_access_is_current(
          o.subscription_status,
          o.subscription_trial_ends_at,
          o.subscription_current_period_end,
          o.subscription_billing_mode
        )
        or public.organization_has_current_access_grant(o.id)
      )
  ), false)
$$;

-- Billing remains available after trial expiry so the owner can subscribe or
-- review a complimentary grant; this intentionally ignores subscription state.
create or replace function public.auth_is_billing_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin'
    from public.profiles p
    join public.organizations o on o.id = p.org_id
    where p.id = auth.uid()
      and o.account_status = 'active'
  ), false)
$$;
