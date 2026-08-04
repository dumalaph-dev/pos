-- Keep the lightweight recent-leave summary used by admin navigation on the
-- same organization-scoped index as the rest of the employee workspace.

create index if not exists leave_requests_org_created_idx
  on leave_requests (org_id, created_at desc);
