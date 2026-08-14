# Dumala POS — Database Schema & RLS Spec

**Companion to:** [POS_PRD.md](POS_PRD.md) §10 · [ARCHITECTURE.md](ARCHITECTURE.md)
**Engine:** Postgres (Supabase). **The single highest-risk area is tenant isolation** — an owner's branch must never see another org's or another branch's data. Design RLS first; test it with a two-branch, two-org fixture before any feature.

**Conventions**
- Money is stored as **integer centavos** (`bigint`) — never floats. `₱850.00` = `85000`. Weight (`kg`) is `numeric(10,3)`.
- `store` = a **branch** (a row in `stores`); `organizations` is the account root.
- All timestamps `timestamptz`, default `now()`. Every scoped table carries `org_id` + `store_id`.
- `id` = `uuid default gen_random_uuid()`.

---

## 1. Enums

```sql
create type user_role          as enum ('admin','manager','cashier');
create type pricing_mode        as enum ('fixed','per_kg');
create type order_status        as enum ('completed','voided','refunded');
create type payment_method      as enum ('cash','gcash','maya','card');
create type discount_type       as enum ('none','senior','pwd','custom');
create type stock_movement_type as enum ('receive','yield_in','yield_out','sale','waste','adjust');
create type printer_transport   as enum ('bluetooth','network','usb');
```

---

## 2. Tables (DDL — first cut)

```sql
create extension if not exists pgcrypto;

-- Account root
create table organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  owner_profile_id  uuid,                     -- FK added after profiles exists
  currency          text not null default 'PHP',
  settings          jsonb not null default '{}',
  created_at        timestamptz not null default now()
);

-- A branch
create table stores (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  address       text,
  tin           text,
  vat_registered boolean not null default false,
  vat_rate      numeric(5,4) not null default 0.12,
  currency      text not null default 'PHP',
  settings      jsonb not null default '{}',   -- receipt header/footer, paper default, branding
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- A physical tablet; printer + display settings live here
create table devices (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  store_id          uuid not null references stores(id) on delete cascade,
  name              text not null,
  device_prefix     text not null,             -- e.g. 'T1' → order no prefix
  printer_transport printer_transport,
  printer_config    jsonb not null default '{}', -- {ble_id} | {ip,port,bridge_host,bridge_port} | {paper_width}
  paired_display_id text,                       -- customer display pairing token
  is_active         boolean not null default true,
  last_seen_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (store_id, device_prefix)
);

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  store_id    uuid references stores(id) on delete set null,  -- home branch (null for org-wide admin)
  full_name   text not null,
  role        user_role not null default 'cashier',
  pin_hash    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
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
  price        bigint not null,                 -- centavos; per-kg = price per kg
  unit         text not null default 'pcs',     -- 'pcs' | 'kg'
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
  discount_ref      text,                       -- SC/PWD/OSCA id + name
  vatable_sale      bigint not null default 0,
  vat_amount        bigint not null default 0,
  vat_exempt_sale   bigint not null default 0,
  total             bigint not null,
  payment_method    payment_method not null,
  payment_ref       text,                       -- gcash/maya ref, card last4
  amount_tendered   bigint,
  change_due        bigint,
  note              text,
  created_at_device timestamptz not null,       -- original device time (offline-safe)
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  unique (local_uuid)                           -- ← idempotent sync
);

create table order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references orders(id) on delete cascade,
  product_id           uuid references products(id) on delete set null,
  name_snapshot        text not null,
  pricing_mode_snapshot pricing_mode not null,
  unit_price_snapshot  bigint not null,         -- centavos at time of sale
  qty                  numeric(10,2) not null default 1,
  weight_kg            numeric(10,3),
  line_total           bigint not null          -- centavos
);

create table stock_movements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  store_id     uuid not null references stores(id) on delete cascade,
  product_id   uuid not null references products(id) on delete cascade,
  type         stock_movement_type not null,
  qty          numeric(12,3) not null,          -- signed by convention per type
  unit         text not null,
  unit_cost    bigint,                          -- centavos
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
  action     text not null,                     -- 'sale.completed','order.void',...
  entity     text,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  device_id  uuid references devices(id),
  created_at timestamptz not null default now()
);
```

