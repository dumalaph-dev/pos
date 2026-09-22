-- Rollback-scoped contract smoke for migration 0089.
-- Run with:
--   Get-Content -Raw scripts/platform-attention-smoke.sql |
--   docker exec -i supabase_db_pos psql -v ON_ERROR_STOP=1 -U postgres -d postgres

begin;
set local request.jwt.claim.role = 'service_role';

do $$
declare
  v_org             uuid := 'a0000000-0000-0000-0000-000000000001';
  v_actor           uuid := 'b0000000-0000-0000-0000-000000000011';
  v_operator_id     uuid := 'b0000000-0000-0000-0000-000000000012';
  v_store_id        uuid;
  v_occurrence_id   uuid;
  v_version         bigint;
  v_result          jsonb;
  v_signal          jsonb;
  v_request         uuid := 'c0000000-0000-0000-0000-000000000011';
  v_assign_request  uuid := 'c0000000-0000-0000-0000-000000000012';
  v_snooze_request  uuid := 'c0000000-0000-0000-0000-000000000013';
  v_unsnooze_req    uuid := 'c0000000-0000-0000-0000-000000000014';
begin
  insert into auth.users (id, email, role, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, is_sso_user, is_anonymous)
  values (v_actor, 'attention-smoke@example.test', 'authenticated', '{}', '{}', false, now(), now(), false, false)
  on conflict (id) do nothing;

  insert into public.platform_operators (id, email, role, is_active, created_by)
  values (v_operator_id, 'attention-owner@example.test', 'support', true, v_actor)
  on conflict (id) do update set is_active = true, role = 'support', revoked_at = null;

  select id into v_store_id from public.stores where org_id = v_org limit 1;
  assert v_store_id is not null, 'expected a smoke store for the fixture organization';

  v_signal := jsonb_build_array(
    jsonb_build_object(
      'logical_key', 'billing:' || v_org::text || ':past_due',
      'source', 'billing', 'category', 'billing', 'severity', 'critical',
      'title', 'Smoke payment due', 'detail', 'Rollback-scoped attention signal.',
      'organization_id', v_org, 'branch_id', null, 'href', '/platform/organizations/' || v_org::text,
      'action_label', 'Review account', 'source_created_at', null
    ),
    jsonb_build_object(
      'logical_key', 'sync:' || v_store_id::text,
      'source', 'sync', 'category', 'sync', 'severity', 'high',
      'title', 'Smoke sync issue', 'detail', 'Rollback-scoped sync signal.',
      'organization_id', v_org, 'branch_id', v_store_id, 'href', '/platform/sync',
      'action_label', 'Open sync health', 'source_created_at', now()
    )
  );

  select public.platform_reconcile_attention(v_signal, array['billing', 'sync'], now()) into v_result;
  assert (v_result->>'opened')::integer = 2, 'first reconciliation did not open two occurrences';

  select public.platform_reconcile_attention(v_signal, array['billing', 'sync'], now()) into v_result;
  assert (v_result->>'refreshed')::integer = 2, 'same condition was not deduplicated';

  select id, version into v_occurrence_id, v_version
  from public.platform_attention_occurrences
  where logical_key = 'billing:' || v_org::text || ':past_due'
  order by created_at desc
  limit 1;
  assert v_occurrence_id is not null and v_version = 1, 'billing occurrence was not version one';

  select public.platform_update_attention_occurrence(v_occurrence_id, v_version, 'acknowledge', null, null, '', v_actor, 'attention-smoke@example.test', v_request) into v_result;
  assert v_result->>'state' = 'acknowledged', 'acknowledge did not persist';
  v_version := (v_result->>'version')::bigint;

  begin
    perform public.platform_update_attention_occurrence(v_occurrence_id, 1, 'snooze', null, now() + interval '1 hour', 'stale page', v_actor, 'attention-smoke@example.test', 'c0000000-0000-0000-0000-000000000015');
    raise exception 'expected optimistic attention conflict';
  exception when others then
    assert sqlerrm = 'platform_attention_version_conflict', 'unexpected stale attention error: ' || sqlerrm;
  end;

  select public.platform_update_attention_occurrence(v_occurrence_id, v_version, 'assign', v_operator_id, null, '', v_actor, 'attention-smoke@example.test', v_assign_request) into v_result;
  assert (v_result->>'assigned_to')::uuid = v_operator_id, 'attention assignment did not persist';
  v_version := (v_result->>'version')::bigint;

  select public.platform_update_attention_occurrence(v_occurrence_id, v_version, 'snooze', null, now() + interval '1 hour', 'Wait for owner confirmation', v_actor, 'attention-smoke@example.test', v_snooze_request) into v_result;
  assert v_result->>'state' = 'snoozed', 'attention snooze did not persist';
  v_version := (v_result->>'version')::bigint;

  select public.platform_update_attention_occurrence(v_occurrence_id, v_version, 'unsnooze', null, null, '', v_actor, 'attention-smoke@example.test', v_unsnooze_req) into v_result;
  assert v_result->>'state' = 'acknowledged', 'attention unsnooze did not restore acknowledged state';

  select public.platform_reconcile_attention('[]'::jsonb, array['billing'], now()) into v_result;
  assert (select state from public.platform_attention_occurrences where id = v_occurrence_id) = 'resolved', 'missing billing signal did not resolve the occurrence';

  select public.platform_reconcile_attention(jsonb_build_array(v_signal->0), array['billing'], now()) into v_result;
  assert (v_result->>'recurred')::integer = 1, 'recovered condition did not create a recurrence';
  assert (select max(recurrence_count) from public.platform_attention_occurrences where logical_key = 'billing:' || v_org::text || ':past_due') = 2, 'recurrence count did not increment';
  assert (select count(*) from public.platform_attention_audit_logs where occurrence_id = v_occurrence_id and action in ('opened', 'acknowledged', 'assigned', 'snoozed', 'unsnoozed', 'resolved')) = 6, 'attention audit history is incomplete';
  raise notice 'platform attention smoke passed; fixture transaction will roll back';
end;
$$;

rollback;
