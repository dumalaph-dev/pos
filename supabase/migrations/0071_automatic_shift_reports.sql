-- Dumala POS — automatically seal a dashboard report whenever a shift closes.
--
-- The existing Z-reading archive already contains the immutable, reversal-aware
-- shift snapshot needed by the owner dashboard. This trigger moves report
-- generation into the same transaction as close_shift so a successful close
-- cannot leave a shift without a report.

create or replace function auto_generate_shift_report()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_reading jsonb;
  v_z_number bigint;
  v_grand_before bigint;
  v_net bigint;
  v_actor_id uuid;
  v_id uuid;
begin
  v_actor_id := coalesce(new.closed_by, new.cashier_id);

  if old.closed_at is not null or new.closed_at is null then
    return new;
  end if;

  -- Keep this idempotent for an existing archive row or a retried migration.
  if exists (select 1 from z_readings where shift_id = new.id) then
    return new;
  end if;

  -- Serialize the branch-wide Z sequence and lifetime total.
  perform pg_advisory_xact_lock(hashtext('z_reading:' || new.store_id::text));

  select coalesce(max(z_number), 0) + 1
    into v_z_number
  from z_readings
  where store_id = new.store_id;

  select coalesce(grand_total_after, 0)
    into v_grand_before
  from z_readings
  where store_id = new.store_id
  order by z_number desc
  limit 1;

  v_grand_before := coalesce(v_grand_before, 0);
  v_reading := shift_reading(new.id);
  if v_reading is null then
    raise exception 'the shift report could not read the closed shift';
  end if;
  v_net := (v_reading->>'net_sales')::bigint;

  insert into z_readings (
    org_id, store_id, shift_id, z_number, business_date, cashier_id, device_id,
    opened_at, closed_at,
    order_count, gross_sales, discount_total, net_sales,
    vatable_sale, vat_amount, vat_exempt_sale,
    void_count, void_total, refund_count, refund_total,
    cash_sales, gcash_sales, maya_sales, card_sales,
    opening_cash, cash_refunds, expected_cash, declared_cash, cash_variance,
    grand_total_before, grand_total_after,
    reading, note, generated_by
  )
  values (
    new.org_id,
    new.store_id,
    new.id,
    v_z_number,
    (new.closed_at at time zone 'Asia/Singapore')::date,
    new.cashier_id,
    new.device_id,
    new.opened_at,
    new.closed_at,
    (v_reading->>'order_count')::int,
    (v_reading->>'gross_sales')::bigint,
    (v_reading->>'discount_total')::bigint,
    v_net,
    (v_reading->>'vatable_sale')::bigint,
    (v_reading->>'vat_amount')::bigint,
    (v_reading->>'vat_exempt_sale')::bigint,
    (v_reading->>'void_count')::int,
    (v_reading->>'void_total')::bigint,
    (v_reading->>'refund_count')::int,
    (v_reading->>'refund_total')::bigint,
    (v_reading->>'cash_sales')::bigint,
    (v_reading->>'gcash_sales')::bigint,
    (v_reading->>'maya_sales')::bigint,
    (v_reading->>'card_sales')::bigint,
    coalesce(new.opening_cash, 0),
    (v_reading->>'cash_refunds')::bigint,
    coalesce(new.expected_cash, (v_reading->>'expected_cash')::bigint),
    coalesce(new.declared_cash, 0),
    coalesce(new.variance, 0),
    v_grand_before,
    v_grand_before + v_net,
    v_reading,
    new.note,
    v_actor_id
  )
  returning id into v_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    new.org_id,
    new.store_id,
    v_actor_id,
    'shift.report_generated',
    'z_readings',
    v_id,
    jsonb_build_object(
      'automatic', true,
      'shift_id', new.id,
      'shift_no', new.shift_no,
      'z_number', v_z_number,
      'net_sales', v_net,
      'grand_total_after', v_grand_before + v_net
    )
  );

  return new;
end;
$$;

revoke all on function auto_generate_shift_report() from public;

drop trigger if exists auto_generate_shift_report_on_close on shifts;
create trigger auto_generate_shift_report_on_close
  after update of closed_at on shifts
  for each row
  when (old.closed_at is null and new.closed_at is not null)
  execute function auto_generate_shift_report();

comment on function auto_generate_shift_report() is
  'Seals an immutable dashboard shift report in z_readings during closeout.';
