-- Make a platform-owned complimentary grant and its audit evidence one
-- transaction. The server action remains the authorization boundary; this
-- function makes the lifecycle calculation and audit write atomic and uses the
-- same subscription fields that the tenant expiry predicate reads.

create or replace function public.grant_platform_access(
  p_org_id       uuid,
  p_days         integer,
  p_reason       text,
  p_source       text default 'manual',
  p_start_mode   text default 'now',
  p_actor_id     uuid default null,
  p_actor_email  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization       public.organizations%rowtype;
  v_current_grant_end  timestamptz;
  v_subscription_end   timestamptz;
  v_starts_at          timestamptz;
  v_ends_at            timestamptz;
  v_grant_id           uuid;
  v_reason             text := trim(coalesce(p_reason, ''));
  v_source             text := trim(coalesce(p_source, 'manual'));
  v_start_mode         text := trim(coalesce(p_start_mode, 'now'));
  v_operator_email     text := nullif(trim(coalesce(p_actor_email, '')), '');
begin
  if p_org_id is null then
    raise exception 'platform_access_invalid_organization';
  end if;

  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'platform_access_invalid_days';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'platform_access_invalid_reason';
  end if;

  if v_source not in ('manual', 'support', 'campaign', 'referral') then
    raise exception 'platform_access_invalid_source';
  end if;

  if v_start_mode not in ('now', 'after_current_access') then
    raise exception 'platform_access_invalid_start_mode';
  end if;

  -- Serialize grants against account suspension and subscription updates so a
  -- grant cannot be approved from a stale platform-console snapshot.
  select *
    into v_organization
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'platform_access_organization_not_found';
  end if;

  -- Suspended is an account-level boundary and must not be bypassed by a
  -- tenant entitlement. Paused/expired subscription rows are intentionally
  -- allowed: a current grant is the deliberate recovery path for those rows.
  if coalesce(v_organization.account_status, 'active') <> 'active' then
    raise exception 'platform_access_account_suspended';
  end if;

  select max(grant_record.ends_at)
    into v_current_grant_end
  from public.platform_access_grants grant_record
  where grant_record.org_id = p_org_id
    and grant_record.status = 'active'
    and grant_record.ends_at > now();

  v_starts_at := now();
  if v_start_mode = 'after_current_access' then
    v_starts_at := greatest(v_starts_at, coalesce(v_current_grant_end, v_starts_at));

    -- Mirror subscription_access_is_current(): recurring active/past-due
    -- subscriptions have no local expiry boundary, while trials and prepaid
    -- temporary QR Ph access do.
    if v_organization.subscription_status = 'trialing' then
      v_subscription_end := coalesce(
        v_organization.subscription_trial_ends_at,
        v_organization.subscription_current_period_end
      );
    elsif v_organization.subscription_status in ('active', 'past_due')
      and coalesce(v_organization.subscription_billing_mode, 'recurring') = 'temporary_qrph' then
      v_subscription_end := v_organization.subscription_current_period_end;
    else
      v_subscription_end := null;
    end if;

    if v_subscription_end is not null and v_subscription_end > v_starts_at then
      v_starts_at := v_subscription_end;
    end if;
  end if;

  v_ends_at := v_starts_at + make_interval(days => p_days);

  insert into public.platform_access_grants (
    org_id,
    source,
    status,
    starts_at,
    ends_at,
    reason,
    created_by,
    metadata
  )
  values (
    p_org_id,
    v_source,
    'active',
    v_starts_at,
    v_ends_at,
    v_reason,
    p_actor_id,
    jsonb_build_object('grant_kind', 'complimentary_premium')
  )
  returning id into v_grant_id;

  -- actor_id is a tenant-profile foreign key. Platform operators can be
  -- cross-organization users, so their identity is carried explicitly in the
  -- immutable after snapshot instead of being forced into the tenant actor
  -- column.
  insert into public.audit_logs (
    org_id,
    actor_id,
    action,
    entity,
    entity_id,
    before,
    after
  )
  values (
    p_org_id,
    null,
    'platform.access_grant.created',
    'platform_access_grants',
    v_grant_id,
    jsonb_build_object(
      'subscription_status', v_organization.subscription_status,
      'subscription_trial_started_at', v_organization.subscription_trial_started_at,
      'subscription_trial_ends_at', v_organization.subscription_trial_ends_at,
      'subscription_current_period_end', v_organization.subscription_current_period_end,
      'subscription_billing_mode', v_organization.subscription_billing_mode,
      'account_status', v_organization.account_status
    ),
    jsonb_build_object(
      'grant_id', v_grant_id,
      'source', v_source,
      'status', 'active',
      'starts_at', v_starts_at,
      'ends_at', v_ends_at,
      'reason', v_reason,
      'platform_actor_id', p_actor_id,
      'operator_id', p_actor_id,
      'platform_actor_email', v_operator_email,
      'subscription_status', v_organization.subscription_status,
      'subscription_trial_ends_at', v_organization.subscription_trial_ends_at,
      'subscription_current_period_end', v_organization.subscription_current_period_end
    )
  );

  return jsonb_build_object(
    'grant_id', v_grant_id,
    'org_id', p_org_id,
    'source', v_source,
    'status', 'active',
    'starts_at', v_starts_at,
    'ends_at', v_ends_at,
    'reason', v_reason,
    'days', p_days
  );
end;
$$;

revoke all on function public.grant_platform_access(uuid, integer, text, text, text, uuid, text) from public;
grant execute on function public.grant_platform_access(uuid, integer, text, text, text, uuid, text) to service_role;
