-- Remember which local billing catalog option activated the organization's
-- current access so the owner-facing billing page can show the correct rate.

alter table organizations
  add column if not exists subscription_billing_variant_id text;

create index if not exists organizations_subscription_billing_variant_idx
  on organizations (subscription_billing_variant_id)
  where subscription_billing_variant_id is not null;
