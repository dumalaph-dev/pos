-- Older migrations granted EXECUTE to authenticated without first removing
-- the hosted PUBLIC default. PUBLIC EXECUTE also makes the function callable
-- by anon, even after an explicit anon revoke. Normalize the application RPC
-- ACLs and keep the server-only entry points server-only.

do $$
declare
  function_signature regprocedure;
  function_name text;
  server_only boolean;
begin
  for function_signature, function_name in
    select p.oid::regprocedure, p.proname
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
    execute format('revoke execute on function %s from public, anon', function_signature);

    server_only := function_name in (
      'expire_trialing_organization',
      'grant_platform_access',
      'place_online_order',
      'platform_promotion_performance',
      'qualify_referral_for_paid_conversion',
      'verify_online_order_phone'
    );

    if server_only then
      execute format('grant execute on function %s to service_role', function_signature);
    else
      execute format('grant execute on function %s to authenticated', function_signature);
    end if;
  end loop;
end;
$$;

-- Do not give future application functions the hosted PUBLIC/anon default.
-- Functions that are intentionally public must opt in explicitly.
alter default privileges in schema public
  revoke execute on functions from public, anon;

notify pgrst, 'reload schema';
