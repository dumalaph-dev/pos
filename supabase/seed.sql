-- Dumala POS — local dev fixture (applied automatically by `supabase start` / `supabase db reset`).
-- 2 orgs × 2 branches + one device per branch + a small menu per branch.
--
-- Auth users and `profiles` rows are NOT created here: GoTrue must hash the
-- passwords, so scripts/rls-fixture.mjs creates them via the admin API after
-- this seed runs. Org/store/device ids are fixed so the fixture script (and
-- the RLS assertions in TEST_PLAN §1) can reference them deterministically.

insert into organizations (id, name, currency, settings) values
  ('a0000000-0000-0000-0000-000000000001', 'Org Alpha', 'PHP', '{}'),
  ('a0000000-0000-0000-0000-000000000002', 'Org Beta',  'PHP', '{}');

insert into stores (id, org_id, name, address, tin) values
  ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Alpha Branch 1', '123 Rizal St, Cebu City', '000-000-000-001'),
  ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Alpha Branch 2', '456 Mango Ave, Cebu City', '000-000-000-002'),
  ('a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000002', 'Beta Branch 1',  '789 Osmena Blvd, Cebu City', '000-000-000-003'),
  ('a0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000002', 'Beta Branch 2',  '111 Colon St, Cebu City',   '000-000-000-004');

insert into devices (id, org_id, store_id, name, device_prefix) values
  ('a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000011', 'Alpha-1 Tablet', 'A1'),
  ('a0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000012', 'Alpha-2 Tablet', 'A2'),
  ('a0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000013', 'Beta-1 Tablet',  'B1'),
  ('a0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000014', 'Beta-2 Tablet',  'B2');

-- Per-branch menu. Whole Lechon deliberately differs per branch so the
-- "price edit on Branch A doesn't touch Branch B" assertion (TEST_PLAN 1.6)
-- has something to compare against.
do $$
declare
  s record;
  cat_lechon uuid;
  cat_sides uuid;
begin
  for s in select id, org_id from stores order by id loop
    insert into categories (org_id, store_id, name, icon, sort_order)
    values (s.org_id, s.id, 'Lechon', '🐷', 1) returning id into cat_lechon;
    insert into categories (org_id, store_id, name, icon, sort_order)
    values (s.org_id, s.id, 'Sides', '🍚', 2) returning id into cat_sides;

    insert into products (org_id, store_id, category_id, name, pricing_mode, price, unit, track_stock, sort_order) values
      (s.org_id, s.id, cat_lechon, 'Whole Lechon',   'fixed', case s.id
         when 'a0000000-0000-0000-0000-000000000011' then 280000
         when 'a0000000-0000-0000-0000-000000000012' then 290000
         when 'a0000000-0000-0000-0000-000000000013' then 270000
         else 285000 end, 'pcs', true, 1),
      (s.org_id, s.id, cat_lechon, 'Quarter Lechon', 'fixed', 75000, 'pcs', true, 2),
      (s.org_id, s.id, cat_lechon, 'Lechon Per Kilo','per_kg', 85000, 'kg', true, 3),
      (s.org_id, s.id, cat_sides,  'Rice',           'fixed', 2500,  'cup', false, 1),
      (s.org_id, s.id, cat_sides,  'Softdrink',      'fixed', 3000,  'bottle', false, 2),
      (s.org_id, s.id, cat_sides,  'Sarsaparilla',   'fixed', 3500,  'bottle', false, 3);
  end loop;
end $$;
