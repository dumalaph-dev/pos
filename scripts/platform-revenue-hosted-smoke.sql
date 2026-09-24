-- Read-only hosted validation for the A1a contracted revenue readout.
--
-- Run with:
--   npx supabase@2.114.0 db query --linked --file scripts/platform-revenue-hosted-smoke.sql --output json
--
-- This query reads only aggregate catalog, organization, and access-grant
-- inputs. It creates no fixtures and does not write to the hosted project.

with catalog_settings as (
  select
    greatest(round(monthly_price_centavos::numeric), 0) as monthly_price_centavos,
    greatest(round(additional_branch_price_centavos::numeric), 0) as additional_branch_price_centavos,
    greatest(floor(included_branch_count::numeric), 1) as included_branch_count
  from public.platform_billing_settings
  where id = 'default'
), catalog_variants as (
  select
    id::text as variant_id,
    label,
    lower(trim(billing_unit)) as billing_unit,
    greatest(floor(interval_count::numeric), 1) as interval_count,
    least(greatest(discount_percent::numeric, 0), 100) as discount_percent,
    paymongo_plan_id,
    sort_order
  from public.platform_billing_variants
  where lower(trim(billing_unit)) in ('month', 'year')
), bounded_organizations as (
  select
    id,
    subscription_status,
    subscription_trial_ends_at,
    subscription_billing_mode,
    subscription_billing_variant_id,
    subscription_provider_plan_id,
    subscription_entitled_branch_count
  from public.organizations
  order by created_at desc, id asc
  limit 1000
), organization_inputs as (
  select
    organization.id,
    lower(trim(coalesce(organization.subscription_status, ''))) as subscription_status,
    nullif(trim(coalesce(organization.subscription_billing_mode, '')), '') as billing_mode,
    floor(organization.subscription_entitled_branch_count::numeric) as entitled_branch_count,
    organization.subscription_trial_ends_at,
    variant.variant_id,
    variant.billing_unit,
    variant.interval_count,
    variant.discount_percent,
    settings.monthly_price_centavos,
    settings.additional_branch_price_centavos,
    settings.included_branch_count,
    coalesce(grants.current_grant_count, 0) > 0 as has_current_grant
  from bounded_organizations as organization
  cross join catalog_settings as settings
  left join lateral (
    select
      catalog_variant.variant_id,
      catalog_variant.billing_unit,
      catalog_variant.interval_count,
      catalog_variant.discount_percent
    from catalog_variants as catalog_variant
    where (
      nullif(trim(coalesce(organization.subscription_billing_variant_id, '')), '') is not null
      and catalog_variant.variant_id = trim(organization.subscription_billing_variant_id)
    ) or (
      nullif(trim(coalesce(organization.subscription_provider_plan_id, '')), '') is not null
      and catalog_variant.paymongo_plan_id = trim(organization.subscription_provider_plan_id)
    )
    order by (
      catalog_variant.variant_id = trim(coalesce(organization.subscription_billing_variant_id, ''))
    ) desc, catalog_variant.sort_order asc, catalog_variant.variant_id asc
    limit 1
  ) as variant on true
  left join lateral (
    select count(*) as current_grant_count
    from public.platform_access_grants as grant_record
    where grant_record.org_id = organization.id
      and grant_record.status = 'active'
      and grant_record.starts_at <= now()
      and grant_record.ends_at > now()
  ) as grants on true
), classified as (
  select
    organization_inputs.*,
    case
      when subscription_status in ('active', 'past_due') then
        case
          when coalesce(billing_mode, 'recurring') = 'temporary_qrph' then 'prepaid'
          when coalesce(billing_mode, 'recurring') <> 'recurring' then 'unsupported'
          when variant_id is null or entitled_branch_count is null or entitled_branch_count < 1 then 'unsupported'
          when subscription_status = 'past_due' then 'past_due'
          else 'contracted'
        end
      when coalesce(billing_mode, 'recurring') = 'temporary_qrph' and subscription_status = 'active' then 'prepaid'
      when has_current_grant then 'complimentary'
      when subscription_status = 'trialing'
        and (subscription_trial_ends_at is null or subscription_trial_ends_at > now()) then 'trial'
      else 'none'
    end as state
  from organization_inputs
), priced as (
  select
    classified.*,
    case
      when state in ('contracted', 'past_due') then
        round(
          (
            monthly_price_centavos
            + additional_branch_price_centavos
              * greatest(entitled_branch_count - included_branch_count, 0)
          )
          * case when billing_unit = 'year' then interval_count * 12 else interval_count end
          * greatest(1 - discount_percent / 100, 0)
        )
        / case when billing_unit = 'year' then interval_count * 12 else interval_count end
      else null
    end as normalized_mrr_centavos
  from classified
), summary as (
  select
    count(*) as organization_rows_read,
    count(*) filter (where state in ('contracted', 'past_due')) as recognized_organization_count,
    count(*) filter (where state = 'contracted') as active_organization_count,
    count(*) filter (where state = 'past_due') as past_due_organization_count,
    count(*) filter (where state = 'unsupported') as unsupported_organization_count,
    count(*) filter (where state = 'prepaid') as prepaid_organization_count,
    count(*) filter (where state in ('trial', 'complimentary')) as unbilled_access_organization_count,
    count(*) filter (where state in ('trial', 'complimentary') and subscription_status = 'trialing' and (subscription_trial_ends_at is null or subscription_trial_ends_at > now())) as current_trial_organization_count,
    count(*) filter (where state in ('trial', 'complimentary') and has_current_grant) as current_complimentary_organization_count,
    count(*) filter (where state in ('contracted', 'past_due') and has_current_grant) as paid_with_current_grant_organization_count,
    round(coalesce(sum(normalized_mrr_centavos), 0)) as contracted_mrr_centavos,
    round(coalesce(sum(normalized_mrr_centavos) filter (where state = 'contracted'), 0)) as active_mrr_centavos,
    round(coalesce(sum(normalized_mrr_centavos) filter (where state = 'past_due'), 0)) as past_due_mrr_centavos
  from priced
)
select json_build_object(
  'catalog_settings_table', to_regclass('public.platform_billing_settings') is not null,
  'catalog_variants_table', to_regclass('public.platform_billing_variants') is not null,
  'access_grants_table', to_regclass('public.platform_access_grants') is not null,
  'catalog_monthly_price_centavos', (select monthly_price_centavos from catalog_settings),
  'catalog_additional_branch_price_centavos', (select additional_branch_price_centavos from catalog_settings),
  'catalog_included_branch_count', (select included_branch_count from catalog_settings),
  'catalog_variant_count', (select count(*) from catalog_variants),
  'organization_total', (select count(*) from public.organizations),
  'organization_read_limit', 1000,
  'organization_rows_read', summary.organization_rows_read,
  'organization_coverage_complete', (select count(*) from public.organizations) <= 1000,
  'contracted_mrr_centavos', summary.contracted_mrr_centavos,
  'arr_centavos', summary.contracted_mrr_centavos * 12,
  'active_mrr_centavos', summary.active_mrr_centavos,
  'past_due_mrr_centavos', summary.past_due_mrr_centavos,
  'recognized_organization_count', summary.recognized_organization_count,
  'active_organization_count', summary.active_organization_count,
  'past_due_organization_count', summary.past_due_organization_count,
  'unsupported_organization_count', summary.unsupported_organization_count,
  'prepaid_organization_count', summary.prepaid_organization_count,
  'unbilled_access_organization_count', summary.unbilled_access_organization_count,
  'current_trial_organization_count', summary.current_trial_organization_count,
  'current_complimentary_organization_count', summary.current_complimentary_organization_count,
  'paid_with_current_grant_organization_count', summary.paid_with_current_grant_organization_count,
  'unbilled_access_mrr_centavos', 0,
  'service_role_can_read_catalog', has_table_privilege('service_role', 'public.platform_billing_settings', 'SELECT') and has_table_privilege('service_role', 'public.platform_billing_variants', 'SELECT'),
  'service_role_can_read_access_grants', has_table_privilege('service_role', 'public.platform_access_grants', 'SELECT'),
  'authenticated_can_read_access_grants', has_table_privilege('authenticated', 'public.platform_access_grants', 'SELECT'),
  'readout_definition', 'Current-catalog contracted MRR/ARR run-rate; not collected cash.',
  'read_is_read_only', true
) as platform_revenue_boundary
from summary;
