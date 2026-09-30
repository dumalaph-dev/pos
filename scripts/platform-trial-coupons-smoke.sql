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
end;
$$;

rollback;
