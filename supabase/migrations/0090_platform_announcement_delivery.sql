-- Deliver platform announcements through a narrow authenticated read path.
--
-- The announcement and audit tables remain service-role-only. Tenant callers
-- cannot choose an organization, audience, or timestamp; the function derives
-- the owner organization from auth.uid() and applies every delivery predicate
-- inside Postgres.

create or replace function public.platform_announcements_for_current_tenant()
returns table (
  id           uuid,
  title        text,
  body         text,
  severity     text,
  action_label text,
  action_url   text,
  published_at timestamptz,
  expires_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.title,
    a.body,
    a.severity,
    a.action_label,
    a.action_url,
    a.published_at,
    a.expires_at
  from public.platform_announcements a
  join public.profiles p
    on p.id = auth.uid()
   and p.is_active
   and p.role = 'admin'::public.user_role
  join public.organizations o
    on o.id = p.org_id
  where a.status = 'published'
    and (a.starts_at is null or a.starts_at <= now())
    and (a.expires_at is null or a.expires_at > now())
    and (
      a.audience = 'all'
      or (
        a.audience = 'plan'
        and lower(trim(a.audience_value)) = lower(trim(o.subscription_plan))
      )
      or (
        a.audience = 'account_status'
        and lower(trim(a.audience_value)) = lower(trim(o.account_status))
      )
    )
  order by a.published_at desc nulls last, a.created_at desc, a.id desc
  limit 100;
$$;

-- Revoke before granting so the hosted PUBLIC default cannot make this
-- security-definer read callable by anonymous clients.
revoke execute on function public.platform_announcements_for_current_tenant() from public, anon, authenticated;
grant execute on function public.platform_announcements_for_current_tenant() to authenticated;

notify pgrst, 'reload schema';
