-- Hosted Supabase projects can carry an explicit anon function grant from
-- their default privileges. Keep the pickup handoff callable only by a
-- signed-in POS employee even when the function itself rejects auth.uid() IS
-- NULL callers.

revoke all on function public.complete_online_order(uuid, uuid) from anon;
grant execute on function public.complete_online_order(uuid, uuid) to authenticated;
