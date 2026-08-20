-- Give new online orders a memorable store-initial code and numeric sequence.
-- Existing WEB- order numbers remain valid for lookup and historical records.

create or replace function public.online_order_store_code(p_store_name text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_code text;
begin
  select upper(string_agg(left(clean_word, 1), '' order by ord))
    into v_code
  from (
    select regexp_replace(word, '[^A-Za-z0-9]', '', 'g') as clean_word, ord
    from regexp_split_to_table(coalesce(p_store_name, ''), '\s+') with ordinality as parts(word, ord)
  ) words
  where clean_word <> ''
    and ord <= 3;

  v_code := left(regexp_replace(coalesce(v_code, 'STORE'), '[^A-Z0-9]', '', 'g'), 4);
  return coalesce(nullif(v_code, ''), 'STORE');
end;
$$;

alter function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb)
  rename to place_online_order_legacy;

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
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_order_id uuid;
  v_store_name text;
  v_old_order_no text;
  v_order_no text;
  v_order_sequence integer;
begin
  v_result := public.place_online_order_legacy(
    p_store_id,
    p_request_id,
    p_customer_name,
    p_customer_phone,
    p_fulfillment_method,
    p_pickup_slot,
    p_delivery_address,
    p_delivery_note,
    p_note,
    p_average_prep_minutes,
    p_order_lead_minutes,
    p_items
  );

  begin
    v_order_id := (v_result ->> 'order_id')::uuid;
  exception when invalid_text_representation then
    return v_result;
  end;

  if v_order_id is null then
    return v_result;
  end if;

  select o.order_no, s.name
    into v_old_order_no, v_store_name
  from online_orders o
  join stores s on s.id = o.store_id
  where o.id = v_order_id
    and o.store_id = p_store_id
  for update of o;

  if not found then
    return v_result;
  end if;

  -- Retries for orders created before this migration are upgraded lazily;
  -- already-readable codes remain stable.
  if v_old_order_no !~ '^WEB-' then
    return jsonb_set(v_result, '{order_no}', to_jsonb(v_old_order_no), true);
  end if;

  select count(*)::integer
    into v_order_sequence
  from online_orders
  where store_id = p_store_id;

  v_order_sequence := greatest(1, coalesce(v_order_sequence, 1));
  loop
    v_order_no := public.online_order_store_code(v_store_name) || '-' || lpad(v_order_sequence::text, 4, '0');
    exit when not exists (
      select 1
      from online_orders
      where store_id = p_store_id
        and order_no = v_order_no
        and id <> v_order_id
    );
    v_order_sequence := v_order_sequence + 1;
  end loop;

  update online_orders
  set order_no = v_order_no
  where id = v_order_id
    and store_id = p_store_id;

  insert into audit_logs (org_id, store_id, action, entity, entity_id, after)
  select org_id,
         store_id,
         'online_order.renumbered',
         'online_orders',
         id,
         jsonb_build_object('previous_order_no', v_old_order_no, 'order_no', v_order_no)
  from online_orders
  where id = v_order_id;

  return jsonb_set(v_result, '{order_no}', to_jsonb(v_order_no), true);
end;
$$;

revoke all on function public.online_order_store_code(text) from public;
revoke all on function public.online_order_store_code(text) from anon;
revoke all on function public.online_order_store_code(text) from authenticated;
grant execute on function public.online_order_store_code(text) to service_role;

revoke all on function public.place_online_order_legacy(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from public;
revoke all on function public.place_online_order_legacy(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from anon;
revoke all on function public.place_online_order_legacy(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from authenticated;
grant execute on function public.place_online_order_legacy(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) to service_role;

revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from public;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from anon;
revoke all on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) from authenticated;
grant execute on function public.place_online_order(uuid, uuid, text, text, text, text, text, text, text, integer, integer, jsonb) to service_role;
