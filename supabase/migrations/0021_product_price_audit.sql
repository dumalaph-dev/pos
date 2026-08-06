-- P6: keep product price history in the append-only audit ledger.
create or replace function public.audit_product_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price then
    insert into public.audit_logs (
      org_id,
      store_id,
      actor_id,
      action,
      entity,
      entity_id,
      before,
      after
    ) values (
      new.org_id,
      new.store_id,
      auth.uid(),
      'product.price_changed',
      'products',
      new.id,
      jsonb_build_object(
        'name', old.name,
        'price', old.price,
        'pricing_mode', old.pricing_mode,
        'unit', old.unit
      ),
      jsonb_build_object(
        'name', new.name,
        'price', new.price,
        'pricing_mode', new.pricing_mode,
        'unit', new.unit
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function public.audit_product_price_change() from public;

drop trigger if exists product_price_audit on public.products;
create trigger product_price_audit
after update of price on public.products
for each row
when (old.price is distinct from new.price)
execute function public.audit_product_price_change();
