-- Support cases are platform-operator records in this phase. Remove any
-- inherited default table grants so tenant clients cannot query or write them,
-- even though RLS is enabled as a second boundary.

revoke all on table support_cases from anon, authenticated, public;
grant all on table support_cases to service_role;
