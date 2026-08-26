-- Products and Inventory recipe model.
--
-- Products remain sellable POS records. Inventory items are countable stock.
-- Product recipes connect the two and allow one inventory item to be shared by
-- many products. Existing tracked products are migrated to direct finished-good
-- inventory items so their stock history remains intact.

alter table public.products
  add column if not exists inventory_mode text not null default 'none';

update public.products
set inventory_mode = case when track_stock then 'direct' else 'none' end
where inventory_mode is null
   or inventory_mode not in ('none', 'direct', 'recipe');

alter table public.products
  drop constraint if exists products_inventory_mode_check;

alter table public.products
  add constraint products_inventory_mode_check
  check (inventory_mode in ('none', 'direct', 'recipe'));

create index if not exists products_store_inventory_mode_idx
  on public.products (store_id, inventory_mode, is_active);

create table if not exists public.inventory_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  store_id          uuid not null references public.stores(id) on delete cascade,
  linked_product_id uuid references public.products(id) on delete set null,
  name              text not null,
  item_type         text not null default 'ingredient'
                    check (item_type in ('ingredient', 'packaging', 'finished_good')),
  unit              text not null default 'pcs',
  cost_per_unit     bigint check (cost_per_unit is null or cost_per_unit >= 0),
  min_stock         numeric(14,6) not null default 0 check (min_stock >= 0),
  supplier_id       uuid references public.suppliers(id) on delete set null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists inventory_items_store_active_idx
  on public.inventory_items (store_id, is_active, name);

create index if not exists inventory_items_org_type_idx
  on public.inventory_items (org_id, item_type, is_active);

create unique index if not exists inventory_items_linked_product_unique_idx
  on public.inventory_items (linked_product_id)
  where linked_product_id is not null;

create index if not exists inventory_items_supplier_idx
  on public.inventory_items (org_id, supplier_id)
  where supplier_id is not null;

alter table public.products
  drop constraint if exists products_inventory_mode_link_check;

alter table public.stock_movements
  alter column product_id drop not null;

alter table public.stock_movements
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete restrict,
  add column if not exists source_product_id uuid references public.products(id) on delete set null;

create index if not exists stock_movements_inventory_item_idx
  on public.stock_movements (store_id, inventory_item_id, created_at desc)
  where inventory_item_id is not null;

create index if not exists stock_movements_source_product_idx
  on public.stock_movements (store_id, source_product_id, created_at desc)
  where source_product_id is not null;

-- Migrate existing product-level stock into direct finished-good inventory
-- items. This is intentionally idempotent so the migration is safe to inspect
-- and replay in a controlled environment.
insert into public.inventory_items (
  org_id,
  store_id,
  linked_product_id,
  name,
  item_type,
  unit,
  cost_per_unit,
  min_stock,
  supplier_id,
  is_active
)
select
  p.org_id,
  p.store_id,
  p.id,
  p.name,
  'finished_good',
  p.unit,
  p.cost_price,
  p.min_stock,
  p.supplier_id,
  p.is_active
from public.products p
where p.track_stock
  and p.inventory_mode = 'direct'
  and not exists (
    select 1
    from public.inventory_items i
    where i.linked_product_id = p.id
  );

update public.stock_movements sm
set inventory_item_id = i.id
from public.inventory_items i
where sm.inventory_item_id is null
  and i.linked_product_id = sm.product_id;

