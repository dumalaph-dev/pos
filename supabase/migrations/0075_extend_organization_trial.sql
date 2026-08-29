-- Platform-owned trial extension.
--
-- A complimentary grant (0052/0054) deliberately leaves the trial dates alone,
-- which is right for a paid account being carried through a support incident.
-- It is wrong for an account that is still evaluating: the owner's trial
-- banner and countdown read `subscription_trial_ends_at`, so an account
-- carried by a grant is told "Trial ended" while the product keeps working.
-- Extending the trial therefore moves the trial itself, and this ledger is the
-- evidence and the cap for how far an operator may move it.

create table if not exists platform_trial_extensions (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  days                   integer not null,
  reason                 text not null,
  previous_status        text,
  new_status             text,
  previous_trial_ends_at timestamptz,
  new_trial_ends_at      timestamptz not null,
  revived                boolean not null default false,
  created_by             uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  metadata               jsonb not null default '{}',
  constraint platform_trial_extensions_days_check
    check (days between 1 and 90),
  constraint platform_trial_extensions_reason_check
    check (char_length(trim(reason)) between 5 and 500)
);

create index if not exists platform_trial_extensions_org_created_idx
  on platform_trial_extensions (org_id, created_at desc);

alter table platform_trial_extensions enable row level security;

revoke all on table platform_trial_extensions from anon, authenticated, public;
grant all on table platform_trial_extensions to service_role;

-- Lifetime ceiling on operator-added trial days per organization. Without it,
-- repeated small extensions keep an account free forever with no single action
-- that looks unreasonable in the audit log.
create or replace function public.organization_trial_extension_days(p_org_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(extension_row.days), 0)::integer
  from public.platform_trial_extensions extension_row
  where extension_row.org_id = p_org_id;
$$;

revoke all on function public.organization_trial_extension_days(uuid) from public;
grant execute on function public.organization_trial_extension_days(uuid) to service_role;

-- Extend the trial, revive a trial-expired pause, write the ledger row, and
-- write the audit evidence as one transaction. The server action remains the
-- authorization boundary; this function owns the lifecycle arithmetic and the
-- guards that must hold even if a future caller forgets them.
create or replace function public.extend_organization_trial(
  p_org_id       uuid,
  p_days         integer,
  p_reason       text,
  p_actor_id     uuid default null,
  p_actor_email  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization        public.organizations%rowtype;
  v_reason              text := trim(coalesce(p_reason, ''));
  v_operator_email      text := nullif(trim(coalesce(p_actor_email, '')), '');
  v_previous_ends_at    timestamptz;
  v_base                timestamptz;
  v_new_ends_at         timestamptz;
  v_new_status          text;
  v_revived             boolean := false;
  v_used_days           integer;
  v_extension_id        uuid;
  v_max_days_per_action constant integer := 90;
  v_max_days_lifetime   constant integer := 180;
begin
  if p_org_id is null then
    raise exception 'platform_trial_invalid_organization';
  end if;

  if p_days is null or p_days < 1 or p_days > v_max_days_per_action then
    raise exception 'platform_trial_invalid_days';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'platform_trial_invalid_reason';
  end if;

  -- Serialize against suspension, billing webhooks, and the expiry transition
  -- so an extension cannot be approved from a stale console snapshot.
  select *
    into v_organization
  from public.organizations
  where id = p_org_id
  for update;

  if not found then
    raise exception 'platform_trial_organization_not_found';
  end if;

  if coalesce(v_organization.account_status, 'active') <> 'active' then
    raise exception 'platform_trial_account_suspended';
  end if;

  -- `paused` has two unrelated causes: a trial that expired, and a provider
  -- status of unpaid. Only the first may be revived here, and the
  -- discriminator is the one the billing routes already use — a trial expiry
  -- never has provider records because there was never a subscription.
  if v_organization.subscription_status = 'trialing' then
    v_new_status := 'trialing';
  elsif v_organization.subscription_status = 'paused'
    and v_organization.subscription_provider_subscription_id is null
    and v_organization.subscription_provider_payment_intent_id is null then
    v_new_status := 'trialing';
    v_revived := true;
  elsif v_organization.subscription_status = 'paused' then
    raise exception 'platform_trial_billing_pause';
  else
    raise exception 'platform_trial_status_not_eligible';
  end if;

  select public.organization_trial_extension_days(p_org_id) into v_used_days;

  if v_used_days + p_days > v_max_days_lifetime then
    raise exception 'platform_trial_cap_exceeded';
  end if;

  v_previous_ends_at := coalesce(
    v_organization.subscription_trial_ends_at,
    v_organization.subscription_current_period_end
  );

  -- Extending a live trial appends to the time that is left. Extending a
  -- lapsed one restarts from today, so the operator's days are not silently
  -- spent covering the gap since it expired.
  v_base := greatest(now(), coalesce(v_previous_ends_at, now()));
  v_new_ends_at := v_base + make_interval(days => p_days);

  update public.organizations
  set
    subscription_status = v_new_status,
    subscription_trial_ends_at = v_new_ends_at,
    subscription_updated_at = now()
  where id = p_org_id;

  insert into public.platform_trial_extensions (
    org_id,
    days,
    reason,
    previous_status,
    new_status,
    previous_trial_ends_at,
    new_trial_ends_at,
    revived,
    created_by,
    metadata
  )
  values (
    p_org_id,
    p_days,
    v_reason,
    v_organization.subscription_status,
    v_new_status,
    v_previous_ends_at,
    v_new_ends_at,
    v_revived,
    p_actor_id,
    jsonb_build_object('platform_actor_email', v_operator_email)
  )
  returning id into v_extension_id;

  -- actor_id is a tenant-profile foreign key. Platform operators can be
  -- cross-organization users, so their identity is carried explicitly in the
  -- immutable after snapshot instead of being forced into the tenant column.
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
    'platform.trial.extended',
    'platform_trial_extensions',
    v_extension_id,
    jsonb_build_object(
      'subscription_status', v_organization.subscription_status,
      'subscription_trial_started_at', v_organization.subscription_trial_started_at,
      'subscription_trial_ends_at', v_organization.subscription_trial_ends_at,
      'subscription_current_period_end', v_organization.subscription_current_period_end,
      'subscription_billing_mode', v_organization.subscription_billing_mode,
      'account_status', v_organization.account_status,
      'operator_trial_days_used', v_used_days
    ),
    jsonb_build_object(
      'extension_id', v_extension_id,
      'days', p_days,
      'reason', v_reason,
      'revived', v_revived,
      'subscription_status', v_new_status,
      'subscription_trial_ends_at', v_new_ends_at,
      'operator_trial_days_used', v_used_days + p_days,
      'operator_trial_days_remaining', v_max_days_lifetime - (v_used_days + p_days),
      'platform_actor_id', p_actor_id,
      'operator_id', p_actor_id,
      'platform_actor_email', v_operator_email
    )
  );

  return jsonb_build_object(
    'extension_id', v_extension_id,
    'org_id', p_org_id,
    'days', p_days,
    'reason', v_reason,
    'revived', v_revived,
    'previous_status', v_organization.subscription_status,
    'status', v_new_status,
    'previous_trial_ends_at', v_previous_ends_at,
    'trial_ends_at', v_new_ends_at,
    'days_used', v_used_days + p_days,
    'days_remaining', v_max_days_lifetime - (v_used_days + p_days)
  );
end;
$$;

revoke all on function public.extend_organization_trial(uuid, integer, text, uuid, text) from public;
grant execute on function public.extend_organization_trial(uuid, integer, text, uuid, text) to service_role;

notify pgrst, 'reload schema';
