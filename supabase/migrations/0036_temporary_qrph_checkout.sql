-- Temporary one-time QR Ph access while recurring PayMongo methods are pending.
-- This keeps the recurring subscription columns intact and records which
-- organizations were activated through a prepaid QR Ph checkout.

alter table organizations
  add column if not exists subscription_billing_mode text not null default 'recurring',
  add column if not exists subscription_provider_checkout_session_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_subscription_billing_mode_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table organizations
      add constraint organizations_subscription_billing_mode_check
      check (subscription_billing_mode in ('recurring', 'temporary_qrph'));
  end if;
end;
$$;

create index if not exists organizations_subscription_checkout_session_idx
  on organizations (subscription_provider_checkout_session_id)
  where subscription_provider_checkout_session_id is not null;
