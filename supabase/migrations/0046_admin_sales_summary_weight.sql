-- Keep sales summary quantities aligned with the application salesQuantity()
-- helper: only positive recorded weight uses kilograms; otherwise use qty.

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
    coalesce(p.unit, case when bool_or(coalesce(oi.weight_kg, 0) > 0) then 'kg' else 'item' end) as unit,
    sum(case when coalesce(oi.weight_kg, 0) > 0 then oi.weight_kg else oi.qty end) as qty,
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
  group by oi.product_id, oi.name_snapshot, p.unit
  order by total desc, qty desc, name asc
  limit greatest(1, least(coalesce(p_limit, 5), 25));
$$;

grant execute on function admin_sales_top_items(uuid, timestamptz, timestamptz, uuid, integer) to authenticated;
