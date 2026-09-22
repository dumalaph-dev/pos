-- Wave 1 account safety and support lifecycle.
--
-- Platform server actions remain the authorization boundary. These functions
-- make the state change, append-only history, and platform audit one database
-- transaction, while an expected version prevents a stale console page from
-- overwriting a newer operator decision.

alter table public.organizations
  add column if not exists platform_account_version bigint not null default 1;

create table if not exists public.platform_mutation_requests (
  request_id  uuid primary key,
  action      text not null,
  target_type text not null,
  target_id   uuid not null,
  actor_id    uuid,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists platform_mutation_requests_target_idx
  on public.platform_mutation_requests (target_type, target_id, created_at desc);

alter table public.support_cases
  add column if not exists version bigint not null default 1,
  add column if not exists assigned_to uuid references public.platform_operators(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists policy_version integer not null default 1,
  add column if not exists first_response_at timestamptz,
  add column if not exists first_response_by uuid references auth.users(id) on delete set null,
  add column if not exists resolution_reason text,
  add column if not exists request_id uuid;

create unique index if not exists support_cases_request_id_idx
  on public.support_cases (request_id)
  where request_id is not null;

create index if not exists support_cases_assigned_status_idx
  on public.support_cases (assigned_to, status, first_response_due_at);

create table if not exists public.support_case_events (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.support_cases(id) on delete cascade,
  event_type   text not null,
  from_status  text,
  to_status    text,
  actor_id     uuid,
  actor_email  text,
  reason       text,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  constraint support_case_events_type_check check (event_type in (
    'opened', 'status_changed', 'assigned', 'unassigned', 'note_added', 'first_response_recorded'
  ))
);

create index if not exists support_case_events_case_created_idx
  on public.support_case_events (case_id, created_at desc, id desc);

create table if not exists public.support_case_notes (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.support_cases(id) on delete cascade,
  author_id   uuid,
  author_email text,
  note_type   text not null default 'internal',
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint support_case_notes_type_check check (note_type in ('internal', 'operator_response')),
  constraint support_case_notes_body_check check (char_length(trim(body)) between 1 and 5000)
);

create index if not exists support_case_notes_case_created_idx
  on public.support_case_notes (case_id, created_at asc, id asc);

alter table public.platform_mutation_requests enable row level security;
alter table public.support_case_events enable row level security;
alter table public.support_case_notes enable row level security;

revoke all on table
  public.platform_mutation_requests,
  public.support_case_events,
  public.support_case_notes
from anon, authenticated, public;

grant all on table
  public.platform_mutation_requests,
  public.support_case_events,
  public.support_case_notes
to service_role;

-- The recovery reader uses the service-role API and must be able to export
-- every application table, including older tables whose migrations only
-- granted access to tenant roles. This does not widen tenant access.
grant select on all tables in schema public to service_role;

do $$
begin
  if to_regprocedure('public.forbid_mutation()') is not null then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'no_mutate_support_case_events'
        and tgrelid = 'public.support_case_events'::regclass
    ) then
      create trigger no_mutate_support_case_events
        before update or delete on public.support_case_events
        for each row execute function public.forbid_mutation();
    end if;
    if not exists (
      select 1 from pg_trigger
      where tgname = 'no_mutate_support_case_notes'
        and tgrelid = 'public.support_case_notes'::regclass
    ) then
      create trigger no_mutate_support_case_notes
        before update or delete on public.support_case_notes
        for each row execute function public.forbid_mutation();
    end if;
  end if;
end;
$$;

create or replace function public.platform_set_organization_status(
  p_org_id             uuid,
  p_expected_version   bigint,
  p_target_status      text,
  p_reason             text,
  p_actor_id           uuid,
  p_actor_email        text,
  p_policy_version     integer,
  p_request_id         uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org              public.organizations%rowtype;
  v_request_id       uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing         jsonb;
  v_existing_action  text;
  v_existing_type    text;
  v_existing_target  uuid;
  v_reason           text := trim(coalesce(p_reason, ''));
  v_target           text := trim(coalesce(p_target_status, ''));
  v_changed_at       timestamptz := now();
  v_next_version     bigint;
  v_result           jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));

  select action, target_type, target_id, result into v_existing_action, v_existing_type, v_existing_target, v_existing
  from public.platform_mutation_requests
  where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.organization.status_changed' or v_existing_type <> 'organization' or v_existing_target <> p_org_id then
      raise exception 'platform_request_id_conflict';
    end if;
    return v_existing;
  end if;

  if p_org_id is null or p_expected_version is null then
    raise exception 'platform_organization_invalid_request';
  end if;
  if v_target not in ('active', 'suspended') then
    raise exception 'platform_organization_invalid_status';
  end if;
  if p_actor_id is null or p_policy_version is null or p_policy_version < 1 then
    raise exception 'platform_organization_invalid_actor';
  end if;
  if v_target = 'suspended' and char_length(v_reason) not between 10 and 500 then
    raise exception 'platform_organization_invalid_reason';
  end if;

  select * into v_org
  from public.organizations
  where id = p_org_id
  for update;
  if not found then
    raise exception 'platform_organization_not_found';
  end if;
  if coalesce(v_org.platform_account_version, 1) <> p_expected_version then
    raise exception 'platform_organization_conflict';
  end if;
  if coalesce(v_org.account_status, 'active') = v_target then
    raise exception 'platform_organization_already_in_state';
  end if;

  v_next_version := coalesce(v_org.platform_account_version, 1) + 1;
  if v_target = 'suspended' then
    update public.organizations
    set account_status = 'suspended',
        suspension_reason = v_reason,
        suspended_at = v_changed_at,
        suspended_by = p_actor_id,
        platform_account_version = v_next_version
    where id = p_org_id;
  else
    update public.organizations
    set account_status = 'active',
        suspension_reason = null,
        suspended_at = null,
        suspended_by = null,
        platform_account_version = v_next_version
    where id = p_org_id;
  end if;

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    p_org_id,
    null,
    case when v_target = 'suspended' then 'platform.organization.suspended' else 'platform.organization.restored' end,
    'organizations',
    p_org_id,
    jsonb_build_object(
      'account_status', coalesce(v_org.account_status, 'active'),
      'suspension_reason', v_org.suspension_reason,
      'suspended_at', v_org.suspended_at,
      'platform_account_version', coalesce(v_org.platform_account_version, 1)
    ),
    jsonb_build_object(
      'account_status', v_target,
      'suspension_reason', case when v_target = 'suspended' then v_reason else null end,
      'changed_at', v_changed_at,
      'platform_account_version', v_next_version,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', nullif(trim(coalesce(p_actor_email, '')), ''),
      'reason', v_reason,
      'policy_version', p_policy_version,
      'request_id', v_request_id,
      'expected_version', p_expected_version
    )
  );

  v_result := jsonb_build_object(
    'organization_id', p_org_id,
    'account_status', v_target,
    'platform_account_version', v_next_version,
    'request_id', v_request_id,
    'changed_at', v_changed_at
  );
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.organization.status_changed', 'organization', p_org_id, p_actor_id, v_result);
  return v_result;
