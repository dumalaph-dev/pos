-- Reconcile an online pickup with the normal POS sale ledger.
-- The POS sends the online order id through its local outbox. The handoff is
-- completed only after place_order succeeds, so offline sales remain safe.

alter table public.online_orders
  add column if not exists pos_order_id uuid references public.orders(id) on delete set null;

create unique index if not exists online_orders_pos_order_id_unique_idx
  on public.online_orders (pos_order_id)
  where pos_order_id is not null;

create or replace function public.complete_online_order(
  p_online_order_id uuid,
  p_pos_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_online online_orders%rowtype;
  v_pos orders%rowtype;
begin
  if auth.uid() is null or p_online_order_id is null or p_pos_order_id is null then
    raise exception 'a signed-in pickup handoff requires both order ids';
  end if;

  select * into v_online
  from online_orders
  where id = p_online_order_id
  for update;

  if not found or v_online.org_id <> auth_org_id()
     or (not auth_is_admin() and v_online.store_id <> auth_store_id()) then
    raise exception 'online order is not available to this terminal';
  end if;

  -- Replays are expected when a sync response is interrupted. A previously
  -- linked order is safe only when it is the same POS sale.
  if v_online.pos_order_id is not null then
    if v_online.pos_order_id = p_pos_order_id then
      return true;
    end if;
    raise exception 'online order has already been linked to another POS sale';
  end if;

  if v_online.status = 'cancelled' then
    raise exception 'a cancelled online order cannot be handed off';
  end if;

  select * into v_pos
  from orders
  where id = p_pos_order_id
    and org_id = v_online.org_id
    and store_id = v_online.store_id
    and cashier_id = auth.uid()
    and status = 'completed';

  if not found then
    raise exception 'the completed POS sale could not be verified';
  end if;

  update online_orders
  set pos_order_id = v_pos.id,
      status = 'picked_up',
      picked_up_at = coalesce(picked_up_at, now())
  where id = v_online.id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_online.org_id,
    v_online.store_id,
    auth.uid(),
    'online_order.picked_up',
    'online_orders',
    v_online.id,
    jsonb_build_object('pos_order_id', v_pos.id, 'order_no', v_online.order_no)
  );

  return true;
end;
$$;

revoke all on function public.complete_online_order(uuid, uuid) from public;
revoke all on function public.complete_online_order(uuid, uuid) from anon;
grant execute on function public.complete_online_order(uuid, uuid) to authenticated;
