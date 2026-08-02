-- Mario's Lechon House POS - business records for the Admin backoffice.
-- Customers and suppliers are organization directories. Expenses are a
-- branch-scoped, editable ledger; application actions still require admin role.

create table customers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  store_id   uuid references stores(id) on delete set null,
  name       text not null,
  phone      text,
  email      text,
  address    text,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  store_id      uuid references stores(id) on delete set null,
  name          text not null,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table expenses (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  store_id       uuid not null references stores(id) on delete cascade,
  category       text not null,
  description    text not null,
  amount         bigint not null check (amount >= 0),
  incurred_on    date not null default current_date,
  payment_method text not null default 'cash' check (payment_method in ('cash', 'gcash', 'maya', 'card', 'other')),
  reference      text,
  notes          text,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index customers_org_name_idx on customers (org_id, name);
create index customers_org_active_name_idx on customers (org_id, is_active, name);
create index suppliers_org_name_idx on suppliers (org_id, name);
create index suppliers_org_active_name_idx on suppliers (org_id, is_active, name);
create index expenses_org_date_idx on expenses (org_id, incurred_on desc, created_at desc);
create index expenses_store_date_idx on expenses (store_id, incurred_on desc, created_at desc);

grant select, insert, update, delete on customers, suppliers, expenses to authenticated;

alter table customers enable row level security;
alter table suppliers enable row level security;
alter table expenses enable row level security;

create policy customers_org_read on customers
  for select using (org_id = auth_org_id());
create policy customers_admin_write on customers
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

create policy suppliers_org_read on suppliers
  for select using (org_id = auth_org_id());
create policy suppliers_admin_write on suppliers
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

create policy expenses_branch_read on expenses
  for select using (
    (auth_is_admin() and org_id = auth_org_id())
    or store_id = auth_store_id()
  );
create policy expenses_admin_write on expenses
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
