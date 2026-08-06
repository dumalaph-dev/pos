-- Dumala POS — P8 shifts, till reconciliation, and Z-readings (PRD §6.5).
--
-- The `shifts` table has existed since 0001 but nothing ever wrote to it, so
-- every order carries `shift_id = null`. This migration:
--   1. hardens `shifts` (human label, closer, one open shift per cashier),
--   2. makes `place_order` stamp `shift_id` so sales are attributable to a till,
--   3. adds `open_shift` / `close_shift` with expected-cash reconciliation,
--   4. adds `shift_reading` — the single source of truth for X and Z readings,
--   5. adds an append-only `z_readings` archive with a per-branch sequence.
--
-- Money is integer centavos throughout. Readings are computed from the order
-- ledger, never from a mutable counter: "resetting the counters" is expressed
-- by sealing a shift into an immutable `z_readings` row and starting the next
-- shift, which is what keeps the append-only guarantees of 0002 intact.

/* ── 1. Shift hardening ──────────────────────────────────────────────── */

alter table shifts
  add column if not exists shift_no text,
  add column if not exists closed_by uuid references profiles(id);

-- A cashier can only have one till open per branch at a time. Partial unique
-- index, so closed shifts never collide.
create unique index if not exists shifts_one_open_per_cashier_idx
  on shifts (store_id, cashier_id)
  where closed_at is null;

create index if not exists shifts_store_opened_idx
  on shifts (store_id, opened_at desc);

create index if not exists shifts_org_opened_idx
  on shifts (org_id, opened_at desc);

-- 0002 scoped shift reads to the owning cashier and to admins. A branch
-- manager needs the same read-only till visibility they already have for
-- inventory counts (0019) — no insert, update, or close.
drop policy if exists shifts_manager_read on shifts;
create policy shifts_manager_read on shifts
  for select using (
    auth_role() = 'manager'::user_role
    and org_id = auth_org_id()
    and store_id = auth_store_id()
  );

/* ── 2. Cash-variance threshold (organization setting) ───────────────── */

-- PRD §6.5: closing requires a note when the variance exceeds a configurable
-- amount. Stored as centavos at settings -> 'shifts' -> 'cash_variance_threshold'.
create or replace function shift_variance_threshold(p_org_id uuid)
  returns bigint
  language sql
  stable
  security invoker
  set search_path = public
as $$
  select coalesce(
    nullif(o.settings -> 'shifts' ->> 'cash_variance_threshold', '')::bigint,
    10000
  )
  from organizations o
  where o.id = p_org_id
$$;

grant execute on function shift_variance_threshold(uuid) to authenticated;

/* ── 3. Shift reading — one implementation for X-reading and Z-reading ─ */

