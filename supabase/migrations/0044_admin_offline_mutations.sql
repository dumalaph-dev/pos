-- Phase 5: idempotent receipts for the first low-risk admin outbox slice.
-- The browser stores only operational payloads in IndexedDB. Every replay is
-- still authorized by the current Supabase session and is committed through
-- the existing inventory RPCs.

create table if not exists admin_mutation_receipts (
  mutation_id    uuid primary key,
  org_id         uuid not null references organizations(id) on delete cascade,
  store_id       uuid not null references stores(id) on delete cascade,
  actor_id       uuid not null references profiles(id) on delete cascade,
  mutation_type  text not null check (mutation_type in ('inventory_movement', 'inventory_count')),
  result_id      uuid,
  result_count   integer,
  created_at     timestamptz not null default now()
);

create index if not exists admin_mutation_receipts_scope_idx
  on admin_mutation_receipts (org_id, actor_id, store_id, created_at desc);

alter table admin_mutation_receipts enable row level security;
revoke all on table admin_mutation_receipts from anon, authenticated;

-- Idempotent stock movement entry point used by the admin outbox. The legacy
-- six-argument function remains available to existing online server actions.
create or replace function record_stock_movement(
  p_store_id uuid,
  p_product_id uuid,
  p_type stock_movement_type,
  p_qty numeric,
  p_unit_cost bigint default null,
  p_reason text default null,
  p_client_mutation_id uuid default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id uuid;
  v_org_id uuid := auth_org_id();
  v_unit text;
  v_track_stock boolean;
  v_existing admin_mutation_receipts%rowtype;
  v_inserted_id uuid;
begin
  if not auth_is_admin() then
    raise exception 'only admins can record stock movements';
  end if;

  if v_org_id is null then
    raise exception 'organization context is required';
  end if;

  -- A replay with the same receipt is safe even if the product has since been
  -- archived; the original actor and branch still have to match exactly.
  if p_client_mutation_id is not null then
    select *
      into v_existing
    from admin_mutation_receipts
    where mutation_id = p_client_mutation_id;

    if found then
      if v_existing.org_id <> v_org_id
        or v_existing.store_id <> p_store_id
        or v_existing.actor_id <> auth.uid()
        or v_existing.mutation_type <> 'inventory_movement' then
        raise exception 'client mutation id is already assigned to another action';
      end if;
      if v_existing.result_id is null then
        raise exception 'the previous inventory movement is still being finalized';
      end if;
      return v_existing.result_id;
    end if;
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

  select p.unit, p.track_stock
    into v_unit, v_track_stock
  from products p
  where p.id = p_product_id
    and p.store_id = p_store_id
    and p.org_id = v_org_id
    and p.is_active;

  if v_unit is null then
    raise exception 'product and branch must belong to the same active organization';
  end if;

  if not v_track_stock then
    raise exception 'enable stock tracking for this product first';
  end if;

  if not exists (
    select 1 from stores s
    where s.id = p_store_id
      and s.org_id = v_org_id
      and s.is_active
  ) then
    raise exception 'branch is not active for the product organization';
  end if;

  if p_client_mutation_id is not null then
    insert into admin_mutation_receipts (
      mutation_id, org_id, store_id, actor_id, mutation_type
    )
    values (
      p_client_mutation_id, v_org_id, p_store_id, auth.uid(), 'inventory_movement'
    )
    on conflict (mutation_id) do nothing
    returning mutation_id into v_inserted_id;

    if v_inserted_id is null then
      select *
        into v_existing
      from admin_mutation_receipts
      where mutation_id = p_client_mutation_id;

      if v_existing.org_id <> v_org_id
        or v_existing.store_id <> p_store_id
        or v_existing.actor_id <> auth.uid()
        or v_existing.mutation_type <> 'inventory_movement' then
        raise exception 'client mutation id is already assigned to another action';
      end if;
      if v_existing.result_id is null then
        raise exception 'the previous inventory movement is still being finalized';
      end if;
      return v_existing.result_id;
    end if;
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
      'reason', nullif(trim(p_reason), ''),
      'client_mutation_id', p_client_mutation_id
    )
  );

  if p_client_mutation_id is not null then
    update admin_mutation_receipts
      set result_id = v_id
    where mutation_id = p_client_mutation_id;
  end if;

  return v_id;
end;
$$;

grant execute on function record_stock_movement(uuid, uuid, stock_movement_type, numeric, bigint, text, uuid)
  to authenticated;

-- Idempotent wrapper for the existing physical-count workflow. The original
-- three-argument function owns the count/reconciliation logic; this wrapper
-- adds a receipt around that transaction for reconnect retries.
create or replace function record_inventory_count(
  p_store_id uuid,
  p_count_date date,
  p_counts jsonb,
  p_client_mutation_id uuid
)
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_existing admin_mutation_receipts%rowtype;
  v_inserted_id uuid;
  v_processed integer;
begin
  if not auth_is_admin() then
    raise exception 'only admins can record inventory counts';
  end if;

  if v_org_id is null then
    raise exception 'organization context is required';
  end if;

  if p_client_mutation_id is null then
    return public.record_inventory_count(p_store_id, p_count_date, p_counts);
  end if;

  select *
    into v_existing
  from admin_mutation_receipts
  where mutation_id = p_client_mutation_id;

  if found then
    if v_existing.org_id <> v_org_id
      or v_existing.store_id <> p_store_id
      or v_existing.actor_id <> auth.uid()
      or v_existing.mutation_type <> 'inventory_count' then
      raise exception 'client mutation id is already assigned to another action';
    end if;
    if v_existing.result_count is null then
      raise exception 'the previous physical count is still being finalized';
    end if;
    return v_existing.result_count;
  end if;

  insert into admin_mutation_receipts (
    mutation_id, org_id, store_id, actor_id, mutation_type
  )
  values (
    p_client_mutation_id, v_org_id, p_store_id, auth.uid(), 'inventory_count'
  )
  on conflict (mutation_id) do nothing
  returning mutation_id into v_inserted_id;

  if v_inserted_id is null then
    select *
      into v_existing
    from admin_mutation_receipts
    where mutation_id = p_client_mutation_id;

    if v_existing.org_id <> v_org_id
      or v_existing.store_id <> p_store_id
      or v_existing.actor_id <> auth.uid()
      or v_existing.mutation_type <> 'inventory_count' then
      raise exception 'client mutation id is already assigned to another action';
    end if;
    if v_existing.result_count is null then
      raise exception 'the previous physical count is still being finalized';
    end if;
    return v_existing.result_count;
  end if;

  v_processed := public.record_inventory_count(p_store_id, p_count_date, p_counts);

  update admin_mutation_receipts
    set result_count = v_processed
  where mutation_id = p_client_mutation_id;

  return v_processed;
end;
$$;

grant execute on function record_inventory_count(uuid, date, jsonb, uuid)
  to authenticated;
