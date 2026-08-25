-- Read-only catalog verification for the paid branch-entitlement schema in
-- migration 0070. This query must not create fixtures or change production
-- data; it only inspects PostgreSQL's catalog views.

with expected_objects(object_name, present) as (
  values
    (
      'public.organizations.subscription_entitled_branch_count',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organizations'
          and column_name = 'subscription_entitled_branch_count'
          and data_type = 'integer'
          and is_nullable = 'NO'
      )
    ),
    (
      'public.organizations.subscription_pending_branch_count',
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organizations'
          and column_name = 'subscription_pending_branch_count'
          and data_type = 'integer'
          and is_nullable = 'YES'
      )
    ),
    (
      'organizations_subscription_entitled_branch_count_check',
      exists (
        select 1
        from pg_constraint
        where conname = 'organizations_subscription_entitled_branch_count_check'
          and conrelid = to_regclass('public.organizations')
          and contype = 'c'
      )
    ),
    (
      'organizations_subscription_pending_branch_count_check',
      exists (
        select 1
        from pg_constraint
        where conname = 'organizations_subscription_pending_branch_count_check'
          and conrelid = to_regclass('public.organizations')
          and contype = 'c'
      )
    ),
    (
      'public.enforce_active_branch_entitlement()',
      exists (
        select 1
        from pg_proc
        join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
        where pg_namespace.nspname = 'public'
          and pg_proc.proname = 'enforce_active_branch_entitlement'
          and pg_proc.prorettype = 'trigger'::regtype
          and pg_get_function_identity_arguments(pg_proc.oid) = ''
          and position('subscription_entitled_branch_count' in pg_get_functiondef(pg_proc.oid)) > 0
      )
    ),
    (
      'public.stores.enforce_active_branch_entitlement trigger',
      exists (
        select 1
        from pg_trigger
        join pg_class on pg_class.oid = pg_trigger.tgrelid
        join pg_namespace on pg_namespace.oid = pg_class.relnamespace
        join pg_proc on pg_proc.oid = pg_trigger.tgfoid
        where pg_namespace.nspname = 'public'
          and pg_class.relname = 'stores'
          and pg_trigger.tgname = 'enforce_active_branch_entitlement'
          and not pg_trigger.tgisinternal
          and pg_trigger.tgenabled <> 'D'
          and pg_proc.proname = 'enforce_active_branch_entitlement'
      )
    )
)
select
  bool_and(present) as schema_ready,
  coalesce(string_agg(object_name, ', ' order by object_name) filter (where not present), '') as missing_objects,
  count(*)::integer as expected_object_count,
  count(*) filter (where present)::integer as present_object_count
from expected_objects;
