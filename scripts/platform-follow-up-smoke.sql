-- Rollback-scoped contract smoke for migration 0093.
-- Run with:
--   Get-Content -Raw scripts/platform-follow-up-smoke.sql |
--   docker exec -i supabase_db_pos psql -v ON_ERROR_STOP=1 -U postgres -d postgres

begin;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_org             uuid := 'a0000000-0000-0000-0000-000000000001';
  v_actor           uuid := 'b0000000-0000-0000-0000-000000000021';
  v_operator_id     uuid := 'b0000000-0000-0000-0000-000000000022';
  v_task_id         uuid;
  v_version         bigint;
  v_result          jsonb;
  v_request         uuid := 'c0000000-0000-0000-0000-000000000021';
  v_start_request   uuid := 'c0000000-0000-0000-0000-000000000022';
  v_complete_req   uuid := 'c0000000-0000-0000-0000-000000000023';
  v_reopen_request uuid := 'c0000000-0000-0000-0000-000000000024';
  v_cancel_request uuid := 'c0000000-0000-0000-0000-000000000025';
  v_error          text;
begin
  insert into auth.users (id, email, role, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
  values (v_actor, 'follow-up-smoke@example.test', 'authenticated', '{}', '{}', false, now(), now(), false, false)
  on conflict (id) do nothing;

  insert into public.platform_operators (id, email, role, is_active, created_by)
  values (v_operator_id, 'follow-up-owner@example.test', 'support', true, v_actor)
  on conflict (id) do update set is_active = true, role = 'support', revoked_at = null;

  select public.platform_create_follow_up_task(
    v_org,
    'Smoke onboarding follow-up',
    'Rollback-scoped task contract',
    'trial_feedback',
    'd0000000-0000-0000-0000-000000000021',
    v_operator_id,
    now() + interval '1 hour',
    'Call the owner after reviewing setup',
    v_actor,
    'follow-up-smoke@example.test',
    v_request
  ) into v_result;
  v_task_id := (v_result ->> 'task_id')::uuid;
  v_version := (v_result ->> 'version')::bigint;
  assert v_task_id is not null and v_result ->> 'status' = 'open' and v_version = 1,
    'create did not return an open version-one task';

  select public.platform_create_follow_up_task(
    v_org,
    'Smoke onboarding follow-up',
    'Rollback-scoped task contract',
    'trial_feedback',
    'd0000000-0000-0000-0000-000000000021',
    v_operator_id,
    now() + interval '1 hour',
    'Call the owner after reviewing setup',
    v_actor,
    'follow-up-smoke@example.test',
    v_request
  ) into v_result;
  assert (v_result ->> 'task_id')::uuid = v_task_id,
    'replaying the create request did not return the original task';
  assert (select count(*) from public.platform_follow_up_tasks where id = v_task_id) = 1,
    'idempotent create inserted a duplicate task';

  select public.platform_update_follow_up_task(v_task_id, v_version, 'start', null, null, null, null, null, v_actor, 'follow-up-smoke@example.test', v_start_request)
    into v_result;
  v_version := (v_result ->> 'version')::bigint;
  assert v_result ->> 'status' = 'in_progress' and v_version = 2,
    'start did not move the task to version-two in-progress state';

  begin
    perform public.platform_update_follow_up_task(v_task_id, 1, 'complete', null, null, 'stale completion', null, null, v_actor, 'follow-up-smoke@example.test', gen_random_uuid());
    raise exception 'expected optimistic follow-up conflict';
  exception when others then
    get stacked diagnostics v_error = message_text;
    assert v_error = 'platform_follow_up_task_version_conflict', 'unexpected stale follow-up error: ' || coalesce(v_error, 'no error');
  end;

  select public.platform_update_follow_up_task(v_task_id, v_version, 'complete', null, null, 'Owner completed setup review', null, null, v_actor, 'follow-up-smoke@example.test', v_complete_req)
    into v_result;
  v_version := (v_result ->> 'version')::bigint;
  assert v_result ->> 'status' = 'completed' and v_version = 3,
    'complete did not persist outcome and version-three state';

  select public.platform_update_follow_up_task(v_task_id, v_version, 'reopen', null, null, null, null, null, v_actor, 'follow-up-smoke@example.test', v_reopen_request)
    into v_result;
  v_version := (v_result ->> 'version')::bigint;
  assert v_result ->> 'status' = 'open' and v_version = 4,
    'reopen did not restore an open state';

  select public.platform_update_follow_up_task(v_task_id, v_version, 'cancel', null, null, null, null, 'No longer needed', v_actor, 'follow-up-smoke@example.test', v_cancel_request)
    into v_result;
  assert v_result ->> 'status' = 'cancelled' and (v_result ->> 'version')::bigint = 5,
    'cancel did not persist the cancelled state';
  assert (select outcome from public.platform_follow_up_tasks where id = v_task_id) = 'No longer needed',
    'cancellation reason was not retained as the outcome';
  assert (select count(*) from public.platform_follow_up_task_audit_logs where task_id = v_task_id) = 5,
    'expected create/start/complete/reopen/cancel audit history';

  if has_table_privilege('anon', 'public.platform_follow_up_tasks', 'select')
    or has_table_privilege('authenticated', 'public.platform_follow_up_tasks', 'select')
    or has_table_privilege('anon', 'public.platform_follow_up_task_audit_logs', 'select')
    or has_table_privilege('authenticated', 'public.platform_follow_up_task_audit_logs', 'select') then
    raise exception 'browser roles retain follow-up table privileges';
  end if;
  if has_function_privilege('anon', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute') then
    raise exception 'browser roles retain follow-up RPC privileges';
  end if;
  if not has_table_privilege('service_role', 'public.platform_follow_up_tasks', 'select')
    or not has_table_privilege('service_role', 'public.platform_follow_up_task_audit_logs', 'select')
    or not has_function_privilege('service_role', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute') then
    raise exception 'service_role cannot use follow-up boundary';
  end if;
end;
$$;

select 'platform follow-up smoke passed; fixture transaction will roll back' as status;

rollback;
