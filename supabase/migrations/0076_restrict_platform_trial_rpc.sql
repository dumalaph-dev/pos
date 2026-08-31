-- Repair the service-role boundary created by migration 0075.
--
-- Supabase projects can grant EXECUTE directly to the authenticated role via
-- default privileges. Revoking PUBLIC does not remove that direct grant, so
-- both platform trial functions must explicitly revoke browser-role access.

revoke all on function public.organization_trial_extension_days(uuid)
  from public, anon, authenticated;
grant execute on function public.organization_trial_extension_days(uuid)
  to service_role;

revoke all on function public.extend_organization_trial(uuid, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.extend_organization_trial(uuid, integer, text, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
