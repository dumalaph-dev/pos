-- Weekly branch hours for online ordering. Legacy stores without
-- `business_hours` keep using the existing opening/closing window because the
-- application normalizes that shape before exposing or saving settings.

create or replace function public.enforce_online_ordering_business_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_settings jsonb;
  v_day_settings jsonb;
  v_day_key text;
  v_open_time time;
  v_close_time time;
  v_slot_time time;
  v_local_now timestamp without time zone;
begin
  if new.pickup_date is null then
    return new;
  end if;

  select settings
    into v_store_settings
  from public.stores
  where id = new.store_id;

  if not found then
    return new;
  end if;

  v_day_key := case extract(isodow from new.pickup_date)::integer
    when 1 then 'mon'
    when 2 then 'tue'
    when 3 then 'wed'
    when 4 then 'thu'
    when 5 then 'fri'
    when 6 then 'sat'
    else 'sun'
  end;
  v_day_settings := v_store_settings #> array['online_ordering', 'schedule', 'business_hours', v_day_key];

  if jsonb_typeof(v_day_settings) = 'object'
     and (
       coalesce(lower(v_day_settings->>'enabled'), 'true') <> 'true'
       or coalesce(lower(v_day_settings->>'closed'), 'false') = 'true'
     ) then
    raise exception 'online ordering is closed on the selected day';
  end if;

  v_open_time := case
    when coalesce(v_day_settings->>'opening_time', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_day_settings->>'opening_time')::time
    when coalesce(v_store_settings #>> '{online_ordering,schedule,opening_time}', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_store_settings #>> '{online_ordering,schedule,opening_time}')::time
    else '09:00'::time
  end;
  v_close_time := case
    when coalesce(v_day_settings->>'closing_time', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_day_settings->>'closing_time')::time
    when coalesce(v_store_settings #>> '{online_ordering,schedule,closing_time}', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      then (v_store_settings #>> '{online_ordering,schedule,closing_time}')::time
    else '18:00'::time
  end;

  if v_close_time <= v_open_time then
    raise exception 'online ordering hours are invalid for the selected day';
  end if;

  if new.pickup_slot = 'asap' then
    v_local_now := timezone('Asia/Singapore', now());
    if new.pickup_date <> v_local_now::date
       or v_local_now::time < v_open_time
       or v_local_now::time >= v_close_time then
      raise exception 'the store is outside the available pickup hours';
    end if;
  elsif new.pickup_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    v_slot_time := new.pickup_slot::time;
    if v_slot_time < v_open_time or v_slot_time >= v_close_time then
      raise exception 'the selected time is outside the available pickup hours';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_online_ordering_business_hours() from public;
grant execute on function public.enforce_online_ordering_business_hours() to service_role;

drop trigger if exists online_orders_business_hours_guard on public.online_orders;
create trigger online_orders_business_hours_guard
before insert on public.online_orders
for each row execute function public.enforce_online_ordering_business_hours();
