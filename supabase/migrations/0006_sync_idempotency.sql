-- Dumala POS — make place_order idempotent for offline sync (P2).
--
-- Replays of the same order (same local_uuid) return the existing order id
-- without inserting items/audit again. The offline outbox can therefore
-- retry forever without duplicating anything.
create or replace function place_order(p_order jsonb, p_items jsonb)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_id uuid;
  v_created boolean;
begin
  insert into orders (
    local_uuid, org_id, store_id, device_id, order_no, cashier_id, status,
    subtotal, discount_type, discount_amount, discount_ref,
    vatable_sale, vat_amount, vat_exempt_sale, total,
    payment_method, payment_ref, amount_tendered, change_due, note,
    created_at_device
  )
  select
    (p_order->>'local_uuid')::uuid,
    (p_order->>'org_id')::uuid,
    (p_order->>'store_id')::uuid,
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
    -- Replay of an already-synced order: return its id, touch nothing.
    select id into v_id from orders where local_uuid = (p_order->>'local_uuid')::uuid;
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

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    (p_order->>'org_id')::uuid,
    (p_order->>'store_id')::uuid,
    (p_order->>'cashier_id')::uuid,
    'order.created',
    'orders',
    v_id,
    jsonb_build_object('order_no', p_order->>'order_no', 'total', p_order->>'total')
  );

  return v_id;
end;
$$;
