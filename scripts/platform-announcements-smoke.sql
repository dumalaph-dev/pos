-- Read-only boundary check for the platform announcement storage and its
-- authenticated tenant delivery function. The base tables stay service-role
-- only; tenant callers receive only the function's targeted projection.

select jsonb_build_object(
  'announcements_table', to_regclass('public.platform_announcements') is not null,
  'audit_table', to_regclass('public.platform_announcement_audit_logs') is not null,
  'announcements_rls', (
    select relrowsecurity
    from pg_class
    where oid = 'public.platform_announcements'::regclass
  ),
  'audit_rls', (
    select relrowsecurity
    from pg_class
    where oid = 'public.platform_announcement_audit_logs'::regclass
  ),
  'service_role_select', has_table_privilege('service_role', 'public.platform_announcements', 'SELECT'),
  'authenticated_select', has_table_privilege('authenticated', 'public.platform_announcements', 'SELECT'),
  'authenticated_insert', has_table_privilege('authenticated', 'public.platform_announcements', 'INSERT'),
  'tenant_delivery_function', to_regprocedure('public.platform_announcements_for_current_tenant()') is not null,
  'authenticated_delivery_execute', coalesce(has_function_privilege('authenticated', to_regprocedure('public.platform_announcements_for_current_tenant()'), 'EXECUTE'), false),
  'anon_delivery_execute', coalesce(has_function_privilege('anon', to_regprocedure('public.platform_announcements_for_current_tenant()'), 'EXECUTE'), false),
  'status_constraint', exists (
    select 1
    from pg_constraint
    where conname = 'platform_announcements_status_check'
  ),
  'audit_constraint', exists (
    select 1
    from pg_constraint
    where conname = 'platform_announcement_audit_action_check'
  )
) as platform_announcements_boundary;
