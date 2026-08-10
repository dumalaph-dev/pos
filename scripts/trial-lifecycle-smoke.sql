-- Focused database verification for migration 0041.
-- Run with the service-role/DB-owner Supabase SQL runner; every fixture row is
-- rolled back before the script exits.

begin;

do $$
declare
  v_org_id uuid;
  v_store_id uuid;
  v_user_id uuid := gen_random_uuid();
  v_transitioned boolean;
  v_status text;
begin
  if subscription_access_is_current('trialing', now() - interval '1 second', now() - interval '1 second', 'recurring') then
    raise exception 'an expired trial still has tenant access';
  end if;

  if not subscription_access_is_current('trialing', now() + interval '1 second', now() + interval '1 second', 'recurring') then
    raise exception 'an active trial lost tenant access';
  end if;

  if subscription_access_is_current('trialing', now(), now(), 'recurring') then
    raise exception 'a trial at its exact end boundary still has tenant access';
  end if;

  if subscription_access_is_current('paused', now() - interval '1 second', now() - interval '1 second', 'recurring') then
    raise exception 'paused access was not blocked';
  end if;

  if not subscription_access_is_current('active', null::timestamptz, null::timestamptz, 'recurring') then
    raise exception 'a paid recurring subscription lost tenant access';
  end if;

  if not subscription_access_is_current('active', null::timestamptz, now() + interval '1 second', 'temporary_qrph') then
    raise exception 'a current temporary QR Ph period lost tenant access';
  end if;

  if subscription_access_is_current('active', null::timestamptz, now(), 'temporary_qrph') then
    raise exception 'an expired temporary QR Ph period still has tenant access';
  end if;

  insert into organizations (
    name,
    subscription_status,
    subscription_trial_started_at,
    subscription_trial_ends_at,
    subscription_current_period_end
  )
  values (
    'trial-lifecycle-smoke',
    'trialing',
    now() - interval '15 minutes',
    now() - interval '1 second',
    now() - interval '1 second'
  )
  returning id into v_org_id;

  select expire_trialing_organization(v_org_id) into v_transitioned;
  select subscription_status into v_status from organizations where id = v_org_id;
  if not v_transitioned or v_status <> 'paused' then
    raise exception 'expired trial did not transition to paused';
  end if;

  insert into stores (org_id, name)
  values (v_org_id, 'trial-lifecycle-smoke-store')
  returning id into v_store_id;

  insert into auth.users (id, email)
  values (v_user_id, 'trial-lifecycle-smoke@example.test');

  insert into profiles (id, org_id, store_id, full_name, role)
  values (v_user_id, v_org_id, v_store_id, 'Trial Lifecycle Smoke', 'admin');

  perform set_config('trial_smoke.org_id', v_org_id::text, true);
  perform set_config('trial_smoke.store_id', v_store_id::text, true);
  perform set_config('trial_smoke.user_id', v_user_id::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('trial_smoke.user_id'), true);

do $$
declare
  v_org_id uuid := current_setting('trial_smoke.org_id')::uuid;
  v_store_id uuid := current_setting('trial_smoke.store_id')::uuid;
  v_count integer;
begin
  if auth_org_id() is not null or auth_store_id() is not null or auth_is_admin() then
    raise exception 'expired trial retained tenant RLS context';
  end if;

  if not auth_is_billing_admin() then
    raise exception 'expired owner lost Billing authorization';
  end if;

  select count(*) into v_count from organizations where id = v_org_id;
  if v_count <> 1 then
    raise exception 'expired owner cannot read the organization row for Billing';
  end if;

  select count(*) into v_count from stores where id = v_store_id;
  if v_count <> 0 then
    raise exception 'expired owner can still read tenant store data';
  end if;

  insert into trial_feedback (org_id, submitted_by, reason, details)
  values (v_org_id, auth.uid(), 'need_more_time', 'smoke');
end;
$$;

reset role;
update organizations
set subscription_status = 'active'
where id = current_setting('trial_smoke.org_id')::uuid;

set local role authenticated;
do $$
declare
  v_org_id uuid := current_setting('trial_smoke.org_id')::uuid;
  v_store_id uuid := current_setting('trial_smoke.store_id')::uuid;
  v_count integer;
begin
  if auth_org_id() <> v_org_id or auth_store_id() <> v_store_id or not auth_is_admin() then
    raise exception 'paid activation did not restore tenant RLS context';
  end if;

  select count(*) into v_count from stores where id = v_store_id;
  if v_count <> 1 then
    raise exception 'paid activation did not restore branch access';
  end if;
end;
$$;

rollback;
