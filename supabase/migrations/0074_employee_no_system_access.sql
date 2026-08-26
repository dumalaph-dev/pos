-- Allow directory employees to be tracked for attendance and payroll without
-- granting them an admin dashboard or POS login. `profiles.role` remains
-- non-null and limited to the authenticated access tiers.

alter table employee_records
  alter column role drop not null;

comment on column employee_records.role is
  'System access tier for a linked employee login; NULL means attendance/payroll only.';
