-- Durable, internal account-success follow-up tasks.
--
-- These tasks are platform-operator work, not tenant messages. The tables stay
-- service-role-only and all writes go through idempotent, versioned RPCs so a
-- stale organization page cannot overwrite a newer operator decision.

create table if not exists public.platform_follow_up_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  title          text not null,
  reason         text not null,
  source_type    text not null default 'manual',
  source_id      uuid,
  status         text not null default 'open',
  assignee_id    uuid references public.platform_operators(id) on delete set null,
  due_at         timestamptz,
  outcome        text,
  next_step      text,
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  completed_at   timestamptz,
  version        bigint not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint platform_follow_up_task_title_check check (char_length(trim(title)) between 3 and 160),
  constraint platform_follow_up_task_reason_check check (char_length(trim(reason)) between 1 and 500),
  constraint platform_follow_up_task_source_check check (source_type in ('manual', 'attention', 'support_case', 'trial_feedback', 'renewal')),
  constraint platform_follow_up_task_status_check check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  constraint platform_follow_up_task_outcome_check check (outcome is null or char_length(trim(outcome)) between 1 and 2000),
  constraint platform_follow_up_task_next_step_check check (next_step is null or char_length(trim(next_step)) between 1 and 1000),
  constraint platform_follow_up_task_version_check check (version >= 1)
);

create index if not exists platform_follow_up_tasks_org_status_due_idx
  on public.platform_follow_up_tasks (org_id, status, due_at asc nulls last, updated_at desc);

create index if not exists platform_follow_up_tasks_assignee_status_due_idx
  on public.platform_follow_up_tasks (assignee_id, status, due_at asc nulls last, updated_at desc);

create index if not exists platform_follow_up_tasks_source_idx
  on public.platform_follow_up_tasks (source_type, source_id, created_at desc);

create table if not exists public.platform_follow_up_task_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.platform_follow_up_tasks(id) on delete cascade,
  action      text not null,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now(),
  constraint platform_follow_up_task_audit_action_check check (action in (
    'platform.follow_up_task.created',
    'platform.follow_up_task.updated',
    'platform.follow_up_task.assigned',
    'platform.follow_up_task.unassigned',
    'platform.follow_up_task.started',
    'platform.follow_up_task.completed',
    'platform.follow_up_task.cancelled',
    'platform.follow_up_task.reopened'
  ))
);

create index if not exists platform_follow_up_task_audit_task_created_idx
  on public.platform_follow_up_task_audit_logs (task_id, created_at desc, id desc);

alter table public.platform_follow_up_tasks enable row level security;
alter table public.platform_follow_up_task_audit_logs enable row level security;

revoke all on table public.platform_follow_up_tasks, public.platform_follow_up_task_audit_logs
  from anon, authenticated, public;
grant all on table public.platform_follow_up_tasks, public.platform_follow_up_task_audit_logs
  to service_role;

do $$
begin
  if to_regprocedure('public.forbid_mutation()') is not null
    and not exists (
      select 1
      from pg_trigger
      where tgname = 'no_mutate_platform_follow_up_task_audit'
        and tgrelid = 'public.platform_follow_up_task_audit_logs'::regclass
    ) then
    create trigger no_mutate_platform_follow_up_task_audit
      before update or delete on public.platform_follow_up_task_audit_logs
      for each row execute function public.forbid_mutation();
  end if;
end;
$$;

