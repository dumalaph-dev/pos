-- Online ordering availability, scheduling, pricing transparency, and abuse
-- protection. The public menu is intentionally backed by service-role-only
-- placement RPCs; this migration keeps the same trust boundary while making
-- every decision server-side and auditable.

alter table public.categories
  add column if not exists online_available boolean not null default true;

alter table public.products
  add column if not exists online_available boolean not null default true;

create index if not exists categories_store_online_available_idx
  on public.categories (store_id, online_available, sort_order);

create index if not exists products_store_online_available_idx
  on public.products (store_id, online_available, category_id, sort_order);

alter table public.online_orders
  add column if not exists scheduled_for timestamptz,
  add column if not exists tax_amount bigint not null default 0,
  add column if not exists customer_phone_normalized text,
  add column if not exists cart_fingerprint text,
  add column if not exists estimated_prep_minutes integer not null default 20,
  add column if not exists address_validation_status text not null default 'not_required',
  add column if not exists risk_level text not null default 'normal',
  add column if not exists phone_verification_status text not null default 'not_required',
  add column if not exists phone_verified_at timestamptz,
  add column if not exists cancel_reason text;

update public.online_orders
   set customer_phone_normalized = regexp_replace(customer_phone, '[^0-9]', '', 'g')
 where customer_phone_normalized is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'online_orders_tax_amount_check'
      and conrelid = 'public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_tax_amount_check check (tax_amount >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'online_orders_estimated_prep_check'
      and conrelid = 'public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_estimated_prep_check check (estimated_prep_minutes between 0 and 720);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'online_orders_risk_level_check'
      and conrelid = 'public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_risk_level_check check (risk_level in ('normal', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'online_orders_phone_verification_status_check'
      and conrelid = 'public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_phone_verification_status_check
      check (phone_verification_status in ('not_required', 'pending', 'verified', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'online_orders_address_validation_status_check'
      and conrelid = 'public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_address_validation_status_check
      check (address_validation_status in ('not_required', 'validated', 'manual_review'));
  end if;
end;
$$;

create index if not exists online_orders_store_phone_created_idx
  on public.online_orders (store_id, customer_phone_normalized, created_at desc);

create index if not exists online_orders_store_cart_fingerprint_idx
  on public.online_orders (store_id, cart_fingerprint, created_at desc)
  where cart_fingerprint is not null;

-- Public checkout attempts are recorded without storing raw IP addresses. The
-- table is service-role-only and exists solely for rate limiting and incident
-- review; customer-facing order data stays in online_orders.
create table if not exists public.online_order_attempts (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references public.stores(id) on delete cascade,
  request_id        uuid,
  phone_normalized  text,
  ip_hash           text,
  allowed           boolean not null default true,
  reason            text,
  created_at        timestamptz not null default now()
);

create index if not exists online_order_attempts_store_phone_idx
  on public.online_order_attempts (store_id, phone_normalized, created_at desc);

create index if not exists online_order_attempts_store_ip_idx
  on public.online_order_attempts (store_id, ip_hash, created_at desc)
  where ip_hash is not null;

create table if not exists public.online_order_phone_verifications (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.online_orders(id) on delete cascade,
  store_id          uuid not null references public.stores(id) on delete cascade,
  phone_normalized  text not null,
  code_hash         text not null,
  attempts          integer not null default 0,
  expires_at        timestamptz not null,
  verified_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists online_order_phone_verifications_order_idx
  on public.online_order_phone_verifications (order_id, created_at desc);

alter table public.online_order_attempts enable row level security;
alter table public.online_order_phone_verifications enable row level security;

revoke all on public.online_order_attempts from anon, authenticated;
revoke all on public.online_order_phone_verifications from anon, authenticated;
grant all on public.online_order_attempts to service_role;
grant all on public.online_order_phone_verifications to service_role;

-- Branch managers can pause online products or categories without taking the
-- entire menu offline. The RPC is the write boundary because the base catalog
-- tables intentionally reserve direct writes for organization admins.
create or replace function public.set_online_availability(
  p_scope text,
  p_entity_id uuid,
  p_available boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_org_id uuid;
  v_store_id uuid;
  v_entity_name text;
  v_before boolean;
begin
  if v_actor_id is null or auth_role() not in ('admin'::user_role, 'manager'::user_role) then
    raise exception 'only an admin or manager can change online availability';
  end if;

  if p_entity_id is null or p_scope not in ('product', 'category') or p_available is null then
    raise exception 'online availability input is invalid';
  end if;

  if p_scope = 'product' then
    select org_id, store_id, name, online_available
      into v_org_id, v_store_id, v_entity_name, v_before
    from products
    where id = p_entity_id;
  else
    select org_id, store_id, name, online_available
      into v_org_id, v_store_id, v_entity_name, v_before
    from categories
    where id = p_entity_id;
  end if;

  if v_org_id is null or v_org_id <> auth_org_id()
     or (not auth_is_admin() and v_store_id <> auth_store_id()) then
    raise exception 'that catalog item is not available to this account';
  end if;

  if p_scope = 'product' then
    update products set online_available = p_available where id = p_entity_id;
  else
    update categories set online_available = p_available where id = p_entity_id;
  end if;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_org_id,
    v_store_id,
    v_actor_id,
    'online_availability.changed',
    p_scope,
    p_entity_id,
    jsonb_build_object('name', v_entity_name, 'online_available', v_before),
    jsonb_build_object('name', v_entity_name, 'online_available', p_available)
  );

  return true;
end;
$$;

revoke all on function public.set_online_availability(text, uuid, boolean) from public;
grant execute on function public.set_online_availability(text, uuid, boolean) to authenticated;

-- Keep the settings action consistent with the manager controls above. Base
-- stores writes are organization-admin-only, so managers use this narrowly
-- scoped RPC after the server action has validated the online-ordering form.
create or replace function public.set_online_ordering_settings(
  p_store_id uuid,
  p_settings jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before jsonb;
  v_org_id uuid;
begin
  if v_actor_id is null or auth_role() not in ('admin'::user_role, 'manager'::user_role) then
    raise exception 'only an admin or manager can change online ordering settings';
  end if;
  if p_store_id is null
     or p_settings is null
     or jsonb_typeof(p_settings) <> 'object'
     or jsonb_typeof(p_settings->'online_ordering') <> 'object' then
    raise exception 'online ordering settings input is invalid';
  end if;

  select org_id, settings
    into v_org_id, v_before
  from stores
  where id = p_store_id
    and org_id = auth_org_id()
    and (auth_is_admin() or id = auth_store_id())
    and is_active = true
  for update;

  if not found then
    raise exception 'that branch is not available to this account';
  end if;

  update stores
     set settings = coalesce(v_before, '{}'::jsonb)
       || jsonb_build_object('online_ordering', p_settings->'online_ordering')
     where id = p_store_id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_org_id,
    p_store_id,
    v_actor_id,
    'online_order.settings_changed',
    'stores',
    p_store_id,
    coalesce(v_before->'online_ordering', '{}'::jsonb),
    coalesce(p_settings->'online_ordering', '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function public.set_online_ordering_settings(uuid, jsonb) from public;
grant execute on function public.set_online_ordering_settings(uuid, jsonb) to authenticated;

-- Manual verification is available to a manager when no SMS provider is
-- configured, or when a caller confirms the number over the phone.
create or replace function public.mark_online_order_phone_verified(
  p_online_order_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order online_orders%rowtype;
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or auth_role() not in ('admin'::user_role, 'manager'::user_role) then
    raise exception 'only an admin or manager can verify an online order phone';
  end if;

  select * into v_order
  from online_orders
  where id = p_online_order_id
    and org_id = auth_org_id()
    and (auth_is_admin() or store_id = auth_store_id())
  for update;

  if not found then
    raise exception 'online order is not available to this account';
  end if;

  update online_orders
     set phone_verification_status = 'manual',
         phone_verified_at = coalesce(phone_verified_at, now())
   where id = v_order.id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_order.org_id,
    v_order.store_id,
    v_actor_id,
    'online_order.phone_verified',
    'online_orders',
    v_order.id,
    jsonb_build_object('phone_verification_status', v_order.phone_verification_status),
    jsonb_build_object('phone_verification_status', 'manual', 'order_no', v_order.order_no)
  );

  return true;
end;
$$;

revoke all on function public.mark_online_order_phone_verified(uuid) from public;
grant execute on function public.mark_online_order_phone_verified(uuid) to authenticated;

-- SMS verification is called only by the server-side route after a risk check.
-- The raw code is never stored or returned to the browser.
create or replace function public.verify_online_order_phone(
  p_online_order_id uuid,
  p_verification_id uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order online_orders%rowtype;
  v_verification online_order_phone_verifications%rowtype;
  v_code text := btrim(coalesce(p_code, ''));
begin
  if p_online_order_id is null or p_verification_id is null or v_code !~ '^[0-9]{6}$' then
    raise exception 'verification code is invalid';
  end if;

  select * into v_order
  from online_orders
  where id = p_online_order_id
  for update;

  if not found then
    raise exception 'online order could not be found';
  end if;

  select * into v_verification
  from online_order_phone_verifications
  where id = p_verification_id
    and order_id = v_order.id
  for update;

  if not found or v_order.phone_verification_status <> 'pending' then
    raise exception 'phone verification is not pending for this order';
  end if;
  if v_verification.verified_at is not null then
    return jsonb_build_object('ok', true, 'already_verified', true);
  end if;
  if v_verification.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_verification.attempts >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'attempts');
  end if;

  update online_order_phone_verifications
     set attempts = attempts + 1
   where id = v_verification.id;

  if encode(extensions.digest(v_code, 'sha256'), 'hex') <> v_verification.code_hash then
    return jsonb_build_object('ok', false, 'reason', 'incorrect');
  end if;

  update online_order_phone_verifications
     set verified_at = now()
   where id = v_verification.id;

  update online_orders
     set phone_verification_status = 'verified',
         phone_verified_at = now()
   where id = v_order.id;

  insert into audit_logs (org_id, store_id, action, entity, entity_id, before, after)
  values (
    v_order.org_id,
    v_order.store_id,
    'online_order.phone_verified',
    'online_orders',
    v_order.id,
    jsonb_build_object('phone_verification_status', 'pending'),
    jsonb_build_object('phone_verification_status', 'verified', 'order_no', v_order.order_no)
  );

  return jsonb_build_object('ok', true, 'already_verified', false);
end;
$$;

revoke all on function public.verify_online_order_phone(uuid, uuid, text) from public;
grant execute on function public.verify_online_order_phone(uuid, uuid, text) to service_role;

-- Admin/manager queue changes are audited and enforce legal transitions. POS
-- cashiers continue to use advance_online_order_status below, which delegates
-- to this same boundary.
create or replace function public.set_online_order_status(
  p_online_order_id uuid,
  p_next_status public.online_order_status,
  p_cancel_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order online_orders%rowtype;
  v_actor_id uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_cancel_reason, '')), '');
begin
  if v_actor_id is null or auth_role() not in ('admin'::user_role, 'manager'::user_role, 'cashier'::user_role) then
    raise exception 'a signed-in employee is required to update the online queue';
  end if;
  if p_online_order_id is null or p_next_status is null then
    raise exception 'online order status input is invalid';
  end if;

  select * into v_order
  from online_orders
  where id = p_online_order_id
    and org_id = auth_org_id()
    and (auth_is_admin() or store_id = auth_store_id())
  for update;

  if not found then
    raise exception 'that online order is not available to this terminal';
  end if;

  if v_order.status in ('picked_up', 'cancelled') then
    raise exception 'the online order is already closed';
  end if;

  if (v_order.status = 'new' and p_next_status not in ('confirmed', 'cancelled'))
     or (v_order.status = 'confirmed' and p_next_status not in ('preparing', 'cancelled'))
     or (v_order.status = 'preparing' and p_next_status not in ('ready', 'cancelled'))
     or (v_order.status = 'ready' and p_next_status not in ('picked_up', 'cancelled')) then
    raise exception 'the online order has already moved to another step';
  end if;

  if v_order.phone_verification_status = 'pending'
     and p_next_status in ('confirmed', 'preparing', 'ready', 'picked_up') then
    raise exception 'verify the customer phone before preparing this order';
  end if;

  if p_next_status = 'cancelled' and length(coalesce(v_reason, '')) > 240 then
    raise exception 'cancellation reason is too long';
  end if;

  update online_orders
     set status = p_next_status,
         confirmed_at = case when p_next_status in ('confirmed', 'preparing', 'ready', 'picked_up') then coalesce(confirmed_at, now()) else confirmed_at end,
         ready_at = case when p_next_status in ('ready', 'picked_up') then coalesce(ready_at, now()) else ready_at end,
         picked_up_at = case when p_next_status = 'picked_up' then coalesce(picked_up_at, now()) else picked_up_at end,
         cancelled_at = case when p_next_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
         cancel_reason = case when p_next_status = 'cancelled' then coalesce(v_reason, 'Cancelled by store') else cancel_reason end
   where id = v_order.id;

  insert into audit_logs (org_id, store_id, actor_id, action, entity, entity_id, before, after)
  values (
    v_order.org_id,
    v_order.store_id,
    v_actor_id,
    case when p_next_status = 'cancelled' then 'online_order.cancelled' else 'online_order.status_changed' end,
    'online_orders',
    v_order.id,
    jsonb_build_object('order_no', v_order.order_no, 'status', v_order.status),
    jsonb_build_object('order_no', v_order.order_no, 'status', p_next_status, 'reason', v_reason)
  );

  return true;
end;
$$;

revoke all on function public.set_online_order_status(uuid, public.online_order_status, text) from public;
grant execute on function public.set_online_order_status(uuid, public.online_order_status, text) to authenticated;

create or replace function public.advance_online_order_status(
  p_online_order_id uuid,
  p_next_status public.online_order_status
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_next_status not in ('confirmed', 'preparing', 'ready') then
    raise exception 'that online order transition is not available from the POS';
  end if;
  return public.set_online_order_status(p_online_order_id, p_next_status, null);
end;
$$;

revoke all on function public.advance_online_order_status(uuid, public.online_order_status) from public;
grant execute on function public.advance_online_order_status(uuid, public.online_order_status) to authenticated;

-- Replace the earlier placement wrappers with one authoritative transaction.
-- p_client_ip is hashed for rate limits; p_pickup_date is explicit so a
-- scheduled order cannot silently become a same-day order on the server.
drop function if exists public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb);
drop function if exists public.place_online_order_legacy(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb);

create or replace function public.place_online_order(
  p_store_id uuid,
  p_request_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment_method text,
  p_pickup_slot text,
  p_delivery_address text,
  p_delivery_note text,
  p_note text,
  p_average_prep_minutes integer,
  p_order_lead_minutes integer,
  p_items jsonb,
  p_client_ip text default null,
  p_pickup_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_org_id uuid;
  v_store_settings jsonb;
  v_vat_registered boolean;
  v_vat_rate numeric;
  v_existing online_orders%rowtype;
  v_duplicate online_orders%rowtype;
  v_order_id uuid;
  v_order_no text;
  v_customer_name text;
  v_customer_phone text;
  v_phone_normalized text;
  v_fulfillment_method text;
  v_pickup_slot text;
  v_delivery_address text;
  v_delivery_note text;
  v_note text;
  v_pickup_date date;
  v_today date := timezone('Asia/Singapore', now())::date;
  v_max_days_ahead integer;
  v_slot_interval integer;
  v_open_time time;
  v_close_time time;
  v_slot_offset_minutes integer;
  v_service_area text;
  v_queue_count integer;
  v_queue_position integer;
  v_average_prep_minutes integer;
  v_order_lead_minutes integer;
  v_delivery_eta_minutes integer;
  v_delivery_fee bigint := 0;
  v_minimum_order bigint := 0;
  v_max_item_quantity numeric := 20;
  v_delivery_enabled boolean;
  v_total bigint;
  v_tax_amount bigint := 0;
  v_vat_inclusive_rate numeric := 0;
  v_eta_at timestamptz;
  v_scheduled_at timestamptz;
  v_address_validation_status text := 'not_required';
  v_cart_fingerprint text;
  v_item jsonb;
  v_product_id uuid;
  v_product_name text;
  v_pricing_mode pricing_mode;
  v_unit_price bigint;
  v_qty numeric;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_total_qty numeric := 0;
  v_seen_product_ids uuid[] := '{}'::uuid[];
  v_track_stock boolean;
  v_online_available boolean;
  v_category_available boolean;
  v_on_hand numeric;
  v_reserved numeric;
  v_phone_attempts integer;
  v_ip_attempts integer := 0;
  v_recent_phone_orders integer;
  v_store_recent_orders integer;
  v_ip_hash text;
  v_phone_verification_required boolean := false;
  v_phone_verification_status text := 'not_required';
  v_risk_level text := 'normal';
  v_verification_id uuid;
  v_verification_code text;
begin
  if p_store_id is null or p_request_id is null then
    raise exception 'store and request ids are required';
  end if;

  -- Serialize queue assignment, stock checks, duplicate detection, and rate
  -- limits per store. The unique request key still protects cross-process
  -- retries if a caller is interrupted after the insert commits.
  perform pg_advisory_xact_lock(hashtext(p_store_id::text));

  select org_id, settings, vat_registered, vat_rate
    into v_store_org_id, v_store_settings, v_vat_registered, v_vat_rate
  from stores
  where id = p_store_id
    and is_active = true;

  if v_store_org_id is null then
    raise exception 'store is not available';
  end if;

  select * into v_existing
  from online_orders
  where store_id = p_store_id
    and request_id = p_request_id;

  if found then
    return jsonb_build_object(
      'order_id', v_existing.id,
      'order_no', v_existing.order_no,
      'queue_position', v_existing.queue_position,
      'eta_at', v_existing.eta_at,
      'scheduled_for', v_existing.scheduled_for,
      'total', v_existing.total,
      'subtotal', v_existing.subtotal,
      'tax_amount', v_existing.tax_amount,
      'delivery_fee', v_existing.delivery_fee,
      'fulfillment_method', v_existing.fulfillment_method,
      'phone_verification_required', v_existing.phone_verification_status = 'pending',
      'phone_verification_status', v_existing.phone_verification_status,
      'verification_id', null,
      'deduplicated', true
    );
  end if;

  if coalesce((v_store_settings #>> '{online_ordering,enabled}')::boolean, false) is not true then
    raise exception 'online ordering is disabled';
  end if;

  v_customer_name := btrim(coalesce(p_customer_name, ''));
  v_customer_phone := btrim(coalesce(p_customer_phone, ''));
  v_phone_normalized := regexp_replace(v_customer_phone, '[^0-9]', '', 'g');
  v_fulfillment_method := coalesce(nullif(btrim(p_fulfillment_method), ''), 'pickup');
  v_pickup_slot := coalesce(nullif(btrim(p_pickup_slot), ''), 'asap');
  v_delivery_address := btrim(coalesce(p_delivery_address, ''));
  v_delivery_note := btrim(coalesce(p_delivery_note, ''));
  v_note := btrim(coalesce(p_note, ''));
  v_delivery_enabled := coalesce((v_store_settings #>> '{online_ordering,delivery,enabled}')::boolean, false);
  v_delivery_fee := greatest(0, least(1000000, coalesce((v_store_settings #>> '{online_ordering,delivery,fee_centavos}')::bigint, 0)));
  v_delivery_eta_minutes := greatest(15, least(180, coalesce((v_store_settings #>> '{online_ordering,delivery,eta_minutes}')::integer, 45)));
  v_minimum_order := greatest(0, least(100000000, coalesce((v_store_settings #>> '{online_ordering,minimum_order_centavos}')::bigint, 0)));
  v_max_item_quantity := greatest(1, least(100, coalesce((v_store_settings #>> '{online_ordering,max_item_quantity}')::numeric, 20)));
  v_average_prep_minutes := greatest(5, least(180, coalesce(p_average_prep_minutes, 20)));
  v_order_lead_minutes := greatest(0, least(180, coalesce(p_order_lead_minutes, 15)));
  v_slot_interval := greatest(5, least(120, coalesce((v_store_settings #>> '{online_ordering,schedule,slot_interval_minutes}')::integer, 30)));
  v_max_days_ahead := greatest(0, least(14, coalesce((v_store_settings #>> '{online_ordering,schedule,max_days_ahead}')::integer, 2)));
  v_open_time := case
    when coalesce(v_store_settings #>> '{online_ordering,schedule,opening_time}', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_store_settings #>> '{online_ordering,schedule,opening_time}')::time
    else '09:00'::time
  end;
  v_close_time := case
    when coalesce(v_store_settings #>> '{online_ordering,schedule,closing_time}', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_store_settings #>> '{online_ordering,schedule,closing_time}')::time
    else '18:00'::time
  end;
  if v_close_time <= v_open_time then
    v_close_time := '23:00'::time;
  end if;
  v_service_area := nullif(lower(btrim(coalesce(v_store_settings #>> '{online_ordering,delivery,service_area}', ''))), '');
  v_ip_hash := case when nullif(btrim(coalesce(p_client_ip, '')), '') is null then null else encode(extensions.digest(btrim(p_client_ip), 'sha256'), 'hex') end;

  if length(v_customer_name) < 2 or length(v_customer_name) > 80 then
    raise exception 'customer name is invalid';
  end if;
  if length(v_phone_normalized) < 7 or length(v_phone_normalized) > 15 then
    raise exception 'customer phone is invalid';
  end if;
  if v_fulfillment_method not in ('pickup', 'delivery') then
    raise exception 'fulfillment method is invalid';
  end if;
  if v_fulfillment_method = 'delivery' and not v_delivery_enabled then
    raise exception 'delivery is not available';
  end if;
  if v_fulfillment_method = 'delivery' and (length(v_delivery_address) < 8 or length(v_delivery_address) > 240) then
    raise exception 'delivery address is invalid';
  end if;
  if v_fulfillment_method = 'delivery' and v_delivery_address !~ '\s' then
    raise exception 'delivery address needs a street and locality';
  end if;
  if v_fulfillment_method = 'delivery' and length(v_delivery_note) > 160 then
    raise exception 'delivery note is invalid';
  end if;
  if v_fulfillment_method = 'delivery' and v_service_area is not null
     and not exists (
       select 1
       from unnest(string_to_array(v_service_area, ',')) as area(token)
       where length(btrim(area.token)) >= 2
         and lower(v_delivery_address) like '%' || btrim(area.token) || '%'
     ) then
    raise exception 'delivery address is outside the service area';
  end if;
  if v_fulfillment_method = 'delivery' then
    v_address_validation_status := case when v_service_area is null then 'manual_review' else 'validated' end;
  else
    v_delivery_address := null;
    v_delivery_note := null;
    v_delivery_fee := 0;
  end if;
  if length(v_note) > 240 then
    raise exception 'order note is invalid';
  end if;

  v_pickup_date := coalesce(p_pickup_date, v_today);
  if v_pickup_date < v_today or v_pickup_date > v_today + v_max_days_ahead then
    raise exception 'the selected date is outside the scheduling window';
  end if;
  if v_pickup_slot = 'asap' then
    if v_pickup_date <> v_today then
      raise exception 'ASAP orders must use today';
    end if;
    if (v_pickup_date + v_close_time) at time zone 'Asia/Singapore' <= now() + make_interval(mins => v_order_lead_minutes) then
      raise exception 'the store is outside the available pickup hours';
    end if;
  elsif v_pickup_slot !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'pickup time is invalid';
  else
    v_slot_offset_minutes := floor(extract(epoch from ((v_pickup_slot::time) - v_open_time)) / 60)::integer;
    if v_pickup_slot::time < v_open_time or v_pickup_slot::time >= v_close_time or mod(v_slot_offset_minutes, v_slot_interval) <> 0 then
      raise exception 'the selected time is outside the available slots';
    end if;
    v_scheduled_at := (v_pickup_date + v_pickup_slot::time) at time zone 'Asia/Singapore';
    if v_scheduled_at <= now() + make_interval(mins => v_order_lead_minutes) then
      raise exception 'the selected time is no longer available';
    end if;
  end if;

  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 40 then
    raise exception 'order items are invalid';
  end if;

  select count(*)::integer into v_phone_attempts
  from online_order_attempts
  where store_id = p_store_id
    and phone_normalized = v_phone_normalized
    and created_at > now() - interval '15 minutes';

  if v_ip_hash is not null then
    select count(*)::integer into v_ip_attempts
    from online_order_attempts
    where store_id = p_store_id
      and ip_hash = v_ip_hash
      and created_at > now() - interval '15 minutes';
  end if;

  if v_phone_attempts >= 8 or v_ip_attempts >= 30 then
    insert into online_order_attempts (store_id, request_id, phone_normalized, ip_hash, allowed, reason)
    values (p_store_id, p_request_id, v_phone_normalized, v_ip_hash, false, 'rate_limit');
    raise exception 'too many order attempts; please wait a few minutes before trying again';
  end if;

  insert into online_order_attempts (store_id, request_id, phone_normalized, ip_hash, allowed)
  values (p_store_id, p_request_id, v_phone_normalized, v_ip_hash, true);

  v_cart_fingerprint := md5(coalesce(p_items::text, '') || '|' || v_fulfillment_method || '|' || v_pickup_date::text || '|' || v_pickup_slot);

  select * into v_duplicate
  from online_orders
  where store_id = p_store_id
    and customer_phone_normalized = v_phone_normalized
    and cart_fingerprint = v_cart_fingerprint
    and status not in ('picked_up', 'cancelled')
    and created_at > now() - interval '20 minutes'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'order_id', v_duplicate.id,
      'order_no', v_duplicate.order_no,
      'queue_position', v_duplicate.queue_position,
      'eta_at', v_duplicate.eta_at,
      'scheduled_for', v_duplicate.scheduled_for,
      'total', v_duplicate.total,
      'subtotal', v_duplicate.subtotal,
      'tax_amount', v_duplicate.tax_amount,
      'delivery_fee', v_duplicate.delivery_fee,
      'fulfillment_method', v_duplicate.fulfillment_method,
      'phone_verification_required', v_duplicate.phone_verification_status = 'pending',
      'phone_verification_status', v_duplicate.phone_verification_status,
      'verification_id', null,
      'deduplicated', true
    );
  end if;

  for v_item in select item.value from jsonb_array_elements(p_items) as item(value) loop
    begin
      v_product_id := (v_item->>'productId')::uuid;
      v_qty := (v_item->>'qty')::numeric;
    exception when invalid_text_representation then
      raise exception 'order item is invalid';
    end;

    if v_product_id is null or v_qty is null or v_qty <= 0 or v_qty > v_max_item_quantity then
      raise exception 'item quantity exceeds the online order limit';
    end if;
    if v_qty <> trunc(v_qty) then
      raise exception 'order item quantity must be a whole number';
    end if;
    if v_product_id = any(v_seen_product_ids) then
      raise exception 'order contains a duplicate item';
    end if;
    v_seen_product_ids := array_append(v_seen_product_ids, v_product_id);
    v_total_qty := v_total_qty + v_qty;

    select p.name, p.pricing_mode, p.price, p.track_stock,
           coalesce(p.online_available, true),
           coalesce(c.is_active, true) and coalesce(c.online_available, true)
      into v_product_name, v_pricing_mode, v_unit_price, v_track_stock,
           v_online_available, v_category_available
    from products p
    left join categories c on c.id = p.category_id and c.store_id = p.store_id
    where p.id = v_product_id
      and p.store_id = p_store_id
      and p.is_active = true
    for update of p;

    if not found or not v_online_available or not v_category_available then
      raise exception 'one of the selected products is unavailable';
    end if;

    if v_track_stock then
      select coalesce(sum(case
        when sm.type::text in ('receive', 'yield_in') then sm.qty
        when sm.type::text in ('yield_out', 'sale', 'waste') then -sm.qty
        else sm.qty
      end), 0)
        into v_on_hand
      from stock_movements sm
      where sm.store_id = p_store_id
        and sm.product_id = v_product_id;

      select coalesce(sum(oi.qty), 0)
        into v_reserved
      from online_order_items oi
      join online_orders oo on oo.id = oi.order_id
      where oo.store_id = p_store_id
        and oi.product_id = v_product_id
        and oo.status::text in ('new', 'confirmed', 'preparing', 'ready');

      if v_on_hand - v_reserved < v_qty then
        raise exception 'sold out: %', v_product_name;
      end if;
    end if;

    v_line_total := round(v_unit_price * v_qty)::bigint;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_total_qty > 40 then
    raise exception 'your order has too many items';
  end if;
  if v_subtotal < v_minimum_order then
    raise exception 'minimum order is % centavos', v_minimum_order;
  end if;
  if v_subtotal < 1 then
    raise exception 'order total is invalid';
  end if;

  v_vat_inclusive_rate := case when coalesce(v_vat_registered, false) then greatest(0, least(1, coalesce(v_vat_rate, 0.12))) else 0 end;
  if v_vat_inclusive_rate > 0 then
    v_tax_amount := round(v_subtotal * v_vat_inclusive_rate / (1 + v_vat_inclusive_rate))::bigint;
  end if;
  v_total := v_subtotal + v_delivery_fee;

  select count(*)::integer into v_recent_phone_orders
  from online_orders
  where store_id = p_store_id
    and customer_phone_normalized = v_phone_normalized
    and status <> 'cancelled'
    and created_at > now() - interval '24 hours';

  select count(*)::integer into v_store_recent_orders
  from online_orders
  where store_id = p_store_id
    and status <> 'cancelled'
    and created_at > now() - interval '15 minutes';

  v_phone_verification_required := v_recent_phone_orders >= 3 or v_phone_attempts >= 4 or v_store_recent_orders >= 25;
  if v_phone_verification_required then
    v_phone_verification_status := 'pending';
    v_risk_level := 'high';
    v_verification_id := gen_random_uuid();
    v_verification_code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  end if;

  v_queue_count := 0;
  select count(*)::integer into v_queue_count
  from online_orders
  where store_id = p_store_id
    and pickup_date = v_pickup_date
    and status in ('new', 'confirmed', 'preparing', 'ready');
  v_queue_position := v_queue_count + 1;

  if v_scheduled_at is not null then
    v_eta_at := v_scheduled_at;
  else
    v_eta_at := now() + make_interval(mins => v_order_lead_minutes + (v_queue_position * v_average_prep_minutes) + case when v_fulfillment_method = 'delivery' then v_delivery_eta_minutes else 0 end);
  end if;

  v_order_id := gen_random_uuid();
  v_order_no := 'WEB-' || upper(substr(replace(p_request_id::text, '-', ''), 1, 10));

  insert into online_orders (
    id, request_id, org_id, store_id, order_no, customer_name, customer_phone,
    customer_phone_normalized, fulfillment_method, delivery_address, delivery_note,
    delivery_fee, pickup_slot, pickup_date, scheduled_for, status, queue_position,
    subtotal, tax_amount, total, note, eta_at, estimated_prep_minutes,
    address_validation_status, risk_level, phone_verification_status
  )
  values (
    v_order_id, p_request_id, v_store_org_id, p_store_id, v_order_no,
    v_customer_name, v_customer_phone, v_phone_normalized, v_fulfillment_method,
    nullif(v_delivery_address, ''), nullif(v_delivery_note, ''), v_delivery_fee,
    v_pickup_slot, v_pickup_date, v_scheduled_at, 'new', v_queue_position,
    v_subtotal, v_tax_amount, v_total, nullif(v_note, ''), v_eta_at,
    v_average_prep_minutes + case when v_fulfillment_method = 'delivery' then v_delivery_eta_minutes else 0 end,
    v_address_validation_status, v_risk_level, v_phone_verification_status
  );

  for v_item in select item.value from jsonb_array_elements(p_items) as item(value) loop
    v_product_id := (v_item->>'productId')::uuid;
    v_qty := (v_item->>'qty')::numeric;

    select name, pricing_mode, price
      into v_product_name, v_pricing_mode, v_unit_price
    from products
    where id = v_product_id
      and store_id = p_store_id
      and is_active = true;

    v_line_total := round(v_unit_price * v_qty)::bigint;

    insert into online_order_items (
      order_id, product_id, name_snapshot, pricing_mode_snapshot,
      unit_price_snapshot, qty, line_total
    )
    values (
      v_order_id, v_product_id, v_product_name, v_pricing_mode,
      v_unit_price, v_qty, v_line_total
    );
  end loop;

  if v_phone_verification_required then
    insert into online_order_phone_verifications (
      id, order_id, store_id, phone_normalized, code_hash, expires_at
    )
    values (
      v_verification_id,
      v_order_id,
      p_store_id,
      v_phone_normalized,
      encode(extensions.digest(v_verification_code, 'sha256'), 'hex'),
      now() + interval '10 minutes'
    );
  end if;

  insert into audit_logs (org_id, store_id, action, entity, entity_id, after)
  values (
    v_store_org_id,
    p_store_id,
    'online_order.created',
    'online_orders',
    v_order_id,
    jsonb_build_object(
      'order_no', v_order_no,
      'subtotal', v_subtotal,
      'delivery_fee', v_delivery_fee,
      'tax_amount', v_tax_amount,
      'total', v_total,
      'minimum_order', v_minimum_order,
      'fulfillment_method', v_fulfillment_method,
      'pickup_date', v_pickup_date,
      'pickup_slot', v_pickup_slot,
      'scheduled_for', v_scheduled_at,
      'risk_level', v_risk_level,
      'phone_verification_status', v_phone_verification_status,
      'address_validation_status', v_address_validation_status,
      'idempotency_key', p_request_id
    )
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_no', v_order_no,
    'queue_position', v_queue_position,
    'eta_at', v_eta_at,
    'scheduled_for', v_scheduled_at,
    'total', v_total,
    'subtotal', v_subtotal,
    'tax_amount', v_tax_amount,
    'delivery_fee', v_delivery_fee,
    'fulfillment_method', v_fulfillment_method,
    'phone_verification_required', v_phone_verification_required,
    'phone_verification_status', v_phone_verification_status,
    'verification_id', v_verification_id,
    'verification_code', v_verification_code,
    'deduplicated', false
  );
end;
$$;

revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb, text, date) from public;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb, text, date) from anon;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb, text, date) from authenticated;
grant execute on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb, text, date) to service_role;