end;
$$;

create or replace function public.platform_open_support_case(
  p_org_id                 uuid,
  p_subject                text,
  p_description            text,
  p_priority               text,
  p_first_response_due_at  timestamptz,
  p_policy_version         integer,
  p_actor_id               uuid,
  p_actor_email            text,
  p_request_id             uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org          public.organizations%rowtype;
  v_case_id      uuid;
  v_request_id   uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing     jsonb;
  v_existing_action text;
  v_existing_type   text;
  v_subject      text := trim(coalesce(p_subject, ''));
  v_description  text := trim(coalesce(p_description, ''));
  v_priority     text := trim(coalesce(p_priority, 'normal'));
  v_result       jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, result into v_existing_action, v_existing_type, v_existing from public.platform_mutation_requests where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.support_case.opened' or v_existing_type <> 'support_case' then raise exception 'platform_request_id_conflict'; end if;
    return v_existing;
  end if;

  if p_org_id is null or p_actor_id is null or p_policy_version is null or p_policy_version < 1 then
    raise exception 'platform_support_invalid_actor';
  end if;
  if char_length(v_subject) < 1 or char_length(v_subject) > 160 then
    raise exception 'platform_support_invalid_subject';
  end if;
  if char_length(v_description) < 1 or char_length(v_description) > 5000 then
    raise exception 'platform_support_invalid_description';
  end if;
  if v_priority not in ('normal', 'urgent') then
    raise exception 'platform_support_invalid_priority';
  end if;
  if p_first_response_due_at is null then
    raise exception 'platform_support_invalid_deadline';
  end if;

  select * into v_org from public.organizations where id = p_org_id for key share;
  if not found then raise exception 'platform_support_organization_not_found'; end if;

  insert into public.support_cases (
    org_id, created_by, subject, description, priority, status,
    first_response_due_at, policy_version, request_id
  )
  values (
    p_org_id, p_actor_id, v_subject, v_description, v_priority, 'open',
    p_first_response_due_at, p_policy_version, v_request_id
  )
  returning id into v_case_id;

  insert into public.support_case_events (case_id, event_type, to_status, actor_id, actor_email, metadata)
  values (
    v_case_id, 'opened', 'open', p_actor_id, nullif(trim(coalesce(p_actor_email, '')), ''),
    jsonb_build_object('policy_version', p_policy_version, 'request_id', v_request_id)
  );

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    p_org_id, null, 'platform.support_case.opened', 'support_cases', v_case_id, null,
    jsonb_build_object(
      'support_case_id', v_case_id,
      'subject', v_subject,
      'priority', v_priority,
      'status', 'open',
      'first_response_due_at', p_first_response_due_at,
      'policy_version', p_policy_version,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', nullif(trim(coalesce(p_actor_email, '')), ''),
      'request_id', v_request_id
    )
  );

  v_result := jsonb_build_object(
    'support_case_id', v_case_id,
    'org_id', p_org_id,
    'status', 'open',
    'version', 1,
    'first_response_due_at', p_first_response_due_at,
    'request_id', v_request_id
  );
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.support_case.opened', 'support_case', v_case_id, p_actor_id, v_result);
  return v_result;