create table if not exists public.product_recipes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  store_id    uuid not null references public.stores(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  version     integer not null check (version > 0),
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists product_recipes_active_product_unique_idx
  on public.product_recipes (product_id)
  where is_active;

create unique index if not exists product_recipes_product_version_unique_idx
  on public.product_recipes (product_id, version);

create index if not exists product_recipes_store_product_idx
  on public.product_recipes (store_id, product_id, is_active);

create table if not exists public.product_recipe_items (
  id                    uuid primary key default gen_random_uuid(),
  recipe_id             uuid not null references public.product_recipes(id) on delete cascade,
  inventory_item_id     uuid not null references public.inventory_items(id) on delete restrict,
  quantity_per_unit     numeric(14,6) not null check (quantity_per_unit > 0),
  waste_percent         numeric(6,3) not null default 0 check (waste_percent >= 0 and waste_percent <= 100),
  note                  text,
  sort_order            integer not null default 0 check (sort_order >= 0),
  created_at            timestamptz not null default now()
);

create unique index if not exists product_recipe_items_unique_item_idx
  on public.product_recipe_items (recipe_id, inventory_item_id);

create index if not exists product_recipe_items_inventory_item_idx
  on public.product_recipe_items (inventory_item_id, recipe_id);

create table if not exists public.order_item_consumptions (
  id                 uuid primary key default gen_random_uuid(),
  order_item_id      uuid not null references public.order_items(id) on delete cascade,
  inventory_item_id  uuid not null references public.inventory_items(id) on delete restrict,
  recipe_id          uuid references public.product_recipes(id) on delete set null,
  recipe_version     integer,
  quantity           numeric(14,6) not null check (quantity > 0),
  unit               text not null,
  unit_cost          bigint check (unit_cost is null or unit_cost >= 0),
  created_at         timestamptz not null default now()
);

create index if not exists order_item_consumptions_order_item_idx
  on public.order_item_consumptions (order_item_id);

create index if not exists order_item_consumptions_inventory_item_idx
  on public.order_item_consumptions (inventory_item_id, created_at desc);

create or replace function public.current_inventory_stock(p_org_id uuid)
returns table (
  store_id uuid,
  inventory_item_id uuid,
  qty numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    i.store_id,
    i.id,
    coalesce(sum(case
      when sm.type in ('receive', 'yield_in') then sm.qty
      when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
      else sm.qty
    end), 0)::numeric as qty
  from public.inventory_items i
  left join public.stock_movements sm
    on (sm.inventory_item_id = i.id
      or (sm.inventory_item_id is null and sm.product_id = i.linked_product_id))
   and sm.store_id = i.store_id
   and sm.org_id = i.org_id
  where i.org_id = p_org_id
    and (auth_is_admin() or i.store_id = auth_store_id())
  group by i.store_id, i.id;
$$;

grant execute on function public.current_inventory_stock(uuid) to authenticated;

create or replace function public.save_product_recipe(
  p_product_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_recipe_id uuid;
  v_version integer;
  v_line jsonb;
  v_inventory_item_id uuid;
  v_quantity numeric;
  v_waste numeric;
  v_note text;
  v_sort_order integer := 0;
  v_seen_ids uuid[] := '{}'::uuid[];
begin
  if not auth_is_admin() then
    raise exception 'only organization admins can save product recipes';
  end if;

  if p_product_id is null or p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0
     or jsonb_array_length(p_lines) > 100 then
    raise exception 'a recipe must contain between 1 and 100 ingredients';
  end if;

  select *
    into v_product
  from public.products
  where id = p_product_id
    and org_id = auth_org_id();

  if not found then
    raise exception 'product is outside the selected organization branch';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    begin
      v_inventory_item_id := (v_line->>'inventory_item_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'recipe ingredient % is invalid', v_sort_order + 1;
    end;

    v_quantity := nullif(v_line->>'quantity_per_unit', '')::numeric;
    v_waste := coalesce(nullif(v_line->>'waste_percent', '')::numeric, 0);
    v_note := nullif(left(trim(coalesce(v_line->>'note', '')), 180), '');

    if v_inventory_item_id is null or v_quantity is null or v_quantity <= 0
       or v_waste < 0 or v_waste > 100 then
      raise exception 'recipe ingredient % has an invalid quantity or waste percentage', v_sort_order + 1;
    end if;

    if v_inventory_item_id = any(v_seen_ids) then
      raise exception 'an ingredient can only appear once in a recipe';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_inventory_item_id);

    if not exists (
      select 1
      from public.inventory_items ii
      where ii.id = v_inventory_item_id
        and ii.org_id = v_product.org_id
        and ii.store_id = v_product.store_id
        and ii.is_active
    ) then
      raise exception 'every recipe ingredient must be an active inventory item in the same branch';
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  select coalesce(max(version), 0) + 1
    into v_version
  from public.product_recipes
  where product_id = v_product.id;

  update public.product_recipes
  set is_active = false
  where product_id = v_product.id
    and is_active;

  insert into public.product_recipes (
    org_id,
    store_id,
    product_id,
    version,
    is_active,
    created_by
  )
  values (
    v_product.org_id,
    v_product.store_id,
    v_product.id,
    v_version,
    true,
    auth.uid()
  )
  returning id into v_recipe_id;

  v_sort_order := 0;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_sort_order := v_sort_order + 1;
    insert into public.product_recipe_items (
      recipe_id,
      inventory_item_id,
      quantity_per_unit,
      waste_percent,
      note,
      sort_order
    )
    values (
      v_recipe_id,
      (v_line->>'inventory_item_id')::uuid,
      (v_line->>'quantity_per_unit')::numeric,
      coalesce(nullif(v_line->>'waste_percent', '')::numeric, 0),
      nullif(left(trim(coalesce(v_line->>'note', '')), 180), ''),
      v_sort_order
    );
  end loop;

  insert into public.audit_logs (
    org_id,
    store_id,
    actor_id,
    action,
    entity,
    entity_id,
    after
  )
  values (
    v_product.org_id,
    v_product.store_id,
    auth.uid(),
    'product.recipe.saved',
    'product_recipes',
    v_recipe_id,
    jsonb_build_object(
      'product_id', v_product.id,
      'version', v_version,
      'ingredient_count', jsonb_array_length(p_lines)
    )
  );

  return v_recipe_id;
end;
$$;

revoke all on function public.save_product_recipe(uuid, jsonb) from public;
grant execute on function public.save_product_recipe(uuid, jsonb) to authenticated;

create or replace function public.record_inventory_item_movement(
  p_store_id uuid,
  p_inventory_item_id uuid,
  p_type stock_movement_type,
  p_qty numeric,
  p_unit_cost bigint default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.inventory_items%rowtype;
  v_id uuid;
  v_org_id uuid := auth_org_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not auth_is_admin() then
    raise exception 'only organization admins can record inventory movements';
  end if;

  if p_store_id is null or p_inventory_item_id is null then
    raise exception 'a branch and inventory item are required';
  end if;

  if p_type = 'sale' then
    raise exception 'sales are recorded by the POS order flow';
  end if;

  if p_qty = 0 or (p_type <> 'adjust' and p_qty < 0) then
    raise exception 'movement quantity is invalid';
  end if;

  if p_type in ('waste', 'adjust') and v_reason is null then
    raise exception 'a reason is required for waste and adjustment movements';
  end if;

  select *
    into v_item
  from public.inventory_items
  where id = p_inventory_item_id
    and org_id = v_org_id
    and store_id = p_store_id
    and is_active;

  if not found then
    raise exception 'inventory item and branch must belong to the same active organization';
  end if;

  if p_unit_cost is not null and p_unit_cost < 0 then
    raise exception 'unit cost cannot be negative';
  end if;

  insert into public.stock_movements (
    org_id,
    store_id,
    product_id,
    inventory_item_id,
    source_product_id,
    type,
    qty,
    unit,
    unit_cost,
    reason,
    actor_id
  )
  values (
    v_item.org_id,
    v_item.store_id,
    v_item.linked_product_id,
    v_item.id,
    null,
    p_type,
    p_qty,
    v_item.unit,
    p_unit_cost,
    v_reason,
    auth.uid()
  )
  returning id into v_id;

  insert into public.audit_logs (
    org_id,
    store_id,
    actor_id,
    action,
    entity,
    entity_id,
    after
  )
  values (
    v_item.org_id,
    v_item.store_id,
    auth.uid(),
    'inventory.movement.created',
    'stock_movements',
    v_id,
    jsonb_build_object(
      'inventory_item_id', v_item.id,
      'type', p_type,
      'qty', p_qty,
      'unit', v_item.unit,
      'unit_cost', p_unit_cost,
      'reason', v_reason
    )
  );

  return v_id;
end;
$$;

revoke all on function public.record_inventory_item_movement(uuid, uuid, stock_movement_type, numeric, bigint, text) from public;
grant execute on function public.record_inventory_item_movement(uuid, uuid, stock_movement_type, numeric, bigint, text) to authenticated;

create or replace function public.apply_recipe_order_item_consumption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_recipe public.product_recipes%rowtype;
  v_sold_qty numeric;
  v_consumption_count integer;
begin
  select *
    into v_order
  from public.orders
  where id = new.order_id;

  if not found
     or v_order.status <> 'completed'
     or v_order.reversal_of is not null
     or new.product_id is null then
    return new;
  end if;

  select *
    into v_product
  from public.products
  where id = new.product_id
    and org_id = v_order.org_id
    and store_id = v_order.store_id;

  if not found or v_product.inventory_mode <> 'recipe' then
    return new;
  end if;

  -- The order local UUID keeps the order itself idempotent, but this guard
  -- also makes the trigger safe if a caller retries an order-item insert
  -- after the item has already produced consumption rows.
  if exists (
    select 1
    from public.order_item_consumptions c
    where c.order_item_id = new.id
  ) then
    return new;
  end if;

  v_sold_qty := case
    when v_product.pricing_mode = 'per_kg' then coalesce(new.weight_kg, 0)
    else coalesce(new.qty, 0)
  end;

  if v_sold_qty <= 0 then
    raise exception 'recipe-tracked product has no sellable quantity';
  end if;

  select *
    into v_recipe
  from public.product_recipes
  where product_id = v_product.id
    and org_id = v_product.org_id
    and store_id = v_product.store_id
    and is_active
  order by version desc
  limit 1;

  if not found then
    raise exception 'product "%" is marked to track ingredients but has no active recipe', v_product.name;
  end if;

  insert into public.order_item_consumptions (
    order_item_id,
    inventory_item_id,
    recipe_id,
    recipe_version,
    quantity,
    unit,
    unit_cost
  )
  select
    new.id,
    ri.inventory_item_id,
    v_recipe.id,
    v_recipe.version,
    round(ri.quantity_per_unit * v_sold_qty * (1 + ri.waste_percent / 100), 6),
    ii.unit,
    ii.cost_per_unit
  from public.product_recipe_items ri
  join public.inventory_items ii on ii.id = ri.inventory_item_id
  where ri.recipe_id = v_recipe.id
    and ii.org_id = v_product.org_id
    and ii.store_id = v_product.store_id
    and ii.is_active;

  get diagnostics v_consumption_count = row_count;
  if v_consumption_count = 0 then
    raise exception 'product "%" has an empty active recipe', v_product.name;
  end if;

  insert into public.stock_movements (
    org_id,
    store_id,
    product_id,
    inventory_item_id,
    source_product_id,
    type,
    qty,
    unit,
    unit_cost,
    reason,
    ref_order_id,
    actor_id
  )
  select
    v_order.org_id,
    v_order.store_id,
    null,
    c.inventory_item_id,
    v_product.id,
    'sale'::stock_movement_type,
    c.quantity,
    c.unit,
    c.unit_cost,
    format('Sale %s: %s', v_order.order_no, v_product.name),
    v_order.id,
    v_order.cashier_id
  from public.order_item_consumptions c
  where c.order_item_id = new.id;

  return new;
end;
$$;

drop trigger if exists order_item_recipe_consumption_trigger on public.order_items;
create trigger order_item_recipe_consumption_trigger
after insert on public.order_items
for each row
execute function public.apply_recipe_order_item_consumption();

create or replace function public.apply_recipe_order_reversal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original public.orders%rowtype;
  v_actor_id uuid := coalesce(auth.uid(), new.cashier_id);
begin
  if new.reversal_of is null or new.status not in ('voided', 'refunded') then
    return new;
  end if;

  select *
    into v_original
  from public.orders
  where id = new.reversal_of
    and org_id = new.org_id;

  if not found then
    return new;
  end if;

  insert into public.stock_movements (
    org_id,
    store_id,
    product_id,
    inventory_item_id,
    source_product_id,
    type,
    qty,
    unit,
    unit_cost,
    reason,
    ref_order_id,
    actor_id
  )
  select
    new.org_id,
    new.store_id,
    null,
    c.inventory_item_id,
    null,
    'adjust'::stock_movement_type,
    sum(c.quantity),
    max(c.unit),
    max(c.unit_cost),
    format('Return for %s (%s)', v_original.order_no, upper(new.status::text)),
    new.id,
    v_actor_id
  from public.order_item_consumptions c
  join public.order_items oi on oi.id = c.order_item_id
  where oi.order_id = v_original.id
    and not exists (
      select 1
      from public.stock_movements existing
      where existing.ref_order_id = new.id
        and existing.inventory_item_id = c.inventory_item_id
        and existing.type = 'adjust'
    )
  group by c.inventory_item_id;

  return new;
end;
$$;

drop trigger if exists order_recipe_reversal_trigger on public.orders;
create constraint trigger order_recipe_reversal_trigger
after insert on public.orders
deferrable initially deferred
for each row
when (new.reversal_of is not null)
execute function public.apply_recipe_order_reversal();

-- Inventory counts used to be product-only. Keep those rows intact while
-- allowing the new inventory-item ledger to be counted without inventing a
-- product for ingredients such as dough, milk, or coffee beans.
alter table public.inventory_counts
  alter column product_id drop not null;

alter table public.inventory_counts
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete restrict;

alter table public.inventory_counts
  drop constraint if exists inventory_counts_reference_check;

alter table public.inventory_counts
  add constraint inventory_counts_reference_check
  check (product_id is not null or inventory_item_id is not null);

create unique index if not exists inventory_counts_item_date_unique_idx
  on public.inventory_counts (store_id, inventory_item_id, count_date)
  where inventory_item_id is not null;

create index if not exists inventory_counts_item_date_idx
  on public.inventory_counts (inventory_item_id, count_date desc)
  where inventory_item_id is not null;

update public.inventory_counts ic
set inventory_item_id = ii.id
from public.inventory_items ii
where ic.inventory_item_id is null
  and ic.product_id = ii.linked_product_id;

create or replace function public.inventory_item_expected_stock(
  p_org_id uuid,
  p_store_id uuid,
  p_until timestamptz
)
returns table (
  inventory_item_id uuid,
  qty numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ii.id,
    coalesce(sum(case
      when sm.type in ('receive', 'yield_in') then sm.qty
      when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
      else sm.qty
    end), 0)::numeric as qty
  from public.inventory_items ii
  left join public.stock_movements sm
    on sm.org_id = ii.org_id
   and sm.store_id = ii.store_id
   and sm.created_at < p_until
   and (
     sm.inventory_item_id = ii.id
     or (sm.inventory_item_id is null and sm.product_id = ii.linked_product_id)
   )
  where ii.org_id = p_org_id
    and ii.store_id = p_store_id
    and (auth_is_admin() or ii.store_id = auth_store_id())
  group by ii.id;
$$;

grant execute on function public.inventory_item_expected_stock(uuid, uuid, timestamptz) to authenticated;

create or replace function public.record_inventory_item_count(
  p_store_id uuid,
  p_count_date date,
  p_counts jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_until timestamptz;
  v_entry jsonb;
  v_item_id uuid;
  v_item public.inventory_items%rowtype;
  v_counted_qty numeric;
  v_expected_qty numeric;
  v_previous_variance numeric;
  v_adjustment_delta numeric;
  v_count_id uuid;
  v_adjustment_movement_id uuid;
  v_processed integer := 0;
  v_existing_found boolean;
begin
  if not auth_is_admin() then
    raise exception 'only admins can record inventory counts';
  end if;

  if p_count_date is null then
    raise exception 'count date is required';
  end if;

  if p_counts is null or jsonb_typeof(p_counts) <> 'array'
     or jsonb_array_length(p_counts) = 0 then
    raise exception 'at least one inventory item count is required';
  end if;

  if not exists (
    select 1
    from public.stores s
    where s.id = p_store_id
      and s.org_id = v_org_id
      and s.is_active
  ) then
    raise exception 'branch is not active for this organization';
  end if;

  v_until := ((p_count_date + 1)::text || 'T00:00:00+08:00')::timestamptz;

  for v_entry in select value from jsonb_array_elements(p_counts)
  loop
    begin
      v_item_id := (v_entry->>'inventory_item_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'inventory item reference is invalid';
    end;

    v_counted_qty := nullif(v_entry->>'counted_qty', '')::numeric;
    if v_item_id is null or v_counted_qty is null or v_counted_qty < 0 then
      raise exception 'inventory item and counted quantity are required';
    end if;

    select *
      into v_item
    from public.inventory_items
    where id = v_item_id
      and org_id = v_org_id
      and store_id = p_store_id
      and is_active;

    if not found then
      raise exception 'one or more counted inventory items are not valid for this branch';
    end if;

    select ic.id, ic.expected_qty, ic.variance_qty
      into v_count_id, v_expected_qty, v_previous_variance
    from public.inventory_counts ic
    where ic.org_id = v_org_id
      and ic.store_id = p_store_id
      and ic.count_date = p_count_date
      and (
        ic.inventory_item_id = v_item_id
        or (ic.inventory_item_id is null and ic.product_id = v_item.linked_product_id)
      )
    order by (ic.inventory_item_id is not null) desc
    limit 1;
    v_existing_found := found;

    if not v_existing_found then
      select coalesce(sum(case
        when sm.type in ('receive', 'yield_in') then sm.qty
        when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
        else sm.qty
      end), 0)
        into v_expected_qty
      from public.stock_movements sm
      where sm.org_id = v_org_id
        and sm.store_id = p_store_id
        and sm.created_at < v_until
        and (
          sm.inventory_item_id = v_item_id
          or (sm.inventory_item_id is null and sm.product_id = v_item.linked_product_id)
        );

      v_previous_variance := 0;
      insert into public.inventory_counts (
        org_id,
        store_id,
        product_id,
        inventory_item_id,
        count_date,
        expected_qty,
        counted_qty,
        variance_qty,
        unit,
        created_by
      )
      values (
        v_org_id,
        p_store_id,
        v_item.linked_product_id,
        v_item.id,
        p_count_date,
        v_expected_qty,
        v_counted_qty,
        v_counted_qty - v_expected_qty,
        v_item.unit,
        auth.uid()
      )
      returning id into v_count_id;
    end if;

    v_adjustment_delta := v_counted_qty - v_expected_qty - v_previous_variance;
    v_adjustment_movement_id := null;

    if abs(v_adjustment_delta) > 0.0005 then
      insert into public.stock_movements (
        org_id,
        store_id,
        product_id,
        inventory_item_id,
        type,
        qty,
        unit,
        reason,
        actor_id,
        inventory_count_id
      )
      values (
        v_org_id,
        p_store_id,
        v_item.linked_product_id,
        v_item.id,
        'adjust',
        v_adjustment_delta,
        v_item.unit,
        format('End-of-day count %s: %s', p_count_date, v_item.name),
        auth.uid(),
        v_count_id
      )
      returning id into v_adjustment_movement_id;
    end if;

    update public.inventory_counts
    set product_id = coalesce(product_id, v_item.linked_product_id),
        inventory_item_id = v_item.id,
        counted_qty = v_counted_qty,
        variance_qty = v_counted_qty - v_expected_qty,
        unit = v_item.unit,
        adjustment_movement_id = coalesce(v_adjustment_movement_id, adjustment_movement_id),
        created_by = auth.uid(),
        updated_at = now()
    where id = v_count_id;

    insert into public.audit_logs (
      org_id,
      store_id,
      actor_id,
      action,
      entity,
      entity_id,
      after
    )
    values (
      v_org_id,
      p_store_id,
      auth.uid(),
      'inventory.count.completed',
      'inventory_counts',
      v_count_id,
      jsonb_build_object(
        'inventory_item_id', v_item.id,
        'inventory_item_name', v_item.name,
        'count_date', p_count_date,
        'expected_qty', v_expected_qty,
        'counted_qty', v_counted_qty,
        'variance_qty', v_counted_qty - v_expected_qty,
        'adjustment_delta', v_adjustment_delta,
        'unit', v_item.unit
      )
    );

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$$;

grant execute on function public.record_inventory_item_count(uuid, date, jsonb) to authenticated;

grant select, insert, update on public.inventory_items to authenticated;
grant select on public.product_recipes, public.product_recipe_items to authenticated;
grant select on public.order_item_consumptions to authenticated;

alter table public.inventory_items enable row level security;
alter table public.product_recipes enable row level security;
alter table public.product_recipe_items enable row level security;
alter table public.order_item_consumptions enable row level security;

drop policy if exists inventory_items_admin_all on public.inventory_items;
create policy inventory_items_admin_all on public.inventory_items
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

drop policy if exists inventory_items_branch_read on public.inventory_items;
create policy inventory_items_branch_read on public.inventory_items
  for select using (store_id = auth_store_id());

drop policy if exists product_recipes_admin_all on public.product_recipes;
create policy product_recipes_admin_all on public.product_recipes
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

drop policy if exists product_recipes_branch_read on public.product_recipes;
create policy product_recipes_branch_read on public.product_recipes
  for select using (store_id = auth_store_id());

drop policy if exists product_recipe_items_admin_all on public.product_recipe_items;
create policy product_recipe_items_admin_all on public.product_recipe_items
  for all using (exists (
    select 1 from public.product_recipes pr
    where pr.id = product_recipe_items.recipe_id
      and auth_is_admin()
      and pr.org_id = auth_org_id()
  ))
  with check (exists (
    select 1 from public.product_recipes pr
    where pr.id = product_recipe_items.recipe_id
      and auth_is_admin()
      and pr.org_id = auth_org_id()
  ));

drop policy if exists product_recipe_items_branch_read on public.product_recipe_items;
create policy product_recipe_items_branch_read on public.product_recipe_items
  for select using (exists (
    select 1 from public.product_recipes pr
    where pr.id = product_recipe_items.recipe_id
      and pr.store_id = auth_store_id()
  ));

drop policy if exists order_item_consumptions_admin_read on public.order_item_consumptions;
create policy order_item_consumptions_admin_read on public.order_item_consumptions
  for select using (exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_consumptions.order_item_id
      and auth_is_admin()
      and o.org_id = auth_org_id()
  ));

drop policy if exists order_item_consumptions_branch_read on public.order_item_consumptions;
create policy order_item_consumptions_branch_read on public.order_item_consumptions
  for select using (exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.id = order_item_consumptions.order_item_id
      and o.store_id = auth_store_id()
  ));

notify pgrst, 'reload schema';
