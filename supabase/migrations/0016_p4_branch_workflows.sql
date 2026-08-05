-- P4 branch workflows: make menu cloning safe for the full catalog schema.
-- SKUs and barcodes are intentionally cleared because they are unique across
-- the organization, not per branch. The new branch can assign its own codes.
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
  v_src_active boolean;
  v_tgt_active boolean;
  cat record;
  new_cat_id uuid;
begin
  if not auth_is_admin() then
    raise exception 'only admins can clone a menu';
  end if;
  if source_store = target_store then
    raise exception 'source and target branches must be different';
  end if;

  v_org := auth_org_id();
  select org_id, is_active into v_src_org, v_src_active from stores where id = source_store;
  select org_id, is_active into v_tgt_org, v_tgt_active from stores where id = target_store;
  if v_src_org is null or v_tgt_org is null
     or v_src_org <> v_org or v_tgt_org <> v_org then
    raise exception 'both branches must belong to your organization';
  end if;
  if not coalesce(v_src_active, false) or not coalesce(v_tgt_active, false) then
    raise exception 'both branches must be active';
  end if;
  if exists (select 1 from categories where store_id = target_store)
     or exists (select 1 from products where store_id = target_store) then
    raise exception 'target branch already has a menu';
  end if;

  for cat in
    select id, name, icon, sort_order, is_active from categories where store_id = source_store
  loop
    insert into categories (org_id, store_id, name, icon, sort_order, is_active)
    values (v_org, target_store, cat.name, cat.icon, cat.sort_order, cat.is_active)
    returning id into new_cat_id;

    insert into products
      (org_id, store_id, category_id, name, pricing_mode, price, unit,
       sku, barcode, cost_price, min_stock, supplier_id,
       track_stock, image_url, is_active, sort_order)
    select v_org, target_store, new_cat_id, name, pricing_mode, price, unit,
           null, null, cost_price, min_stock, supplier_id,
           track_stock, image_url, is_active, sort_order
    from products where store_id = source_store and category_id = cat.id;
  end loop;

  insert into products
    (org_id, store_id, category_id, name, pricing_mode, price, unit,
     sku, barcode, cost_price, min_stock, supplier_id,
     track_stock, image_url, is_active, sort_order)
  select v_org, target_store, null, name, pricing_mode, price, unit,
         null, null, cost_price, min_stock, supplier_id,
         track_stock, image_url, is_active, sort_order
  from products where store_id = source_store and category_id is null;
end;
$$;

grant execute on function clone_menu(uuid, uuid) to authenticated;
revoke execute on function clone_menu(uuid, uuid) from anon;
