-- Fix branch-wide shift labels under cashier RLS.
--
-- open_shift used to run as SECURITY INVOKER. A cashier could therefore only
-- see their own shifts while the branch-day sequence was being calculated,
-- allowing two cashiers to receive the same SH-YYMMDD-NNN label. Keep the
-- caller's branch check explicit, then calculate the label as the definer so
-- the locked branch-wide read sees every cashier's shifts.

create or replace function open_shift(
  p_store_id uuid,
  p_device_id uuid default null,
  p_opening_cash bigint default 0
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_shift_id uuid;
  v_shift_no text;
  v_day text;
  v_seq int;
begin
  if v_actor_id is null then
    raise exception 'sign in before opening a shift';
  end if;

  if p_store_id is null then
    raise exception 'a branch is required to open a shift';
  end if;

  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'the opening cash float cannot be negative';
  end if;

  if coalesce(p_opening_cash, 0) > 100000000 then
    raise exception 'the opening cash float is too large';
  end if;

  -- SECURITY DEFINER bypasses the cashier's shifts RLS for the sequence read,
  -- so preserve the original branch boundary explicitly before any write.
  if not exists (
    select 1
    from stores
    where id = p_store_id
      and org_id = v_org_id
      and id = auth_store_id()
  ) then
    raise exception 'that branch is not available in your organization';
  end if;

  if exists (
    select 1 from shifts
    where store_id = p_store_id and cashier_id = v_actor_id and closed_at is null
  ) then
    raise exception 'you already have an open shift at this branch';
  end if;

  -- Human-readable label: SH-YYMMDD-NNN, allocated across every cashier at
  -- the branch for the Singapore business day. The advisory lock serializes
  -- concurrent opens; max() also preserves the sequence across old gaps or
  -- duplicate labels created by the pre-fix function.
  v_day := to_char(now() at time zone 'Asia/Singapore', 'YYMMDD');
  perform pg_advisory_xact_lock(hashtext('shift_no:' || p_store_id::text));
  select coalesce(max((substring(shift_no from '([0-9]+)$'))::int), 0) + 1
    into v_seq
  from shifts
  where store_id = p_store_id
    and (opened_at at time zone 'Asia/Singapore')::date
        = (now() at time zone 'Asia/Singapore')::date
    and shift_no ~ '^SH-[0-9]{6}-[0-9]+$';
  v_shift_no := 'SH-' || v_day || '-' || lpad(v_seq::text, 3, '0');

  insert into shifts (org_id, store_id, device_id, cashier_id, opening_cash, shift_no)
  values (v_org_id, p_store_id, p_device_id, v_actor_id, coalesce(p_opening_cash, 0), v_shift_no)
  returning id into v_shift_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    p_store_id,
    v_actor_id,
    'shift.opened',
    'shifts',
    v_shift_id,
    jsonb_build_object(
      'shift_no', v_shift_no,
      'opening_cash', coalesce(p_opening_cash, 0),
      'device_id', p_device_id
    )
  );

  return v_shift_id;
end;
$$;

grant execute on function open_shift(uuid, uuid, bigint) to authenticated;
