--
-- Platform support cases are intentionally service-role-only for this phase.
-- The platform console creates and audits cases after both operating policies
-- have been published. Tenant-facing case history can be added later without
-- weakening the platform operator boundary here.

create table if not exists support_cases (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  created_by            uuid not null,
  subject               text not null,
  description           text not null,
  priority              text not null default 'normal',
  status                text not null default 'open',
  first_response_due_at timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  resolved_at           timestamptz,
  constraint support_cases_subject_check check (char_length(trim(subject)) between 1 and 160),
  constraint support_cases_description_check check (char_length(trim(description)) between 1 and 5000),
  constraint support_cases_priority_check check (priority in ('normal', 'urgent')),
  constraint support_cases_status_check check (status in ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'))
);

create index if not exists support_cases_org_created_idx
  on support_cases (org_id, created_at desc);

create index if not exists support_cases_status_due_idx
  on support_cases (status, first_response_due_at);

alter table support_cases enable row level security;

grant all on table support_cases to service_role;
