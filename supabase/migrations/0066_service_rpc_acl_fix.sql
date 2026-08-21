-- Keep server-only RPCs unavailable to authenticated browser clients. Some
-- older migrations left an explicit authenticated grant behind after PUBLIC
-- was removed, which is broader than the server-side call sites require.

revoke execute on function public.expire_trialing_organization(uuid)
  from public, anon, authenticated;
grant execute on function public.expire_trialing_organization(uuid)
  to service_role;

revoke execute on function public.grant_platform_access(uuid, integer, text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.grant_platform_access(uuid, integer, text, text, text, uuid, text)
  to service_role;

revoke execute on function public.platform_promotion_performance()
  from public, anon, authenticated;
grant execute on function public.platform_promotion_performance()
  to service_role;

revoke execute on function public.qualify_referral_for_paid_conversion(uuid)
  from public, anon, authenticated;
grant execute on function public.qualify_referral_for_paid_conversion(uuid)
  to service_role;

-- This helper is called inside the authenticated POS order transaction, but
-- is not a browser-facing RPC of its own.
revoke execute on function public.consume_discount_approval(uuid)
  from public, anon;
grant execute on function public.consume_discount_approval(uuid)
  to authenticated;

notify pgrst, 'reload schema';
