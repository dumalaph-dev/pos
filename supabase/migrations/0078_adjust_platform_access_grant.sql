-- Adjust an existing complimentary grant in place.
--
-- Revoke-and-recreate produced two grant rows and detached the original
-- reason from the access window. This RPC keeps one row, moves only its end
-- date, and records the complete before/after window in one atomic audit row.

alter table public.platform_access_grants
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.adjust_platform_access_grant(
  p_grant_id    uuid,
  p_delta_days  integer,
  p_reason      text,
  p_actor_id    uuid default null,
  p_actor_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grant          public.platform_access_grants%rowtype;
  v_reason         text := trim(coalesce(p_reason, ''));
  v_actor_email    text := nullif(trim(coalesce(p_actor_email, '')), '');
  v_updated_at     timestamptz := now();
  v_new_ends_at    timestamptz;
begin
  if p_grant_id is null then
    raise exception 'platform_access_invalid_grant';
  end if;

  if p_actor_id is null then
    raise exception 'platform_access_invalid_actor';
  end if;

  if p_delta_days is null or p_delta_days = 0 or p_delta_days < -365 or p_delta_days > 365 then
    raise exception 'platform_access_invalid_delta_days';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'platform_access_invalid_adjustment_reason';
  end if;

  -- Lock the row so two operators cannot both adjust the same end date from
  -- the same console snapshot.
  select *
    into v_grant
  from public.platform_access_grants
  where id = p_grant_id
  for update;

  if not found then
    raise exception 'platform_access_grant_not_found';
  end if;

  if v_grant.status <> 'active' then
    raise exception 'platform_access_grant_not_active';
  end if;

  if v_grant.ends_at <= v_updated_at then
    raise exception 'platform_access_grant_expired';
  end if;

  v_new_ends_at := v_grant.ends_at + make_interval(days => p_delta_days);
  -- Shortening is not revocation. Keep the row valid and leave immediate
  -- access removal to the explicit revoke action.
  if v_new_ends_at <= v_updated_at or v_new_ends_at <= v_grant.starts_at then
    raise exception 'platform_access_invalid_adjusted_window';
  end if;

  update public.platform_access_grants
  set
    ends_at = v_new_ends_at,
    updated_by = p_actor_id,
    updated_at = v_updated_at
  where id = v_grant.id;

  insert into public.audit_logs (
    org_id,
    actor_id,
    action,
    entity,
    entity_id,
    before,
    after
  )
  values (
    v_grant.org_id,
    null,
    'platform.access_grant.adjusted',
    'platform_access_grants',
    v_grant.id,
    jsonb_build_object(
      'grant_id', v_grant.id,
      'source', v_grant.source,
      'status', v_grant.status,
      'starts_at', v_grant.starts_at,
      'ends_at', v_grant.ends_at,
      'reason', v_grant.reason,
      'updated_at', v_grant.updated_at
    ),
    jsonb_build_object(
      'grant_id', v_grant.id,
      'source', v_grant.source,
      'status', v_grant.status,
      'starts_at', v_grant.starts_at,
      'ends_at', v_new_ends_at,
      'reason', v_grant.reason,
      'adjustment_reason', v_reason,
      'delta_days', p_delta_days,
      'updated_at', v_updated_at,
      'platform_actor_id', p_actor_id,
      'operator_id', p_actor_id,
      'platform_actor_email', v_actor_email
    )
  );

  return jsonb_build_object(
    'grant_id', v_grant.id,
    'org_id', v_grant.org_id,
    'source', v_grant.source,
    'status', v_grant.status,
    'starts_at', v_grant.starts_at,
    'previous_ends_at', v_grant.ends_at,
    'ends_at', v_new_ends_at,
    'reason', v_grant.reason,
    'adjustment_reason', v_reason,
    'delta_days', p_delta_days
  );
end;
$$;

revoke all on function public.adjust_platform_access_grant(uuid, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.adjust_platform_access_grant(uuid, integer, text, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
