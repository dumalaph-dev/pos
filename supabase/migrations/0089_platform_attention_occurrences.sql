-- Wave 2 D2 durable attention occurrences.
--
-- The console may observe the same source condition many times. Keep a stable
-- logical key for deduplication, a condition fingerprint for recurrence, and
-- versioned operator state for acknowledgement, assignment and snoozing.

create table if not exists public.platform_attention_occurrences (
  id                    uuid primary key default gen_random_uuid(),
  logical_key           text not null,
  condition_fingerprint text not null,
  source                text not null,
  category              text not null,
  severity              text not null,
  title                 text not null,
  detail                text not null,
  organization_id       uuid references public.organizations(id) on delete set null,
  branch_id             uuid references public.stores(id) on delete set null,
  href                  text not null,
  action_label          text not null,
  source_created_at     timestamptz,
  first_seen_at         timestamptz not null default now(),
  last_seen_at          timestamptz not null default now(),
  state                 text not null default 'open',
  acknowledged_at       timestamptz,
  acknowledged_by       uuid references auth.users(id) on delete set null,
  assigned_to           uuid references public.platform_operators(id) on delete set null,
  assigned_at           timestamptz,
  snoozed_until          timestamptz,
  snooze_reason         text,
  resolved_at           timestamptz,
  resolved_by           uuid references auth.users(id) on delete set null,
  resolution_reason     text,
  recurrence_count      integer not null default 1,
  version               bigint not null default 1,
  metadata              jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint platform_attention_logical_key_check check (char_length(trim(logical_key)) between 1 and 240),
  constraint platform_attention_fingerprint_check check (char_length(trim(condition_fingerprint)) between 1 and 128),
  constraint platform_attention_source_check check (source in ('billing', 'support', 'sync', 'access', 'readiness')),
  constraint platform_attention_category_check check (category in ('billing', 'support', 'sync', 'access', 'readiness')),
  constraint platform_attention_severity_check check (severity in ('critical', 'high', 'medium', 'low')),
  constraint platform_attention_title_check check (char_length(trim(title)) between 1 and 240),
  constraint platform_attention_detail_check check (char_length(trim(detail)) between 1 and 2000),
  constraint platform_attention_href_check check (char_length(trim(href)) between 1 and 500),
  constraint platform_attention_action_label_check check (char_length(trim(action_label)) between 1 and 80),
  constraint platform_attention_state_check check (state in ('open', 'acknowledged', 'snoozed', 'resolved')),
  constraint platform_attention_recurrence_check check (recurrence_count >= 1),
  constraint platform_attention_snooze_reason_check check (snooze_reason is null or char_length(trim(snooze_reason)) between 1 and 240),
  constraint platform_attention_resolution_reason_check check (resolution_reason is null or char_length(trim(resolution_reason)) between 1 and 240)
);

create index if not exists platform_attention_state_severity_idx
  on public.platform_attention_occurrences (state, severity, updated_at desc, id desc);

create index if not exists platform_attention_logical_created_idx
  on public.platform_attention_occurrences (logical_key, created_at desc, id desc);

create index if not exists platform_attention_org_state_idx
  on public.platform_attention_occurrences (organization_id, state, updated_at desc);

create index if not exists platform_attention_assignee_state_idx
  on public.platform_attention_occurrences (assigned_to, state, updated_at desc);

create table if not exists public.platform_attention_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references public.platform_attention_occurrences(id) on delete cascade,
  action         text not null,
  actor_id       uuid references auth.users(id) on delete set null,
  actor_email    text,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now(),
  constraint platform_attention_audit_action_check check (action in (
    'opened', 'observed', 'acknowledged', 'assigned', 'unassigned',
    'snoozed', 'unsnoozed', 'resolved', 'recurred', 'condition_changed'
  ))
);

create index if not exists platform_attention_audit_occurrence_created_idx
  on public.platform_attention_audit_logs (occurrence_id, created_at desc, id desc);

create index if not exists platform_attention_audit_created_idx
  on public.platform_attention_audit_logs (created_at desc, id desc);