-- Security invoker: RLS decides which shifts and orders the caller may read.
-- A cashier sees their own shift; an admin sees any shift in the organization.
--
-- Reversals (0020) are separate order rows that copy the original's shift_id
-- and payment_method, so a void/refund lands in the same till as its sale.
-- Net figures exclude any sale that has a reversal; the reversals are reported
-- on their own lines so the till still explains where the money went.
create or replace function shift_reading(p_shift_id uuid)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = public
as $$
  with s as (
    select * from shifts where id = p_shift_id
  ),
  scoped as (
    select o.* from orders o join s on o.shift_id = s.id
  ),
  reversal as (
    select * from scoped where reversal_of is not null
  ),
  sale as (
    select * from scoped where reversal_of is null and status = 'completed'
  ),
  net as (
    select sl.*
    from sale sl
    where not exists (select 1 from reversal r where r.reversal_of = sl.id)
  ),
  lines as (
    select oi.*
    from order_items oi
    join net n on n.id = oi.order_id
  ),
  cash as (
    select
      coalesce((select sum(total) from sale where payment_method = 'cash'), 0) as sales,
      coalesce((select sum(total) from reversal where payment_method = 'cash'), 0) as reversals
  )
  select jsonb_build_object(
    'shift_id',       s.id,
    'org_id',         s.org_id,
    'store_id',       s.store_id,
    'device_id',      s.device_id,
    'cashier_id',     s.cashier_id,
    'shift_no',       s.shift_no,
    'opened_at',      s.opened_at,
    'closed_at',      s.closed_at,
    'is_open',        s.closed_at is null,
    'note',           s.note,
    'business_date',  (coalesce(s.closed_at, now()) at time zone 'Asia/Singapore')::date,

    'order_count',    (select count(*) from net),
    'gross_sales',    coalesce((select sum(subtotal) from net), 0),
    'discount_total', coalesce((select sum(discount_amount) from net), 0),
    'net_sales',      coalesce((select sum(total) from net), 0),
    'vatable_sale',   coalesce((select sum(vatable_sale) from net), 0),
    'vat_amount',     coalesce((select sum(vat_amount) from net), 0),
    'vat_exempt_sale',coalesce((select sum(vat_exempt_sale) from net), 0),
    'qty_sold',       coalesce((select sum(qty) from lines), 0),
    'kg_sold',        coalesce((select sum(weight_kg) from lines), 0),

    'discounted_order_count', (select count(*) from net where discount_amount > 0),
    'void_count',     (select count(*) from reversal where status = 'voided'),
    'void_total',     coalesce((select sum(total) from reversal where status = 'voided'), 0),
    'refund_count',   (select count(*) from reversal where status = 'refunded'),
    'refund_total',   coalesce((select sum(total) from reversal where status = 'refunded'), 0),

    'payment_totals', (
      select coalesce(
        jsonb_object_agg(p.payment_method, jsonb_build_object('orders', p.orders, 'total', p.total)),
        '{}'::jsonb
      )
      from (
        select payment_method, count(*) as orders, sum(total) as total
        from net
        group by payment_method
      ) p
    ),
    'cash_sales',     coalesce((select sum(total) from net where payment_method = 'cash'), 0),
    'gcash_sales',    coalesce((select sum(total) from net where payment_method = 'gcash'), 0),
    'maya_sales',     coalesce((select sum(total) from net where payment_method = 'maya'), 0),
    'card_sales',     coalesce((select sum(total) from net where payment_method = 'card'), 0),

    -- PRD §6.5: expected cash = opening + cash sales − cash refunds.
    'opening_cash',   s.opening_cash,
    'cash_refunds',   (select reversals from cash),
    'expected_cash',  s.opening_cash + (select sales - reversals from cash),
    'declared_cash',  s.declared_cash,
    'cash_variance',  case
                        when s.declared_cash is null then null
                        else s.declared_cash - (s.opening_cash + (select sales - reversals from cash))
                      end,
    'stored_expected_cash', s.expected_cash,
    'stored_variance',      s.variance,
    'variance_threshold',   shift_variance_threshold(s.org_id)
  )
  from s
$$;

grant execute on function shift_reading(uuid) to authenticated;

-- One round trip for a list of tills. `p_store_id` null reads every branch the
-- caller's RLS scope allows.
create or replace function shift_reading_list(
  p_store_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit int default 200
)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = public
as $$
  select coalesce(jsonb_agg(shift_reading(s.id) order by s.opened_at desc), '[]'::jsonb)
  from (
    select id, opened_at
    from shifts
    where (p_store_id is null or store_id = p_store_id)
      and (p_from is null or opened_at >= p_from)
      and (p_to is null or opened_at < p_to)
    order by opened_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) s
$$;

grant execute on function shift_reading_list(uuid, timestamptz, timestamptz, int) to authenticated;

/* ── 4. Open a shift ─────────────────────────────────────────────────── */

create or replace function open_shift(
  p_store_id uuid,
  p_device_id uuid default null,
  p_opening_cash bigint default 0
)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_org_id uuid := auth_org_id();
  v_actor_id uuid := auth.uid();
  v_shift_id uuid;
  v_shift_no text;
  v_day text;
  v_seq int;
