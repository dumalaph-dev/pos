-- Rollback-scoped verification for migration 0078.
-- The organization, grant, audit rows, and fallback Auth actor are fixtures;
-- the final rollback leaves both local and hosted data unchanged.

begin;

do $$
declare
  v_actor_id       uuid;
  v_actor_email    text;
  v_org_id        uuid := gen_random_uuid();
  v_grant_id      uuid;
  v_grant         jsonb;
  v_original_end  timestamptz;
  v_extended_end  timestamptz;
  v_shortened_end timestamptz;
  v_audit_count   integer;
  v_error         text;
begin
  select id, email
    into v_actor_id, v_actor_email
  from auth.users
  where email is not null
  order by created_at
  limit 1;

  if v_actor_id is null then
    v_actor_id := gen_random_uuid();
    v_actor_email := 'platform-entitlement-smoke-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at
    )
    values (
      v_actor_id,
      'authenticated',
      'authenticated',
      v_actor_email,
      '',
      now(),
      now(),
      now()
    );
  end if;

  insert into public.organizations (
    id,
    name,
    account_status,
    subscription_status,
    subscription_trial_ends_at,
    subscription_current_period_end
  )
  values (
    v_org_id,
    'Platform entitlement adjustment smoke',
    'active',
    'paused',
    now() - interval '1 day',
    now() - interval '1 day'
  );

  v_grant := public.grant_platform_access(
    v_org_id,
    14,
    'Original entitlement smoke reason',
    'support',
    'now',
    v_actor_id,
    v_actor_email
  );
  v_grant_id := (v_grant ->> 'grant_id')::uuid;

  select ends_at
    into v_original_end
  from public.platform_access_grants
  where id = v_grant_id;

  v_grant := public.adjust_platform_access_grant(
    v_grant_id,
    5,
    'Extend after support review',
    v_actor_id,
    v_actor_email
  );
  v_extended_end := (v_grant ->> 'ends_at')::timestamptz;

  if v_extended_end <= v_original_end + interval '4 days 23 hours'
    or (v_grant ->> 'previous_ends_at')::timestamptz <> v_original_end then
    raise exception 'grant extension did not move the original end in place';
  end if;

  select count(*)
    into v_audit_count
  from public.audit_logs
  where org_id = v_org_id
    and action = 'platform.access_grant.adjusted'
    and entity_id = v_grant_id;
  if v_audit_count <> 1 then
    raise exception 'expected one audit row after one adjustment, found %', v_audit_count;
  end if;

  if not exists (
    select 1
    from public.audit_logs
    where org_id = v_org_id
      and action = 'platform.access_grant.adjusted'
      and entity_id = v_grant_id
      and (before ->> 'ends_at')::timestamptz = v_original_end
      and before ->> 'reason' = 'Original entitlement smoke reason'
      and (after ->> 'ends_at')::timestamptz = v_extended_end
      and after ->> 'reason' = 'Original entitlement smoke reason'
      and after ->> 'adjustment_reason' = 'Extend after support review'
      and after ->> 'delta_days' = '5'
      and after ->> 'platform_actor_id' = v_actor_id::text
      and after ->> 'platform_actor_email' = v_actor_email
  ) then
    raise exception 'extension audit row did not preserve before/after state and reason';
  end if;

  v_grant := public.adjust_platform_access_grant(
    v_grant_id,
    -2,
    'Shorten after support review',
    v_actor_id,
    v_actor_email
  );
  v_shortened_end := (v_grant ->> 'ends_at')::timestamptz;

  if v_shortened_end <> v_extended_end - interval '2 days' then
    raise exception 'grant shortening did not preserve the adjusted row';
  end if;

  select count(*)
    into v_audit_count
  from public.audit_logs
  where org_id = v_org_id
    and action = 'platform.access_grant.adjusted'
    and entity_id = v_grant_id;
  if v_audit_count <> 2 then
    raise exception 'expected one additional audit row after the second adjustment, found %', v_audit_count;
  end if;

  if (select count(*) from public.platform_access_grants where id = v_grant_id) <> 1
    or (select reason from public.platform_access_grants where id = v_grant_id) <> 'Original entitlement smoke reason'
    or (select ends_at from public.platform_access_grants where id = v_grant_id) <> v_shortened_end then
    raise exception 'adjustment created a second grant or lost the original reason';
  end if;

  begin
    perform public.adjust_platform_access_grant(
      v_grant_id,
      -365,
      'Invalid shortening smoke',
      v_actor_id,
      v_actor_email
    );
    v_error := 'no error';
  exception when others then
    get stacked diagnostics v_error = message_text;
  end;
  if v_error <> 'platform_access_invalid_adjusted_window' then
    raise exception 'invalid shortening guard returned %', coalesce(v_error, 'no error');
  end if;

  if has_table_privilege('anon', 'public.platform_access_grants', 'select')
    or has_table_privilege('authenticated', 'public.platform_access_grants', 'select')
    or not has_table_privilege('service_role', 'public.platform_access_grants', 'select') then
    raise exception 'grant table browser/service-role privileges are incorrect';
  end if;

  if has_function_privilege('anon', 'public.adjust_platform_access_grant(uuid,integer,text,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.adjust_platform_access_grant(uuid,integer,text,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.adjust_platform_access_grant(uuid,integer,text,uuid,text)', 'execute') then
    raise exception 'grant adjustment RPC ACL is incorrect';
  end if;
end;
$$;

select 'platform entitlement adjustment smoke passed; fixture transaction will roll back' as status;

rollback;
