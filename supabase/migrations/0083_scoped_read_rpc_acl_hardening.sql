-- Restore the 0064/0065 RPC ACL invariant for the scoped read paths.
--
-- 0065 removed PUBLIC/anon EXECUTE from the application RPCs that existed at
-- the time, enumerating them by name. Functions added afterwards did not
-- inherit that hardening: 0073 and 0082 both granted EXECUTE to authenticated
-- without first revoking the hosted PUBLIC default, and 0082's new overloads
-- of current_stock and current_inventory_stock are separate functions from the
-- one-argument signatures 0065 covered. The result is that anon holds EXECUTE
-- on seven data-reading RPCs plus one unguarded SECURITY DEFINER writer.
--
-- The invoker functions are not a data leak on their own — the table grants
-- from 0004/0026 still refuse anon, which is what a hosted probe returns
-- (42501 permission denied for table orders / stock_movements). The DEFINER
-- writer is the real exposure, because definer rights bypass those grants.
--
-- This migration changes ACLs only. No function body, table, policy, or row is
-- modified.

do $$
declare
  function_signature regprocedure;
begin
  -- Application RPCs: authenticated-only, matching every other admin/POS RPC.
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')') in (
        'current_stock(p_org_id uuid, p_store_id uuid)',
        'current_inventory_stock(p_org_id uuid)',
        'current_inventory_stock(p_org_id uuid, p_store_id uuid)',
        'inventory_item_expected_stock(p_org_id uuid, p_store_id uuid, p_until timestamp with time zone)',
        'record_inventory_item_count(p_store_id uuid, p_count_date date, p_counts jsonb)',
        'admin_sales_period_totals(p_org_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_store_id uuid)',
        'admin_products_top_items(p_org_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_store_id uuid, p_limit integer)'
      )
  loop
    execute format('revoke execute on function %s from public, anon', function_signature);
    execute format('grant execute on function %s to authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;

  -- seed_default_employee_roles is SECURITY DEFINER with no internal caller
  -- check and no application call site: its only caller is the equally
  -- SECURITY DEFINER trigger seed_default_employee_roles_on_organization,
  -- which runs as the function owner and therefore needs no EXECUTE grant on
  -- the role it invokes. Left anon-executable it lets an unauthenticated
  -- caller re-insert the four default employee roles into any organization id
  -- they can observe. Make it server-only.
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')
          = 'seed_default_employee_roles(p_org_id uuid)'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', function_signature);
    execute format('grant execute on function %s to service_role', function_signature);
  end loop;
end
$$;

notify pgrst, 'reload schema';
