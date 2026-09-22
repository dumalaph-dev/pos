-- Read-only hosted verification for migration 0093.
-- Run with:
--   npx supabase db query --linked --file scripts/platform-follow-up-hosted-smoke.sql
select
  to_regclass('public.platform_follow_up_tasks') is not null as tasks_table,
  to_regclass('public.platform_follow_up_task_audit_logs') is not null as audit_table,
  to_regprocedure('public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)') is not null as create_rpc,
  to_regprocedure('public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)') is not null as update_rpc,
  has_table_privilege('anon', 'public.platform_follow_up_tasks', 'select') as anon_task_select,
  has_table_privilege('authenticated', 'public.platform_follow_up_tasks', 'select') as authenticated_task_select,
  has_table_privilege('service_role', 'public.platform_follow_up_tasks', 'select') as service_task_select,
  has_table_privilege('anon', 'public.platform_follow_up_task_audit_logs', 'select') as anon_audit_select,
  has_table_privilege('authenticated', 'public.platform_follow_up_task_audit_logs', 'select') as authenticated_audit_select,
  has_table_privilege('service_role', 'public.platform_follow_up_task_audit_logs', 'select') as service_audit_select,
  has_function_privilege('anon', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute') as anon_create_execute,
  has_function_privilege('authenticated', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute') as authenticated_create_execute,
  has_function_privilege('service_role', 'public.platform_create_follow_up_task(uuid,text,text,text,uuid,uuid,timestamptz,text,uuid,text,uuid)', 'execute') as service_create_execute,
  has_function_privilege('anon', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute') as anon_update_execute,
  has_function_privilege('authenticated', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute') as authenticated_update_execute,
  has_function_privilege('service_role', 'public.platform_update_follow_up_task(uuid,bigint,text,uuid,timestamptz,text,text,text,uuid,text,uuid)', 'execute') as service_update_execute,
  (select count(*) from public.platform_follow_up_tasks) as task_rows,
  (select count(*) from public.platform_follow_up_task_audit_logs) as audit_rows,
  exists (select 1 from pg_trigger where tgname = 'no_mutate_platform_follow_up_task_audit' and tgrelid = 'public.platform_follow_up_task_audit_logs'::regclass and not tgenabled = 'D') as audit_append_only_trigger;