end;
$$;

create or replace function public.platform_transition_support_case(
  p_case_id          uuid,
  p_expected_version bigint,
  p_to_status        text,
  p_resolution_reason text,
  p_policy_version   integer,
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
  v_case          public.support_cases%rowtype;
  v_request_id    uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing      jsonb;
  v_existing_action text;
  v_existing_type   text;
  v_existing_target uuid;
  v_status        text := trim(coalesce(p_to_status, ''));
  v_reason        text := trim(coalesce(p_resolution_reason, ''));
  v_resolved_at   timestamptz;
  v_next_version  bigint;
  v_result        jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, target_id, result into v_existing_action, v_existing_type, v_existing_target, v_existing from public.platform_mutation_requests where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.support_case.status_changed' or v_existing_type <> 'support_case' or v_existing_target <> p_case_id then raise exception 'platform_request_id_conflict'; end if;
    return v_existing;
  end if;

  if p_case_id is null or p_expected_version is null or p_actor_id is null or p_policy_version is null or p_policy_version < 1 then
    raise exception 'platform_support_invalid_request';
  end if;
  if v_status not in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed') then
    raise exception 'platform_support_invalid_status';
  end if;
  if v_status in ('resolved', 'closed') and char_length(v_reason) < 1 then
    raise exception 'platform_support_resolution_reason_required';
  end if;
  if char_length(v_reason) > 1000 then raise exception 'platform_support_resolution_reason_invalid'; end if;

  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then raise exception 'platform_support_case_not_found'; end if;
  if coalesce(v_case.version, 1) <> p_expected_version then raise exception 'platform_support_case_conflict'; end if;
  if v_case.status = v_status then raise exception 'platform_support_case_already_in_state'; end if;
  if v_case.status = 'closed' and v_status <> 'closed' and char_length(v_reason) < 1 then
    raise exception 'platform_support_reopen_reason_required';
  end if;

  v_next_version := coalesce(v_case.version, 1) + 1;
  v_resolved_at := case when v_status in ('resolved', 'closed') then now() else null end;
  update public.support_cases
  set status = v_status,
      version = v_next_version,
      updated_at = now(),
      resolved_at = v_resolved_at,
      resolution_reason = case when v_status in ('resolved', 'closed') then v_reason else null end
  where id = p_case_id;

  insert into public.support_case_events (case_id, event_type, from_status, to_status, actor_id, actor_email, reason, metadata)
  values (
    p_case_id, 'status_changed', v_case.status, v_status, p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), ''), nullif(v_reason, ''),
    jsonb_build_object('policy_version', p_policy_version, 'request_id', v_request_id)
  );

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_case.org_id, null, 'platform.support_case.status_changed', 'support_cases', p_case_id,
    jsonb_build_object('status', v_case.status, 'version', coalesce(v_case.version, 1)),
    jsonb_build_object(
      'status', v_status,
      'version', v_next_version,
      'resolution_reason', nullif(v_reason, ''),
      'resolved_at', v_resolved_at,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', nullif(trim(coalesce(p_actor_email, '')), ''),
      'policy_version', p_policy_version,
      'request_id', v_request_id,
      'expected_version', p_expected_version
    )
  );

  v_result := jsonb_build_object('support_case_id', p_case_id, 'status', v_status, 'version', v_next_version, 'request_id', v_request_id);
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.support_case.status_changed', 'support_case', p_case_id, p_actor_id, v_result);
  return v_result;
