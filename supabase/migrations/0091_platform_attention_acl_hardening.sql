-- D2 security hardening.
--
-- Some Supabase projects grant EXECUTE on newly created functions to the
-- authenticated role through default privileges. The D2 RPCs are service-role
-- endpoints, so revoke both explicit client roles as well as PUBLIC.

revoke all on function public.platform_reconcile_attention(jsonb, text[], timestamptz)
  from public, anon, authenticated;
revoke all on function public.platform_update_attention_occurrence(
  uuid, bigint, text, uuid, timestamptz, text, uuid, text, uuid
)
  from public, anon, authenticated;

grant execute on function public.platform_reconcile_attention(jsonb, text[], timestamptz)
  to service_role;
grant execute on function public.platform_update_attention_occurrence(
  uuid, bigint, text, uuid, timestamptz, text, uuid, text, uuid
)
  to service_role;

notify pgrst, 'reload schema';
