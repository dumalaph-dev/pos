-- Phone-code verification is handled by the server route with the service
-- role; it must not be callable directly from an authenticated browser.

revoke execute on function public.verify_online_order_phone(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.verify_online_order_phone(uuid, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