begin
  if v_actor_id is null then
    raise exception 'sign in before opening a shift';
  end if;

  if p_store_id is null then
    raise exception 'a branch is required to open a shift';
  end if;

  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'the opening cash float cannot be negative';
  end if;

  if coalesce(p_opening_cash, 0) > 100000000 then
    raise exception 'the opening cash float is too large';
  end if;

  if not exists (
    select 1 from stores where id = p_store_id and org_id = v_org_id
  ) then
    raise exception 'that branch is not available in your organization';
  end if;

  if exists (
    select 1 from shifts
    where store_id = p_store_id and cashier_id = v_actor_id and closed_at is null
  ) then
    raise exception 'you already have an open shift at this branch';
  end if;

  -- Human-readable label: SH-YYMMDD-NNN, counted per branch per business day.
  v_day := to_char(now() at time zone 'Asia/Singapore', 'YYMMDD');
  perform pg_advisory_xact_lock(hashtext('shift_no:' || p_store_id::text));
  select count(*) + 1 into v_seq
  from shifts
  where store_id = p_store_id
    and (opened_at at time zone 'Asia/Singapore')::date
        = (now() at time zone 'Asia/Singapore')::date;
  v_shift_no := 'SH-' || v_day || '-' || lpad(v_seq::text, 3, '0');

  insert into shifts (org_id, store_id, device_id, cashier_id, opening_cash, shift_no)
  values (v_org_id, p_store_id, p_device_id, v_actor_id, coalesce(p_opening_cash, 0), v_shift_no)
  returning id into v_shift_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    p_store_id,
    v_actor_id,
    'shift.opened',
    'shifts',
    v_shift_id,
    jsonb_build_object(
      'shift_no', v_shift_no,
      'opening_cash', coalesce(p_opening_cash, 0),
      'device_id', p_device_id
    )
  );

  return v_shift_id;
end;
$$;

grant execute on function open_shift(uuid, uuid, bigint) to authenticated;

/* ── 5. Close a shift ────────────────────────────────────────────────── */

create or replace function close_shift(
  p_shift_id uuid,
  p_declared_cash bigint,
  p_note text default null
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift shifts%rowtype;
  v_reading jsonb;
  v_expected bigint;
  v_variance bigint;
  v_threshold bigint;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_actor_id is null then
    raise exception 'sign in before closing a shift';
  end if;

  select * into v_shift from shifts where id = p_shift_id;
  if not found then
    raise exception 'that shift is not available in your scope';
  end if;

  if v_shift.closed_at is not null then
    raise exception 'this shift is already closed';
  end if;

  if v_shift.cashier_id <> v_actor_id and not auth_is_admin() then
    raise exception 'only the shift owner or an organization admin can close this shift';
  end if;

  if p_declared_cash is null or p_declared_cash < 0 then
    raise exception 'enter the counted cash amount';
  end if;

  if p_declared_cash > 100000000 then
    raise exception 'the counted cash amount is too large';
  end if;

  if v_note is not null and length(v_note) > 400 then
    raise exception 'the shift note must be at most 400 characters';
  end if;

  v_reading := shift_reading(p_shift_id);
  v_expected := (v_reading->>'expected_cash')::bigint;
  v_variance := p_declared_cash - v_expected;
  v_threshold := shift_variance_threshold(v_shift.org_id);

  -- plpgsql RAISE only understands a bare `%`, so the peso amount is formatted
  -- before it is interpolated.
  if abs(v_variance) > v_threshold and v_note is null then
    raise exception 'a note is required when the cash variance is more than %',
      to_char(v_threshold / 100.0, 'FM999,999,990.00');
  end if;

  update shifts
  set closed_at = now(),
      declared_cash = p_declared_cash,
      expected_cash = v_expected,
      variance = v_variance,
      note = v_note,
      closed_by = v_actor_id
  where id = p_shift_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_shift.org_id,
    v_shift.store_id,
    v_actor_id,
    'shift.closed',
    'shifts',
    p_shift_id,
    jsonb_build_object(
      'shift_no', v_shift.shift_no,
      'opening_cash', v_shift.opening_cash,
      'opened_at', v_shift.opened_at
    ),
    jsonb_build_object(
      'declared_cash', p_declared_cash,
      'expected_cash', v_expected,
      'variance', v_variance,
      'note', v_note,
      'net_sales', (v_reading->>'net_sales')::bigint,
      'order_count', (v_reading->>'order_count')::int
    )
  );

  return shift_reading(p_shift_id);
