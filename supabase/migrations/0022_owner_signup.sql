-- Self-service store-owner signup.
--
-- The web app marks public registrations with account_type = store_owner in
-- Supabase Auth metadata. This trigger creates the tenant root, first branch,
-- and owner profile in the same transaction as the Auth user, so a signup
-- cannot produce an account without a workspace or an unscoped admin role.

create or replace function public.handle_store_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_org_name text;
  v_store_name text;
  v_store_address text;
  v_org_id uuid;
  v_store_id uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'store_owner' then
    return new;
  end if;

  -- Keep the trigger safe if a user is provisioned twice by an operator.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  v_full_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 120);
  if v_full_name is null then
    v_full_name := left(coalesce(nullif(trim(new.email), ''), 'Store owner'), 120);
  end if;

  v_org_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'organization_name', '')), ''), 120);
  if v_org_name is null then
    v_org_name := left(v_full_name || ' POS', 120);
  end if;

  v_store_name := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_name', '')), ''), 120);
  if v_store_name is null then
    v_store_name := 'Main Branch';
  end if;

  v_store_address := left(nullif(trim(coalesce(new.raw_user_meta_data ->> 'store_address', '')), ''), 240);

  insert into public.organizations (name, currency, settings)
  values (
    v_org_name,
    'PHP',
    jsonb_build_object(
      'admin_dashboard', jsonb_build_object(
        'brand_name', v_org_name,
        'brand_tagline', 'POS WORKSPACE',
        'theme', 'current',
        'low_stock_alerts_enabled', true,
        'default_low_stock_threshold', 2
      )
    )
  )
  returning id into v_org_id;

  insert into public.stores (org_id, name, address, currency)
  values (v_org_id, v_store_name, v_store_address, 'PHP')
  returning id into v_store_id;

  insert into public.profiles (id, org_id, store_id, full_name, role)
  values (new.id, v_org_id, v_store_id, v_full_name, 'admin'::public.user_role);

  update public.organizations
  set owner_profile_id = new.id
  where id = v_org_id;

  return new;
end;
$$;

revoke all on function public.handle_store_owner_signup() from public;

drop trigger if exists on_store_owner_signup on auth.users;
create trigger on_store_owner_signup
  after insert on auth.users
  for each row execute function public.handle_store_owner_signup();
