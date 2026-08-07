-- Collapse the legacy Starter/Growth/Custom model into the single Premium plan.
-- This is deliberately additive and reversible at the schema level: existing
-- subscription status, provider ids, and billing period dates are preserved.

alter table organizations
  alter column subscription_plan set default 'premium';

-- Normalize every existing organization before adding the constraint. The
-- timestamp records that the persisted plan was updated by this migration.
update organizations
set
  subscription_plan = 'premium',
  subscription_updated_at = now()
where subscription_plan is distinct from 'premium';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_subscription_plan_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table organizations
      add constraint organizations_subscription_plan_check
      check (subscription_plan = 'premium');
  end if;
end;
$$;
