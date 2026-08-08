-- P6 custom-discount approval and staff PIN governance.
--
-- profiles.pin_hash has existed since 0001 but remained unused by the first
-- offline implementation, which deliberately keeps the device-unlock PIN in
-- IndexedDB. These functions use the server-side profile PIN only for
-- organization-admin approval of sensitive custom discounts. The hash never
-- crosses the PostgREST response boundary.

create table if not exists discount_approvals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  store_id    uuid references stores(id) on delete cascade,
  actor_id    uuid not null references profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists discount_approvals_actor_idx
  on discount_approvals (actor_id, expires_at desc)
  where consumed_at is null;

alter table orders
  add column if not exists discount_approval_id uuid references discount_approvals(id) on delete set null;

-- The approval table is only reachable through the two narrowly-scoped
-- SECURITY DEFINER functions below. The browser never receives table DML.
revoke all privileges on table discount_approvals from anon, authenticated;
grant all privileges on table discount_approvals to service_role;
alter table discount_approvals enable row level security;

create or replace function consume_discount_approval(p_approval_id uuid)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if p_approval_id is null or auth.uid() is null then
    return false;
  end if;

  update discount_approvals
  set consumed_at = now()
  where id = p_approval_id
    and org_id = auth_org_id()
    and actor_id = auth.uid()
    and consumed_at is null
    and expires_at > now();

  return found;
end;
$$;

revoke all on function consume_discount_approval(uuid) from public;
grant execute on function consume_discount_approval(uuid) to authenticated;

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

  if v_target.role <> 'admin' or not v_target.is_active then
    raise exception 'only active organization admins can receive an approval PIN';
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

create or replace function verify_admin_pin(p_pin text)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_store_id uuid;
  v_approved boolean := false;
  v_approval_id uuid;
begin
  if v_actor_id is not null and v_org_id is not null then
    select store_id into v_store_id
    from profiles
    where id = v_actor_id
      and org_id = v_org_id;

    if p_pin is not null and p_pin ~ '^[0-9]{4,6}$' then
      select exists (
        select 1
        from profiles p
        where p.org_id = v_org_id
          and p.role = 'admin'
          and p.is_active
          and p.pin_hash is not null
          and extensions.crypt(p_pin, p.pin_hash) = p.pin_hash
      ) into v_approved;
    end if;

    if v_approved then
      insert into discount_approvals (org_id, store_id, actor_id, expires_at)
      values (v_org_id, v_store_id, v_actor_id, now() + interval '10 minutes')
      returning id into v_approval_id;
    end if;

    insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
    values (
      v_org_id,
      v_store_id,
      v_actor_id,
      case when v_approved then 'auth.admin_pin.approved' else 'auth.admin_pin.failed' end,
      'profiles',
      v_actor_id,
      jsonb_build_object('approved', v_approved, 'approval_id', v_approval_id)
    );
  end if;

  return v_approval_id;
end;
$$;

revoke all on function verify_admin_pin(text) from public;
grant execute on function verify_admin_pin(text) to authenticated;

-- Re-apply the P8 order function with server-side custom-discount approval.
-- Existing statutory Senior/PWD discounts keep their current behavior. Only a
-- custom discount whose rounded amount exceeds the organization threshold
-- needs a fresh one-use approval issued by verify_admin_pin().
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
  v_cashier_id uuid;
  v_shift_id uuid;
  v_discount_type discount_type;
  v_discount_amount bigint;
  v_subtotal bigint;
  v_discount_threshold numeric;
  v_discount_approval_id uuid;
begin
  v_org_id := (p_order->>'org_id')::uuid;
  v_store_id := (p_order->>'store_id')::uuid;
  v_cashier_id := (p_order->>'cashier_id')::uuid;
  v_discount_type := coalesce(p_order->>'discount_type', 'none')::discount_type;
  v_discount_amount := coalesce((p_order->>'discount_amount')::bigint, 0);
  v_subtotal := coalesce((p_order->>'subtotal')::bigint, 0);
  v_discount_approval_id := nullif(p_order->>'discount_approval_id', '')::uuid;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'an order must contain at least one item';
  end if;

  -- Idempotent replay should succeed even after its one-use approval has been
  -- consumed by the original request whose response was lost.
  select id into v_id
  from orders
  where local_uuid = (p_order->>'local_uuid')::uuid;
  if v_id is not null then
    return v_id;
  end if;

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

  select case
    when (o.settings #>> '{discount_policy,admin_pin_threshold_percent}') ~ '^[0-9]+([.][0-9]+)?$'
      then greatest(0, least(100, (o.settings #>> '{discount_policy,admin_pin_threshold_percent}')::numeric))
    else 10
  end into v_discount_threshold
  from organizations o
  where o.id = v_org_id;
  v_discount_threshold := coalesce(v_discount_threshold, 10);

  if v_discount_type = 'custom'
     and v_discount_amount > round(greatest(v_subtotal, 0) * v_discount_threshold / 100) then
    if not consume_discount_approval(v_discount_approval_id) then
      raise exception 'an active Admin PIN approval is required for this custom discount';
    end if;
  else
    v_discount_approval_id := null;
  end if;

  -- The till is captured on the device at sale time and replayed with the
  -- order, so a sale queued offline still belongs to the shift that rang it
  -- up rather than whichever shift happens to be open when it syncs.
  select s.id into v_shift_id
  from shifts s
  where s.id = nullif(p_order->>'shift_id', '')::uuid
    and s.org_id = v_org_id
    and s.store_id = v_store_id;

  if v_shift_id is null then
    select s.id into v_shift_id
    from shifts s
    where s.store_id = v_store_id
      and s.cashier_id = v_cashier_id
      and s.closed_at is null
    order by s.opened_at desc
    limit 1;
  end if;

  insert into orders (
    local_uuid, org_id, store_id, device_id, order_no, shift_id, cashier_id, status,
    subtotal, discount_type, discount_amount, discount_ref, discount_approval_id,
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
    v_shift_id,
    v_cashier_id,
    coalesce(p_order->>'status', 'completed')::order_status,
    (p_order->>'subtotal')::bigint,
    v_discount_type,
    v_discount_amount,
    p_order->>'discount_ref',
    v_discount_approval_id,
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
    v_cashier_id
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'product_id')::uuid
  where p.track_stock
    and coalesce(p_order->>'status', 'completed') = 'completed';

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    v_store_id,
    v_cashier_id,
    'order.created',
    'orders',
    v_id,
    jsonb_build_object(
      'order_no', p_order->>'order_no',
      'total', p_order->>'total',
      'shift_id', v_shift_id,
      'discount_approval_id', v_discount_approval_id
    )
  );

  return v_id;
end;
$$;

grant execute on function place_order(jsonb, jsonb) to authenticated;
