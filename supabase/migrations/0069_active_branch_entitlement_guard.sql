-- Enforce the active-branch entitlement at the database boundary as well as
-- in the admin Server Action. This protects direct authenticated Supabase
-- writes and keeps concurrent branch activations from bypassing the check.

create or replace function public.enforce_active_branch_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_included_branch_count integer;
  v_active_branch_count integer;
  v_has_paid_access boolean;
begin
  -- Deactivation only reduces the organization's active-branch commitment.
  if not coalesce(new.is_active, false) then
    return new;
  end if;

  -- An already-active row does not change the active-branch count.
  if tg_op = 'UPDATE'
     and coalesce(old.is_active, false)
     and old.org_id = new.org_id then
    return new;
  end if;

  -- Serialize branch activations for an organization so two concurrent
  -- requests cannot both observe the same available included slot.
  perform 1
  from public.organizations
  where id = new.org_id
  for update;

  select coalesce(included_branch_count, 1)
    into v_included_branch_count
  from public.platform_billing_settings
  where id = 'default';
  v_included_branch_count := greatest(coalesce(v_included_branch_count, 1), 1);

  select count(*)
    into v_active_branch_count
  from public.stores
  where org_id = new.org_id
    and is_active;

  select (
    subscription_status = 'active'
    and (
      subscription_provider_subscription_id is not null
      or subscription_billing_mode = 'temporary_qrph'
    )
  )
    into v_has_paid_access
  from public.organizations
  where id = new.org_id;

  if v_active_branch_count >= v_included_branch_count
     and not coalesce(v_has_paid_access, false)
     and not public.organization_has_current_access_grant(new.org_id) then
    raise exception using
      errcode = 'check_violation',
      message = 'Additional active branches require payment in Billing & Plan.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_branch_entitlement on public.stores;
create trigger enforce_active_branch_entitlement
before insert or update of org_id, is_active on public.stores
for each row
execute function public.enforce_active_branch_entitlement();