end;
$$;

grant execute on function close_shift(uuid, bigint, text) to authenticated;

/* ── 6. Z-reading archive ────────────────────────────────────────────── */

create table if not exists z_readings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  store_id          uuid not null references stores(id) on delete cascade,
  shift_id          uuid not null references shifts(id) on delete restrict,
  z_number          bigint not null,
  business_date     date not null,
  cashier_id        uuid not null references profiles(id),
  device_id         uuid references devices(id) on delete set null,
  opened_at         timestamptz not null,
  closed_at         timestamptz not null,

  order_count       int not null default 0,
  gross_sales       bigint not null default 0,
  discount_total    bigint not null default 0,
  net_sales         bigint not null default 0,
  vatable_sale      bigint not null default 0,
  vat_amount        bigint not null default 0,
  vat_exempt_sale   bigint not null default 0,

  void_count        int not null default 0,
  void_total        bigint not null default 0,
  refund_count      int not null default 0,
  refund_total      bigint not null default 0,

  cash_sales        bigint not null default 0,
  gcash_sales       bigint not null default 0,
  maya_sales        bigint not null default 0,
  card_sales        bigint not null default 0,

  opening_cash      bigint not null default 0,
  cash_refunds      bigint not null default 0,
  expected_cash     bigint not null default 0,
  declared_cash     bigint not null default 0,
  cash_variance     bigint not null default 0,

  -- Running accumulator per branch. `grand_total_after` of the newest Z is the
  -- branch's lifetime net sales across every sealed till.
  grand_total_before bigint not null default 0,
  grand_total_after  bigint not null default 0,

  reading           jsonb not null default '{}'::jsonb,
  note              text,
  generated_by      uuid not null references profiles(id),
  generated_at      timestamptz not null default now()
);

create unique index if not exists z_readings_shift_unique_idx on z_readings (shift_id);
create unique index if not exists z_readings_store_number_idx on z_readings (store_id, z_number);
create index if not exists z_readings_store_date_idx on z_readings (store_id, business_date desc);
create index if not exists z_readings_org_date_idx on z_readings (org_id, business_date desc);

-- Append-only, like orders and audit_logs: a sealed Z-reading is never edited.
--
-- Hosted Supabase applies default privileges that hand `anon` and
-- `authenticated` full DML on every new table in `public` (see 0004), so a
-- plain `grant select, insert` would be a no-op on top of an existing
-- `grant all`. The revoke is what actually removes the write paths; RLS and
-- the trigger below then remain a second and third line of defense.
revoke all privileges on z_readings from anon;
revoke all privileges on z_readings from authenticated;
grant select, insert on z_readings to authenticated;
grant all on z_readings to service_role;

alter table z_readings enable row level security;

drop policy if exists z_readings_admin_read on z_readings;
create policy z_readings_admin_read on z_readings
  for select using (auth_is_admin() and org_id = auth_org_id());

drop policy if exists z_readings_manager_read on z_readings;
create policy z_readings_manager_read on z_readings
  for select using (
    auth_role() = 'manager'::user_role
    and org_id = auth_org_id()
    and store_id = auth_store_id()
  );

-- PRD §3: Z-reading is Admin-only. Cashiers get the X-reading instead.
drop policy if exists z_readings_admin_insert on z_readings;
create policy z_readings_admin_insert on z_readings
  for insert with check (auth_is_admin() and org_id = auth_org_id());

drop trigger if exists no_mutate_z_readings on z_readings;
create trigger no_mutate_z_readings before update or delete on z_readings
  for each row execute function forbid_mutation();

