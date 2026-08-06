-- Admin order operations keep the original sale immutable. A void or refund
-- is recorded as a linked reversal row so the order history, stock ledger, and
-- audit log remain append-only and explainable.

alter table orders
  add column if not exists reversal_of uuid references orders(id) on delete restrict;

create unique index if not exists orders_reversal_of_unique_idx
  on orders (reversal_of)
  where reversal_of is not null;

create index if not exists orders_reversal_of_idx
  on orders (reversal_of)
  where reversal_of is not null;

create or replace function record_order_action(
  p_order_id uuid,
  p_action order_status,
  p_reason text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_original orders%rowtype;
  v_reversal_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not auth_is_admin() then
    raise exception 'only organization admins can void or refund orders';
  end if;

  if p_order_id is null then
    raise exception 'an order is required';
  end if;

  if p_action not in ('voided', 'refunded') then
    raise exception 'choose voided or refunded as the order action';
  end if;

  if v_reason is null then
    raise exception 'a reason is required for this order action';
  end if;

  if length(v_reason) > 180 then
    raise exception 'the order action reason must be at most 180 characters';
  end if;

  select *
    into v_original
  from orders
  where id = p_order_id
    and org_id = v_org_id
  for update;

  if not found then
    raise exception 'that order is not available in this organization';
  end if;

  if v_original.status <> 'completed' then
    raise exception 'only completed orders can be voided or refunded';
  end if;

  if exists (
    select 1
    from orders
    where reversal_of = p_order_id
  ) then
    raise exception 'this order already has a void or refund action';
  end if;

  insert into orders (
    local_uuid,
    org_id,
    store_id,
    device_id,
    order_no,
    shift_id,
    cashier_id,
    status,
    subtotal,
    discount_type,
    discount_amount,
    discount_ref,
    vatable_sale,
    vat_amount,
    vat_exempt_sale,
    total,
    payment_method,
    payment_ref,
    amount_tendered,
    change_due,
    note,
    created_at_device,
    synced_at,
    reversal_of
  )
  values (
    gen_random_uuid(),
    v_original.org_id,
    v_original.store_id,
    v_original.device_id,
    v_original.order_no || '-' || upper(p_action::text),
    v_original.shift_id,
    v_original.cashier_id,
    p_action,
    v_original.subtotal,
    v_original.discount_type,
    v_original.discount_amount,
    v_original.discount_ref,
    v_original.vatable_sale,
    v_original.vat_amount,
    v_original.vat_exempt_sale,
    v_original.total,
    v_original.payment_method,
    v_original.payment_ref,
    v_original.amount_tendered,
    v_original.change_due,
    concat(
      'Action for ',
      v_original.order_no,
      ': ',
      upper(p_action::text),
      ' — ',
      v_reason
    ),
    now(),
    now(),
    p_order_id
  )
  returning id into v_reversal_id;

  insert into order_items (
    order_id,
    product_id,
    name_snapshot,
    pricing_mode_snapshot,
    unit_price_snapshot,
    qty,
    weight_kg,
    line_total
  )
  select
    v_reversal_id,
    oi.product_id,
    oi.name_snapshot,
    oi.pricing_mode_snapshot,
    oi.unit_price_snapshot,
    oi.qty,
    oi.weight_kg,
    oi.line_total
  from order_items oi
  where oi.order_id = p_order_id;

  -- Return tracked quantities to the branch ledger. Per-kilogram products use
  -- the sold weight; fixed-price products use their sold quantity.
  insert into stock_movements (
    org_id,
    store_id,
    product_id,
    type,
    qty,
    unit,
    reason,
    ref_order_id,
    actor_id
  )
  select
    v_original.org_id,
    v_original.store_id,
    p.id,
    'adjust'::stock_movement_type,
    case
      when p.pricing_mode = 'per_kg' then oi.weight_kg
      else oi.qty
    end,
    p.unit,
    format(
      'Return for %s (%s): %s',
      v_original.order_no,
      upper(p_action::text),
      v_reason
    ),
    v_reversal_id,
    v_actor_id
  from order_items oi
  join products p on p.id = oi.product_id
  where oi.order_id = p_order_id
    and p.track_stock
    and (
      (p.pricing_mode = 'per_kg' and coalesce(oi.weight_kg, 0) > 0)
      or (p.pricing_mode <> 'per_kg' and coalesce(oi.qty, 0) > 0)
    );

  insert into audit_logs (
    org_id,
    store_id,
    actor_id,
    action,
    entity,
    entity_id,
    before,
    after
  )
  values (
    v_original.org_id,
    v_original.store_id,
    v_actor_id,
    'order.' || p_action::text,
    'orders',
    p_order_id,
    jsonb_build_object(
      'order_no', v_original.order_no,
      'status', v_original.status,
      'total', v_original.total
    ),
    jsonb_build_object(
      'action', p_action,
      'reason', v_reason,
      'reversal_id', v_reversal_id,
      'reversal_of', p_order_id
    )
  );

  return v_reversal_id;
end;
$$;

grant execute on function record_order_action(uuid, order_status, text) to authenticated;
