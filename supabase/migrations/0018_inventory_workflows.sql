-- Inventory workflow extensions: guided yields and end-of-day counts.
-- Counts are snapshots; any difference is recorded as an append-only signed
-- adjustment so the stock ledger remains the source of truth.

create table if not exists inventory_counts (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations(id) on delete cascade,
  store_id                 uuid not null references stores(id) on delete cascade,
  product_id               uuid not null references products(id) on delete cascade,
  count_date               date not null,
  expected_qty             numeric(12,3) not null,
  counted_qty              numeric(12,3) not null check (counted_qty >= 0),
  variance_qty             numeric(12,3) not null,
  unit                     text not null,
  adjustment_movement_id   uuid references stock_movements(id) on delete set null,
  created_by               uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (store_id, product_id, count_date)
);

alter table stock_movements
  add column if not exists inventory_count_id uuid references inventory_counts(id) on delete set null;

create index if not exists inventory_counts_store_date_idx
  on inventory_counts (store_id, count_date desc);
create index if not exists inventory_counts_org_date_idx
  on inventory_counts (org_id, count_date desc);
create index if not exists stock_movements_inventory_count_idx
  on stock_movements (inventory_count_id)
  where inventory_count_id is not null;

grant select, insert, update on inventory_counts to authenticated;
alter table inventory_counts enable row level security;

drop policy if exists inventory_counts_admin_all on inventory_counts;
create policy inventory_counts_admin_all on inventory_counts
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

-- Historical expected stock at the end of a Singapore-local business day.
create or replace function inventory_expected_stock(
  p_org_id uuid,
  p_store_id uuid,
  p_until timestamptz
)
  returns table (product_id uuid, qty numeric)
  language sql
  stable
  security invoker
  set search_path = public
as $$
  select
    sm.product_id,
    coalesce(sum(case
      when sm.type in ('receive', 'yield_in') then sm.qty
      when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
      else sm.qty
    end), 0) as qty
  from stock_movements sm
  where sm.org_id = p_org_id
    and sm.store_id = p_store_id
    and sm.created_at < p_until
  group by sm.product_id
$$;

grant execute on function inventory_expected_stock(uuid, uuid, timestamptz) to authenticated;

