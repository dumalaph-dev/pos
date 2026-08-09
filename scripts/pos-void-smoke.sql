-- POS completed-order void smoke test (TEST_PLAN 8.5, 10.3, 11.5).
--
-- Run against the linked project with:
--   npx supabase db query --linked --file scripts/pos-void-smoke.sql
--
-- The whole check is rolled back. Fixed UUIDs are safe because no row survives
-- the transaction, and using SET ROLE authenticated exercises the same RLS
-- and auth.uid() boundary used by the browser RPC calls.

begin;

create temp table _pos_void_checks (
  seq    integer primary key,
  name   text not null,
  passed boolean not null,
  detail text
);
grant all on table _pos_void_checks to authenticated;

-- Setup runs as postgres so the fixture itself does not bypass the user-path
-- checks below. The empty user metadata avoids the owner-signup trigger.
do $$
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin,
    created_at, updated_at
  )
  values
    ('f0340000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'pos-void-smoke-admin-0034@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, false, now(), now()),
    ('f0340000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'pos-void-smoke-manager-0034@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, false, now(), now()),
    ('f0340000-0000-0000-0000-000000000203', 'authenticated', 'authenticated', 'pos-void-smoke-cashier-0034@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}'::jsonb, false, now(), now());

  insert into organizations (id, name, currency, settings)
  values ('f0340000-0000-0000-0000-000000000001', 'POS Void Smoke 0034', 'PHP', '{}');

  insert into stores (id, org_id, name, address, currency)
  values ('f0340000-0000-0000-0000-000000000011', 'f0340000-0000-0000-0000-000000000001', 'Void Smoke Branch', 'Rollback test branch', 'PHP');

  insert into profiles (id, org_id, store_id, full_name, role)
  values
    ('f0340000-0000-0000-0000-000000000201', 'f0340000-0000-0000-0000-000000000001', null, 'Void Smoke Admin', 'admin'),
    ('f0340000-0000-0000-0000-000000000202', 'f0340000-0000-0000-0000-000000000001', 'f0340000-0000-0000-0000-000000000011', 'Void Smoke Manager', 'manager'),
    ('f0340000-0000-0000-0000-000000000203', 'f0340000-0000-0000-0000-000000000001', 'f0340000-0000-0000-0000-000000000011', 'Void Smoke Cashier', 'cashier');

  update organizations
  set owner_profile_id = 'f0340000-0000-0000-0000-000000000201'
  where id = 'f0340000-0000-0000-0000-000000000001';

  insert into products (
    id, org_id, store_id, name, pricing_mode, price, unit, track_stock, sort_order
  )
  values (
    'f0340000-0000-0000-0000-000000000101',
    'f0340000-0000-0000-0000-000000000001',
    'f0340000-0000-0000-0000-000000000011',
    'Void Smoke Product', 'fixed', 1000, 'pcs', true, 1
  );
end;
$$;

set local role authenticated;

do $$
declare
  v_admin_id       uuid := 'f0340000-0000-0000-0000-000000000201';
  v_manager_id     uuid := 'f0340000-0000-0000-0000-000000000202';
  v_cashier_id     uuid := 'f0340000-0000-0000-0000-000000000203';
  v_org_id         uuid := 'f0340000-0000-0000-0000-000000000001';
  v_store_id       uuid := 'f0340000-0000-0000-0000-000000000011';
  v_product_id     uuid := 'f0340000-0000-0000-0000-000000000101';
  v_shift_id       uuid;
  v_order_id       uuid;
  v_order_id_2     uuid;
  v_approval_id    uuid;
  v_failed_id      uuid;
  v_reversal_id    uuid;
  v_second_result  uuid;
  v_reading        jsonb;
  v_status         text;
  v_order_no       text;
  v_reversal_of    uuid;
  v_total          bigint;
  v_count          bigint;
  v_qty            numeric;
  v_error          text;
  v_seq            integer := 0;