---

## 3. Indexes

```sql
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
```

---

## 4. RLS — the isolation model

**Every table has RLS enabled.** Access is derived from the caller's `profiles` row, never from client-supplied `org_id`/`store_id`.

### Helper functions (SECURITY DEFINER, read the caller's profile)
```sql
create or replace function auth_org_id() returns uuid
  language sql stable security definer as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function auth_store_id() returns uuid
  language sql stable security definer as $$
  select store_id from profiles where id = auth.uid()
$$;

create or replace function auth_role() returns user_role
  language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer as $$
  select role = 'admin' from profiles where id = auth.uid()
$$;
```

### Scoping rules
| Role | Read scope | Write scope |
|---|---|---|
| **admin** | entire `org_id` (all branches) | entire `org_id` |
| **manager** | own `store_id` | own `store_id` (no staff/branch admin) |
| **cashier** | own `store_id`, own shift's orders | INSERT orders/items/shift in own `store_id`; no update/delete |

### Employee workspace role presets

The Employees workspace seeds four organization-scoped permission presets: **Admin**, **Manager**, **Cashier**, and **Staff**. These are stored in `employee_roles` and can be adjusted by an organization admin. They are separate from `profiles.role`, which remains the server-enforced system access tier (`admin`, `manager`, or `cashier`) used by route guards and RLS. A Staff preset therefore does not grant admin or POS access by itself; choose the appropriate system access tier when creating the employee account.

### Policy pattern (applied per table)
```sql
alter table products enable row level security;

-- Admin: full access within their org
create policy products_admin_all on products
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

-- Manager/cashier: read own branch
create policy products_branch_read on products
  for select using (store_id = auth_store_id());
```

Apply the **same shape** to `categories`, `stores` (read own branch; admin writes), `devices`, `shifts`.

### Orders — cashier can insert, never mutate
```sql
alter table orders enable row level security;

create policy orders_admin_all on orders
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

create policy orders_branch_read on orders
  for select using (store_id = auth_store_id());

create policy orders_cashier_insert on orders
  for insert with check (
    store_id = auth_store_id()
    and cashier_id = auth.uid()
    and org_id = auth_org_id()
  );
-- NOTE: no UPDATE/DELETE policy for manager/cashier → denied by default.
```
`order_items` mirrors orders via a join to the parent order's `store_id`.

### Append-only tables (`audit_logs`, `stock_movements`, and orders' immutability)
No `UPDATE`/`DELETE` policy is granted to anyone (including admin) → those operations are rejected by RLS. Voids/refunds are **new** rows (a reversing `stock_movement`, a new `order.status` row is *not* an update — model voids as a linked new order or an audit event, never a mutation of the original).

```sql
alter table audit_logs enable row level security;
create policy audit_read on audit_logs
  for select using (
    (auth_is_admin() and org_id = auth_org_id())
    or store_id = auth_store_id()
  );
create policy audit_insert on audit_logs
  for insert with check (org_id = auth_org_id());
-- deliberately NO update/delete policy anywhere.
```

> To make append-only bulletproof even against the service role in app code, also add a trigger that raises on `UPDATE`/`DELETE` for `audit_logs` and `stock_movements`.

---

## 5. Order-number generation (offline-safe)

Order numbers are generated **on the client** (offline) as `{branch_prefix}-{device_prefix}-{yyMMdd}-{seq}`, where `seq` is a per-device daily counter from IndexedDB. The server does **not** assign the number — it only enforces `unique(local_uuid)`. This guarantees no collisions across offline branches/tablets. See [ARCHITECTURE.md](ARCHITECTURE.md) §Offline.

---