end;
$$;

create or replace function public.platform_assign_support_case(
  p_case_id          uuid,
  p_expected_version bigint,
  p_assignee_id      uuid,
  p_policy_version   integer,
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
  v_case          public.support_cases%rowtype;
  v_operator      public.platform_operators%rowtype;
  v_request_id    uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing      jsonb;
  v_existing_action text;
  v_existing_type   text;
  v_existing_target uuid;
  v_next_version  bigint;
  v_result        jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, target_id, result into v_existing_action, v_existing_type, v_existing_target, v_existing from public.platform_mutation_requests where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.support_case.assigned' or v_existing_type <> 'support_case' or v_existing_target <> p_case_id then raise exception 'platform_request_id_conflict'; end if;
    return v_existing;
  end if;
  if p_case_id is null or p_expected_version is null or p_actor_id is null or p_policy_version is null or p_policy_version < 1 then
    raise exception 'platform_support_invalid_request';
  end if;

  if p_assignee_id is not null then
    select * into v_operator from public.platform_operators
    where id = p_assignee_id and is_active = true and role in ('owner', 'support');
    if not found then raise exception 'platform_support_invalid_assignee'; end if;
  end if;

  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then raise exception 'platform_support_case_not_found'; end if;
  if coalesce(v_case.version, 1) <> p_expected_version then raise exception 'platform_support_case_conflict'; end if;
  if v_case.assigned_to is not distinct from p_assignee_id then raise exception 'platform_support_case_already_assigned'; end if;

  v_next_version := coalesce(v_case.version, 1) + 1;
  update public.support_cases
  set assigned_to = p_assignee_id,
      assigned_at = case when p_assignee_id is null then null else now() end,
      version = v_next_version,
      updated_at = now()
  where id = p_case_id;

  insert into public.support_case_events (case_id, event_type, actor_id, actor_email, metadata)
  values (
    p_case_id,
    case when p_assignee_id is null then 'unassigned' else 'assigned' end,
    p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    jsonb_build_object('assignee_id', p_assignee_id, 'policy_version', p_policy_version, 'request_id', v_request_id)
  );

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_case.org_id, null, 'platform.support_case.assigned', 'support_cases', p_case_id,
    jsonb_build_object('assigned_to', v_case.assigned_to, 'version', coalesce(v_case.version, 1)),
    jsonb_build_object(
      'assigned_to', p_assignee_id,
      'version', v_next_version,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', nullif(trim(coalesce(p_actor_email, '')), ''),
      'policy_version', p_policy_version,
      'request_id', v_request_id
    )
  );

  v_result := jsonb_build_object('support_case_id', p_case_id, 'assigned_to', p_assignee_id, 'version', v_next_version, 'request_id', v_request_id);
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.support_case.assigned', 'support_case', p_case_id, p_actor_id, v_result);
  return v_result;
end;
$$;