begin
  -- The PIN setter is admin-only, but the PIN itself belongs to the manager.
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform public.set_profile_pin(v_manager_id, '2468');

  v_seq := v_seq + 1;
  insert into _pos_void_checks values (v_seq, 'Admin can assign a manager approval PIN', true, null);

  perform set_config('request.jwt.claim.sub', v_cashier_id::text, true);
  v_shift_id := public.open_shift(v_store_id, null, 0);

  v_order_id := public.place_order(
    jsonb_build_object(
      'local_uuid', 'f0340000-0000-0000-0000-000000000301',
      'org_id', v_org_id,
      'store_id', v_store_id,
      'device_id', null,
      'order_no', 'VOID-SMOKE-001',
      'shift_id', v_shift_id,
      'cashier_id', v_cashier_id,
      'status', 'completed',
      'subtotal', 2000,
      'discount_type', 'none',
      'discount_amount', 0,
      'vatable_sale', 2000,
      'vat_amount', 0,
      'vat_exempt_sale', 0,
      'total', 2000,
      'payment_method', 'cash',
      'amount_tendered', 2000,
      'change_due', 0,
      'created_at_device', now()
    ),
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'name_snapshot', 'Void Smoke Product',
      'pricing_mode_snapshot', 'fixed',
      'unit_price_snapshot', 1000,
      'qty', 2,
      'weight_kg', null,
      'line_total', 2000
    ))
  );

  -- A bad manager PIN must only create the failed-approval audit event.
  v_failed_id := public.verify_void_pin(v_order_id, '9999');
  select count(*) into v_count
  from orders
  where reversal_of = v_order_id;
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Invalid PIN creates no reversal', v_failed_id is null and v_count = 0,
    format('approval=%s reversals=%s', coalesce(v_failed_id::text, 'null'), v_count));

  select count(*) into v_count
  from audit_logs
  where org_id = v_org_id
    and entity_id = v_order_id
    and action = 'auth.void_pin.failed';
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Invalid PIN is audit logged', v_count = 1, format('failed_events=%s', v_count));

  -- The cashier supplies the manager PIN; approval is branch-scoped and short-lived.
  v_approval_id := public.verify_void_pin(v_order_id, '2468');
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Valid manager PIN creates an approval', v_approval_id is not null,
    format('approval=%s', coalesce(v_approval_id::text, 'null')));

  v_reversal_id := public.record_pos_order_void(
    v_order_id,
    'Customer payment reversed at the counter',
    v_approval_id
  );

  select status::text, order_no, reversal_of, total
    into v_status, v_order_no, v_reversal_of, v_total
  from orders
  where id = v_reversal_id;
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (
    v_seq,
    'Approved POS void creates an immutable linked reversal',
    v_status = 'voided'
      and v_order_no = 'VOID-SMOKE-001-VOIDED'
      and v_reversal_of = v_order_id
      and v_total = 2000,
    format('status=%s order_no=%s reversal_of=%s total=%s', v_status, v_order_no, v_reversal_of, v_total)
  );

  select status::text into v_status from orders where id = v_order_id;
  select count(*) into v_count from order_items where order_id = v_reversal_id;
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Original sale remains completed and reversal copies its item', v_status = 'completed' and v_count = 1,
    format('original_status=%s reversal_items=%s', v_status, v_count));

  select count(*), coalesce(sum(qty), 0)
    into v_count, v_qty
  from stock_movements
  where ref_order_id = v_reversal_id
    and product_id = v_product_id
    and type = 'adjust';
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Voided tracked stock is returned', v_count = 1 and v_qty = 2,
    format('adjustments=%s returned_qty=%s', v_count, v_qty));

  select count(*) into v_count
  from audit_logs
  where org_id = v_org_id
    and entity_id = v_order_id
    and action = 'order.voided'
    and after ->> 'reversal_id' = v_reversal_id::text
    and after ->> 'reason' = 'Customer payment reversed at the counter'
    and after ->> 'requested_by' = v_cashier_id::text
    and after ->> 'approved_by' = v_manager_id::text;
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Void audit payload includes reason and approver', v_count = 1, format('void_events=%s', v_count));

  v_reading := public.shift_reading(v_shift_id);
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (
    v_seq,
    'X-reading excludes voided sale and reports void totals',
    (v_reading ->> 'net_sales')::bigint = 0
      and (v_reading ->> 'void_count')::integer = 1
      and (v_reading ->> 'void_total')::bigint = 2000,
    format('net_sales=%s void_count=%s void_total=%s', v_reading ->> 'net_sales', v_reading ->> 'void_count', v_reading ->> 'void_total')
  );

  -- Reusing the approval cannot create another reversal.
  begin
    v_second_result := public.record_pos_order_void(v_order_id, 'Reuse approval', v_approval_id);
    v_error := 'no error';
  exception when others then
    v_error := sqlerrm;
  end;
  select count(*) into v_count from orders where reversal_of = v_order_id;
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Approval cannot be reused', v_second_result is null and v_count = 1,
    format('error=%s reversals=%s', v_error, v_count));

  -- A fresh completed sale proves the second security-definer function rejects
  -- a direct call that does not carry a valid one-use approval.
  v_order_id_2 := public.place_order(
    jsonb_build_object(
      'local_uuid', 'f0340000-0000-0000-0000-000000000302',
      'org_id', v_org_id,
      'store_id', v_store_id,
      'device_id', null,
      'order_no', 'VOID-SMOKE-002',
      'shift_id', v_shift_id,
      'cashier_id', v_cashier_id,
      'status', 'completed',
      'subtotal', 1000,
      'discount_type', 'none',
      'discount_amount', 0,
      'vatable_sale', 1000,
      'vat_amount', 0,
      'vat_exempt_sale', 0,
      'total', 1000,
      'payment_method', 'cash',
      'amount_tendered', 1000,
      'change_due', 0,
      'created_at_device', now()
    ),
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product_id,
      'name_snapshot', 'Void Smoke Product',
      'pricing_mode_snapshot', 'fixed',
      'unit_price_snapshot', 1000,
      'qty', 1,
      'weight_kg', null,
      'line_total', 1000
    ))
  );

  begin
    v_second_result := public.record_pos_order_void(v_order_id_2, 'Missing approval', gen_random_uuid());
    v_error := 'no error';
  exception when others then
    v_error := sqlerrm;
  end;
  select count(*) into v_count from orders where reversal_of = v_order_id_2;
  select count(*) into v_qty from stock_movements where ref_order_id = v_order_id_2 and type = 'adjust';
  v_seq := v_seq + 1;
  insert into _pos_void_checks
  values (v_seq, 'Direct void without one-use approval is rejected', v_second_result is null and v_count = 0 and v_qty = 0,
    format('error=%s reversals=%s adjustments=%s', v_error, v_count, v_qty));
end;
$$;

select seq, name, passed, detail
from _pos_void_checks
order by seq;

do $$
declare
  v_failed text;
begin
  select string_agg(name, ', ' order by seq)
    into v_failed
  from _pos_void_checks
  where not passed;
  if v_failed is not null then
    raise exception 'POS void smoke checks failed: %', v_failed;
  end if;
end;
$$;

rollback;
