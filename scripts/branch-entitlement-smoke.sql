-- Database-level verification for migration 0070.
-- Every fixture is rolled back before the script exits.

begin;

do $$
declare
  v_trial_org uuid;
  v_recurring_org uuid;
  v_prepaid_org uuid;
  v_pending_store uuid;
  v_rejected boolean;
begin
  insert into public.organizations (name, subscription_status, subscription_entitled_branch_count)
  values ('branch entitlement trial smoke', 'trialing', 1)
  returning id into v_trial_org;

  insert into public.stores (org_id, name) values (v_trial_org, 'trial branch');
  v_rejected := false;
  begin
    insert into public.stores (org_id, name) values (v_trial_org, 'trial blocked branch');
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'trial organization could create a branch beyond its included entitlement';
  end if;

  insert into public.organizations (
    name,
    subscription_status,
    subscription_provider_subscription_id,
    subscription_entitled_branch_count
  )
  values ('branch entitlement recurring smoke', 'active', 'sub_branch_smoke', 2)
  returning id into v_recurring_org;

  insert into public.stores (org_id, name) values (v_recurring_org, 'recurring branch one');
  insert into public.stores (org_id, name) values (v_recurring_org, 'recurring branch two');
  v_rejected := false;
  begin
    insert into public.stores (org_id, name) values (v_recurring_org, 'recurring blocked branch');
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'recurring organization exceeded its stored paid branch entitlement';
  end if;

  insert into public.organizations (
    name,
    subscription_status,
    subscription_billing_mode,
    subscription_current_period_end,
    subscription_entitled_branch_count
  )
  values ('branch entitlement prepaid smoke', 'active', 'temporary_qrph', now() + interval '30 days', 2)
  returning id into v_prepaid_org;

  insert into public.stores (org_id, name) values (v_prepaid_org, 'prepaid branch one');
  insert into public.stores (org_id, name) values (v_prepaid_org, 'prepaid branch two');
  v_rejected := false;
  begin
    insert into public.stores (org_id, name) values (v_prepaid_org, 'prepaid blocked branch');
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'prepaid organization could create a branch before its add-on payment';
  end if;

  insert into public.stores (org_id, name, is_active)
  values (v_prepaid_org, 'prepaid pending branch', false)
  returning id into v_pending_store;
  v_rejected := false;
  begin
    update public.stores
    set is_active = true
    where id = v_pending_store;
  exception when check_violation then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'prepaid organization could activate a branch before its add-on payment';
  end if;

  update public.organizations
  set subscription_entitled_branch_count = 3
  where id = v_prepaid_org;
  update public.stores
  set is_active = true
  where id = v_pending_store;
end;
$$;

rollback;
