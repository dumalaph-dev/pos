-- Lechon POS — server-side current stock aggregation (admin latency fix).
--
-- The dashboard and sales pages previously downloaded up to 10,000 raw
-- stock_movements rows on every load and re-derived on-hand stock in
-- JavaScript. This RPC returns the same per-branch/per-product totals
-- computed in Postgres, so admin pages transfer one small row per stocked
-- product instead of the whole ledger. The delta rules mirror
-- src/lib/inventory.ts `stockMovementDelta`:
--   receive / yield_in  → +qty
--   yield_out / sale / waste → -qty
--   adjust → signed qty (positive adds, negative removes)
-- The function is SECURITY INVOKER so row-level security still scopes the
-- aggregation to exactly what the caller may read.

create or replace function current_stock(p_org_id uuid)
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
  from stock_movements sm
  where sm.org_id = p_org_id
  group by sm.store_id, sm.product_id
$$;

grant execute on function current_stock(uuid) to authenticated;

-- Cover the org-scoped group-by used by current_stock.
create index if not exists stock_movements_org_store_product_idx
  on stock_movements (org_id, store_id, product_id);
