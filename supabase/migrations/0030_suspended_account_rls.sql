-- Make account suspension effective below the UI layer. Suspended users may
-- still read their own organization row so the app can show the reason and
-- appeal contact, but all tenant-scoped org/store contexts become unavailable
-- to RLS policies and security-definer business functions.

create or replace function auth_org_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.org_id
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
$$;

create or replace function auth_store_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select p.store_id
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
$$;

create or replace function auth_role() returns user_role
  language sql stable security definer set search_path = public as $$
  select p.role
  from profiles p
  join organizations o on o.id = p.org_id
  where p.id = auth.uid()
    and o.account_status = 'active'
$$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.role = 'admin'
    from profiles p
    join organizations o on o.id = p.org_id
    where p.id = auth.uid()
      and o.account_status = 'active'
  ), false)
$$;

drop policy if exists org_read on organizations;
create policy org_read on organizations
  for select using (
    id = auth_org_id()
    or id = (select org_id from profiles where id = auth.uid())
  );
