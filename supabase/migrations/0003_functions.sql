-- Dumala POS — server functions. See docs/SCHEMA.md §6.

-- Clone a branch's menu (categories + products) into another branch of the
-- SAME org. Used by "Add branch → clone menu from…". Prices/SKUs then diverge.
create or replace function clone_menu(source_store uuid, target_store uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org uuid;
  v_src_org uuid;
  v_tgt_org uuid;
  cat record;
  new_cat_id uuid;
begin
  -- Caller must be an admin, and both branches must be in the caller's org.
  if not auth_is_admin() then
    raise exception 'only admins can clone a menu';
  end if;
  v_org := auth_org_id();

  select org_id into v_src_org from stores where id = source_store;
  select org_id into v_tgt_org from stores where id = target_store;
  if v_src_org is null or v_tgt_org is null
     or v_src_org <> v_org or v_tgt_org <> v_org then
    raise exception 'both branches must belong to your organization';
  end if;

  -- Copy categories, remembering the old→new id mapping to relink products.
  for cat in
    select id, name, icon, sort_order, is_active from categories where store_id = source_store
  loop
    insert into categories (org_id, store_id, name, icon, sort_order, is_active)
    values (v_org, target_store, cat.name, cat.icon, cat.sort_order, cat.is_active)
    returning id into new_cat_id;

    insert into products
      (org_id, store_id, category_id, name, pricing_mode, price, unit,
       track_stock, image_url, is_active, sort_order)
    select v_org, target_store, new_cat_id, name, pricing_mode, price, unit,
           track_stock, image_url, is_active, sort_order
    from products where store_id = source_store and category_id = cat.id;
  end loop;

  -- Products with no category.
  insert into products
    (org_id, store_id, category_id, name, pricing_mode, price, unit,
     track_stock, image_url, is_active, sort_order)
  select v_org, target_store, null, name, pricing_mode, price, unit,
         track_stock, image_url, is_active, sort_order
  from products where store_id = source_store and category_id is null;
end;
$$;
