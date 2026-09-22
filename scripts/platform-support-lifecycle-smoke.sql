-- Rollback-scoped contract smoke for migration 0088.
-- Run with:
--   Get-Content -Raw scripts/platform-support-lifecycle-smoke.sql |
--   docker exec -i supabase_db_pos psql -v ON_ERROR_STOP=1 -U postgres -d postgres

begin;

do $$
declare
  v_org              uuid := 'a0000000-0000-0000-0000-000000000001';
  v_actor            uuid := 'b0000000-0000-0000-0000-000000000001';
  v_operator_id      uuid := 'b0000000-0000-0000-0000-000000000002';
  v_request          uuid := 'c0000000-0000-0000-0000-000000000001';
  v_case_request     uuid := 'c0000000-0000-0000-0000-000000000002';
  v_transition_req   uuid := 'c0000000-0000-0000-0000-000000000003';
  v_note_req         uuid := 'c0000000-0000-0000-0000-000000000004';
  v_close_req        uuid := 'c0000000-0000-0000-0000-000000000005';
  v_internal_req     uuid := 'c0000000-0000-0000-0000-000000000008';
  v_assign_req       uuid := 'c0000000-0000-0000-0000-000000000009';
  v_result           jsonb;
  v_repeat           jsonb;
  v_case_id          uuid;
  v_version          bigint;
begin
  insert into auth.users (id, email, role, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
  values (v_actor, 'smoke@example.test', 'authenticated', '{}', '{}', false, now(), now(), false, false)
  on conflict (id) do nothing;
  insert into public.platform_operators (id, email, role, created_by)
  values (v_operator_id, 'support-smoke@example.test', 'support', v_actor)
  on conflict (id) do nothing;

  select public.platform_set_organization_status(
    v_org, 1, 'suspended', 'Smoke test suspension reason', v_actor, 'smoke@example.test', 7, v_request
  ) into v_result;
  assert v_result->>'account_status' = 'suspended', 'suspension did not return suspended';
  assert (v_result->>'platform_account_version')::bigint = 2, 'suspension did not advance version';

  begin
    perform public.platform_open_support_case(
      v_org, 'Conflicting request id', 'This must not reuse an account mutation key.', 'normal', now() + interval '24 hours', 7, v_actor, 'smoke@example.test', v_request
    );
    raise exception 'expected request id conflict';
  exception when others then
    assert sqlerrm = 'platform_request_id_conflict', 'unexpected request id error: ' || sqlerrm;
  end;

  begin
    perform public.platform_set_organization_status(
      v_org, 1, 'active', 'stale request', v_actor, 'smoke@example.test', 7, 'c0000000-0000-0000-0000-000000000006'
    );
    raise exception 'expected optimistic concurrency conflict';
  exception when others then
    assert sqlerrm = 'platform_organization_conflict', 'unexpected stale write error: ' || sqlerrm;
  end;

  select public.platform_set_organization_status(
    v_org, 2, 'active', '', v_actor, 'smoke@example.test', 7, 'c0000000-0000-0000-0000-000000000007'
  ) into v_result;
  assert v_result->>'account_status' = 'active', 'restore did not return active';
  assert (v_result->>'platform_account_version')::bigint = 3, 'restore did not advance version';

  select public.platform_open_support_case(
    v_org,
    'Smoke support case',
    'Rollback-scoped support case contract test.',
    'urgent',
    now() + interval '24 hours',
    7,
    v_actor,
    'smoke@example.test',
    v_case_request
  ) into v_result;
  v_case_id := (v_result->>'support_case_id')::uuid;
  assert v_case_id is not null, 'support case id missing';
  assert v_result->>'status' = 'open', 'support case did not open';

  select public.platform_open_support_case(
    v_org,
    'Different subject must be ignored on replay',
    'Idempotency replay.',
    'normal',
    now() + interval '48 hours',
    7,
    v_actor,
    'smoke@example.test',
    v_case_request
  ) into v_repeat;
  assert (v_repeat->>'support_case_id')::uuid = v_case_id, 'support case replay was not idempotent';

  select public.platform_assign_support_case(v_case_id, 1, v_operator_id, 7, v_actor, 'smoke@example.test', v_assign_req) into v_result;
  assert (v_result->>'assigned_to')::uuid = v_operator_id, 'support assignment did not persist';
  v_version := (v_result->>'version')::bigint;

  select public.platform_append_support_case_note(v_case_id, v_version, 'Internal context must not count as first response.', 'internal', 7, v_actor, 'smoke@example.test', v_internal_req) into v_result;
  assert v_result->>'first_response_at' is null, 'internal note incorrectly counted as first response';
  v_version := (v_result->>'version')::bigint;

  select public.platform_transition_support_case(v_case_id, v_version, 'in_progress', '', 7, v_actor, 'smoke@example.test', v_transition_req) into v_result;
  v_version := (v_result->>'version')::bigint;
  assert v_version = 4, 'status transition did not advance version';

  select public.platform_append_support_case_note(v_case_id, v_version, 'Actual first response recorded by smoke test.', 'operator_response', 7, v_actor, 'smoke@example.test', v_note_req) into v_result;
  v_version := (v_result->>'version')::bigint;
  assert v_result->>'first_response_at' is not null, 'operator response did not record first response';

  select public.platform_transition_support_case(v_case_id, v_version, 'resolved', 'Smoke test resolution', 7, v_actor, 'smoke@example.test', v_close_req) into v_result;
  assert v_result->>'status' = 'resolved', 'case did not resolve';

  assert (select count(*) from public.support_cases where id = v_case_id) = 1, 'expected one case row';
  assert (select count(*) from public.support_case_events where case_id = v_case_id) = 6, 'expected opened, assignment, internal note, transition, response, resolve events';
  assert (select count(*) from public.support_case_notes where case_id = v_case_id and note_type = 'internal') = 1, 'expected one internal note';
  assert (select count(*) from public.support_case_notes where case_id = v_case_id and note_type = 'operator_response') = 1, 'expected one operator response note';
  assert (select count(*) from public.audit_logs where entity = 'support_cases' and entity_id = v_case_id) = 6, 'expected one audit per support mutation';
  raise notice 'platform support lifecycle smoke passed; fixture transaction will roll back';
end;
$$;

rollback;
