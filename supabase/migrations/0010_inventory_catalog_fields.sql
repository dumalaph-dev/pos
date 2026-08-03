-- Inventory catalog fields used by the Admin Inventory workspace.
-- Run after 0009_admin_business_records.sql so products can reference suppliers.

alter table products
  add column if not exists sku text,
  add column if not exists barcode text,
  add column if not exists cost_price bigint,
  add column if not exists min_stock numeric(12,3) not null default 2,
  add column if not exists supplier_id uuid references suppliers(id) on delete set null;

alter table products
  drop constraint if exists products_cost_price_check,
  add constraint products_cost_price_check check (cost_price is null or cost_price >= 0),
  drop constraint if exists products_min_stock_check,
  add constraint products_min_stock_check check (min_stock >= 0);

create unique index if not exists products_org_sku_unique
  on products (org_id, lower(sku))
  where sku is not null and btrim(sku) <> '';

create unique index if not exists products_org_barcode_unique
  on products (org_id, barcode)
  where barcode is not null and btrim(barcode) <> '';

create index if not exists products_org_supplier_idx
  on products (org_id, supplier_id);
