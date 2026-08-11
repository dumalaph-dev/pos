-- Branch-owned content for the passive customer-facing POS display.
-- The cashier POS reads active rows for its own branch; organization admins
-- manage the content from the POS settings workspace.

create table if not exists display_promotions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  eyebrow     text not null default '',
  title       text not null,
  detail      text not null default '',
  tagline     text not null default '',
  image_url   text,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint display_promotions_eyebrow_length check (char_length(eyebrow) <= 80),
  constraint display_promotions_title_length check (char_length(title) between 1 and 120),
  constraint display_promotions_detail_length check (char_length(detail) <= 240),
  constraint display_promotions_tagline_length check (char_length(tagline) <= 120),
  constraint display_promotions_image_check check (image_url is null or image_url ~ '^/[A-Za-z0-9_./-]+$'),
  constraint display_promotions_window_check check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists display_promotions_store_order_idx
  on display_promotions (store_id, is_active, sort_order, created_at);

create index if not exists display_promotions_active_window_idx
  on display_promotions (store_id, is_active, starts_at, ends_at);

grant select, insert, update, delete on display_promotions to authenticated;

alter table display_promotions enable row level security;

create policy display_promotions_admin_all on display_promotions
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());

create policy display_promotions_branch_read on display_promotions
  for select using (store_id = auth_store_id());