alter table public.platform_attention_occurrences enable row level security;
alter table public.platform_attention_audit_logs enable row level security;

revoke all on table public.platform_attention_occurrences, public.platform_attention_audit_logs
  from anon, authenticated, public;
grant all on table public.platform_attention_occurrences, public.platform_attention_audit_logs
  to service_role;

do $$
begin
  if to_regprocedure('public.forbid_mutation()') is not null
    and not exists (
      select 1
      from pg_trigger
      where tgname = 'no_mutate_platform_attention_audit'
        and tgrelid = 'public.platform_attention_audit_logs'::regclass
    ) then
    create trigger no_mutate_platform_attention_audit
      before update or delete on public.platform_attention_audit_logs
      for each row execute function public.forbid_mutation();
  end if;
end;
$$;

create or replace function public.platform_reconcile_attention(
  p_signals          jsonb,
  p_resolve_sources  text[],
  p_observed_at      timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal             jsonb;
  v_current            public.platform_attention_occurrences%rowtype;
  v_new_id             uuid;
  v_logical_key        text;
  v_condition_fingerprint text;
  v_source             text;
  v_category           text;
  v_severity           text;
  v_title              text;
  v_detail             text;
  v_href               text;
  v_action_label       text;
  v_org_id             uuid;
  v_branch_id          uuid;
  v_source_created_at  timestamptz;
  v_observed_at        timestamptz := coalesce(p_observed_at, now());
  v_seen_keys          text[] := array[]::text[];
  v_resolve_sources    text[] := array[]::text[];
  v_opened             integer := 0;
  v_resolved           integer := 0;
  v_refreshed          integer := 0;
  v_recurred           integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'platform_attention_service_role_required';
  end if;

  select coalesce(array_agg(distinct trim(source) order by trim(source)), array[]::text[])
    into v_resolve_sources
  from unnest(coalesce(p_resolve_sources, array[]::text[])) as source
  where trim(source) in ('billing', 'support', 'sync', 'access', 'readiness');

  for v_signal in select value from jsonb_array_elements(coalesce(p_signals, '[]'::jsonb)) loop
    v_logical_key := trim(coalesce(v_signal->>'logical_key', ''));
    v_source := trim(coalesce(v_signal->>'source', ''));
    v_category := trim(coalesce(v_signal->>'category', ''));
    v_severity := trim(coalesce(v_signal->>'severity', ''));
    v_title := trim(coalesce(v_signal->>'title', ''));
    v_detail := trim(coalesce(v_signal->>'detail', ''));
    v_href := trim(coalesce(v_signal->>'href', ''));
    v_action_label := trim(coalesce(v_signal->>'action_label', ''));
    v_org_id := nullif(v_signal->>'organization_id', '')::uuid;
    v_branch_id := nullif(v_signal->>'branch_id', '')::uuid;
    v_source_created_at := nullif(v_signal->>'source_created_at', '')::timestamptz;

    if v_logical_key = '' or v_source not in ('billing', 'support', 'sync', 'access', 'readiness')
      or v_category not in ('billing', 'support', 'sync', 'access', 'readiness')
      or v_severity not in ('critical', 'high', 'medium', 'low')
      or v_title = '' or v_detail = '' or v_href = '' or v_action_label = '' then
      raise exception 'platform_attention_invalid_signal';
    end if;

    if not (v_source = any(v_resolve_sources)) then
      continue;
    end if;

    v_condition_fingerprint := md5(concat_ws(chr(31), v_source, v_category, v_severity, v_title, v_detail, v_org_id::text, v_branch_id::text, v_href, v_action_label, v_source_created_at::text));
    v_seen_keys := array_append(v_seen_keys, v_logical_key);

    select *
      into v_current
    from public.platform_attention_occurrences
    where logical_key = v_logical_key
    order by created_at desc, id desc
    limit 1
    for update;

    if v_current.id is null then
      insert into public.platform_attention_occurrences (
        logical_key, condition_fingerprint, source, category, severity,
        title, detail, organization_id, branch_id, href, action_label,
        source_created_at, first_seen_at, last_seen_at, state,
        recurrence_count, metadata
      ) values (
        v_logical_key, v_condition_fingerprint, v_source, v_category, v_severity,
        v_title, v_detail, v_org_id, v_branch_id, v_href, v_action_label,
        v_source_created_at, v_observed_at, v_observed_at, 'open', 1,
        jsonb_build_object('source_observed_at', v_observed_at)
      ) returning id into v_new_id;

      insert into public.platform_attention_audit_logs (occurrence_id, action, after)
      select v_new_id, 'opened', jsonb_build_object('logical_key', v_logical_key, 'source', v_source, 'severity', v_severity, 'condition_fingerprint', v_condition_fingerprint);
      v_opened := v_opened + 1;
    elsif v_current.state <> 'resolved' and v_current.condition_fingerprint = v_condition_fingerprint then
      update public.platform_attention_occurrences
      set
        source = v_source,
        category = v_category,
        severity = v_severity,
        title = v_title,
        detail = v_detail,
        organization_id = v_org_id,
        branch_id = v_branch_id,
        href = v_href,
        action_label = v_action_label,
        source_created_at = v_source_created_at,
        last_seen_at = v_observed_at,
        state = case when state = 'snoozed' and snoozed_until <= v_observed_at then 'open' else state end,
        snoozed_until = case when state = 'snoozed' and snoozed_until <= v_observed_at then null else snoozed_until end,
        snooze_reason = case when state = 'snoozed' and snoozed_until <= v_observed_at then null else snooze_reason end,
        version = version + case when state = 'snoozed' and snoozed_until <= v_observed_at then 1 else 0 end,
        updated_at = v_observed_at,
        metadata = jsonb_build_object('source_observed_at', v_observed_at)
      where id = v_current.id;

      if v_current.state = 'snoozed' and v_current.snoozed_until <= v_observed_at then
        insert into public.platform_attention_audit_logs (occurrence_id, action, before, after)
        values (v_current.id, 'unsnoozed', jsonb_build_object('state', 'snoozed', 'snoozed_until', v_current.snoozed_until), jsonb_build_object('state', 'open', 'reason', 'snooze_expired'));
      else
        insert into public.platform_attention_audit_logs (occurrence_id, action, after)
        values (v_current.id, 'observed', jsonb_build_object('state', v_current.state, 'last_seen_at', v_observed_at));
      end if;
      v_refreshed := v_refreshed + 1;
    elsif v_current.state <> 'resolved' then
      update public.platform_attention_occurrences
      set state = 'resolved', resolved_at = v_observed_at, resolution_reason = 'condition_changed', version = version + 1, updated_at = v_observed_at
      where id = v_current.id;
      insert into public.platform_attention_audit_logs (occurrence_id, action, before, after)
      values (v_current.id, 'condition_changed', jsonb_build_object('state', v_current.state, 'condition_fingerprint', v_current.condition_fingerprint), jsonb_build_object('state', 'resolved', 'reason', 'condition_changed'));
      v_resolved := v_resolved + 1;

      insert into public.platform_attention_occurrences (
        logical_key, condition_fingerprint, source, category, severity,
        title, detail, organization_id, branch_id, href, action_label,
        source_created_at, first_seen_at, last_seen_at, state,
        recurrence_count, metadata
      ) values (
        v_logical_key, v_condition_fingerprint, v_source, v_category, v_severity,
        v_title, v_detail, v_org_id, v_branch_id, v_href, v_action_label,
        v_source_created_at, v_observed_at, v_observed_at, 'open', v_current.recurrence_count + 1,
        jsonb_build_object('source_observed_at', v_observed_at)
      ) returning id into v_new_id;
      insert into public.platform_attention_audit_logs (occurrence_id, action, after)
      values (v_new_id, 'recurred', jsonb_build_object('previous_occurrence_id', v_current.id, 'logical_key', v_logical_key, 'condition_fingerprint', v_condition_fingerprint));
      v_opened := v_opened + 1;
      v_recurred := v_recurred + 1;
    else
      insert into public.platform_attention_occurrences (
        logical_key, condition_fingerprint, source, category, severity,
        title, detail, organization_id, branch_id, href, action_label,
        source_created_at, first_seen_at, last_seen_at, state,
        recurrence_count, metadata
      ) values (
        v_logical_key, v_condition_fingerprint, v_source, v_category, v_severity,
        v_title, v_detail, v_org_id, v_branch_id, v_href, v_action_label,
        v_source_created_at, v_observed_at, v_observed_at, 'open', v_current.recurrence_count + 1,
        jsonb_build_object('source_observed_at', v_observed_at)
      ) returning id into v_new_id;
      insert into public.platform_attention_audit_logs (occurrence_id, action, after)
      values (v_new_id, 'recurred', jsonb_build_object('previous_occurrence_id', v_current.id, 'logical_key', v_logical_key, 'condition_fingerprint', v_condition_fingerprint));
      v_opened := v_opened + 1;
      v_recurred := v_recurred + 1;
    end if;
  end loop;

  for v_current in
    select *
    from public.platform_attention_occurrences
    where state <> 'resolved'
      and source = any(v_resolve_sources)
      and not (logical_key = any(v_seen_keys))
    for update
  loop
    update public.platform_attention_occurrences
    set state = 'resolved', resolved_at = v_observed_at, resolution_reason = 'source_recovered', version = version + 1, updated_at = v_observed_at
    where id = v_current.id;
    insert into public.platform_attention_audit_logs (occurrence_id, action, before, after)
    values (v_current.id, 'resolved', jsonb_build_object('state', v_current.state), jsonb_build_object('state', 'resolved', 'reason', 'source_recovered'));
    v_resolved := v_resolved + 1;
  end loop;

  return jsonb_build_object('opened', v_opened, 'refreshed', v_refreshed, 'resolved', v_resolved, 'recurred', v_recurred, 'observed_at', v_observed_at);
end;
$$;

create or replace function public.platform_update_attention_occurrence(
  p_occurrence_id    uuid,
  p_expected_version bigint,
  p_action           text,
  p_assignee_id      uuid,
  p_snooze_until     timestamptz,
  p_reason           text,
  p_actor_id         uuid,
  p_actor_email      text,
  p_request_id       uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence       public.platform_attention_occurrences%rowtype;
  v_operator         public.platform_operators%rowtype;
  v_request_id       uuid := coalesce(p_request_id, gen_random_uuid());
  v_action           text := lower(trim(coalesce(p_action, '')));
  v_reason           text := trim(coalesce(p_reason, ''));
  v_actor_email      text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_existing         jsonb;
  v_existing_action  text;
  v_existing_type    text;
  v_existing_target  uuid;
  v_next_state       text;
  v_audit_action     text;
  v_changed_at       timestamptz := now();
  v_result           jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'platform_attention_service_role_required';
  end if;
  if p_actor_id is null then raise exception 'platform_attention_invalid_actor'; end if;
  if p_occurrence_id is null then raise exception 'platform_attention_invalid_occurrence'; end if;
  if v_action not in ('acknowledge', 'assign', 'unassign', 'snooze', 'unsnooze') then raise exception 'platform_attention_invalid_action'; end if;

  select action, target_type, target_id, result
    into v_existing_action, v_existing_type, v_existing_target, v_existing
  from public.platform_mutation_requests
  where request_id = v_request_id
  for update;
  if found then
    if v_existing_action <> 'platform.attention.' || v_action
      or v_existing_type <> 'platform_attention_occurrences'
      or v_existing_target <> p_occurrence_id then
      raise exception 'platform_request_id_conflict';
    end if;
    return v_existing;
  end if;

  select * into v_occurrence
  from public.platform_attention_occurrences
  where id = p_occurrence_id
  for update;
  if not found then raise exception 'platform_attention_not_found'; end if;
  if v_occurrence.version <> p_expected_version then raise exception 'platform_attention_version_conflict'; end if;
  if v_occurrence.state = 'resolved' then raise exception 'platform_attention_resolved'; end if;

  if v_action = 'assign' then
    if p_assignee_id is null then raise exception 'platform_attention_invalid_assignee'; end if;
    select * into v_operator from public.platform_operators where id = p_assignee_id and is_active for update;
    if not found then raise exception 'platform_attention_assignee_not_active'; end if;
    v_next_state := case when v_occurrence.state = 'open' then 'acknowledged' else v_occurrence.state end;
    v_audit_action := 'assigned';
  elsif v_action = 'unassign' then
    v_next_state := v_occurrence.state;
    v_audit_action := 'unassigned';
  elsif v_action = 'acknowledge' then
    v_next_state := 'acknowledged';
    v_audit_action := 'acknowledged';
  elsif v_action = 'snooze' then
    if p_snooze_until is null or p_snooze_until <= v_changed_at or p_snooze_until > v_changed_at + interval '7 days' then raise exception 'platform_attention_invalid_snooze'; end if;
    if char_length(v_reason) < 3 or char_length(v_reason) > 240 then raise exception 'platform_attention_invalid_snooze_reason'; end if;
    v_next_state := 'snoozed';
    v_audit_action := 'snoozed';
  else
    v_next_state := case when v_occurrence.acknowledged_at is not null then 'acknowledged' else 'open' end;
    v_audit_action := 'unsnoozed';
  end if;

  update public.platform_attention_occurrences
  set
    state = v_next_state,
    acknowledged_at = case when v_action in ('acknowledge', 'assign') then coalesce(acknowledged_at, v_changed_at) else acknowledged_at end,
    acknowledged_by = case when v_action in ('acknowledge', 'assign') then coalesce(acknowledged_by, p_actor_id) else acknowledged_by end,
    assigned_to = case when v_action = 'assign' then p_assignee_id when v_action = 'unassign' then null else assigned_to end,
    assigned_at = case when v_action = 'assign' then v_changed_at when v_action = 'unassign' then null else assigned_at end,
    snoozed_until = case when v_action = 'snooze' then p_snooze_until when v_action in ('unsnooze', 'acknowledge', 'assign') then null else snoozed_until end,
    snooze_reason = case when v_action = 'snooze' then v_reason when v_action in ('unsnooze', 'acknowledge', 'assign') then null else snooze_reason end,
    version = version + 1,
    updated_at = v_changed_at
  where id = p_occurrence_id;

  v_result := jsonb_build_object('occurrence_id', p_occurrence_id, 'state', v_next_state, 'version', v_occurrence.version + 1, 'assigned_to', case when v_action = 'assign' then p_assignee_id when v_action = 'unassign' then null else v_occurrence.assigned_to end, 'snoozed_until', case when v_action = 'snooze' then p_snooze_until when v_action = 'unsnooze' then null else v_occurrence.snoozed_until end);

  insert into public.platform_attention_audit_logs (occurrence_id, action, actor_id, actor_email, before, after)
  values (p_occurrence_id, v_audit_action, p_actor_id, v_actor_email,
    jsonb_build_object('state', v_occurrence.state, 'assigned_to', v_occurrence.assigned_to, 'snoozed_until', v_occurrence.snoozed_until, 'version', v_occurrence.version),
    v_result || jsonb_build_object('reason', nullif(v_reason, '')));

  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.attention.' || v_action, 'platform_attention_occurrences', p_occurrence_id, p_actor_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.platform_reconcile_attention(jsonb, text[], timestamptz) from public;
revoke all on function public.platform_update_attention_occurrence(uuid, bigint, text, uuid, timestamptz, text, uuid, text, uuid) from public;
grant execute on function public.platform_reconcile_attention(jsonb, text[], timestamptz) to service_role;
grant execute on function public.platform_update_attention_occurrence(uuid, bigint, text, uuid, timestamptz, text, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
