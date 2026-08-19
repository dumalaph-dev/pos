-- Public order-ahead flow.
--
-- Online orders are intentionally separate from cashier orders. They enter a
-- small owner-managed queue first and can later be reconciled into the normal
-- POS sale flow when the store takes payment at pickup.

create type public.online_order_status as enum ('new', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled');

create table public.online_orders (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  store_id        uuid not null references public.stores(id) on delete cascade,
  order_no        text not null,
  customer_name   text not null,
  customer_phone  text not null,
  pickup_slot     text not null default 'asap',
  pickup_date     date not null default current_date,
  status          public.online_order_status not null default 'new',
  queue_position  integer not null default 1,
  subtotal        bigint not null,
  total           bigint not null,
  note            text,
  eta_at          timestamptz not null,
  confirmed_at    timestamptz,
  ready_at        timestamptz,
  picked_up_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (store_id, order_no)
);

create table public.online_order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.online_orders(id) on delete cascade,
  product_id            uuid references public.products(id) on delete set null,
  name_snapshot         text not null,
  pricing_mode_snapshot public.pricing_mode not null,
  unit_price_snapshot   bigint not null,
  qty                   numeric(10,2) not null default 1,
  line_total            bigint not null
);

create index online_orders_store_queue_idx
  on public.online_orders (store_id, status, created_at);
create index online_order_items_order_idx
  on public.online_order_items (order_id);

grant select, update on public.online_orders to authenticated;
grant select on public.online_order_items to authenticated;
grant all on public.online_orders, public.online_order_items to service_role;

alter table public.online_orders enable row level security;
alter table public.online_order_items enable row level security;

create policy online_orders_admin_read on public.online_orders
  for select using (auth_is_admin() and org_id = auth_org_id());

create policy online_orders_branch_read on public.online_orders
  for select using (store_id = auth_store_id());

create policy online_orders_owner_update on public.online_orders
  for update using (
    (auth_is_admin() or auth_role() = 'manager')
    and org_id = auth_org_id()
    and (auth_is_admin() or store_id = auth_store_id())
  )
  with check (
    (auth_is_admin() or auth_role() = 'manager')
    and org_id = auth_org_id()
    and (auth_is_admin() or store_id = auth_store_id())
  );

create policy online_order_items_read on public.online_order_items
  for select using (exists (
    select 1
    from public.online_orders o
    where o.id = online_order_items.order_id
      and (o.store_id = auth_store_id() or (auth_is_admin() and o.org_id = auth_org_id()))
  ));
