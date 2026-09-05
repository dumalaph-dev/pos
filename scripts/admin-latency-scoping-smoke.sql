-- Read-only admin latency-scoping (migration 0082) smoke.
-- Run with:
-- npx supabase db query --linked --file scripts/admin-latency-scoping-smoke.sql --output json
--
-- Makes no writes. Reports the additive timing columns, the branch-scoped read
-- paths and their overload arities, the partial completed-orders index,
-- aggregate sample counts, and the anon EXECUTE boundary these RPCs must keep
-- (migration 0083). No URL, record ID, or tenant payload is read.

select json_build_object(
  'ledger_max', (select max(version) from supabase_migrations.schema_migrations),
  'timing_columns', (
    select coalesce(json_object_agg(column_name, data_type), '{}'::json)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_performance_samples'
      and column_name in ('ttfb_ms', 'transfer_ms', 'browser_settle_ms')
  ),
  'timing_check_constraints', (
    select count(*)
    from pg_constraint
    where conrelid = 'public.admin_performance_samples'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike any (array['%ttfb_ms%', '%transfer_ms%', '%browser_settle_ms%'])
  ),
  'schema_has_org_id', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_performance_samples'
      and column_name = 'org_id'
  ),
  'scoped_read_functions', (
    select coalesce(json_object_agg(sig, json_build_object(
      'security', case when prosecdef then 'definer' else 'invoker' end,
      'volatility', case provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end,
      'authenticated_execute', has_function_privilege('authenticated', oid, 'execute'),
      'anon_execute', has_function_privilege('anon', oid, 'execute')
    )), '{}'::json)
    from (
      select p.oid, p.prosecdef, p.provolatile,
             p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('current_stock', 'current_inventory_stock',
                          'admin_sales_period_totals', 'admin_products_top_items')
    ) fns
  ),
  'orders_partial_index', (
    select coalesce(json_agg(indexdef), '[]'::json)
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'orders_completed_org_store_created_idx'
  ),
  'sample_counts', (
    select json_build_object(
      'total', count(*),
      'attributed', count(org_id),
      'with_ttfb', count(ttfb_ms),
      'with_transfer', count(transfer_ms),
      'with_browser_settle', count(browser_settle_ms),
      'latest_sample_at', max(recorded_at)
    )
    from public.admin_performance_samples
  ),
  'anon_execute_boundary', (
    select coalesce(json_object_agg(sig, anon_ok), '{}'::json)
    from (
      select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
             has_function_privilege('anon', p.oid, 'execute') as anon_ok
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('current_stock', 'current_inventory_stock',
                          'admin_sales_period_totals', 'admin_products_top_items',
                          'inventory_item_expected_stock', 'record_inventory_item_count',
                          'seed_default_employee_roles')
    ) acl
  ),
  'anon_callable_rpc_count', (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) <> 'trigger'
      and has_function_privilege('anon', p.oid, 'execute')
  ),
  'read_is_telemetry_only', true
) as admin_latency_scoping_boundary;