create or replace function record_z_reading(p_shift_id uuid, p_note text default null)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_shift shifts%rowtype;
  v_reading jsonb;
  v_id uuid;
  v_z_number bigint;
  v_grand_before bigint;
  v_net bigint;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not auth_is_admin() then
    raise exception 'only organization admins can generate a Z-reading';
  end if;

  select * into v_shift from shifts where id = p_shift_id and org_id = auth_org_id();
  if not found then
    raise exception 'that shift is not available in your organization';
  end if;

  if v_shift.closed_at is null then
    raise exception 'close the shift before generating its Z-reading';
  end if;

  if v_note is not null and length(v_note) > 400 then
    raise exception 'the Z-reading note must be at most 400 characters';
  end if;

  if exists (select 1 from z_readings where shift_id = p_shift_id) then
    raise exception 'this shift already has a Z-reading';
  end if;

  -- Serialize the per-branch sequence so two admins closing at once cannot
  -- claim the same Z number.
  perform pg_advisory_xact_lock(hashtext('z_reading:' || v_shift.store_id::text));

  select coalesce(max(z_number), 0) + 1 into v_z_number
  from z_readings
  where store_id = v_shift.store_id;

  select coalesce(grand_total_after, 0) into v_grand_before
  from z_readings
  where store_id = v_shift.store_id
  order by z_number desc
  limit 1;

  v_grand_before := coalesce(v_grand_before, 0);
  v_reading := shift_reading(p_shift_id);
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
    v_shift.org_id,
    v_shift.store_id,
    p_shift_id,
    v_z_number,
    (v_shift.closed_at at time zone 'Asia/Singapore')::date,
    v_shift.cashier_id,
    v_shift.device_id,
    v_shift.opened_at,
    v_shift.closed_at,
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
    coalesce(v_shift.opening_cash, 0),
    (v_reading->>'cash_refunds')::bigint,
    coalesce(v_shift.expected_cash, (v_reading->>'expected_cash')::bigint),
    coalesce(v_shift.declared_cash, 0),
    coalesce(v_shift.variance, 0),
    v_grand_before,
    v_grand_before + v_net,
    v_reading,
    v_note,
    v_actor_id
  )
  returning id into v_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_shift.org_id,
    v_shift.store_id,
    v_actor_id,
    'shift.z_reading',
    'z_readings',
    v_id,
    jsonb_build_object(
      'z_number', v_z_number,
      'shift_id', p_shift_id,
      'shift_no', v_shift.shift_no,
      'net_sales', v_net,
      'declared_cash', coalesce(v_shift.declared_cash, 0),
      'cash_variance', coalesce(v_shift.variance, 0),
      'grand_total_after', v_grand_before + v_net,
      'note', v_note
    )
  );

  return v_id;
end;
$$;

grant execute on function record_z_reading(uuid, text) to authenticated;

/* ── 7. Stamp sales with the till that rang them up ──────────────────── */

-- Replaces the 0007 definition. The only change to the sale path is the
-- resolved `shift_id`; everything else (idempotency, stock, audit) is
-- unchanged so offline replays keep behaving exactly as before.
create or replace function place_order(p_order jsonb, p_items jsonb)
  returns uuid
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  v_id uuid;
  v_created boolean;
  v_org_id uuid;
  v_store_id uuid;
  v_cashier_id uuid;
  v_shift_id uuid;
