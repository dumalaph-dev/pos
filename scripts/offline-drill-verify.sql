-- Exactly-once verification for the P2/P9 offline sale drill.
--
-- Run against the linked project AFTER the tablet has reconnected and the POS
-- pending counter has returned to zero:
--   npx supabase db query --linked --file scripts/offline-drill-verify.sql
--
-- Read-only: this file contains no writes and no transaction to roll back.
--
-- Edit the three values in `params` below to match the drill before running.
-- `expected_sales` is the number of sales the operator actually rang up while
-- the tablet was in airplane mode — the whole point of the drill is that the
-- server agrees with what the cashier counted, so it has to be typed in by
-- hand rather than derived from the rows being checked.

with params as (
  select
    'Main Branch'::text as branch_name,
    current_date        as drill_date,   -- Singapore business date of the drill
    15::int             as expected_sales
),
matched_stores as (
  select s.id
  from params p
  join stores s on s.name = p.branch_name
),
scope as (
  select o.*
  from orders o
  join matched_stores s on s.id = o.store_id
  cross join params p
  where (o.created_at at time zone 'Asia/Singapore')::date = p.drill_date
),
checks as (
  -- 0. Guard. Every check below reads from `scope`, and an empty scope makes
  --    several of them vacuously true — so prove the branch name resolved to
  --    exactly one store before trusting anything else in this report.
  select
    0 as seq,
    'branch name resolves to exactly one store' as name,
    (select count(*) from matched_stores) = 1 as passed,
    format('%s stores named %L', (select count(*) from matched_stores), p.branch_name) as detail
  from params p

  union all

  -- 1. Every offline sale arrived, and none arrived twice.
  select
    1,
    'sale count matches the cashier count',
    (select count(*) from scope) = p.expected_sales,
    format('%s order rows on %s at %L, expected %s',
           (select count(*) from scope), p.drill_date, p.branch_name, p.expected_sales)
  from params p

  union all

  -- 2. The idempotency key did its job. A duplicate here means one sale synced
  --    as two orders, which is the failure that unique(local_uuid) and the
  --    place_order upsert exist to prevent.
  select
    2,
    'no duplicate local_uuid (exactly-once sync)',
    count(*) = count(distinct local_uuid),
    format('%s rows, %s distinct local_uuid', count(*), count(distinct local_uuid))
  from scope

  union all

  -- 3. Order numbers are contiguous per device. A gap means a sale was rung up
  --    on the tablet and never reached the server at all — invisible to check 2,
  --    because a row that was never sent cannot duplicate.
  select
    3,
    'order number sequence has no gaps',
    coalesce(bool_and(ok), false),
    coalesce(string_agg(detail, '; '), 'no numbered orders in scope')
  from (
    select
      max(seq) - min(seq) + 1 = count(*) as ok,
      format('device %s: %s rows spanning %s..%s', device_id, count(*), min(seq), max(seq)) as detail
    from (
      select device_id, (regexp_replace(order_no, '^.*-', ''))::int as seq
      from scope
      where order_no ~ '-[0-9]+$'
    ) numbered
    group by device_id
  ) per_device

  union all

  -- 4. Each synced order carried its lines with it.
  select
    4,
    'every order has at least one line item',
    count(*) filter (where item_count = 0) = 0,
    format('%s of %s orders have no order_items',
           count(*) filter (where item_count = 0), count(*))
  from (
    select o.id, count(oi.id) as item_count
    from scope o
    left join order_items oi on oi.order_id = o.id
    group by o.id
  ) lines

  union all

  -- 5. Totals reconcile against subtotal and discount, so nothing was truncated
  --    in transit. VAT is inclusive here, so it does not enter the identity;
  --    see total = max(0, subtotal - discount) in src/lib/pos/pricing.ts.
  select
    5,
    'order totals reconcile with subtotal and discount',
    count(*) filter (where not balanced) = 0,
    format('%s of %s completed orders do not satisfy subtotal - discount = total',
           count(*) filter (where not balanced), count(*))
  from (
    select o.id, o.subtotal - o.discount_amount = o.total as balanced
    from scope o
    where o.status = 'completed'
  ) totals

  union all

  -- 6. The append-only ledger recorded each sale.
  select
    6,
    'every order has an order.created audit row',
    count(*) filter (where audit_count = 0) = 0,
    format('%s of %s orders have no order.created audit row',
           count(*) filter (where audit_count = 0), count(*))
  from (
    select o.id, count(a.id) as audit_count
    from scope o
    left join audit_logs a
      on a.entity_id = o.id and a.action = 'order.created'
    group by o.id
  ) audited
)
select
  seq,
  case when passed then 'PASS' else 'FAIL' end as result,
  name,
  detail
from checks
order by seq;
