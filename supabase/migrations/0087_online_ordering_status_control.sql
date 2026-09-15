-- Give operational POS roles a narrow online-ordering switch. This does not
-- grant cashiers access to the broader fulfillment settings payload or pause
-- in-store register sales.

create or replace function public.set_online_ordering_status(
  p_store_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
  v_org_id uuid;
begin
  if v_actor_id is null
     or auth_role() not in ('admin'::user_role, 'manager'::user_role, 'cashier'::user_role) then
    raise exception 'only an authorized POS employee can change online ordering status';
  end if;
  if p_store_id is null or p_enabled is null then
    raise exception 'online ordering status input is invalid';
  end if;

  select org_id, settings
    into v_org_id, v_before
  from public.stores
  where id = p_store_id
    and org_id = auth_org_id()
    and (auth_is_admin() or id = auth_store_id())
    and is_active = true
  for update;

  if not found then
    raise exception 'that branch is not available to this POS terminal';
  end if;

  v_after := coalesce(v_before->'online_ordering', '{}'::jsonb)
    || jsonb_build_object('enabled', p_enabled);

  update public.stores
     set settings = coalesce(v_before, '{}'::jsonb)
       || jsonb_build_object('online_ordering', v_after)
   where id = p_store_id;

  insert into public.audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_org_id,
    p_store_id,
    v_actor_id,
    'online_order.status_changed',
    'stores',
    p_store_id,
    coalesce(v_before->'online_ordering', '{}'::jsonb),
    v_after
  );

  return true;
end;
$$;

revoke all on function public.set_online_ordering_status(uuid, boolean) from public;
grant execute on function public.set_online_ordering_status(uuid, boolean) to authenticated;
