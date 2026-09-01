-- Read-only verification for the Phase 4 platform audit viewer.
-- The application query is limited to platform actions and reads no tenant
-- order, customer, staff, or device records.

with organization_events as (
  select id, org_id, action, created_at
  from public.audit_logs
  where action like 'platform.%'
  order by created_at desc
  limit 500
), operator_events as (
  select id, action, created_at
  from public.platform_operator_audit_logs
  order by created_at desc
  limit 500
)
select jsonb_build_object(
  'organization_events_loaded', (select count(*) from organization_events),
  'operator_events_loaded', (select count(*) from operator_events),
  'organization_events_are_platform_scoped', not exists (
    select 1 from organization_events where action not like 'platform.%'
  ),
  'organization_ids_loaded', (select count(distinct org_id) from organization_events),
  'latest_event_at', greatest(
    (select max(created_at) from organization_events),
    (select max(created_at) from operator_events)
  )
) as platform_audit_boundary;
