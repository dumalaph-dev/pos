-- Platform operator membership and role model.
--
-- The operator console currently uses PLATFORM_ADMIN_EMAILS as a flat
-- allowlist. Keep that allowlist as the owner bootstrap/recovery path, while
-- this table lets the owner manage additional operators without a redeploy.
-- Operator records are service-role-only because they are cross-organization
-- identities, not tenant data.

create table if not exists public.platform_operators (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null default 'read_only',
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  revoked_by  uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz,
  metadata    jsonb not null default '{}',
  constraint platform_operators_email_length_check
    check (char_length(email) between 3 and 320),
  constraint platform_operators_email_normalized_check
    check (email = lower(trim(email))),
  constraint platform_operators_role_check
    check (role in ('owner', 'billing', 'support', 'read_only')),
  constraint platform_operators_active_state_check
    check (is_active or revoked_at is not null)
);

create unique index if not exists platform_operators_email_idx
  on public.platform_operators (lower(email));

create index if not exists platform_operators_active_role_idx
  on public.platform_operators (is_active, role, created_at desc);

create table if not exists public.platform_operator_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  operator_id  uuid not null references public.platform_operators(id) on delete restrict,
  action       text not null,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_email  text,
  before       jsonb,
  after        jsonb,
  created_at   timestamptz not null default now(),
  constraint platform_operator_audit_action_check
    check (action in (
      'platform.operator.invited',
      'platform.operator.reactivated',
      'platform.operator.role_changed',
      'platform.operator.revoked'
    ))
);

create index if not exists platform_operator_audit_operator_created_idx
  on public.platform_operator_audit_logs (operator_id, created_at desc);

create index if not exists platform_operator_audit_created_idx
  on public.platform_operator_audit_logs (created_at desc);

alter table public.platform_operators enable row level security;
alter table public.platform_operator_audit_logs enable row level security;

revoke all on table public.platform_operators, public.platform_operator_audit_logs
  from anon, authenticated, public;
grant all on table public.platform_operators, public.platform_operator_audit_logs
  to service_role;

do $$
begin
  if to_regprocedure('public.forbid_mutation()') is not null
    and not exists (
      select 1
      from pg_trigger
      where tgname = 'no_mutate_platform_operator_audit'
        and tgrelid = 'public.platform_operator_audit_logs'::regclass
    ) then
    create trigger no_mutate_platform_operator_audit
      before update or delete on public.platform_operator_audit_logs
      for each row execute function public.forbid_mutation();
  end if;
end;
$$;

