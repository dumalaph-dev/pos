-- Add delivery as a first-class online-order fulfillment mode.
-- Payment remains offline: pickup orders are paid at pickup and delivery
-- orders are paid on delivery until an online payment provider is enabled.

alter table public.online_orders
  add column if not exists fulfillment_method text not null default 'pickup',
  add column if not exists delivery_address text,
  add column if not exists delivery_note text,
  add column if not exists delivery_fee bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'online_orders_fulfillment_method_check'
  ) then
    alter table public.online_orders
      add constraint online_orders_fulfillment_method_check
      check (fulfillment_method in ('pickup', 'delivery'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'online_orders_delivery_fee_check'
  ) then
    alter table public.online_orders
      add constraint online_orders_delivery_fee_check
      check (delivery_fee >= 0);
  end if;
end;
$$;

drop function if exists public.place_online_order(uuid, uuid, text, text, text, text, integer, integer, jsonb);

create or replace function public.place_online_order(
  p_store_id uuid,
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_pickup_slot text,
  p_delivery_address text,
  p_delivery_note text,
  p_note text,
  p_average_prep_minutes integer,
  p_order_lead_minutes integer,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_org_id uuid;
  v_store_settings jsonb;
  v_existing online_orders%rowtype;
  v_order_id uuid;
  v_order_no text;
  v_customer_name text;
  v_customer_phone text;
  v_fulfillment_method text;
  v_pickup_slot text;
  v_delivery_address text;
  v_delivery_note text;
  v_note text;
  v_pickup_date date;
  v_queue_count integer;
  v_queue_position integer;
  v_average_prep_minutes integer;
  v_order_lead_minutes integer;
  v_delivery_eta_minutes integer;
  v_delivery_fee bigint := 0;
  v_delivery_enabled boolean;
  v_total bigint;
  v_eta_at timestamptz;
  v_scheduled_at timestamptz;
  v_item jsonb;
  v_product_id uuid;
  v_product_name text;
  v_pricing_mode pricing_mode;
  v_unit_price bigint;
  v_qty numeric;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_seen_product_ids uuid[] := '{}'::uuid[];
begin
  if p_store_id is null or p_request_id is null then
    raise exception 'store and request ids are required';
  end if;

  -- Serialize queue assignment per store. The unique request key handles
  -- retries, while this lock keeps simultaneous checkouts from sharing a
  -- queue position.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select org_id, settings
    into v_store_org_id, v_store_settings
  from stores
  where id = p_store_id
    and is_active = true;

  if v_store_org_id is null then
    raise exception 'store is not available';
  end if;

  select * into v_existing
  from online_orders
  where store_id = p_store_id
    and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_no', v_existing.order_no,
      'queue_position', v_existing.queue_position,
      'eta_at', v_existing.eta_at,
      'total', v_existing.total,
      'fulfillment_method', v_existing.fulfillment_method
    );
  end if;

  if coalesce((v_store_settings #>> '{online_ordering,enabled}')::boolean, false) is not true then
    raise exception 'online ordering is disabled';
  end if;

  v_customer_name := btrim(coalesce(p_customer_name, ''));
  v_customer_phone := btrim(coalesce(p_customer_phone, ''));
  v_fulfillment_method := coalesce(nullif(btrim(p_fulfillment_method), ''), 'pickup');
  v_pickup_slot := coalesce(nullif(btrim(p_pickup_slot), ''), 'asap');
  v_delivery_address := btrim(coalesce(p_delivery_address, ''));
  v_delivery_note := btrim(coalesce(p_delivery_note, ''));
  v_note := btrim(coalesce(p_note, ''));
  v_delivery_enabled := coalesce((v_store_settings #>> '{online_ordering,delivery,enabled}')::boolean, false);
  v_delivery_fee := greatest(0, least(1000000, coalesce((v_store_settings #>> '{online_ordering,delivery,fee_centavos}')::bigint, 0)));
  v_delivery_eta_minutes := greatest(15, least(180, coalesce((v_store_settings #>> '{online_ordering,delivery,eta_minutes}')::integer, 45)));

  if v_fulfillment_method not in ('pickup', 'delivery') then
    raise exception 'fulfillment method is invalid';
  end if;
  if v_fulfillment_method = 'delivery' and not v_delivery_enabled then
    raise exception 'delivery is not available';
  end if;
  if v_fulfillment_method = 'delivery' and (length(v_delivery_address) < 8 or length(v_delivery_address) > 240) then
    raise exception 'delivery address is invalid';
  end if;
  if v_fulfillment_method = 'delivery' and length(v_delivery_note) > 160 then
    raise exception 'delivery note is invalid';
  end if;
  if v_fulfillment_method = 'pickup' then
    v_delivery_address := null;
    v_delivery_note := null;
    v_delivery_fee := 0;
  end if;
  if length(v_customer_name) < 2 or length(v_customer_name) > 80 then
    raise exception 'customer name is invalid';
  end if;
  if length(v_customer_phone) < 5 or length(v_customer_phone) > 40 then
    raise exception 'customer phone is invalid';
  end if;
  if length(v_note) > 240 then
    raise exception 'order note is invalid';
  end if;
  if v_pickup_slot <> 'asap' and v_pickup_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'pickup time is invalid';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 40 then
    raise exception 'order items are invalid';
  end if;

  v_pickup_date := timezone('Asia/Singapore', now())::date;
  v_average_prep_minutes := greatest(5, least(180, coalesce(p_average_prep_minutes, 20)));
  v_order_lead_minutes := greatest(0, least(180, coalesce(p_order_lead_minutes, 15)));

  for v_item in select item.value from jsonb_array_elements(p_items) as item(value) loop
    begin
      v_product_id := (v_item->>'productId')::uuid;
      v_qty := (v_item->>'qty')::numeric;
    exception when invalid_text_representation then
      raise exception 'order item is invalid';
    end;

    if v_product_id is null or v_qty is null or v_qty <= 0 or v_qty > 20 then
      raise exception 'order item quantity is invalid';
    end if;
    if v_qty <> trunc(v_qty) then
      raise exception 'order item quantity must be a whole number';
    end if;
    if v_product_id = any(v_seen_product_ids) then
      raise exception 'order contains a duplicate item';
    end if;
    v_seen_product_ids := array_append(v_seen_product_ids, v_product_id);

    select name, pricing_mode, price
      into v_product_name, v_pricing_mode, v_unit_price
    from products
    where id = v_product_id
      and store_id = p_store_id
      and is_active = true
    for share;

    if not found then
      raise exception 'one of the selected products is unavailable';
    end if;

    v_line_total := round(v_unit_price * v_qty)::bigint;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_subtotal < 1 then
    raise exception 'order total is invalid';
  end if;
  v_total := v_subtotal + v_delivery_fee;

  select count(*)::integer into v_queue_count
  from online_orders
  where store_id = p_store_id
    and pickup_date = v_pickup_date
    and status in ('new', 'confirmed', 'preparing');

  v_queue_position := v_queue_count + 1;
  if v_pickup_slot <> 'asap' then
    v_scheduled_at := (
      timezone('Asia/Singapore', now())::date + v_pickup_slot::time
    ) at time zone 'Asia/Singapore';
  end if;

  if v_scheduled_at is not null and v_scheduled_at > now() then
    v_eta_at := v_scheduled_at;
  else
    v_eta_at := now() + make_interval(mins => v_order_lead_minutes + (case when v_fulfillment_method = 'delivery' then v_delivery_eta_minutes else 0 end) + (v_queue_position * v_average_prep_minutes));
  end if;

  v_order_id := gen_random_uuid();
  v_order_no := 'WEB-' || upper(substr(replace(p_request_id::text, '-', ''), 1, 10));

  insert into online_orders (
    id, request_id, org_id, store_id, order_no, customer_name, customer_phone,
    fulfillment_method, delivery_address, delivery_note, delivery_fee,
    pickup_slot, pickup_date, status, queue_position, subtotal, total, note, eta_at
  )
  values (
    v_order_id, p_request_id, v_store_org_id, p_store_id, v_order_no,
    v_customer_name, v_customer_phone, v_fulfillment_method, nullif(v_delivery_address, ''),
    nullif(v_delivery_note, ''), v_delivery_fee, v_pickup_slot, v_pickup_date, 'new',
    v_queue_position, v_subtotal, v_total, nullif(v_note, ''), v_eta_at
  );

  for v_item in select item.value from jsonb_array_elements(p_items) as item(value) loop
    v_product_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'qty')::numeric;

    select name, pricing_mode, price
      into v_product_name, v_pricing_mode, v_unit_price
    from products
    where id = v_product_id
      and store_id = p_store_id
      and is_active = true;

    v_line_total := round(v_unit_price * v_qty)::bigint;

    insert into online_order_items (
      order_id, product_id, name_snapshot, pricing_mode_snapshot,
      unit_price_snapshot, qty, line_total
    )
    values (
      v_order_id, v_product_id, v_product_name, v_pricing_mode,
      v_unit_price, v_qty, v_line_total
    );
  end loop;

  insert into audit_logs (org_id, store_id, action, entity, entity_id, after)
  values (
    v_store_org_id,
    p_store_id,
    'online_order.created',
    'online_orders',
    v_order_id,
    jsonb_build_object(
      'order_no', v_order_no,
      'subtotal', v_subtotal,
      'delivery_fee', v_delivery_fee,
      'total', v_total,
      'fulfillment_method', v_fulfillment_method,
      'payment_mode', case when v_fulfillment_method = 'delivery' then 'pay_on_delivery' else 'pay_at_pickup' end
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'queue_position', v_queue_position,
    'eta_at', v_eta_at,
    'total', v_total,
    'fulfillment_method', v_fulfillment_method
  );
end;
$$;

revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from public;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from anon;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from authenticated;
grant execute on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) to service_role;
