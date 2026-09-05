-- Expose the migration ledger position to the platform console.
--
-- Every organization shares one Postgres database, so there is exactly one
-- migration ledger and one applied position for the whole fleet. The drift
-- that actually matters here is repository-versus-database: a migration that
-- ships in the deployment but was never applied, or a version applied to the
-- database that no longer exists in the repository. That is the check
-- currently hand-typed into tasks.md as "local X = remote X" after every
-- hosted pass.
--
-- supabase_migrations is not an exposed PostgREST schema, so the console
-- cannot select the ledger directly. This function is the read path.
-- It returns version and name only. The statements column holds the full SQL
-- text of every migration and is deliberately never selected.

create or replace function public.platform_schema_migrations()
returns table (version text, name text)
language sql
stable
security definer
set search_path = public, supabase_migrations
as $$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

-- Revoke before granting. 0064/0065 established that a bare grant on top of
-- the hosted PUBLIC default is a no-op against anon, and 0083 had to repair
-- exactly that lapse for the RPCs 0073 and 0082 added. This is operator
-- infrastructure: service_role only, never a browser role.
revoke execute on function public.platform_schema_migrations() from public, anon, authenticated;
grant execute on function public.platform_schema_migrations() to service_role;

notify pgrst, 'reload schema';
