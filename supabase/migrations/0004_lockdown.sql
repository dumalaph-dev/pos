-- Dumala POS — lockdown: revoke anon's table privileges.
--
-- HOSTED Supabase applies default privileges that grant `anon` full table
-- access to tables created in schema public (local stacks don't, so behavior
-- differs: hosted anon gets HTTP 200 + [] instead of 401). RLS policies
-- already filter anon to zero rows; this closes the privilege hole for
-- defense in depth and makes hosted behave like local (permission denied).
revoke all privileges on all tables in schema public from anon;

-- Cover tables created later (hosted re-applies its default grants on new
-- tables created by postgres).
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
