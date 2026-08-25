-- Repair migration drift where migration 0070 is recorded as applied but the
-- active-branch trigger still contains the pre-entitlement 0069 function.
-- This migration changes only the database guard and trigger; it does not
-- modify branch rows or subscription data.

create or replace function public.enforce_active_branch_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_included_branch_count integer;
  v_paid_branch_entitlement integer;
  v_active_branch_count integer;
  v_subscription_status text;
  v_billing_mode text;
  v_period_end timestamptz;
  v_provider_subscription_id text;
  v_has_paid_access boolean;
  v_branch_limit integer;
begin
  -- Deactivation only reduces the organization's active-branch commitment.
  if not coalesce(new.is_active, false) then
    return new;
  end if;

  -- An already-active row in the same organization does not change the
  -- active-branch count. Moving an active row to another organization is
  -- still checked against the destination organization.
  if tg_op = 'UPDATE'
     and coalesce(old.is_active, false)
     and old.org_id = new.org_id then
    return new;
  end if;

  -- Serialize branch activations for an organization so two concurrent
  -- requests cannot both observe the same available entitlement slot.
  select
    subscription_status,
    subscription_billing_mode,
    subscription_current_period_end,
    subscription_provider_subscription_id,
    subscription_entitled_branch_count
    into
      v_subscription_status,
      v_billing_mode,
      v_period_end,
      v_provider_subscription_id,
      v_paid_branch_entitlement
  from public.organizations
  where id = new.org_id
  for update;

  if not found then
    return new;
  end if;

  select coalesce(included_branch_count, 1)
    into v_included_branch_count
  from public.platform_billing_settings
  where id = 'default';
  v_included_branch_count := greatest(coalesce(v_included_branch_count, 1), 1);
  v_paid_branch_entitlement := greatest(coalesce(v_paid_branch_entitlement, v_included_branch_count), 1);

  select count(*)
    into v_active_branch_count
  from public.stores
  where org_id = new.org_id
    and is_active;

  v_has_paid_access := v_subscription_status = 'active'
    and (
      v_provider_subscription_id is not null
      or (
        v_billing_mode = 'temporary_qrph'
        and v_period_end is not null
        and v_period_end > now()
      )
    );

  -- Complimentary platform grants remain an explicit unlimited-access
  -- exception, while trial and unpaid organizations retain only the included
  -- branch.
  if public.organization_has_current_access_grant(new.org_id) then
    return new;
  end if;

  v_branch_limit := case when v_has_paid_access then v_paid_branch_entitlement else v_included_branch_count end;
  if v_active_branch_count >= v_branch_limit then
    raise exception using
      errcode = 'check_violation',
      message = format('Additional active branches require payment. Paid entitlement: %s.', v_branch_limit);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_branch_entitlement on public.stores;
create trigger enforce_active_branch_entitlement
before insert or update of org_id, is_active on public.stores
for each row
execute function public.enforce_active_branch_entitlement();