## 6. Multi-branch operations

- **Add branch:** insert into `stores` (admin only, `org_id = auth_org_id()`).
- **Clone menu:** server-side function copies `categories` + `products` from a source `store_id` (same org) into the new branch — new ids, prices/SKUs then diverge freely.
- **Bind tablet:** insert/activate a `devices` row for the branch; the device stores its `store_id` + `device_prefix` locally.

---

## 7. Test fixtures (write these before features)

Seed **two orgs**, each with **two branches**, each with a cashier + admin, and assert:
1. Org A admin cannot read any Org B row (any table).
2. Branch A cashier cannot read Branch B orders/products (same org).
3. A cashier `UPDATE`/`DELETE` on any `orders`/`audit_logs` row is rejected.
4. A price edit on Branch A leaves Branch B's product price unchanged.
5. `insert` order with a mismatched `store_id`/`cashier_id` is rejected by `with check`.
6. Two devices inserting the same `local_uuid` → second insert fails (idempotent sync).

---

## 8. Platform operations (migrations 0027–0030)

Platform-wide configuration is intentionally isolated from tenant RLS. The
server-only platform admin client reads and writes these tables after checking
the `PLATFORM_ADMIN_EMAILS` allowlist:

- `platform_billing_settings` stores the PHP monthly base price in integer
  centavos.
- `platform_billing_variants` stores monthly or annual durations, adjustable
  discounts, active/offered state, and the corresponding PayMongo plan ID.
- `platform_policies` stores versioned `billing` and `support` drafts or
  published policies. Checkout, suspension, and support mutations must require
  both policy rows to be `published`.
- `billing_provider_events` stores PayMongo event IDs and payloads for signed,
  idempotent webhook processing. Organizations also retain the provider
  customer, plan, subscription, and first payment-intent IDs needed to
  reconcile recurring billing.
- `support_cases` stores platform-created support requests with a priority,
  lifecycle status, and first-response due time calculated from the published
  support policy. It is service-role-only while the platform console owns the
  workflow; migration 0029 removes inherited tenant table grants, and
  tenant-facing case history can be added later without changing the policy
  gate.

`organizations.account_status` plus the suspension metadata columns are the
account-lifecycle projection. Platform suspension and restore actions write an
append-only `audit_logs` record with the platform operator ID in the JSON
snapshot because platform operators are not required to have tenant `profiles`.
Migration 0030 also makes the active organization/store helper functions return
no tenant context for suspended users, so the suspension boundary applies to
RLS and security-definer business functions as well as the route UI.

Migration 0041 applies the same defense-in-depth pattern to subscription
entitlement. A `trialing` organization is current only while its stored trial
end is strictly later than `now()`; at the boundary, the server-side profile
guard atomically transitions it to the existing `paused` status. The RLS helper
functions independently remove the organization/store/role context for an
expired trial, so direct POS and admin table/RPC calls fail even if no page has
yet performed the transition. The owner can still read the organization row,
open `/admin/billing`, and submit trial feedback through the billing-specific
policy. A successful PayMongo activation writes `active`, and the provider
webhook plus payment-status paths invalidate cached profiles so access returns
immediately.

---

## 9. Open schema questions

- **Void/refund modeling (implemented):** linked reversing orders remain the immutable accounting truth. POS voids use `order_action_approvals`, `verify_void_pin`, and `record_pos_order_void`; the approval is one-use, expires after five minutes, is branch-scoped for managers, and writes both approval and reversal audit events. Refunds continue through the admin order-action path.
- **VAT computation:** store computed at sale time (snapshot) — confirm SC/PWD VAT-exempt split formula with the owner.
- **Product images:** Supabase Storage bucket per org; cache in the PWA for offline tiles.
- **`profiles.pin_hash`:** used for server-managed manager/admin approval PINs. The offline unlock still stores only a salted device-local PBKDF2 verifier in IndexedDB (see ARCHITECTURE security).
