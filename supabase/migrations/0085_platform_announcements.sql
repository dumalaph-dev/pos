-- Platform-wide announcements are service-role-only operator content.
-- Tenant delivery can be added later behind explicit audience checks.

create table if not exists public.platform_announcements (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  body           text not null,
  severity       text not null default 'info',
  status         text not null default 'draft',
  audience       text not null default 'all',
  audience_value text,
  action_label   text,
  action_url     text,
  starts_at      timestamptz,
  expires_at     timestamptz,
  published_at   timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint platform_announcements_title_check check (char_length(trim(title)) between 3 and 140),
  constraint platform_announcements_body_check check (char_length(trim(body)) between 1 and 5000),
  constraint platform_announcements_severity_check check (severity in ('info', 'success', 'warning', 'critical')),
  constraint platform_announcements_status_check check (status in ('draft', 'scheduled', 'published', 'archived')),
  constraint platform_announcements_audience_check check (audience in ('all', 'plan', 'account_status')),
  constraint platform_announcements_action_label_check check (action_label is null or char_length(trim(action_label)) between 1 and 60),
  constraint platform_announcements_action_url_check check (action_url is null or char_length(trim(action_url)) between 1 and 500),
  constraint platform_announcements_schedule_check check (expires_at is null or starts_at is null or expires_at > starts_at)
);

create index if not exists platform_announcements_status_schedule_idx
  on public.platform_announcements (status, starts_at, expires_at);

create index if not exists platform_announcements_created_idx
  on public.platform_announcements (created_at desc);

create table if not exists public.platform_announcement_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
  action          text not null,
  actor_id        uuid references auth.users(id) on delete set null,
  actor_email     text,
  before          jsonb,
  after           jsonb,
  created_at      timestamptz not null default now(),
  constraint platform_announcement_audit_action_check check (action in ('platform.announcement.created', 'platform.announcement.updated', 'platform.announcement.published', 'platform.announcement.archived'))
);

create index if not exists platform_announcement_audit_created_idx
  on public.platform_announcement_audit_logs (created_at desc);

alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_audit_logs enable row level security;

revoke all on table public.platform_announcements, public.platform_announcement_audit_logs
  from anon, authenticated, public;
grant all on table public.platform_announcements, public.platform_announcement_audit_logs
  to service_role;

