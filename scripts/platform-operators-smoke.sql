-- Rollback-scoped verification for migration 0077.
-- The operator rows and audit rows below are fixtures only; the final rollback
-- leaves the hosted project unchanged.

begin;

do $$
declare
  v_actor_id       uuid;
  v_actor_email    text;
  v_operator_id    uuid;
  v_owner_id       uuid;
  v_operator_email text := 'platform-operator-smoke-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
  v_owner_email    text := 'platform-owner-smoke-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
  v_result         jsonb;
  v_error          text;
  v_audit_count    integer;
  v_owner_count    integer;
begin
  select id, email
    into v_actor_id, v_actor_email
  from auth.users
  where email is not null
  order by created_at
  limit 1;

  if v_actor_id is null then
    -- A fresh local stack may not have an Auth fixture yet. Create a minimal
    -- transaction-local actor so the FK-backed audit path is still exercised;
    -- the final rollback removes it. Hosted runs use the first real Auth user.
    v_actor_id := gen_random_uuid();
    v_actor_email := 'platform-operator-smoke-actor-' || replace(gen_random_uuid()::text, '-', '') || '@example.invalid';
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

  -- Invite, change, revoke, and reactivate one managed identity. Each state
  -- change is committed by its RPC with its corresponding audit row.
  select public.create_platform_operator(v_operator_email, 'read_only', v_actor_id, v_actor_email)
    into v_result;
  v_operator_id := (v_result ->> 'operator_id')::uuid;

  if not exists (
    select 1
    from public.platform_operators
    where id = v_operator_id
      and email = v_operator_email
      and role = 'read_only'
      and is_active
  ) then
    raise exception 'invite did not create the expected active read-only operator';
  end if;

  select public.change_platform_operator_role(v_operator_id, 'support', v_actor_id, v_actor_email)
    into v_result;
  select public.revoke_platform_operator(v_operator_id, v_actor_id, v_actor_email)
    into v_result;
  select public.create_platform_operator(v_operator_email, 'billing', v_actor_id, v_actor_email)
    into v_result;

  if not exists (
    select 1
    from public.platform_operators
    where id = v_operator_id
      and role = 'billing'
      and is_active
      and revoked_at is null
  ) then
    raise exception 'reactivation did not restore the managed operator';
  end if;

  select count(*)
    into v_audit_count
  from public.platform_operator_audit_logs
  where operator_id = v_operator_id;
  if v_audit_count <> 4 then
    raise exception 'expected four lifecycle audit rows, found %', v_audit_count;
  end if;

  -- A table-only final owner cannot be demoted. Skip this assertion only when
  -- a pre-existing managed owner means the fixture is not the final owner.
  select public.create_platform_operator(v_owner_email, 'owner', v_actor_id, v_actor_email)
    into v_result;
  v_owner_id := (v_result ->> 'operator_id')::uuid;
  select count(*)
    into v_owner_count
  from public.platform_operators
  where is_active and role = 'owner';

  if v_owner_count = 1 then
    v_error := null;
    begin
      perform public.change_platform_operator_role(v_owner_id, 'billing', v_actor_id, v_actor_email);
    exception when others then
      get stacked diagnostics v_error = message_text;
    end;
    if v_error <> 'platform_operator_last_owner' then
      raise exception 'final owner demotion guard returned %', coalesce(v_error, 'no error');
    end if;
  end if;

  -- RLS and ACL are both part of the boundary. The tables are readable by the
  -- service role only, and the security-definer RPCs are not browser-callable.
  if has_table_privilege('anon', 'public.platform_operators', 'select')
    or has_table_privilege('authenticated', 'public.platform_operators', 'select')
    or has_table_privilege('anon', 'public.platform_operator_audit_logs', 'select')
    or has_table_privilege('authenticated', 'public.platform_operator_audit_logs', 'select') then
    raise exception 'browser roles retain operator table privileges';
  end if;

  if not has_table_privilege('service_role', 'public.platform_operators', 'select')
    or not has_table_privilege('service_role', 'public.platform_operator_audit_logs', 'select') then
    raise exception 'service_role cannot read operator tables';
  end if;

  if has_function_privilege('anon', 'public.create_platform_operator(text,text,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.create_platform_operator(text,text,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.change_platform_operator_role(uuid,text,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.change_platform_operator_role(uuid,text,uuid,text)', 'execute')
    or has_function_privilege('anon', 'public.revoke_platform_operator(uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.revoke_platform_operator(uuid,uuid,text)', 'execute') then
    raise exception 'browser roles retain operator RPC privileges';
  end if;

  if not has_function_privilege('service_role', 'public.create_platform_operator(text,text,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.change_platform_operator_role(uuid,text,uuid,text)', 'execute')
    or not has_function_privilege('service_role', 'public.revoke_platform_operator(uuid,uuid,text)', 'execute') then
    raise exception 'service_role cannot execute operator RPCs';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'no_mutate_platform_operator_audit'
      and tgrelid = 'public.platform_operator_audit_logs'::regclass
      and not tgenabled = 'D'
  ) then
    raise exception 'operator audit table is missing its append-only trigger';
  end if;
end;
$$;

select 'platform operator smoke passed; fixture transaction will roll back' as status;

rollback;