begin
  v_org_id := (p_order->>'org_id')::uuid;
  v_store_id := (p_order->>'store_id')::uuid;
  v_cashier_id := (p_order->>'cashier_id')::uuid;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'an order must contain at least one item';
  end if;

  -- Validate the product scope before writing anything. This also makes sure
  -- the sale ledger cannot be pointed at another branch or organization.
  if exists (
    select 1
    from jsonb_array_elements(p_items) i
    left join products p on p.id = (i->>'product_id')::uuid
    where p.id is null
      or p.org_id <> v_org_id
      or p.store_id <> v_store_id
      or (p.pricing_mode = 'per_kg' and coalesce(nullif(i->>'weight_kg', '')::numeric, 0) <= 0)
      or (p.pricing_mode <> 'per_kg' and coalesce(nullif(i->>'qty', '')::numeric, 0) <= 0)
  ) then
    raise exception 'order contains an invalid product or quantity';
  end if;

  -- The till is captured on the device at sale time and replayed with the
  -- order, so a sale queued offline still belongs to the shift that rang it
  -- up rather than whichever shift happens to be open when it syncs. A shift
  -- that is already closed is still valid for this reason.
  select s.id into v_shift_id
  from shifts s
  where s.id = nullif(p_order->>'shift_id', '')::uuid
    and s.org_id = v_org_id
    and s.store_id = v_store_id;

  -- Fall back to the caller's currently open till when the client did not send
  -- one, or sent a shift outside this branch. A sale is never rejected over
  -- shift attribution — an unattributed sale is recoverable, a lost one is not.
  if v_shift_id is null then
    select s.id into v_shift_id
    from shifts s
    where s.store_id = v_store_id
      and s.cashier_id = v_cashier_id
      and s.closed_at is null
    order by s.opened_at desc
    limit 1;
  end if;

  insert into orders (
    local_uuid, org_id, store_id, device_id, order_no, shift_id, cashier_id, status,
    subtotal, discount_type, discount_amount, discount_ref,
    vatable_sale, vat_amount, vat_exempt_sale, total,
    payment_method, payment_ref, amount_tendered, change_due, note,
    created_at_device
  )
  select
    (p_order->>'local_uuid')::uuid,
    v_org_id,
    v_store_id,
    nullif(p_order->>'device_id', '')::uuid,
    p_order->>'order_no',
    v_shift_id,
    v_cashier_id,
    coalesce(p_order->>'status', 'completed')::order_status,
    (p_order->>'subtotal')::bigint,
    coalesce(p_order->>'discount_type', 'none')::discount_type,
    coalesce((p_order->>'discount_amount')::bigint, 0),
    p_order->>'discount_ref',
    coalesce((p_order->>'vatable_sale')::bigint, 0),
    coalesce((p_order->>'vat_amount')::bigint, 0),
    coalesce((p_order->>'vat_exempt_sale')::bigint, 0),
    (p_order->>'total')::bigint,
    (p_order->>'payment_method')::payment_method,
    p_order->>'payment_ref',
    nullif(p_order->>'amount_tendered', '')::bigint,
    nullif(p_order->>'change_due', '')::bigint,
    p_order->>'note',
    (p_order->>'created_at_device')::timestamptz
  on conflict (local_uuid) do nothing
  returning id into v_id;

  v_created := v_id is not null;

  if not v_created then
    -- Offline replay of an already-synced order: do not add items, audit, or
    -- stock movements a second time.
    select id into v_id
    from orders
    where local_uuid = (p_order->>'local_uuid')::uuid;
    return v_id;
  end if;

  insert into order_items (
    order_id, product_id, name_snapshot, pricing_mode_snapshot,
    unit_price_snapshot, qty, weight_kg, line_total
  )
  select
    v_id,
    (i->>'product_id')::uuid,
    i->>'name_snapshot',
    (i->>'pricing_mode_snapshot')::pricing_mode,
    (i->>'unit_price_snapshot')::bigint,
    (i->>'qty')::numeric,
    nullif(i->>'weight_kg', '')::numeric,
    (i->>'line_total')::bigint
  from jsonb_array_elements(p_items) i;

  insert into stock_movements (
    org_id, store_id, product_id, type, qty, unit, ref_order_id, actor_id
  )
  select
    v_org_id,
    v_store_id,
    p.id,
    'sale'::stock_movement_type,
    case
      when p.pricing_mode = 'per_kg' then nullif(i->>'weight_kg', '')::numeric
      else (i->>'qty')::numeric
    end,
    p.unit,
    v_id,
    v_cashier_id
  from jsonb_array_elements(p_items) i
  join products p on p.id = (i->>'product_id')::uuid
  where p.track_stock
    and coalesce(p_order->>'status', 'completed') = 'completed';

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, after)
  values (
    v_org_id,
    v_store_id,
    v_cashier_id,
    'order.created',
    'orders',
    v_id,
    jsonb_build_object(
      'order_no', p_order->>'order_no',
      'total', p_order->>'total',
      'shift_id', v_shift_id
    )
  );

  return v_id;
end;
$$;

grant execute on function place_order(jsonb, jsonb) to authenticated;