create or replace function public.platform_append_support_case_note(
  p_case_id          uuid,
  p_expected_version bigint,
  p_body             text,
  p_note_type        text,
  p_policy_version   integer,
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
  v_case             public.support_cases%rowtype;
  v_note_id          uuid;
  v_request_id       uuid := coalesce(p_request_id, gen_random_uuid());
  v_existing         jsonb;
  v_existing_action  text;
  v_existing_type    text;
  v_existing_target  uuid;
  v_body             text := trim(coalesce(p_body, ''));
  v_note_type        text := trim(coalesce(p_note_type, 'internal'));
  v_next_version     bigint;
  v_first_response_at timestamptz;
  v_result           jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  select action, target_type, target_id, result into v_existing_action, v_existing_type, v_existing_target, v_existing from public.platform_mutation_requests where request_id = v_request_id;
  if found then
    if v_existing_action <> 'platform.support_case.note_added' or v_existing_type <> 'support_case' or v_existing_target <> p_case_id then raise exception 'platform_request_id_conflict'; end if;
    return v_existing;
  end if;
  if p_case_id is null or p_expected_version is null or p_actor_id is null or p_policy_version is null or p_policy_version < 1 then
    raise exception 'platform_support_invalid_request';
  end if;
  if v_note_type not in ('internal', 'operator_response') then raise exception 'platform_support_invalid_note_type'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 5000 then raise exception 'platform_support_invalid_note'; end if;

  select * into v_case from public.support_cases where id = p_case_id for update;
  if not found then raise exception 'platform_support_case_not_found'; end if;
  if coalesce(v_case.version, 1) <> p_expected_version then raise exception 'platform_support_case_conflict'; end if;
  if v_note_type = 'operator_response' and v_case.first_response_at is null then v_first_response_at := now(); end if;
  v_next_version := coalesce(v_case.version, 1) + 1;

  insert into public.support_case_notes (case_id, author_id, author_email, note_type, body)
  values (p_case_id, p_actor_id, nullif(trim(coalesce(p_actor_email, '')), ''), v_note_type, v_body)
  returning id into v_note_id;

  update public.support_cases
  set version = v_next_version,
      updated_at = now(),
      first_response_at = coalesce(v_case.first_response_at, v_first_response_at),
      first_response_by = case when v_case.first_response_at is null and v_first_response_at is not null then p_actor_id else v_case.first_response_by end
  where id = p_case_id;

  insert into public.support_case_events (case_id, event_type, actor_id, actor_email, metadata)
  values (
    p_case_id,
    case when v_note_type = 'operator_response' and v_first_response_at is not null then 'first_response_recorded' else 'note_added' end,
    p_actor_id,
    nullif(trim(coalesce(p_actor_email, '')), ''),
    jsonb_build_object('note_id', v_note_id, 'note_type', v_note_type, 'policy_version', p_policy_version, 'request_id', v_request_id)
  );

  insert into public.audit_logs (org_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_case.org_id, null,
    case when v_note_type = 'operator_response' and v_first_response_at is not null then 'platform.support_case.first_response_recorded' else 'platform.support_case.note_added' end,
    'support_cases', p_case_id,
    jsonb_build_object('version', coalesce(v_case.version, 1), 'first_response_at', v_case.first_response_at),
    jsonb_build_object(
      'note_id', v_note_id,
      'note_type', v_note_type,
      'version', v_next_version,
      'first_response_at', coalesce(v_case.first_response_at, v_first_response_at),
      'platform_actor_id', p_actor_id,
      'platform_actor_email', nullif(trim(coalesce(p_actor_email, '')), ''),
      'policy_version', p_policy_version,
      'request_id', v_request_id
    )
  );

  v_result := jsonb_build_object(
    'support_case_id', p_case_id,
    'note_id', v_note_id,
    'note_type', v_note_type,
    'version', v_next_version,
    'first_response_at', coalesce(v_case.first_response_at, v_first_response_at),
    'request_id', v_request_id
  );
  insert into public.platform_mutation_requests (request_id, action, target_type, target_id, actor_id, result)
  values (v_request_id, 'platform.support_case.note_added', 'support_case', p_case_id, p_actor_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.platform_set_organization_status(uuid, bigint, text, text, uuid, text, integer, uuid) from public;
revoke all on function public.platform_open_support_case(uuid, text, text, text, timestamptz, integer, uuid, text, uuid) from public;
revoke all on function public.platform_transition_support_case(uuid, bigint, text, text, integer, uuid, text, uuid) from public;
revoke all on function public.platform_assign_support_case(uuid, bigint, uuid, integer, uuid, text, uuid) from public;
revoke all on function public.platform_append_support_case_note(uuid, bigint, text, text, integer, uuid, text, uuid) from public;

grant execute on function public.platform_set_organization_status(uuid, bigint, text, text, uuid, text, integer, uuid) to service_role;
grant execute on function public.platform_open_support_case(uuid, text, text, text, timestamptz, integer, uuid, text, uuid) to service_role;
grant execute on function public.platform_transition_support_case(uuid, bigint, text, text, integer, uuid, text, uuid) to service_role;
grant execute on function public.platform_assign_support_case(uuid, bigint, uuid, integer, uuid, text, uuid) to service_role;
grant execute on function public.platform_append_support_case_note(uuid, bigint, text, text, integer, uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
