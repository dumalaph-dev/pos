-- Supporting indexes for the organization-scoped latency improvements.
-- These keep audit pagination and inventory movement counts from scanning
-- unrelated organizations as the shared tables grow.

create index if not exists audit_logs_org_created_idx
  on audit_logs (org_id, created_at desc);

create index if not exists stock_movements_org_type_idx
  on stock_movements (org_id, type);
