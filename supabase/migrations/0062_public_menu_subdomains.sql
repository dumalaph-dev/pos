-- Stable customer-facing hostnames for branch public menus.
--
-- This is deliberately separate from staff_login_slug. Staff links and menu
-- links have different ownership and future rename behavior, so changing one
-- must not silently change the other.

alter table public.stores
  add column if not exists public_menu_subdomain text;

do $$
declare
  store_row record;
  base_slug text;
  candidate text;
  suffix integer;
begin
  for store_row in
    select id, staff_login_slug, name
    from public.stores
    where nullif(trim(public_menu_subdomain), '') is null
    order by created_at, id
  loop
    base_slug := lower(trim(coalesce(store_row.staff_login_slug, store_row.name, 'store')));
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
    base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');
    base_slug := left(coalesce(nullif(base_slug, ''), 'store'), 63);
    base_slug := regexp_replace(base_slug, '-+$', '', 'g');
    base_slug := coalesce(nullif(base_slug, ''), 'store');
    if base_slug in (
      'account', 'admin', 'api', 'app', 'auth', 'demo', 'dev', 'display',
      'ftp', 'login', 'mail', 'platform', 'pos', 'signup', 'staff',
      'staging', 'status', 'support', 'test', 'www'
    ) then
      base_slug := left(base_slug, 58) || '-menu';
    end if;

    candidate := base_slug;
    suffix := 1;
    while exists (
      select 1
      from public.stores
      where public_menu_subdomain = candidate
        and id <> store_row.id
    ) loop
      suffix := suffix + 1;
      candidate := left(base_slug, greatest(1, 63 - length(suffix::text) - 1)) || '-' || suffix::text;
    end loop;

    update public.stores
    set public_menu_subdomain = candidate
    where id = store_row.id;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_public_menu_subdomain_format'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_public_menu_subdomain_format
      check (
        public_menu_subdomain is null
        or (
          public_menu_subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
          and public_menu_subdomain not in (
            'account', 'admin', 'api', 'app', 'auth', 'demo', 'dev', 'display',
            'ftp', 'login', 'mail', 'platform', 'pos', 'signup', 'staff',
            'staging', 'status', 'support', 'test', 'www'
          )
        )
      );
  end if;
end;
$$;

create unique index if not exists stores_public_menu_subdomain_idx
  on public.stores (public_menu_subdomain)
  where public_menu_subdomain is not null;
