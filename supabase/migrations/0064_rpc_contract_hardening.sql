-- Keep the RPC contract visible to PostgREST after a hosted migration and
-- prevent hosted default privileges from exposing internal RPCs to anon.
--
-- Supabase projects can retain explicit anon EXECUTE grants created by their
-- default privileges. REVOKE ... FROM public does not remove those explicit
-- grants, so revoke anon directly for every RPC called by the application.

do $$
declare
  function_signature regprocedure;
begin
  for function_signature in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_sales_top_items',
        'advance_online_order_status',
        'clone_menu',
        'close_shift',
        'complete_online_order',
        'current_stock',
        'expire_trialing_organization',
        'grant_platform_access',
        'inventory_expected_stock',
        'mark_online_order_phone_verified',
        'open_shift',
        'place_online_order',
        'place_order',
        'platform_promotion_performance',
        'qualify_referral_for_paid_conversion',
        'record_inventory_count',
        'record_order_action',
        'record_pos_order_void',
        'record_stock_movement',
        'record_yield_entry',
        'record_z_reading',
        'set_online_availability',
        'set_online_order_status',
        'set_online_ordering_settings',
        'set_profile_pin',
        'shift_reading',
        'shift_reading_list',
        'verify_admin_pin',
        'verify_online_order_phone',
        'verify_void_pin'
      )
  loop
    execute format('revoke execute on function %s from anon', function_signature);
  end loop;
end;
$$;

-- Keep newly-created application functions from inheriting the same hosted
-- anon grant. RLS helper functions are intentionally left unchanged because
-- policies may call them while evaluating anonymous reads.
alter default privileges in schema public
  revoke execute on functions from anon;

-- DDL applied through the hosted migration path may complete before
-- PostgREST's schema cache has observed the new function signatures.
notify pgrst, 'reload schema';
