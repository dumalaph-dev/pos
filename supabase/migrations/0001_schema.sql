-- Lechon POS — schema (first cut). See docs/SCHEMA.md.
-- Money is integer centavos (bigint). store = a BRANCH; organizations = account root.

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────
create type user_role          as enum ('admin','manager','cashier');
create type pricing_mode        as enum ('fixed','per_kg');
create type order_status        as enum ('completed','voided','refunded');
create type payment_method      as enum ('cash','gcash','maya','card');
create type discount_type       as enum ('none','senior','pwd','custom');
create type stock_movement_type as enum ('receive','yield_in','yield_out','sale','waste','adjust');
create type printer_transport   as enum ('bluetooth','network','usb');

-- ── Tables ──────────────────────────────────────────────────────────────
create table organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  owner_profile_id uuid,                       -- FK added after profiles exists
  currency         text not null default 'PHP',
  settings         jsonb not null default '{}',
  created_at       timestamptz not null default now()
);

create table stores (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  address        text,
  tin            text,
  vat_registered boolean not null default false,
  vat_rate       numeric(5,4) not null default 0.12,
  currency       text not null default 'PHP',
  settings       jsonb not null default '{}',  -- receipt header/footer, paper default, branding
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table devices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  store_id          uuid not null references stores(id) on delete cascade,
  name              text not null,
  device_prefix     text not null,             -- e.g. 'T1' → order-no prefix
  printer_transport printer_transport,
  printer_config    jsonb not null default '{}', -- {ble_id} | {ip,port} | {paper_width}
  paired_display_id text,
  is_active         boolean not null default true,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (store_id, device_prefix)
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references organizations(id) on delete cascade,
  store_id   uuid references stores(id) on delete set null,  -- home branch (null = org-wide admin)
  full_name  text not null,
  role       user_role not null default 'cashier',
  pin_hash   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

alter table organizations
  add constraint org_owner_fk foreign key (owner_profile_id) references profiles(id);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  store_id   uuid not null references stores(id) on delete cascade,
  name       text not null,
  icon       text,
  sort_order int not null default 0,
  is_active  boolean not null default true
);

create table products (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  category_id  uuid references categories(id) on delete set null,
  name         text not null,
  pricing_mode pricing_mode not null default 'fixed',
  price        bigint not null,                 -- centavos; per_kg = price per kg
  unit         text not null default 'pcs',
  track_stock  boolean not null default false,
  image_url    text,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table shifts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  store_id      uuid not null references stores(id) on delete cascade,
  device_id     uuid references devices(id) on delete set null,
  cashier_id    uuid not null references profiles(id),
  opened_at     timestamptz not null default now(),
  opening_cash  bigint not null default 0,
  closed_at     timestamptz,
  declared_cash bigint,
  expected_cash bigint,
  variance      bigint,
  note          text
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  local_uuid        uuid not null,              -- client idempotency key
  org_id            uuid not null references organizations(id) on delete cascade,
  store_id          uuid not null references stores(id) on delete cascade,
  device_id         uuid references devices(id) on delete set null,
  order_no          text not null,              -- {branch}-{device}-{yyMMdd}-{seq}
  shift_id          uuid references shifts(id),
  cashier_id        uuid not null references profiles(id),
  status            order_status not null default 'completed',
  subtotal          bigint not null,
  discount_type     discount_type not null default 'none',
  discount_amount   bigint not null default 0,
  discount_ref      text,
  vatable_sale      bigint not null default 0,
  vat_amount        bigint not null default 0,
  vat_exempt_sale   bigint not null default 0,
  total             bigint not null,
  payment_method    payment_method not null,
  payment_ref       text,
  amount_tendered   bigint,
  change_due        bigint,
  note              text,
  created_at_device timestamptz not null,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (local_uuid)                           -- ← idempotent sync
);

create table order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders(id) on delete cascade,
  product_id            uuid references products(id) on delete set null,
  name_snapshot         text not null,
  pricing_mode_snapshot pricing_mode not null,
  unit_price_snapshot   bigint not null,
  qty                   numeric(10,2) not null default 1,
  weight_kg             numeric(10,3),
  line_total            bigint not null
);

create table stock_movements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  type         stock_movement_type not null,
  qty          numeric(12,3) not null,
  unit         text not null,
  unit_cost    bigint,
  reason       text,
  ref_order_id uuid references orders(id),
  actor_id     uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  store_id   uuid references stores(id) on delete cascade,
  actor_id   uuid references profiles(id),
  action     text not null,
  entity     text,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  device_id  uuid references devices(id),
  created_at timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────
create index on stores (org_id);
create index on devices (store_id);
create index on profiles (org_id);
create index on categories (store_id, sort_order);
create index on products (store_id, category_id, is_active);
create index on orders (store_id, created_at desc);
create index on orders (org_id, created_at desc);
create index on orders (shift_id);
create index on order_items (order_id);
create index on stock_movements (store_id, product_id, created_at);
create index on audit_logs (store_id, created_at desc);
create index on shifts (store_id, cashier_id, opened_at desc);
