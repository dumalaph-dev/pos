-- Lechon POS — Row-Level Security. See docs/SCHEMA.md §4.
-- RLS is the ONLY trust boundary. Scope is derived from the caller's profile,
-- never from client-supplied org_id/store_id.

-- ── Privileges: authenticated gets table access; RLS narrows rows ─────────
grant usage on schema public to authenticated, anon;
-- Mutable config tables: full DML (RLS restricts which rows).
grant select, insert, update, delete on
  organizations, stores, devices, profiles, categories, products, shifts
  to authenticated;
-- Append-only tables: no update/delete privilege at all (defense in depth).
grant select, insert on orders, order_items, stock_movements, audit_logs
  to authenticated;

-- service_role (trusted backend / seed scripts) gets full table access.
-- It bypasses RLS, but still needs table privileges. Append-only triggers
-- still block UPDATE/DELETE on orders/audit/stock even for service_role.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- ── Helper functions (read the caller's profile) ─────────────────────────
create or replace function auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function auth_store_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select store_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid()), false)
$$;

-- ── Enable RLS everywhere ────────────────────────────────────────────────
alter table organizations   enable row level security;
alter table stores          enable row level security;
alter table devices         enable row level security;
alter table profiles        enable row level security;
alter table categories      enable row level security;
alter table products        enable row level security;
alter table shifts          enable row level security;
alter table orders          enable row level security;
alter table order_items     enable row level security;
alter table stock_movements enable row level security;
alter table audit_logs      enable row level security;

-- ── organizations: everyone in the org can read it; admin writes ─────────
create policy org_read on organizations
  for select using (id = auth_org_id());
create policy org_admin_write on organizations
  for all using (auth_is_admin() and id = auth_org_id())
  with check (auth_is_admin() and id = auth_org_id());

-- ── profiles: read self or (admin) org; admin manages staff ──────────────
create policy profiles_read on profiles
  for select using (id = auth.uid() or (auth_is_admin() and org_id = auth_org_id()));
create policy profiles_admin_write on profiles
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

-- ── stores (branches): admin all in org; branch users read own branch ────
create policy stores_admin_all on stores
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy stores_branch_read on stores
  for select using (id = auth_store_id());

-- ── devices: admin all; branch users read + configure own tablet ─────────
create policy devices_admin_all on devices
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy devices_branch_read on devices
  for select using (store_id = auth_store_id());
create policy devices_branch_update on devices
  for update using (store_id = auth_store_id())
  with check (store_id = auth_store_id());

-- ── categories / products: admin all in org; branch read own store ───────
create policy categories_admin_all on categories
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy categories_branch_read on categories
  for select using (store_id = auth_store_id());

create policy products_admin_all on products
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy products_branch_read on products
  for select using (store_id = auth_store_id());

-- ── shifts: admin all; cashier opens/reads/closes own shift ──────────────
create policy shifts_admin_all on shifts
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy shifts_cashier_read on shifts
  for select using (store_id = auth_store_id() and cashier_id = auth.uid());
create policy shifts_cashier_insert on shifts
  for insert with check (
    store_id = auth_store_id() and cashier_id = auth.uid() and org_id = auth_org_id()
  );
create policy shifts_cashier_close on shifts
  for update using (store_id = auth_store_id() and cashier_id = auth.uid())
  with check (store_id = auth_store_id() and cashier_id = auth.uid());

-- ── orders: append-only. admin reads org; branch reads store; insert only ─
create policy orders_admin_read on orders
  for select using (auth_is_admin() and org_id = auth_org_id());
create policy orders_branch_read on orders
  for select using (store_id = auth_store_id());
create policy orders_insert on orders
  for insert with check (
    store_id = auth_store_id() and cashier_id = auth.uid() and org_id = auth_org_id()
  );
-- No UPDATE/DELETE policy → orders are immutable (voids are new rows, later).

-- ── order_items: scoped through the parent order ─────────────────────────
create policy order_items_read on order_items
  for select using (exists (
    select 1 from orders o where o.id = order_items.order_id
      and (o.store_id = auth_store_id() or (auth_is_admin() and o.org_id = auth_org_id()))
  ));
create policy order_items_insert on order_items
  for insert with check (exists (
    select 1 from orders o where o.id = order_items.order_id
      and o.store_id = auth_store_id() and o.cashier_id = auth.uid()
  ));

-- ── stock_movements: append-only. admin insert org; branch read store ────
create policy stock_admin_insert on stock_movements
  for insert with check (auth_is_admin() and org_id = auth_org_id());
create policy stock_sale_insert on stock_movements
  for insert with check (type = 'sale' and store_id = auth_store_id());
create policy stock_admin_read on stock_movements
  for select using (auth_is_admin() and org_id = auth_org_id());
create policy stock_branch_read on stock_movements
  for select using (store_id = auth_store_id());

-- ── audit_logs: append-only. any org member inserts; admin/branch read ───
create policy audit_insert on audit_logs
  for insert with check (org_id = auth_org_id());
create policy audit_read on audit_logs
  for select using (
    (auth_is_admin() and org_id = auth_org_id()) or store_id = auth_store_id()
  );

-- ── Defense-in-depth: hard-block UPDATE/DELETE on append-only tables ─────
create or replace function forbid_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'append-only table: % not allowed', tg_op;
end;
$$;

create trigger no_mutate_audit before update or delete on audit_logs
  for each row execute function forbid_mutation();
create trigger no_mutate_stock before update or delete on stock_movements
  for each row execute function forbid_mutation();
create trigger no_mutate_orders before update or delete on orders
  for each row execute function forbid_mutation();
create trigger no_mutate_order_items before update or delete on order_items
  for each row execute function forbid_mutation();
