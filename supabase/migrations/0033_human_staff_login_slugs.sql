-- Human-readable staff entry links.
--
-- staff_login_key remains the stable UUID identifier used by existing /store/
-- links. staff_login_slug is the shareable, memorable /staff/{slug} alias.

alter table public.stores
  add column if not exists staff_login_slug text;

create or replace function public.staff_login_slug_part(value text)
returns text
language plpgsql
immutable
as $$
declare
  normalized text;
begin
  normalized := lower(trim(coalesce(value, '')));
  normalized := regexp_replace(normalized, '[^a-z0-9]+', '-', 'g');
  normalized := regexp_replace(normalized, '(^-+|-+$)', '', 'g');
  return nullif(left(normalized, 40), '');
end;
$$;

create or replace function public.build_staff_login_slug(org_name text, branch_name text)
returns text
language plpgsql
immutable
as $$
declare
  org_part text;
  branch_part text;
  combined text;
begin
  org_part := public.staff_login_slug_part(org_name);
  branch_part := public.staff_login_slug_part(branch_name);
  branch_part := regexp_replace(coalesce(branch_part, ''), '(^|-)branch$', '', 'i');
  branch_part := nullif(regexp_replace(branch_part, '(^-+|-+$)', '', 'g'), '');
  combined := concat_ws('-', org_part, branch_part);
  return nullif(left(combined, 80), '');
end;
$$;

do $$
declare
  branch_row record;
  base_slug text;
  candidate text;
  suffix integer;
begin
  for branch_row in
    select s.id, s.name as branch_name, o.name as org_name
    from public.stores s
    join public.organizations o on o.id = s.org_id
    where nullif(trim(s.staff_login_slug), '') is null
    order by s.created_at, s.id
  loop
    base_slug := public.build_staff_login_slug(branch_row.org_name, branch_row.branch_name);
    if base_slug is null then
      base_slug := 'branch';
    end if;

    candidate := base_slug;
    suffix := 1;
    while exists (select 1 from public.stores where staff_login_slug = candidate) loop
      suffix := suffix + 1;
      candidate := left(base_slug, greatest(1, 79 - length(suffix::text))) || '-' || suffix::text;
    end loop;

    update public.stores
    set staff_login_slug = candidate
    where id = branch_row.id;
  end loop;
end;
$$;

alter table public.stores
  alter column staff_login_slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stores_staff_login_slug_format'
      and conrelid = 'public.stores'::regclass
  ) then
    alter table public.stores
      add constraint stores_staff_login_slug_format
      check (staff_login_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(staff_login_slug) between 1 and 80);
  end if;
end;
$$;

create unique index if not exists stores_staff_login_slug_idx
  on public.stores (staff_login_slug);

create or replace function public.assign_staff_login_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org_name text;
  base_slug text;
  candidate text;
  suffix integer;
begin
  if nullif(trim(new.staff_login_slug), '') is not null then
    new.staff_login_slug := lower(trim(new.staff_login_slug));
    return new;
  end if;

  select name into org_name
  from public.organizations
  where id = new.org_id;

  base_slug := public.build_staff_login_slug(org_name, new.name);
  if base_slug is null then
    base_slug := 'branch';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(base_slug, 0));
  candidate := base_slug;
  suffix := 1;
  while exists (select 1 from public.stores where staff_login_slug = candidate and id is distinct from new.id) loop
    suffix := suffix + 1;
    candidate := left(base_slug, greatest(1, 79 - length(suffix::text))) || '-' || suffix::text;
  end loop;

  new.staff_login_slug := candidate;
  return new;
end;
$$;

revoke all on function public.staff_login_slug_part(text) from public;
revoke all on function public.build_staff_login_slug(text, text) from public;
revoke all on function public.assign_staff_login_slug() from public;

drop trigger if exists assign_staff_login_slug on public.stores;
create trigger assign_staff_login_slug
before insert on public.stores
for each row execute function public.assign_staff_login_slug();
