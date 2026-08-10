-- Enforce the trial boundary below the route and UI layers.
--
-- Expired trials become `paused`: there is no provider subscription to cancel,
-- the owner must still be able to open Billing, and all tenant-scoped access
-- must fail closed until a successful payment restores `active`.

create or replace function subscription_access_is_current(
  p_subscription_status text,
  p_trial_ends_at timestamptz default null,
  p_current_period_end timestamptz default null,
  p_billing_mode text default 'recurring'
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_subscription_status = 'trialing'
      then coalesce(p_trial_ends_at, p_current_period_end) > now()
    when p_subscription_status in ('active', 'past_due')
      then coalesce(p_billing_mode, 'recurring') <> 'temporary_qrph'
        or (p_current_period_end is not null and p_current_period_end > now())
    else false
  end;
$$;

revoke all on function subscription_access_is_current(text, timestamptz, timestamptz, text) from public;
grant execute on function subscription_access_is_current(text, timestamptz, timestamptz, text) to authenticated, service_role;

-- Called by the server-side lifecycle guard with the service role. The status
-- predicate makes expiry/payment races safe: a payment that wins first cannot
-- be overwritten by a stale expiry request.
create or replace function expire_trialing_organization(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update organizations
  set
    subscription_status = 'paused',
    subscription_updated_at = now()
  where id = p_org_id
    and subscription_status = 'trialing'
    and coalesce(subscription_trial_ends_at, subscription_current_period_end) <= now();

  return found;
end;
$$;

revoke all on function expire_trialing_organization(uuid) from public;
grant execute on function expire_trialing_organization(uuid) to service_role;

create or replace function auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.org_id
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and subscription_access_is_current(
      o.subscription_status,
      o.subscription_trial_ends_at,
      o.subscription_current_period_end,
      o.subscription_billing_mode
    )
$$;

create or replace function auth_store_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.store_id
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and subscription_access_is_current(
      o.subscription_status,
      o.subscription_trial_ends_at,
      o.subscription_current_period_end,
      o.subscription_billing_mode
    )
$$;

create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select p.role
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
    and subscription_access_is_current(
      o.subscription_status,
      o.subscription_trial_ends_at,
      o.subscription_current_period_end,
      o.subscription_billing_mode
    )
$$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin'
    from profiles p
    join organizations o on o.id = p.org_id
    where p.id = auth.uid()
      and o.account_status = 'active'
      and subscription_access_is_current(
        o.subscription_status,
        o.subscription_trial_ends_at,
        o.subscription_current_period_end,
        o.subscription_billing_mode
      )
  ), false)
$$;

-- Billing-related owner surfaces remain available after trial expiry. This
-- helper intentionally checks account suspension but not subscription access.
create or replace function auth_is_billing_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin'
    from profiles p
    join organizations o on o.id = p.org_id
    where p.id = auth.uid()
      and o.account_status = 'active'
  ), false)
$$;

drop policy if exists trial_feedback_admin_read on trial_feedback;
create policy trial_feedback_admin_read on trial_feedback
  for select using (
    auth_is_billing_admin()
    and org_id = (select org_id from profiles where id = auth.uid())
  );

drop policy if exists trial_feedback_admin_write on trial_feedback;
create policy trial_feedback_admin_write on trial_feedback
  for insert with check (
    auth_is_billing_admin()
    and org_id = (select org_id from profiles where id = auth.uid())
    and submitted_by = auth.uid()
  );

drop policy if exists trial_feedback_admin_update on trial_feedback;
create policy trial_feedback_admin_update on trial_feedback
  for update using (
    auth_is_billing_admin()
    and org_id = (select org_id from profiles where id = auth.uid())
  )
  with check (
    auth_is_billing_admin()
    and org_id = (select org_id from profiles where id = auth.uid())
    and submitted_by = auth.uid()
  );
