-- Let branch cashiers move online orders through the preparation queue without
-- exposing a general UPDATE policy on online_orders. Final pickup handoff still
-- happens through complete_online_order after the POS sale is completed.

create or replace function public.advance_online_order_status(
  p_online_order_id uuid,
  p_next_status public.online_order_status
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_order public.online_orders%rowtype;
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'a signed-in employee is required to update the online queue';
  end if;

  if auth_role() not in ('admin'::user_role, 'manager'::user_role, 'cashier'::user_role) then
    raise exception 'your role cannot update the online queue';
  end if;

  if p_online_order_id is null then
    raise exception 'an online order is required';
  end if;

  if p_next_status not in (
    'confirmed'::public.online_order_status,
    'preparing'::public.online_order_status,
    'ready'::public.online_order_status
  ) then
    raise exception 'that online order transition is not available from the POS';
  end if;

  select *
    into v_order
    from public.online_orders
   where id = p_online_order_id
   for update;

  if not found
     or v_order.org_id <> auth_org_id()
     or (not auth_is_admin() and v_order.store_id <> auth_store_id()) then
    raise exception 'that online order is not available to this terminal';
  end if;

  if (v_order.status::text, p_next_status::text) not in (
    ('new', 'confirmed'),
    ('confirmed', 'preparing'),
    ('preparing', 'ready')
  ) then
    raise exception 'the online order has already moved to another step';
  end if;

  update public.online_orders
     set status = p_next_status,
         confirmed_at = case
           when p_next_status in ('confirmed'::public.online_order_status, 'preparing'::public.online_order_status, 'ready'::public.online_order_status)
             then coalesce(confirmed_at, v_now)
           else confirmed_at
         end,
         ready_at = case
           when p_next_status = 'ready'::public.online_order_status then coalesce(ready_at, v_now)
           else ready_at
         end
   where id = v_order.id;

  insert into public.audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_order.org_id,
    v_order.store_id,
    v_actor_id,
    'online_order.status_changed',
    'online_orders',
    v_order.id,
    jsonb_build_object(
      'order_no', v_order.order_no,
      'from_status', v_order.status,
      'to_status', p_next_status
    )
  );

  return true;
end;
$$;

revoke all on function public.advance_online_order_status(uuid, public.online_order_status) from public;
revoke all on function public.advance_online_order_status(uuid, public.online_order_status) from anon;
grant execute on function public.advance_online_order_status(uuid, public.online_order_status) to authenticated;