-- Record a whole-lechon preparation as one auditable transaction. The total
-- yield is added to the output product, then the waste portion is removed so
-- the output product's net increase equals usable yield.
create or replace function record_yield_entry(
  p_store_id uuid,
  p_source_product_id uuid,
  p_source_qty numeric,
  p_output_product_id uuid,
  p_total_yield_qty numeric,
  p_waste_qty numeric default 0,
  p_reason text default null
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_org_id uuid;
  v_source_unit text;
  v_output_unit text;
  v_source_name text;
  v_output_name text;
  v_source_movement_id uuid;
  v_output_movement_id uuid;
  v_waste_movement_id uuid;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not auth_is_admin() then
    raise exception 'only admins can record yield entries';
  end if;

  if p_source_qty is null or p_source_qty <= 0 then
    raise exception 'source quantity must be greater than zero';
  end if;

  if p_total_yield_qty is null or p_total_yield_qty <= 0 then
    raise exception 'total yield must be greater than zero';
  end if;

  if p_waste_qty is null or p_waste_qty < 0 or p_waste_qty > p_total_yield_qty then
    raise exception 'waste must be between zero and total yield';
  end if;

  if p_source_product_id = p_output_product_id then
    raise exception 'source and output products must be different';
  end if;

  if length(coalesce(p_reason, '')) > 180 then
    raise exception 'yield note must be at most 180 characters';
  end if;

  select p.org_id, p.unit, p.name
    into v_org_id, v_source_unit, v_source_name
  from products p
  where p.id = p_source_product_id
    and p.store_id = p_store_id
    and p.track_stock
    and p.is_active;

  if v_org_id is null or v_org_id <> auth_org_id() then
    raise exception 'source product is not available in this branch';
  end if;

  select p.unit, p.name
    into v_output_unit, v_output_name
  from products p
  where p.id = p_output_product_id
    and p.org_id = v_org_id
    and p.store_id = p_store_id
    and p.track_stock
    and p.is_active;

  if v_output_unit is null then
    raise exception 'output product is not available in this branch';
  end if;

  if not exists (
    select 1
    from stores s
    where s.id = p_store_id
      and s.org_id = v_org_id
      and s.is_active
  ) then
    raise exception 'branch is not active for this organization';
  end if;

  v_reason := coalesce(v_reason, format('Whole-lechon yield: %s to %s', v_source_name, v_output_name));

  insert into stock_movements (
    org_id, store_id, product_id, type, qty, unit, reason, actor_id
  )
  values (
    v_org_id, p_store_id, p_source_product_id, 'yield_out', p_source_qty,
    v_source_unit, v_reason, auth.uid()
  )
  returning id into v_source_movement_id;

  insert into stock_movements (
    org_id, store_id, product_id, type, qty, unit, reason, actor_id
  )
  values (
    v_org_id, p_store_id, p_output_product_id, 'yield_in', p_total_yield_qty,
    v_output_unit, v_reason, auth.uid()
  )
  returning id into v_output_movement_id;

  if p_waste_qty > 0 then
    insert into stock_movements (
      org_id, store_id, product_id, type, qty, unit, reason, actor_id
    )
    values (
      v_org_id,
      p_store_id,
      p_output_product_id,
      'waste',
      p_waste_qty,
      v_output_unit,
      v_reason || ' (waste)',
      auth.uid()
    )
    returning id into v_waste_movement_id;
  end if;

  insert into audit_logs (
    org_id, store_id, actor_id, action, entity, entity_id, after
  )
  values (
    v_org_id,
    p_store_id,
    auth.uid(),
    'inventory.yield.completed',
    'stock_movements',
    v_source_movement_id,
    jsonb_build_object(
      'source_product_id', p_source_product_id,
      'source_product_name', v_source_name,
      'source_qty', p_source_qty,
      'source_movement_id', v_source_movement_id,
      'output_product_id', p_output_product_id,
      'output_product_name', v_output_name,
      'total_yield_qty', p_total_yield_qty,
      'usable_yield_qty', p_total_yield_qty - p_waste_qty,
      'waste_qty', p_waste_qty,
      'output_movement_id', v_output_movement_id,
      'waste_movement_id', v_waste_movement_id,
      'reason', v_reason
    )
  );

  return v_source_movement_id;
end;
$$;

grant execute on function record_yield_entry(uuid, uuid, numeric, uuid, numeric, numeric, text) to authenticated;

-- Save a physical count and reconcile the ledger with a signed adjustment.
-- Re-saving a date only records the difference from the previous adjustment,
-- so correcting a count never double-counts stock.
create or replace function record_inventory_count(
  p_store_id uuid,
  p_count_date date,
  p_counts jsonb
)
  returns integer
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_until timestamptz;
  v_item jsonb;
  v_product_id uuid;
  v_counted_qty numeric;
  v_expected_qty numeric;
  v_previous_variance numeric;
  v_adjustment_delta numeric;
  v_count_id uuid;
  v_adjustment_movement_id uuid;
  v_processed integer := 0;
  v_unit text;
  v_product_name text;
  v_existing record;
  v_has_existing boolean;
begin
  if not auth_is_admin() then
    raise exception 'only admins can record inventory counts';
  end if;

  if p_count_date is null then
    raise exception 'count date is required';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'at least one product count is required';
  end if;

  if not exists (
    select 1
    from stores s
    where s.id = p_store_id
      and s.org_id = v_org_id
      and s.is_active
  ) then
    raise exception 'branch is not active for this organization';
  end if;

  v_until := ((p_count_date + 1)::text || 'T00:00:00+08:00')::timestamptz;

  for v_item in select value from jsonb_array_elements(p_counts)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_counted_qty := nullif(v_item->>'counted_qty', '')::numeric;

    if v_counted_qty is null or v_counted_qty < 0 then
      raise exception 'counted quantity must be zero or greater';
    end if;

    select p.unit, p.name
      into v_unit, v_product_name
    from products p
    where p.id = v_product_id
      and p.org_id = v_org_id
      and p.store_id = p_store_id
      and p.track_stock
      and p.is_active;

    if v_unit is null then
      raise exception 'one or more counted products are not valid for this branch';
    end if;

    select ic.id, ic.expected_qty, ic.variance_qty, ic.adjustment_movement_id
      into v_existing
    from inventory_counts ic
    where ic.org_id = v_org_id
      and ic.store_id = p_store_id
      and ic.product_id = v_product_id
      and ic.count_date = p_count_date;
    v_has_existing := found;

    if not v_has_existing then
      select coalesce(sum(case
        when sm.type in ('receive', 'yield_in') then sm.qty
        when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
        else sm.qty
      end), 0)
        into v_expected_qty
      from stock_movements sm
      where sm.org_id = v_org_id
        and sm.store_id = p_store_id
        and sm.product_id = v_product_id
        and sm.created_at < v_until;

      v_previous_variance := 0;
      insert into inventory_counts (
        org_id, store_id, product_id, count_date, expected_qty,
        counted_qty, variance_qty, unit, created_by
      )
      values (
        v_org_id, p_store_id, v_product_id, p_count_date, v_expected_qty,
        v_counted_qty, v_counted_qty - v_expected_qty, v_unit, auth.uid()
      )
      returning id into v_count_id;
    else
      v_count_id := v_existing.id;
      v_expected_qty := v_existing.expected_qty;
      v_previous_variance := v_existing.variance_qty;
    end if;

    v_adjustment_delta := v_counted_qty - v_expected_qty - v_previous_variance;
    v_adjustment_movement_id := null;

    if abs(v_adjustment_delta) > 0.0005 then
      insert into stock_movements (
        org_id, store_id, product_id, type, qty, unit, reason, actor_id, inventory_count_id
      )
      values (
        v_org_id,
        p_store_id,
        v_product_id,
        'adjust',
        v_adjustment_delta,
        v_unit,
        format('End-of-day count %s: %s', p_count_date, v_product_name),
        auth.uid(),
        v_count_id
      )
      returning id into v_adjustment_movement_id;
    end if;

    update inventory_counts
      set counted_qty = v_counted_qty,
          variance_qty = v_counted_qty - v_expected_qty,
          unit = v_unit,
          adjustment_movement_id = coalesce(v_adjustment_movement_id, adjustment_movement_id),
          created_by = auth.uid(),
          updated_at = now()
    where id = v_count_id;

    insert into audit_logs (
      org_id, store_id, actor_id, action, entity, entity_id, after
    )
    values (
      v_org_id,
      p_store_id,
      auth.uid(),
      'inventory.count.completed',
      'inventory_counts',
      v_count_id,
      jsonb_build_object(
        'product_id', v_product_id,
        'product_name', v_product_name,
        'count_date', p_count_date,
        'expected_qty', v_expected_qty,
        'counted_qty', v_counted_qty,
        'variance_qty', v_counted_qty - v_expected_qty,
        'adjustment_delta', v_adjustment_delta,
        'unit', v_unit
      )
    );

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

grant execute on function record_inventory_count(uuid, date, jsonb) to authenticated;
