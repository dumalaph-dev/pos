-- Admin pages scope reads by organization before sorting or filtering.
-- These indexes keep dashboard, reports, inventory, and staff queries fast
-- as the organization grows across branches.

create index if not exists products_org_name_idx
  on products (org_id, name);

create index if not exists categories_org_sort_name_idx
  on categories (org_id, sort_order, name);

create index if not exists profiles_org_name_idx
  on profiles (org_id, full_name);

create index if not exists devices_org_active_idx
  on devices (org_id, is_active);

create index if not exists stock_movements_org_created_idx
  on stock_movements (org_id, created_at desc);

create index if not exists orders_org_status_created_idx
  on orders (org_id, status, created_at desc);
