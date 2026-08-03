-- Employee ID login support.
-- Supabase Auth remains the identity provider; this flag only tells the app
-- to require a password change after an admin provisions or resets a login.

alter table profiles
  add column if not exists password_change_required boolean not null default false;

create index if not exists employee_records_active_code_idx
  on employee_records (employee_code)
  where is_active = true;
