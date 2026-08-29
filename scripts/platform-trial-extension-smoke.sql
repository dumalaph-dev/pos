-- Focused database verification for migration 0075.
-- Run with the service-role/DB-owner Supabase SQL runner; every fixture row is
-- rolled back before the script exits.
--
-- This proves the guards that live in `extend_organization_trial` rather than
-- in the console, because those are the ones a future caller could bypass:
-- the trial arithmetic, the trial-expiry vs billing-failure discriminator,
-- the lifetime cap, and the audit evidence.

begin;

do $$
declare
  v_org_id       uuid;
  v_store_id     uuid;
  v_user_id      uuid := gen_random_uuid();
  v_before       timestamptz;
  v_after        timestamptz;
  v_status       text;
  v_result       jsonb;
  v_count        integer;
  v_message      text;
begin
  ---------------------------------------------------------------------------
  -- A live trial is extended from where it already ends.
  ---------------------------------------------------------------------------
  insert into organizations (name, subscription_status, subscription_trial_started_at, subscription_trial_ends_at)
  values ('trial-extension-smoke', 'trialing', now() - interval '9 days', now() + interval '5 days')
  returning id, subscription_trial_ends_at into v_org_id, v_before;

  insert into auth.users (id, email)
  values (v_user_id, 'trial-extension-smoke@example.test');

  insert into stores (org_id, name)
  values (v_org_id, 'trial-extension-smoke-store')
  returning id into v_store_id;

  insert into profiles (id, org_id, store_id, full_name, role)
  values (v_user_id, v_org_id, v_store_id, 'Trial Extension Smoke', 'admin');

  select extend_organization_trial(v_org_id, 7, 'smoke: live trial extension', v_user_id, 'operator@example.test')
    into v_result;

  select subscription_trial_ends_at, subscription_status
    into v_after, v_status
  from organizations where id = v_org_id;

  if v_after <> v_before + interval '7 days' then
    raise exception 'a live trial was not extended from its existing end (% -> %)', v_before, v_after;
  end if;

  if v_status <> 'trialing' then
    raise exception 'a live trial changed status to %', v_status;
  end if;

  if (v_result ->> 'revived')::boolean then
    raise exception 'a live trial was incorrectly reported as revived';
  end if;

  ---------------------------------------------------------------------------
  -- The ledger and the audit evidence are written in the same transaction.
  ---------------------------------------------------------------------------
  select count(*) into v_count
  from platform_trial_extensions
  where org_id = v_org_id and days = 7 and new_trial_ends_at = v_after;
  if v_count <> 1 then
    raise exception 'the trial extension ledger row was not written';
  end if;

  select count(*) into v_count
  from audit_logs
  where org_id = v_org_id
    and action = 'platform.trial.extended'
    and entity = 'platform_trial_extensions';
  if v_count <> 1 then
    raise exception 'the trial extension audit row was not written';
  end if;

  if organization_trial_extension_days(v_org_id) <> 7 then
    raise exception 'operator-added days were not counted';
  end if;

  ---------------------------------------------------------------------------
  -- A paying or ended subscription is not a trial and must be refused.
  ---------------------------------------------------------------------------
  for v_status in select unnest(array['active', 'past_due', 'canceled', 'incomplete']) loop
    update organizations set subscription_status = v_status where id = v_org_id;
    begin
      perform extend_organization_trial(v_org_id, 7, 'smoke: ineligible status', v_user_id, null);
      raise exception 'a % subscription was extended as a trial', v_status;
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_message = message_text;
      if v_message <> 'platform_trial_status_not_eligible' then raise; end if;
    end;
  end loop;

  ---------------------------------------------------------------------------
  -- A pause carrying provider records is a billing failure, not an expired
  -- trial, and must never be reopened into free access.
  ---------------------------------------------------------------------------
  update organizations
  set subscription_status = 'paused',
      subscription_trial_ends_at = now() - interval '2 days',
      subscription_provider_subscription_id = 'sub_smoke'
  where id = v_org_id;

  begin
    perform extend_organization_trial(v_org_id, 7, 'smoke: billing pause', v_user_id, null);
    raise exception 'a nonpayment pause was reopened as a trial';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_billing_pause' then raise; end if;
  end;

  update organizations
  set subscription_provider_subscription_id = null,
      subscription_provider_payment_intent_id = 'pi_smoke'
  where id = v_org_id;

  begin
    perform extend_organization_trial(v_org_id, 7, 'smoke: billing pause via intent', v_user_id, null);
    raise exception 'a pause with a payment intent was reopened as a trial';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_billing_pause' then raise; end if;
  end;

  ---------------------------------------------------------------------------
  -- A trial-expired pause is the case this feature exists for: it reopens,
  -- and it restarts from today rather than burning days on the gap.
  ---------------------------------------------------------------------------
  update organizations
  set subscription_provider_payment_intent_id = null,
      subscription_trial_ends_at = now() - interval '30 days'
  where id = v_org_id;

  select extend_organization_trial(v_org_id, 7, 'smoke: revive expired trial', v_user_id, null)
    into v_result;

  select subscription_trial_ends_at, subscription_status
    into v_after, v_status
  from organizations where id = v_org_id;

  if v_status <> 'trialing' then
    raise exception 'an expired trial was not reopened (status %)', v_status;
  end if;

  if not (v_result ->> 'revived')::boolean then
    raise exception 'the revive was not recorded in the extension result';
  end if;

  if v_after < now() + interval '7 days' - interval '1 minute'
    or v_after > now() + interval '7 days' + interval '1 minute' then
    raise exception 'a lapsed trial did not restart from today (ends %)', v_after;
  end if;

  ---------------------------------------------------------------------------
  -- Suspension is an account-level boundary that entitlement cannot cross.
  ---------------------------------------------------------------------------
  update organizations set account_status = 'suspended' where id = v_org_id;
  begin
    perform extend_organization_trial(v_org_id, 7, 'smoke: suspended account', v_user_id, null);
    raise exception 'a suspended account had its trial extended';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_account_suspended' then raise; end if;
  end;
  update organizations set account_status = 'active' where id = v_org_id;

  ---------------------------------------------------------------------------
  -- Input bounds.
  ---------------------------------------------------------------------------
  begin
    perform extend_organization_trial(v_org_id, 91, 'smoke: too many days', v_user_id, null);
    raise exception 'an over-long extension was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_invalid_days' then raise; end if;
  end;

  begin
    perform extend_organization_trial(v_org_id, 0, 'smoke: zero days', v_user_id, null);
    raise exception 'a zero-day extension was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_invalid_days' then raise; end if;
  end;

  begin
    perform extend_organization_trial(v_org_id, 7, 'no', v_user_id, null);
    raise exception 'an extension without a usable reason was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_invalid_reason' then raise; end if;
  end;

  ---------------------------------------------------------------------------
  -- The lifetime ceiling stops repeated small extensions from carrying an
  -- account indefinitely.
  ---------------------------------------------------------------------------
  insert into platform_trial_extensions (org_id, days, reason, new_trial_ends_at)
  values
    (v_org_id, 83, 'smoke: cap filler', now()),
    (v_org_id, 83, 'smoke: cap filler', now());

  if organization_trial_extension_days(v_org_id) <> 180 then
    raise exception 'the operator-day total is %, expected 180', organization_trial_extension_days(v_org_id);
  end if;

  begin
    perform extend_organization_trial(v_org_id, 1, 'smoke: past the lifetime cap', v_user_id, null);
    raise exception 'an extension past the lifetime cap was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_cap_exceeded' then raise; end if;
  end;

  ---------------------------------------------------------------------------
  -- A missing organization is refused rather than silently ignored.
  ---------------------------------------------------------------------------
  begin
    perform extend_organization_trial(gen_random_uuid(), 7, 'smoke: unknown organization', v_user_id, null);
    raise exception 'an unknown organization was extended';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'platform_trial_organization_not_found' then raise; end if;
  end;

  perform set_config('trial_extension_smoke.org_id', v_org_id::text, true);
  perform set_config('trial_extension_smoke.store_id', v_store_id::text, true);
  perform set_config('trial_extension_smoke.user_id', v_user_id::text, true);
end;
$$;

-- The reopened trial must restore tenant RLS context, not just the route UI.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('trial_extension_smoke.user_id'), true);

do $$
declare
  v_org_id   uuid := current_setting('trial_extension_smoke.org_id')::uuid;
  v_store_id uuid := current_setting('trial_extension_smoke.store_id')::uuid;
  v_count    integer;
begin
  if auth_org_id() <> v_org_id or auth_store_id() <> v_store_id or not auth_is_admin() then
    raise exception 'the reopened trial did not restore tenant RLS context';
  end if;

  select count(*) into v_count from stores where id = v_store_id;
  if v_count <> 1 then
    raise exception 'the reopened trial did not restore branch access';
  end if;
end;
$$;

reset role;

-- The ledger is service-role-only; a tenant client must not reach it.
set local role authenticated;
do $$
declare
  v_reachable boolean := true;
begin
  begin
    perform 1 from platform_trial_extensions limit 1;
  exception when insufficient_privilege then
    v_reachable := false;
  end;

  if v_reachable then
    raise exception 'an authenticated tenant client can read platform_trial_extensions';
  end if;
end;
$$;

reset role;

rollback;
