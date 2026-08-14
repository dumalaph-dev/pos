-- Employee workspace: directory, roles, attendance, payroll, and leave requests.
-- Money values are stored as integer centavos, matching the existing POS schema.

create table employee_roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  slug        text not null,
  description text,
  color       text not null default 'brown',
  permissions jsonb not null default '[]'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, slug)
);

create table employee_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  profile_id     uuid unique references profiles(id) on delete set null,
  role_id        uuid references employee_roles(id) on delete set null,
  store_id       uuid references stores(id) on delete set null,
  employee_code  text not null,
  full_name      text not null,
  email          text,
  phone          text,
  role           user_role not null default 'cashier',
  job_title      text,
  hired_on       date not null default current_date,
  schedule_days  text[] not null default array['mon','tue','wed','thu','fri','sat','sun']::text[],
  schedule_start time not null default '09:00',
  schedule_end   time not null default '17:00',
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, employee_code)
);

create table attendance_logs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  store_id    uuid references stores(id) on delete set null,
  employee_id uuid not null references employee_records(id) on delete cascade,
  work_date   date not null,
  status      text not null default 'present' check (status in ('present','absent','late','on_leave')),
  check_in    timestamptz,
  check_out   timestamptz,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, work_date)
);

create table payroll_records (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  store_id      uuid references stores(id) on delete set null,
  employee_id   uuid not null references employee_records(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  regular_pay   bigint not null default 0 check (regular_pay >= 0),
  overtime_pay  bigint not null default 0 check (overtime_pay >= 0),
  allowances   bigint not null default 0 check (allowances >= 0),
  deductions    bigint not null default 0 check (deductions >= 0),
  status        text not null default 'draft' check (status in ('draft','processed','paid')),
  notes         text,
  processed_at  timestamptz,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (period_end >= period_start),
  unique (employee_id, period_start, period_end)
);

create table leave_requests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  store_id     uuid references stores(id) on delete set null,
  employee_id  uuid not null references employee_records(id) on delete cascade,
  leave_type   text not null default 'Personal Leave',
  start_date   date not null,
  end_date     date not null,
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by  uuid references profiles(id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_date >= start_date)
);

create index employee_records_org_active_idx on employee_records (org_id, is_active, full_name);
create index employee_records_org_store_idx on employee_records (org_id, store_id);
create index employee_roles_org_active_idx on employee_roles (org_id, is_active, name);
create index attendance_logs_org_date_idx on attendance_logs (org_id, work_date desc);
create index attendance_logs_employee_date_idx on attendance_logs (employee_id, work_date desc);
create index payroll_records_org_period_idx on payroll_records (org_id, period_start desc, period_end desc);
create index payroll_records_employee_period_idx on payroll_records (employee_id, period_start desc);
create index leave_requests_org_status_idx on leave_requests (org_id, status, start_date desc);
create index leave_requests_employee_date_idx on leave_requests (employee_id, start_date desc);

-- Seed the built-in permission roles for every existing organization. These are
-- database rows so the Roles & Permissions tab can edit them like any other role.
insert into employee_roles (org_id, name, slug, description, color, permissions)
select o.id, seed.name, seed.slug, seed.description, seed.color, seed.permissions
from organizations o
cross join (
  values
    ('Admin', 'admin', 'Full access to the backoffice and employee workspace.', 'brown', '["dashboard.view","sales.view","pos.use","orders.manage","inventory.manage","products.manage","employees.manage","reports.view","settings.manage"]'::jsonb),
    ('Manager', 'manager', 'Operational access to review sales, stock, and staff activity.', 'amber', '["dashboard.view","sales.view","orders.manage","inventory.manage","products.manage","employees.view","reports.view"]'::jsonb),
    ('Cashier', 'cashier', 'POS access for recording sales at the assigned branch.', 'green', '["pos.use","orders.create","products.view"]'::jsonb),
    ('Staff', 'staff', 'Basic store access for staff who do not manage the business.', 'blue', '["products.view"]'::jsonb)
) as seed(name, slug, description, color, permissions)
on conflict (org_id, slug) do nothing;

-- Backfill the directory from auth profiles so existing signed-in staff are
-- immediately visible. New rows created by the UI can exist before an auth
-- profile is linked, which keeps employee planning separate from login setup.
insert into employee_records (org_id, profile_id, role_id, store_id, employee_code, full_name, email, role, hired_on, is_active)
select
  p.org_id,
  p.id,
  r.id,
  p.store_id,
  'EMP-' || lpad(row_number() over (partition by p.org_id order by p.created_at, p.id)::text, 4, '0'),
  p.full_name,
  u.email,
  p.role,
  p.created_at::date,
  p.is_active
from profiles p
left join auth.users u on u.id = p.id
left join employee_roles r on r.org_id = p.org_id and r.slug = p.role::text
where not exists (
  select 1 from employee_records existing where existing.profile_id = p.id
);

grant select, insert, update, delete on
  employee_roles, employee_records, attendance_logs, payroll_records, leave_requests
  to authenticated;
grant all on employee_roles, employee_records, attendance_logs, payroll_records, leave_requests to service_role;
revoke all on employee_roles, employee_records, attendance_logs, payroll_records, leave_requests from anon;

alter table employee_roles enable row level security;
alter table employee_records enable row level security;
alter table attendance_logs enable row level security;
alter table payroll_records enable row level security;
alter table leave_requests enable row level security;

create policy employee_roles_admin_all on employee_roles
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy employee_roles_manager_read on employee_roles
  for select using (auth_role() in ('admin'::user_role, 'manager'::user_role) and org_id = auth_org_id());

create policy employee_records_admin_all on employee_records
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy employee_records_manager_read on employee_records
  for select using (auth_role() in ('admin'::user_role, 'manager'::user_role) and org_id = auth_org_id());

create policy attendance_logs_admin_all on attendance_logs
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy attendance_logs_manager_read on attendance_logs
  for select using (auth_role() in ('admin'::user_role, 'manager'::user_role) and org_id = auth_org_id());

create policy payroll_records_admin_all on payroll_records
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy payroll_records_manager_read on payroll_records
  for select using (auth_role() in ('admin'::user_role, 'manager'::user_role) and org_id = auth_org_id());

create policy leave_requests_admin_all on leave_requests
  for all using (auth_is_admin() and org_id = auth_org_id())
  with check (auth_is_admin() and org_id = auth_org_id());
create policy leave_requests_manager_read on leave_requests
  for select using (auth_role() in ('admin'::user_role, 'manager'::user_role) and org_id = auth_org_id());
