-- Dumala POS — bounded sales summaries for admin pages.
--
-- Sales only needs the top five completed products for its dashboard panel;
-- receipt line items are fetched separately for the visible page. Keeping the
-- aggregation in Postgres prevents a multi-day order_items ledger from being
-- serialized into every Sales document.

create or replace function admin_sales_top_items(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_store_id uuid default null,
  p_limit integer default 5
)
returns table (
  product_id uuid,
  name text,
  unit text,
  qty numeric,
  total bigint
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
    sum(oi.line_total)::bigint as total
  from order_items oi
  join orders o on o.id = oi.order_id
  left join products p on p.id = oi.product_id
  where o.org_id = p_org_id
    and o.status = 'completed'
    and o.reversal_of is null
    and o.created_at >= p_from
    and o.created_at < p_to
    and (p_store_id is null or o.store_id = p_store_id)
    and not exists (
      select 1
      from orders reversal
      where reversal.org_id = o.org_id
        and reversal.reversal_of = o.id
    )
  group by oi.product_id, oi.name_snapshot, p.unit, oi.weight_kg is not null
  order by total desc, qty desc, name asc
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

grant execute on function admin_sales_top_items(uuid, timestamptz, timestamptz, uuid, integer) to authenticated;

create index if not exists orders_org_store_created_idx
  on orders (org_id, store_id, created_at desc);

create index if not exists order_items_order_product_idx
  on order_items (order_id, product_id);
