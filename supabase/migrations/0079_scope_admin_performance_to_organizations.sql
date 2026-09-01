-- Preserve existing performance samples while attributing future samples to the
-- authenticated organization that produced them. The column stays nullable so
-- historical rows cannot be assigned to an organization without evidence.

alter table public.admin_performance_samples
  add column if not exists org_id uuid references public.organizations(id) on delete set null;

create index if not exists admin_performance_samples_org_idx
  on public.admin_performance_samples (org_id, recorded_at desc);

-- The API derives org_id from the caller's profile. Keep direct browser inserts
-- from claiming another organization, while allowing legacy clients to leave
-- the new attribution column null during rollout.
drop policy if exists admin_performance_samples_insert on public.admin_performance_samples;
create policy admin_performance_samples_insert
  on public.admin_performance_samples
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and (org_id is null or org_id = auth_org_id())
  );
