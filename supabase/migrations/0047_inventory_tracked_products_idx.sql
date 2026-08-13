-- Inventory only renders products that participate in stock tracking. Keep
-- that scoped, ordered lookup indexable as the catalog grows.

create index if not exists products_org_store_tracking_sort_idx
  on products (org_id, store_id, track_stock, sort_order, name);
