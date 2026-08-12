-- Full-screen marketing and menu imagery for the customer-facing POS display.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'display-gallery',
  'display-gallery',
  true,
  1900000,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Display gallery photos are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'display-gallery');

create policy "Admins can upload display gallery photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'display-gallery'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);

create policy "Admins can update display gallery photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'display-gallery'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
)
with check (
  bucket_id = 'display-gallery'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);

create policy "Admins can delete display gallery photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'display-gallery'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);

create table if not exists display_gallery_items (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  store_id          uuid not null references stores(id) on delete cascade,
  kind              text not null default 'marketing' check (kind in ('marketing', 'menu')),
  title             text not null,
  image_url         text not null,
  image_path        text,
  overlay_position  text not null default 'left' check (overlay_position in ('left', 'right')),
  sort_order        integer not null default 0,
  is_active         boolean not null default true,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint display_gallery_title_length check (char_length(title) between 1 and 120),
  constraint display_gallery_image_check check (image_url ~ '^(https?://|/)')
);

create index if not exists display_gallery_store_order_idx
  on display_gallery_items (store_id, kind, is_active, sort_order, created_at);

grant select, insert, update, delete on display_gallery_items to authenticated;

alter table display_gallery_items enable row level security;

create policy display_gallery_admin_all on display_gallery_items
for all using (auth_is_admin() and org_id = auth_org_id())
with check (auth_is_admin() and org_id = auth_org_id());

create policy display_gallery_branch_read on display_gallery_items
for select using (store_id = auth_store_id());
