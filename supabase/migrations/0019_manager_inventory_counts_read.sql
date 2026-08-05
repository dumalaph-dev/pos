-- Managers can review physical counts for their assigned branch without
-- gaining any ability to create, revise, or delete count records.

drop policy if exists inventory_counts_manager_read on inventory_counts;
create policy inventory_counts_manager_read on inventory_counts
  for select using (
    auth_role() = 'manager'::user_role
    and org_id = auth_org_id()
    and store_id = auth_store_id()
  );