create or replace function public.platform_create_follow_up_task(
  p_org_id        uuid,
  p_title         text,
  p_reason        text,
  p_source_type   text default 'manual',
  p_source_id     uuid default null,
  p_assignee_id   uuid default null,
  p_due_at        timestamptz default null,
  p_next_step     text default null,
  p_actor_id      uuid default null,
  p_actor_email   text default null,
  p_request_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id     uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing       jsonb;
  v_existing_action text;
  v_existing_type   text;
  v_org_exists     boolean;
  v_task_id        uuid;
  v_title          text := trim(coalesce(p_title, ''));
  v_reason         text := trim(coalesce(p_reason, ''));
  v_source_type    text := lower(trim(coalesce(p_source_type, 'manual')));
  v_next_step      text := nullif(trim(coalesce(p_next_step, '')), '');
  v_result         jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, result
    into v_existing_action, v_existing_type, v_existing
  from public.platform_mutation_requests
  where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.follow_up_task.created' or v_existing_type <> 'follow_up_task' then
      raise exception 'platform_request_id_conflict';
    end if;
    return v_existing;
  end if;

  if p_org_id is null or p_actor_id is null then
    raise exception 'platform_follow_up_task_invalid_actor';
  end if;
  if v_title = '' or char_length(v_title) > 160 then
    raise exception 'platform_follow_up_task_invalid_title';
  end if;
  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'platform_follow_up_task_invalid_reason';
  end if;
  if v_source_type not in ('manual', 'attention', 'support_case', 'trial_feedback', 'renewal') then
    raise exception 'platform_follow_up_task_invalid_source';
  end if;
  if v_next_step is not null and char_length(v_next_step) > 1000 then
    raise exception 'platform_follow_up_task_invalid_next_step';
  end if;

  select exists(select 1 from public.organizations where id = p_org_id)
    into v_org_exists;
  if not v_org_exists then
    raise exception 'platform_follow_up_task_organization_not_found';
  end if;

  if p_assignee_id is not null and not exists (
    select 1
    from public.platform_operators
    where id = p_assignee_id
      and is_active
      and role in ('owner', 'support')
  ) then
    raise exception 'platform_follow_up_task_assignee_invalid';
  end if;

  insert into public.platform_follow_up_tasks (
    org_id, title, reason, source_type, source_id, assignee_id,
    due_at, next_step, created_by, updated_by
  )
  values (
    p_org_id, v_title, v_reason, v_source_type, p_source_id, p_assignee_id,
    p_due_at, v_next_step, p_actor_id, p_actor_id
  )
  returning id into v_task_id;

  insert into public.platform_follow_up_task_audit_logs (
    task_id, action, actor_id, actor_email, before, after
  )
  values (
    v_task_id,
    'platform.follow_up_task.created',
    p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    null,
    jsonb_build_object(
      'task_id', v_task_id,
      'org_id', p_org_id,
      'title', v_title,
      'reason', v_reason,
      'source_type', v_source_type,
      'source_id', p_source_id,
      'assignee_id', p_assignee_id,
      'due_at', p_due_at,
      'next_step', v_next_step,
      'status', 'open',
      'version', 1,
      'request_id', v_request_id
    )
  );

  v_result := jsonb_build_object(
    'task_id', v_task_id,
    'org_id', p_org_id,
    'status', 'open',
    'version', 1,
    'request_id', v_request_id
  );
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.follow_up_task.created', 'follow_up_task', v_task_id, p_actor_id, v_result);
  return v_result;
end;
$$;

create or replace function public.platform_update_follow_up_task(
  p_task_id       uuid,
  p_expected_version bigint,
  p_action        text,
  p_assignee_id   uuid default null,
  p_due_at        timestamptz default null,
  p_outcome       text default null,
  p_next_step     text default null,
  p_reason        text default null,
  p_actor_id      uuid default null,
  p_actor_email   text default null,
  p_request_id    uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id     uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing       jsonb;
  v_existing_action text;
  v_existing_type   text;
  v_task           public.platform_follow_up_tasks%rowtype;
  v_action         text := lower(trim(coalesce(p_action, '')));
  v_assignee       uuid;
  v_status         text;
  v_outcome        text := nullif(trim(coalesce(p_outcome, '')), '');
  v_next_step      text := nullif(trim(coalesce(p_next_step, '')), '');
  v_reason         text := nullif(trim(coalesce(p_reason, '')), '');
  v_completed_at   timestamptz;
  v_audit_action   text;
  v_result         jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, result
    into v_existing_action, v_existing_type, v_existing
  from public.platform_mutation_requests
  where request_id = v_request_id;
  if found then
    if v_existing_type <> 'follow_up_task' or v_existing_action not like 'platform.follow_up_task.%' then raise exception 'platform_request_id_conflict'; end if;
    return v_existing;
  end if;

  if p_task_id is null or p_actor_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'platform_follow_up_task_invalid_actor';
  end if;
  if v_action not in ('assign', 'unassign', 'start', 'complete', 'cancel', 'reopen', 'edit') then
    raise exception 'platform_follow_up_task_invalid_action';
  end if;
  if v_outcome is not null and char_length(v_outcome) > 2000 then
    raise exception 'platform_follow_up_task_invalid_outcome';
  end if;
  if v_next_step is not null and char_length(v_next_step) > 1000 then
    raise exception 'platform_follow_up_task_invalid_next_step';
  end if;
  if v_action = 'assign' then
    if p_assignee_id is null then raise exception 'platform_follow_up_task_assignee_invalid'; end if;
    if not exists (
      select 1 from public.platform_operators
      where id = p_assignee_id and is_active and role in ('owner', 'support')
    ) then raise exception 'platform_follow_up_task_assignee_invalid'; end if;
  end if;
  if v_action = 'complete' and v_outcome is null then
    raise exception 'platform_follow_up_task_outcome_required';
  end if;
  if v_action = 'cancel' and v_reason is null then
    raise exception 'platform_follow_up_task_reason_required';
  end if;

  select * into v_task
  from public.platform_follow_up_tasks
  where id = p_task_id
  for update;
  if not found then raise exception 'platform_follow_up_task_not_found'; end if;
  if v_task.version <> p_expected_version then raise exception 'platform_follow_up_task_version_conflict'; end if;

  v_assignee := v_task.assignee_id;
  v_status := v_task.status;
  v_completed_at := v_task.completed_at;
  v_audit_action := 'platform.follow_up_task.updated';

  if v_action = 'assign' then
    v_assignee := p_assignee_id;
    v_audit_action := 'platform.follow_up_task.assigned';
  elsif v_action = 'unassign' then
    v_assignee := null;
    v_audit_action := 'platform.follow_up_task.unassigned';
  elsif v_action = 'start' then
    if v_task.status in ('completed', 'cancelled') then raise exception 'platform_follow_up_task_closed'; end if;
    v_status := 'in_progress';
    v_audit_action := 'platform.follow_up_task.started';
  elsif v_action = 'complete' then
    if v_task.status = 'cancelled' then raise exception 'platform_follow_up_task_closed'; end if;
    v_status := 'completed';
    v_completed_at := now();
    v_audit_action := 'platform.follow_up_task.completed';
  elsif v_action = 'cancel' then
    if v_task.status = 'completed' then raise exception 'platform_follow_up_task_closed'; end if;
    v_status := 'cancelled';
    v_completed_at := null;
    v_outcome := coalesce(v_outcome, v_reason);
    v_audit_action := 'platform.follow_up_task.cancelled';
  elsif v_action = 'reopen' then
    v_status := 'open';
    v_completed_at := null;
    v_audit_action := 'platform.follow_up_task.reopened';
  end if;

  update public.platform_follow_up_tasks
  set assignee_id = v_assignee,
      due_at = case when v_action = 'edit' then p_due_at else v_task.due_at end,
      outcome = case when v_action in ('complete', 'cancel', 'edit') then coalesce(v_outcome, v_task.outcome) else v_task.outcome end,
      next_step = case when v_action in ('complete', 'cancel', 'reopen', 'edit') then coalesce(v_next_step, v_task.next_step) else v_task.next_step end,
      status = v_status,
      completed_at = v_completed_at,
      updated_by = p_actor_id,
      updated_at = now(),
      version = v_task.version + 1
  where id = v_task.id;

  insert into public.platform_follow_up_task_audit_logs (
    task_id, action, actor_id, actor_email, before, after
  )
  values (
    v_task.id,
    v_audit_action,
    p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    jsonb_build_object('status', v_task.status, 'assignee_id', v_task.assignee_id, 'due_at', v_task.due_at, 'outcome', v_task.outcome, 'next_step', v_task.next_step, 'version', v_task.version),
    jsonb_build_object('status', v_status, 'assignee_id', v_assignee, 'due_at', case when v_action = 'edit' then p_due_at else v_task.due_at end, 'outcome', case when v_action in ('complete', 'cancel', 'edit') then coalesce(v_outcome, v_task.outcome) else v_task.outcome end, 'next_step', case when v_action in ('complete', 'cancel', 'reopen', 'edit') then coalesce(v_next_step, v_task.next_step) else v_task.next_step end, 'version', v_task.version + 1, 'reason', v_reason, 'request_id', v_request_id)
  );

  v_result := jsonb_build_object('task_id', v_task.id, 'org_id', v_task.org_id, 'status', v_status, 'version', v_task.version + 1, 'request_id', v_request_id);
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, v_audit_action, 'follow_up_task', v_task.id, p_actor_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.platform_create_follow_up_task(uuid, text, text, text, uuid, uuid, timestamptz, text, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.platform_update_follow_up_task(uuid, bigint, text, uuid, timestamptz, text, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.platform_create_follow_up_task(uuid, text, text, text, uuid, uuid, timestamptz, text, uuid, text, uuid) to service_role;
grant execute on function public.platform_update_follow_up_task(uuid, bigint, text, uuid, timestamptz, text, text, text, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
