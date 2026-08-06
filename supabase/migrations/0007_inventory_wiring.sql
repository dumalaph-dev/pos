-- Dumala POS — inventory ledger wiring (P7 first slice).
--
-- Stock is derived from append-only movements. Manual movements are recorded
-- through an authenticated RPC so the movement and its audit row are atomic.
-- POS sales are recorded inside the idempotent place_order transaction below.

create or replace function record_stock_movement(
  p_store_id uuid,
  p_product_id uuid,
  p_type stock_movement_type,
  p_qty numeric,
  p_unit_cost bigint default null,
  p_reason text default null
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid;
  v_unit text;
  v_track_stock boolean;
begin
  if not auth_is_admin() then
    raise exception 'only admins can record stock movements';
  end if;

  if p_type = 'sale' then
    raise exception 'sales are recorded by the POS order flow';
  end if;

  if p_qty = 0 or (p_type <> 'adjust' and p_qty < 0) then
    raise exception 'movement quantity is invalid';
  end if;

  if p_type in ('waste', 'adjust') and nullif(trim(p_reason), '') is null then
    raise exception 'a reason is required for waste and adjustment movements';
  end if;

  select p.org_id, p.unit, p.track_stock
    into v_org_id, v_unit, v_track_stock
  from products p
  where p.id = p_product_id
    and p.store_id = p_store_id;

  if v_org_id is null then
    raise exception 'product and branch must belong to the same organization';
  end if;

  if not v_track_stock then
    raise exception 'enable stock tracking for this product first';
  end if;

  if not exists (
    select 1 from stores s
    where s.id = p_store_id and s.org_id = v_org_id
  ) then
    raise exception 'branch is not valid for the product organization';
  end if;

  insert into stock_movements (
    org_id, store_id, product_id, type, qty, unit, unit_cost, reason, actor_id
  )
  values (
    v_org_id,
    p_store_id,
    p_product_id,
    p_type,
    p_qty,
    v_unit,
    p_unit_cost,
    nullif(trim(p_reason), ''),
    auth.uid()
  )
  returning id into v_id;

  insert into audit_logs (
    org_id, store_id, actor_id, action, entity, entity_id, after
  )
  values (
    v_org_id,
    p_store_id,
    auth.uid(),
    'stock.movement.created',
    'stock_movements',
    v_id,
    jsonb_build_object(
      'product_id', p_product_id,
      'type', p_type,
      'qty', p_qty,
      'unit', v_unit,
      'unit_cost', p_unit_cost,
      'reason', nullif(trim(p_reason), '')
    )
  );

  return v_id;
end;
$$;

grant execute on function record_stock_movement(uuid, uuid, stock_movement_type, numeric, bigint, text)
  to authenticated;

create or replace function place_order(p_order jsonb, p_items jsonb)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_id uuid;
  v_created boolean;
  v_org_id uuid;
  v_store_id uuid;
begin
  v_org_id := (p_order->>'org_id')::uuid;
  v_store_id := (p_order->>'store_id')::uuid;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'an order must contain at least one item';
  end if;

  -- Validate the product scope before writing anything. This also makes sure
  -- the sale ledger cannot be pointed at another branch or organization.
  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    left join products p on p.id = (i->>'product_id')::uuid
    where p.id is null
      or p.org_id <> v_org_id
      or p.store_id <> v_store_id
      or (p.pricing_mode = 'per_kg' and coalesce(nullif(i->>'weight_kg', '')::numeric, 0) <= 0)
      or (p.pricing_mode <> 'per_kg' and coalesce(nullif(i->>'qty', '')::numeric, 0) <= 0)
  ) then
    raise exception 'order contains an invalid product or quantity';
  end if;

  insert into orders (
    local_uuid, org_id, store_id, device_id, order_no, cashier_id, status,
    subtotal, discount_type, discount_amount, discount_ref,
    vatable_sale, vat_amount, vat_exempt_sale, total,
    payment_method, payment_ref, amount_tendered, change_due, note,
    created_at_device
  )
  select
    (p_order->>'local_uuid')::uuid,
    v_org_id,
    v_store_id,
    nullif(p_order->>'device_id', '')::uuid,
    p_order->>'order_no',
    (p_order->>'cashier_id')::uuid,
    coalesce(p_order->>'status', 'completed')::order_status,
    (p_order->>'subtotal')::bigint,
    coalesce(p_order->>'discount_type', 'none')::discount_type,
    coalesce((p_order->>'discount_amount')::bigint, 0),
    p_order->>'discount_ref',
    coalesce((p_order->>'vatable_sale')::bigint, 0),
    coalesce((p_order->>'vat_amount')::bigint, 0),
    coalesce((p_order->>'vat_exempt_sale')::bigint, 0),
    (p_order->>'total')::bigint,
    (p_order->>'payment_method')::payment_method,
    p_order->>'payment_ref',
    nullif(p_order->>'amount_tendered', '')::bigint,
    nullif(p_order->>'change_due', '')::bigint,
    p_order->>'note',
    (p_order->>'created_at_device')::timestamptz
  on conflict (local_uuid) do nothing
  returning id into v_id;

  v_created := v_id is not null;

  if not v_created then
    -- Offline replay of an already-synced order: do not add items, audit, or
    -- stock movements a second time.
    select id into v_id
    from orders
    where local_uuid = (p_order->>'local_uuid')::uuid;
    return v_id;
  end if;

  insert into order_items (
    order_id, product_id, name_snapshot, pricing_mode_snapshot,
    unit_price_snapshot, qty, weight_kg, line_total
  )
  select
    v_id,
    (i->>'product_id')::uuid,
    i->>'name_snapshot',
    (i->>'pricing_mode_snapshot')::pricing_mode,
    (i->>'unit_price_snapshot')::bigint,
    (i->>'qty')::numeric,
    nullif(i->>'weight_kg', '')::numeric,
    (i->>'line_total')::bigint
  from jsonb_array_elements(p_items) i;

  insert into stock_movements (
    org_id, store_id, product_id, type, qty, unit, ref_order_id, actor_id
  )
  select
    v_org_id,
    v_store_id,
    p.id,
    'sale'::stock_movement_type,
    case
      when p.pricing_mode = 'per_kg' then nullif(i->>'weight_kg', '')::numeric
      else (i->>'qty')::numeric
    end,
    p.unit,
    v_id,
    (p_order->>'cashier_id')::uuid
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'product_id')::uuid
  where p.track_stock
    and coalesce(p_order->>'status', 'completed') = 'completed';

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    v_store_id,
    (p_order->>'cashier_id')::uuid,
    'order.created',
    'orders',
    v_id,
    jsonb_build_object('order_no', p_order->>'order_no', 'total', p_order->>'total')
  );

  return v_id;
end;
$$;

grant execute on function place_order(jsonb, jsonb) to authenticated;
