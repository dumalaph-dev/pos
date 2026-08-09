-- P9 POS void approval.
--
-- Completed sales remain immutable. The POS requests a short-lived, one-use
-- approval from an active manager or organization admin, then records a
-- linked void reversal through a second security-definer function. The
-- approval table is never exposed to the browser via table privileges.

create table if not exists order_action_approvals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete restrict,
  requested_by uuid not null references profiles(id) on delete restrict,
  approved_by  uuid not null references profiles(id) on delete restrict,
  action       text not null check (action = 'voided'),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists order_action_approvals_order_idx
  on order_action_approvals (order_id, created_at desc);

create index if not exists order_action_approvals_request_idx
  on order_action_approvals (requested_by, expires_at desc)
  where consumed_at is null;

revoke all privileges on table order_action_approvals from anon, authenticated;
grant all privileges on table order_action_approvals to service_role;
alter table order_action_approvals enable row level security;

-- Approval PINs are now available to active managers as well as admins. The
-- existing discount approval RPC still intentionally accepts admin PINs only.
create or replace function set_profile_pin(p_profile_id uuid, p_pin text)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_target profiles%rowtype;
begin
  if not auth_is_admin() then
    raise exception 'only organization admins can set staff PINs';
  end if;

  if p_profile_id is null then
    raise exception 'a staff profile is required';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4 to 6 digits';
  end if;

  select * into v_target
  from profiles
  where id = p_profile_id
    and org_id = v_org_id;
  if not found then
    raise exception 'that staff profile is not available in your organization';
  end if;

  if v_target.role not in ('admin'::user_role, 'manager'::user_role) or not v_target.is_active then
    raise exception 'only active admins or managers can receive an approval PIN';
  end if;

  if v_target.role = 'manager'::user_role and v_target.store_id is null then
    raise exception 'a manager must be assigned to a branch before receiving an approval PIN';
  end if;

  update profiles
  set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12))
  where id = p_profile_id
    and org_id = v_org_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    v_target.store_id,
    v_actor_id,
    'auth.profile.pin_changed',
    'profiles',
    p_profile_id,
    jsonb_build_object('profile_role', v_target.role, 'pin_set', true)
  );

  return true;
end;
$$;

revoke all on function set_profile_pin(uuid, text) from public;
grant execute on function set_profile_pin(uuid, text) to authenticated;

create or replace function verify_void_pin(
  p_order_id uuid,
  p_pin text
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_actor_store_id uuid := auth_store_id();
  v_original orders%rowtype;
  v_approver profiles%rowtype;
  v_approval_id uuid;
begin
  if v_actor_id is null or v_org_id is null or p_order_id is null then
    return null;
  end if;

  select *
    into v_original
  from orders
  where id = p_order_id
    and org_id = v_org_id
    and (auth_is_admin() or store_id = v_actor_store_id);

  if not found or v_original.status <> 'completed' or exists (
    select 1 from orders where reversal_of = p_order_id
  ) then
    insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
    values (
      v_org_id,
      coalesce(v_original.store_id, v_actor_store_id),
      v_actor_id,
      'auth.void_pin.failed',
      'orders',
      p_order_id,
      jsonb_build_object('approved', false, 'reason', 'order_not_eligible')
    );
    return null;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4,6}$' then
    select p.*
      into v_approver
    from profiles p
    where p.org_id = v_org_id
      and p.role in ('admin'::user_role, 'manager'::user_role)
      and p.is_active
      and p.pin_hash is not null
      and (p.role = 'admin'::user_role or p.store_id = v_original.store_id)
      and extensions.crypt(p_pin, p.pin_hash) = p.pin_hash
    order by (p.id = v_actor_id) desc, (p.role = 'manager'::user_role) desc, p.created_at
    limit 1;
  end if;

  if v_approver.id is null then
    insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
    values (
      v_org_id,
      v_original.store_id,
      v_actor_id,
      'auth.void_pin.failed',
      'orders',
      p_order_id,
      jsonb_build_object(
        'order_no', v_original.order_no,
        'approved', false,
        'reason', 'pin_not_approved'
      )
    );
    return null;
  end if;

  insert into order_action_approvals (
    org_id, store_id, order_id, requested_by, approved_by, action, expires_at
  )
  values (
    v_org_id,
    v_original.store_id,
    p_order_id,
    v_actor_id,
    v_approver.id,
    'voided',
    now() + interval '5 minutes'
  )
  returning id into v_approval_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    v_original.store_id,
    v_actor_id,
    'auth.void_pin.approved',
    'orders',
    p_order_id,
    jsonb_build_object(
      'order_no', v_original.order_no,
      'approved', true,
      'approval_id', v_approval_id,
      'approved_by', v_approver.id
    )
  );

  return v_approval_id;
end;
$$;

revoke all on function verify_void_pin(uuid, text) from public;
grant execute on function verify_void_pin(uuid, text) to authenticated;

create or replace function record_pos_order_void(
  p_order_id uuid,
  p_reason text,
  p_approval_id uuid
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
  v_approver_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or v_org_id is null then
    raise exception 'your session is not available';
  end if;

  if p_order_id is null then
    raise exception 'an order is required';
  end if;

  if v_reason is null then
    raise exception 'a reason is required for this void';
  end if;

  if length(v_reason) > 180 then
    raise exception 'the void reason must be at most 180 characters';
  end if;

  select *
    into v_original
  from orders
  where id = p_order_id
    and org_id = v_org_id
    and (auth_is_admin() or store_id = auth_store_id())
  for update;

  if not found then
    raise exception 'that order is not available in this branch';
  end if;

  if v_original.status <> 'completed' then
    raise exception 'only completed orders can be voided';
  end if;

  if exists (select 1 from orders where reversal_of = p_order_id) then
    raise exception 'this order already has a void or refund action';
  end if;

  update order_action_approvals
  set consumed_at = now()
  where id = p_approval_id
    and org_id = v_org_id
    and store_id = v_original.store_id
    and order_id = p_order_id
    and requested_by = v_actor_id
    and action = 'voided'
    and consumed_at is null
    and expires_at > now()
  returning approved_by into v_approver_id;

  if v_approver_id is null then
    raise exception 'manager PIN approval is missing or expired';
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
    v_original.order_no || '-VOIDED',
    v_original.shift_id,
    v_original.cashier_id,
    'voided',
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
    concat('Action for ', v_original.order_no, ': VOIDED - ', v_reason),
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
    format('Return for %s (VOIDED): %s', v_original.order_no, v_reason),
    v_reversal_id,
    v_approver_id
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
    v_approver_id,
    'order.voided',
    'orders',
    p_order_id,
    jsonb_build_object(
      'order_no', v_original.order_no,
      'status', v_original.status,
      'total', v_original.total
    ),
    jsonb_build_object(
      'action', 'voided',
      'reason', v_reason,
      'reversal_id', v_reversal_id,
      'reversal_of', p_order_id,
      'requested_by', v_actor_id,
      'approved_by', v_approver_id,
      'approval_id', p_approval_id
    )
  );

  return v_reversal_id;
end;
$$;

revoke all on function record_pos_order_void(uuid, text, uuid) from public;
grant execute on function record_pos_order_void(uuid, text, uuid) to authenticated;
