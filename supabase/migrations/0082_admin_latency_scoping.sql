-- Dumala POS — split navigation timing and bound high-volume admin reads.
--
-- The browser's total navigation duration combines request/response time with
-- client-side hydration and rendering. These optional fields let Fleet Health
-- show the two useful boundaries without collecting URLs or tenant data.

alter table public.admin_performance_samples
  add column if not exists ttfb_ms integer check (ttfb_ms between 0 and 120000),
  add column if not exists transfer_ms integer check (transfer_ms between 0 and 120000),
  add column if not exists browser_settle_ms integer check (browser_settle_ms between 0 and 120000);

-- A branch-scoped overload keeps existing one-argument callers compatible
-- during rollout while allowing Products and Inventory to avoid aggregating
-- every branch's stock ledger.
create or replace function public.current_stock(
  p_org_id uuid,
  p_store_id uuid
)
returns table (store_id uuid, product_id uuid, qty numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    sm.store_id,
    sm.product_id,
    sum(case
      when sm.type in ('receive', 'yield_in') then sm.qty
      when sm.type in ('yield_out', 'sale', 'waste') then -sm.qty
      else sm.qty
    end) as qty
  from public.stock_movements sm
  where sm.org_id = p_org_id
    and (p_store_id is null or sm.store_id = p_store_id)
  group by sm.store_id, sm.product_id
$$;

grant execute on function public.current_stock(uuid, uuid) to authenticated;

create or replace function public.current_inventory_stock(
  p_org_id uuid,
  p_store_id uuid
)
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
    and (p_store_id is null or i.store_id = p_store_id)
    and (auth_is_admin() or i.store_id = auth_store_id())
  group by i.store_id, i.id;
$$;

grant execute on function public.current_inventory_stock(uuid, uuid) to authenticated;

-- Products needs only the two period totals, not every order header and line
-- item. Reversal-aware filtering matches the existing sales summary RPC.
create or replace function public.admin_sales_period_totals(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_store_id uuid
)
returns table (
  order_count bigint,
  total_sales bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint as order_count,
    coalesce(sum(o.total), 0)::bigint as total_sales
  from public.orders o
  where o.org_id = p_org_id
    and o.status = 'completed'
    and o.reversal_of is null
    and o.created_at >= p_from
    and o.created_at < p_to
    and (p_store_id is null or o.store_id = p_store_id)
    and not exists (
      select 1
      from public.orders reversal
      where reversal.org_id = o.org_id
        and reversal.reversal_of = o.id
    );
$$;

grant execute on function public.admin_sales_period_totals(uuid, timestamptz, timestamptz, uuid) to authenticated;

-- The Product page also needs the number of orders represented by each top
-- item. Keep this separate from admin_sales_top_items so that its established
-- return contract remains unchanged for the Sales page.
create or replace function public.admin_products_top_items(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_store_id uuid,
  p_limit integer
)
returns table (
  product_id uuid,
  name text,
  unit text,
  qty numeric,
  total bigint,
  order_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oi.product_id,
    oi.name_snapshot as name,
    coalesce(p.unit, case when oi.weight_kg is not null then 'kg' else 'item' end) as unit,
    sum(case when oi.weight_kg is not null then oi.weight_kg else oi.qty end) as qty,
    sum(oi.line_total)::bigint as total,
    count(distinct o.id)::bigint as order_count
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.products p on p.id = oi.product_id
  where o.org_id = p_org_id
    and o.status = 'completed'
    and o.reversal_of is null
    and o.created_at >= p_from
    and o.created_at < p_to
    and (p_store_id is null or o.store_id = p_store_id)
    and not exists (
      select 1
      from public.orders reversal
      where reversal.org_id = o.org_id
        and reversal.reversal_of = o.id
    )
  group by oi.product_id, oi.name_snapshot, p.unit, oi.weight_kg is not null
  order by total desc, qty desc, name asc
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

grant execute on function public.admin_products_top_items(uuid, timestamptz, timestamptz, uuid, integer) to authenticated;

create index if not exists orders_completed_org_store_created_idx
  on public.orders (org_id, store_id, created_at desc)
  where status = 'completed' and reversal_of is null;

notify pgrst, 'reload schema';
