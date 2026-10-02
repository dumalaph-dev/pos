-- Rollback-scoped contract smoke for 0094_platform_trial_coupons.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_coupon uuid;
  v_before timestamptz;
  v_after timestamptz;
  v_code text;
  v_result jsonb;
  v_error text;
  v_count integer;
  v_status text;
begin
  insert into organizations (name, subscription_status, subscription_trial_started_at, subscription_trial_ends_at)
  values ('trial-coupon-smoke', 'trialing', now() - interval '3 days', now() + interval '10 days')
  returning id, subscription_trial_ends_at into v_org, v_before;
  insert into organizations (name, subscription_status, subscription_trial_started_at, subscription_trial_ends_at)
  values ('trial-coupon-smoke-other', 'trialing', now() - interval '3 days', now() + interval '10 days')
  returning id into v_other_org;

  insert into platform_trial_coupons (code, name, months, max_redemptions)
  values ('SMOKE' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'Trial coupon smoke', 1, 1)
  returning id, code into v_coupon, v_code;

  select redeem_platform_trial_coupon(v_org, v_code, gen_random_uuid()) into v_result;
  select subscription_trial_ends_at into v_after from organizations where id = v_org;
  if v_after <> v_before + interval '1 month' then raise exception 'coupon did not add one calendar month'; end if;
  if (v_result->>'months')::integer <> 1 then raise exception 'redemption result omitted coupon duration'; end if;
  select count(*) into v_count from platform_trial_coupon_redemptions where coupon_id = v_coupon and organization_id = v_org;
  if v_count <> 1 then raise exception 'coupon redemption ledger row missing'; end if;
  select count(*) into v_count from audit_logs where org_id = v_org and action = 'platform.trial.coupon_redeemed';
  if v_count <> 1 then raise exception 'coupon redemption audit row missing'; end if;

  begin
    perform redeem_platform_trial_coupon(v_org, v_code, gen_random_uuid());
    raise exception 'coupon was redeemed twice by one organization';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_already_redeemed' then raise; end if;
  end;

  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'campaign redemption limit was exceeded';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_limit_reached' then raise; end if;
  end;

  update organizations set subscription_status = 'active' where id = v_other_org;
  insert into platform_trial_coupons (code, name, months)
  values ('PAID' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'Paid state smoke', 3)
  returning code into v_code;
  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'paid organization received a free trial coupon';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_trial_only' then raise; end if;
  end;

  -- An unpaid expired trial can be restored whether the expiry guard has
  -- already persisted paused or the account still says trialing.
  foreach v_status in array array['trialing', 'paused'] loop
    update organizations set subscription_status = v_status,
      subscription_trial_ends_at = now() - interval '1 month'
      where id = v_other_org;
    insert into platform_trial_coupons (code, name, months)
    values ('EXPIRED' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'Expired trial smoke', 3)
    returning code into v_code;
    select redeem_platform_trial_coupon(v_other_org, lower(v_code), gen_random_uuid()) into v_result;
    select subscription_trial_ends_at into v_after from organizations where id = v_other_org;
    if v_after <> now() + interval '3 months' then raise exception 'expired trial lost part of its three months'; end if;
    if (select subscription_status from organizations where id = v_other_org) <> 'trialing' then
      raise exception 'coupon failed to restore trialing access';
    end if;
    if not subscription_access_is_current('trialing', v_after) then raise exception 'restored trial has no tenant access'; end if;
    if not exists (select 1 from platform_trial_coupon_redemptions
      where organization_id = v_other_org and previous_ends_at = now() - interval '1 month' and new_ends_at = v_after) then
      raise exception 'expired trial ledger did not preserve previous end';
    end if;
  end loop;

  insert into platform_trial_coupons (code, name, months)
  values ('BLOCKED' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), 'Blocked states smoke', 3)
  returning code into v_code;
  foreach v_status in array array['active', 'past_due', 'canceled'] loop
    update organizations set subscription_status = v_status where id = v_other_org;
    begin
      perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
      raise exception 'ineligible billing status accepted';
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_error = message_text;
      if v_error <> 'platform_trial_coupon_trial_only' then raise; end if;
    end;
  end loop;

  update organizations set subscription_status = 'paused', subscription_trial_ends_at = now() + interval '1 day'
    where id = v_other_org;
  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'non-expiry billing pause accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_trial_only' then raise; end if;
  end;

  update organizations set subscription_status = 'paused', subscription_trial_ends_at = now() - interval '1 day',
    subscription_provider_subscription_id = 'coupon-smoke-unpaid' where id = v_other_org;
  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'provider subscription accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_trial_only' then raise; end if;
  end;
  update organizations set subscription_provider_subscription_id = null,
    subscription_provider_payment_intent_id = 'coupon-smoke-paid' where id = v_other_org;
  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'provider payment intent accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_trial_only' then raise; end if;
  end;
  update organizations set subscription_provider_payment_intent_id = null, account_status = 'suspended'
    where id = v_other_org;
  begin
    perform redeem_platform_trial_coupon(v_other_org, v_code, gen_random_uuid());
    raise exception 'suspended organization accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'platform_trial_coupon_account_inactive' then raise; end if;
  end;
end;
$$;

rollback;
