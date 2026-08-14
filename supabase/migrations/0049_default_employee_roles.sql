-- Keep the built-in employee permission presets available for every tenant.
-- `profiles.role` remains the secure system access tier (admin/manager/cashier);
-- employee_roles are organization-scoped workspace presets.

create or replace function public.seed_default_employee_roles(p_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.employee_roles (org_id, name, slug, description, color, permissions)
  values
    (p_org_id, 'Admin', 'admin', 'Full access to the backoffice and employee workspace.', 'brown', '["dashboard.view","sales.view","pos.use","orders.manage","inventory.manage","products.manage","employees.manage","reports.view","settings.manage"]'::jsonb),
    (p_org_id, 'Manager', 'manager', 'Operational access to review sales, stock, and staff activity.', 'amber', '["dashboard.view","sales.view","orders.manage","inventory.manage","products.manage","employees.view","reports.view"]'::jsonb),
    (p_org_id, 'Cashier', 'cashier', 'POS access for recording sales at the assigned branch.', 'green', '["pos.use","orders.create","products.view"]'::jsonb),
    (p_org_id, 'Staff', 'staff', 'Basic store access for staff who do not manage the business.', 'blue', '["products.view"]'::jsonb)
  on conflict (org_id, slug) do nothing;
$$;

revoke all on function public.seed_default_employee_roles(uuid) from public;

create or replace function public.seed_default_employee_roles_on_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_employee_roles(new.id);
  return new;
end;
$$;

revoke all on function public.seed_default_employee_roles_on_organization() from public;

drop trigger if exists seed_default_employee_roles_after_organization on public.organizations;
create trigger seed_default_employee_roles_after_organization
  after insert on public.organizations
  for each row execute function public.seed_default_employee_roles_on_organization();

-- Backfill organizations created before this migration. Existing customized
-- role presets are preserved because the insert is conflict-safe by slug.
select public.seed_default_employee_roles(id)
from public.organizations;