-- Add or re-activate an operator. Keeping the row on reactivation preserves
-- the identity and its prior history instead of creating a second membership.
create or replace function public.create_platform_operator(
  p_email        text,
  p_role         text,
  p_actor_id     uuid,
  p_actor_email  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email         text := lower(trim(coalesce(p_email, '')));
  v_role          text := lower(trim(coalesce(p_role, '')));
  v_actor_email   text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_existing      public.platform_operators%rowtype;
  v_operator_id   uuid;
  v_action        text;
  v_reactivated   boolean := false;
begin
  if p_actor_id is null then
    raise exception 'platform_operator_invalid_actor';
  end if;

  if char_length(v_email) < 3 or char_length(v_email) > 320
    or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'platform_operator_invalid_email';
  end if;

  if v_role not in ('owner', 'billing', 'support', 'read_only') then
    raise exception 'platform_operator_invalid_role';
  end if;

  select *
    into v_existing
  from public.platform_operators
  where email = v_email
  for update;

  if found and v_existing.is_active then
    raise exception 'platform_operator_already_active';
  elsif found then
    update public.platform_operators
    set
      role = v_role,
      is_active = true,
      updated_by = p_actor_id,
      updated_at = now(),
      revoked_by = null,
      revoked_at = null
    where id = v_existing.id;

    v_operator_id := v_existing.id;
    v_action := 'platform.operator.reactivated';
    v_reactivated := true;
  else
    insert into public.platform_operators (
      email,
      role,
      is_active,
      created_by,
      updated_by
    )
    values (
      v_email,
      v_role,
      true,
      p_actor_id,
      p_actor_id
    )
    returning id into v_operator_id;

    v_action := 'platform.operator.invited';
  end if;

  insert into public.platform_operator_audit_logs (
    operator_id,
    action,
    actor_id,
    actor_email,
    before,
    after
  )
  values (
    v_operator_id,
    v_action,
    p_actor_id,
    v_actor_email,
    case when v_reactivated then jsonb_build_object(
      'email', v_existing.email,
      'role', v_existing.role,
      'is_active', v_existing.is_active,
      'revoked_at', v_existing.revoked_at
    ) else null end,
    jsonb_build_object(
      'email', v_email,
      'role', v_role,
      'is_active', true,
      'reactivated', v_reactivated,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', v_actor_email
    )
  );

  return jsonb_build_object(
    'operator_id', v_operator_id,
    'email', v_email,
    'role', v_role,
    'is_active', true,
    'reactivated', v_reactivated
  );
end;
$$;

-- Change a live operator's role while preserving the old role in the audit
-- row. The final active owner cannot be demoted.
create or replace function public.change_platform_operator_role(
  p_operator_id  uuid,
  p_role         text,
  p_actor_id     uuid,
  p_actor_email  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        text := lower(trim(coalesce(p_role, '')));
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_operator    public.platform_operators%rowtype;
begin
  if p_actor_id is null then
    raise exception 'platform_operator_invalid_actor';
  end if;

  if p_operator_id is null then
    raise exception 'platform_operator_invalid_operator';
  end if;

  if v_role not in ('owner', 'billing', 'support', 'read_only') then
    raise exception 'platform_operator_invalid_role';
  end if;

  select *
    into v_operator
  from public.platform_operators
  where id = p_operator_id
  for update;

  if not found then
    raise exception 'platform_operator_not_found';
  end if;

  if not v_operator.is_active then
    raise exception 'platform_operator_not_active';
  end if;

  if v_operator.role = v_role then
    raise exception 'platform_operator_same_role';
  end if;

  if v_operator.role = 'owner'
    and v_role <> 'owner'
    and not exists (
      select 1
      from public.platform_operators other_operator
      where other_operator.id <> v_operator.id
        and other_operator.is_active
        and other_operator.role = 'owner'
    ) then
    raise exception 'platform_operator_last_owner';
  end if;

  update public.platform_operators
  set
    role = v_role,
    updated_by = p_actor_id,
    updated_at = now()
  where id = v_operator.id;

  insert into public.platform_operator_audit_logs (
    operator_id,
    action,
    actor_id,
    actor_email,
    before,
    after
  )
  values (
    v_operator.id,
    'platform.operator.role_changed',
    p_actor_id,
    v_actor_email,
    jsonb_build_object(
      'email', v_operator.email,
      'role', v_operator.role,
      'is_active', v_operator.is_active
    ),
    jsonb_build_object(
      'email', v_operator.email,
      'role', v_role,
      'is_active', true,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', v_actor_email
    )
  );

  return jsonb_build_object(
    'operator_id', v_operator.id,
    'email', v_operator.email,
    'previous_role', v_operator.role,
    'role', v_role,
    'is_active', true
  );
end;
$$;

-- Revoke membership without deleting identity or history. The final active
-- owner is protected so the table cannot lock the console by itself.
create or replace function public.revoke_platform_operator(
  p_operator_id  uuid,
  p_actor_id     uuid,
  p_actor_email  text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_email text := nullif(lower(trim(coalesce(p_actor_email, ''))), '');
  v_operator    public.platform_operators%rowtype;
  v_revoked_at  timestamptz := now();
begin
  if p_actor_id is null then
    raise exception 'platform_operator_invalid_actor';
  end if;

  if p_operator_id is null then
    raise exception 'platform_operator_invalid_operator';
  end if;

  select *
    into v_operator
  from public.platform_operators
  where id = p_operator_id
  for update;

  if not found then
    raise exception 'platform_operator_not_found';
  end if;

  if not v_operator.is_active then
    raise exception 'platform_operator_not_active';
  end if;

  if v_operator.role = 'owner'
    and not exists (
      select 1
      from public.platform_operators other_operator
      where other_operator.id <> v_operator.id
        and other_operator.is_active
        and other_operator.role = 'owner'
    ) then
    raise exception 'platform_operator_last_owner';
  end if;

  update public.platform_operators
  set
    is_active = false,
    updated_by = p_actor_id,
    updated_at = v_revoked_at,
    revoked_by = p_actor_id,
    revoked_at = v_revoked_at
  where id = v_operator.id;

  insert into public.platform_operator_audit_logs (
    operator_id,
    action,
    actor_id,
    actor_email,
    before,
    after
  )
  values (
    v_operator.id,
    'platform.operator.revoked',
    p_actor_id,
    v_actor_email,
    jsonb_build_object(
      'email', v_operator.email,
      'role', v_operator.role,
      'is_active', v_operator.is_active
    ),
    jsonb_build_object(
      'email', v_operator.email,
      'role', v_operator.role,
      'is_active', false,
      'revoked_at', v_revoked_at,
      'platform_actor_id', p_actor_id,
      'platform_actor_email', v_actor_email
    )
  );

  return jsonb_build_object(
    'operator_id', v_operator.id,
    'email', v_operator.email,
    'role', v_operator.role,
    'is_active', false,
    'revoked_at', v_revoked_at
  );
end;
$$;

revoke all on function public.create_platform_operator(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_platform_operator(text, text, uuid, text)
  to service_role;

revoke all on function public.change_platform_operator_role(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.change_platform_operator_role(uuid, text, uuid, text)
  to service_role;

revoke all on function public.revoke_platform_operator(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_platform_operator(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
