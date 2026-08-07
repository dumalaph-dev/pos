-- Remove hosted default full-DML grants from the authenticated role.
--
-- Orders, order items, stock movements, and audit logs are append-only. The
-- POS needs SELECT for history/reporting and INSERT for sale, inventory,
-- reversal, and audit writes. Reversals are new linked rows; no authenticated
-- caller needs UPDATE or DELETE on any of these tables.
--
-- Revoke ALL first because hosted Supabase projects may already have a direct
-- full grant from their default privilege configuration. A plain GRANT
-- SELECT, INSERT would otherwise leave UPDATE/DELETE (and other table
-- privileges) in place.
revoke all privileges on table
  orders,
  order_items,
  stock_movements,
  audit_logs
from authenticated;

grant select, insert on table
  orders,
  order_items,
  stock_movements,
  audit_logs
to authenticated;
