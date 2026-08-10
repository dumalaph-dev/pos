-- Give platform operators a small, auditable workflow for trial-retention leads.

alter table trial_feedback
  add column if not exists status text not null default 'new',
  add column if not exists platform_notes text not null default '',
  add column if not exists acted_at timestamptz,
  add column if not exists acted_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trial_feedback_status_check'
      and conrelid = 'trial_feedback'::regclass
  ) then
    alter table trial_feedback
      add constraint trial_feedback_status_check check (status in ('new', 'contacted', 'offer_sent', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'trial_feedback_platform_notes_check'
      and conrelid = 'trial_feedback'::regclass
  ) then
    alter table trial_feedback
      add constraint trial_feedback_platform_notes_check check (char_length(platform_notes) <= 2000);
  end if;
end;
$$;

create index if not exists trial_feedback_workflow_idx
  on trial_feedback (status, updated_at desc);
