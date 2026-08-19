-- Focused rollback-scoped verification for migration 0054.
-- This script is intentionally local-only; it never targets a linked project.

begin;

do $$
declare
  v_actor_id       uuid := gen_random_uuid();
  v_paused_org_id  uuid := gen_random_uuid();
  v_trial_org_id   uuid := gen_random_uuid();
  v_suspended_id   uuid := gen_random_uuid();
  v_grant_id       uuid;
  v_grant          jsonb;
  v_status         text;
  v_starts_at      timestamptz;
  v_trial_end      timestamptz;
  v_expired        boolean;
  v_error          text;
begin
  insert into auth.users (id, email)
  values (v_actor_id, 'platform-access-grant-smoke@example.invalid');

  -- A paused/expired account is a deliberate grant target. The grant starts
  -- immediately, leaves billing/provider fields untouched, and supplies the
  -- tenant entitlement through the existing grant-aware RLS helper.
  insert into organizations (
    id,
    name,
    account_status,
    subscription_status,
    subscription_trial_ends_at,
    subscription_current_period_end,
    subscription_provider_subscription_id
  )
  values (
    v_paused_org_id,
    'Platform access paused smoke',
    'active',
    'paused',
    now() - interval '1 day',
    now() - interval '1 day',
    'provider-unchanged'
  );

  v_grant := public.grant_platform_access(
    v_paused_org_id,
    5,
    'Paused account recovery smoke',
    'support',
    'now',
    v_actor_id,
    'platform-access-grant-smoke@example.invalid'
  );
  v_grant_id := (v_grant ->> 'grant_id')::uuid;

  select starts_at, ends_at
    into v_starts_at, v_trial_end
  from platform_access_grants
  where id = v_grant_id;

  if v_starts_at < now() - interval '1 second' or v_trial_end <= v_starts_at then
    raise exception 'paused grant did not create a valid immediate window';
  end if;

  select subscription_status
    into v_status
  from organizations
  where id = v_paused_org_id;
  if v_status <> 'paused' then
    raise exception 'grant changed the paused subscription lifecycle';
  end if;

  if not organization_has_current_access_grant(v_paused_org_id) then
    raise exception 'current paused grant did not carry tenant access';
  end if;

  if not exists (
    select 1
    from audit_logs
    where org_id = v_paused_org_id
      and action = 'platform.access_grant.created'
      and entity_id = v_grant_id
      and after ->> 'reason' = 'Paused account recovery smoke'
      and after ->> 'platform_actor_id' = v_actor_id::text
      and after ->> 'platform_actor_email' = 'platform-access-grant-smoke@example.invalid'
  ) then
    raise exception 'grant audit row did not contain reason and operator';
  end if;

  -- The strict server-side expiry rule does not pause a trial while a current
  -- grant is carrying it. Once the grant is revoked, the same rule transitions
  -- the expired trial to paused.
  insert into organizations (
    id,
    name,
    account_status,
    subscription_status,
    subscription_trial_started_at,
    subscription_trial_ends_at,
    subscription_current_period_end
  )
  values (
    v_trial_org_id,
    'Platform access expired trial smoke',
    'active',
    'trialing',
    now() - interval '2 days',
    now() - interval '1 minute',
    now() - interval '1 minute'
  );

  v_grant := public.grant_platform_access(
    v_trial_org_id,
    3,
    'Expired trial recovery smoke',
    'manual',
    'now',
    v_actor_id,
    'platform-access-grant-smoke@example.invalid'
  );
  v_grant_id := (v_grant ->> 'grant_id')::uuid;
  select expire_trialing_organization(v_trial_org_id) into v_expired;
  select subscription_status into v_status from organizations where id = v_trial_org_id;
  if v_expired or v_status <> 'trialing' then
    raise exception 'current grant did not protect the expired trial from pause';
  end if;

  update platform_access_grants
  set status = 'revoked', revoked_at = now(), revoked_by = v_actor_id
  where id = v_grant_id;
  select expire_trialing_organization(v_trial_org_id) into v_expired;
  select subscription_status into v_status from organizations where id = v_trial_org_id;
  if not v_expired or v_status <> 'paused' then
    raise exception 'expired trial did not follow the server-side pause rule after grant removal';
  end if;

  insert into organizations (id, name, account_status, subscription_status)
  values (v_suspended_id, 'Platform access suspended smoke', 'suspended', 'paused');

  begin
    perform public.grant_platform_access(
      v_suspended_id,
      2,
      'Suspended account must fail closed',
      'manual',
      'now',
      v_actor_id,
      'platform-access-grant-smoke@example.invalid'
    );
    v_error := 'no error';
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error <> 'platform_access_account_suspended' then
    raise exception 'suspended grant was not rejected: %', v_error;
  end if;

  -- Invalid operator identity fails the grant insert; the surrounding RPC
  -- transaction must leave neither a grant nor an audit row behind.
  begin
    perform public.grant_platform_access(
      v_paused_org_id,
      2,
      'Atomicity failure smoke',
      'manual',
      'now',
      gen_random_uuid(),
      'platform-access-grant-smoke@example.invalid'
    );
  exception when others then
    null;
  end;

  if exists (
    select 1
    from platform_access_grants
    where org_id = v_paused_org_id
      and reason = 'Atomicity failure smoke'
  ) or exists (
    select 1
    from audit_logs
    where org_id = v_paused_org_id
      and action = 'platform.access_grant.created'
      and after ->> 'reason' = 'Atomicity failure smoke'
  ) then
    raise exception 'failed grant left data without an audit-consistent transaction';
  end if;
end;
$$;

rollback;
