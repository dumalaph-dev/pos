-- Dumala POS — product photo storage.
-- Product photos are resized in the browser before upload and stored under
-- an organization-prefixed path so admins can replace and clean up safely.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  921600,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Product photos are publicly readable"
on storage.objects
for select
to public
using (bucket_id = 'product-images');

create policy "Admins can upload product photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);

create policy "Admins can update product photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
)
with check (
  bucket_id = 'product-images'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);

create policy "Admins can delete product photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and auth_is_admin()
  and (storage.foldername(name))[1] = auth_org_id()::text
);
