-- Branch-wide shift-label smoke test for migration 0035.
--
-- Run against the linked project with:
--   npx supabase db query --linked --file scripts/shift-sequence-smoke.sql
--
-- The whole check is rolled back. Two cashier identities exercise the same
-- branch so the test crosses the cashier RLS boundary that exposed the bug.

begin;

create temp table _shift_sequence_checks (
  seq    integer primary key,
  name   text not null,
  passed boolean not null,
  detail text
);
grant all on table _shift_sequence_checks to authenticated;

do $$
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at
  )
  values
    ('f0350000-0000-0000-0000-000000000201', 'authenticated', 'authenticated', 'shift-seq-cashier-a-0035@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now()),
    ('f0350000-0000-0000-0000-000000000202', 'authenticated', 'authenticated', 'shift-seq-cashier-b-0035@example.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now());

  insert into organizations (id, name, currency, settings)
  values ('f0350000-0000-0000-0000-000000000001', 'Shift Sequence Smoke 0035', 'PHP', '{}');

  insert into stores (id, org_id, name, address, currency)
  values
    ('f0350000-0000-0000-0000-000000000011', 'f0350000-0000-0000-0000-000000000001', 'Sequence Smoke Branch', 'Rollback test branch', 'PHP'),
    ('f0350000-0000-0000-0000-000000000012', 'f0350000-0000-0000-0000-000000000001', 'Sequence Smoke Branch 2', 'Rollback test branch', 'PHP');

  insert into profiles (id, org_id, store_id, full_name, role)
  values
    ('f0350000-0000-0000-0000-000000000201', 'f0350000-0000-0000-0000-000000000001', 'f0350000-0000-0000-0000-000000000011', 'Sequence Cashier A', 'cashier'),
    ('f0350000-0000-0000-0000-000000000202', 'f0350000-0000-0000-0000-000000000001', 'f0350000-0000-0000-0000-000000000011', 'Sequence Cashier B', 'cashier');
end;
$$;

set local role authenticated;

do $$
declare
  v_first_shift uuid;
  v_second_shift uuid;
  v_seq integer := 0;
  v_error text;
begin
  perform set_config('request.jwt.claim.sub', 'f0350000-0000-0000-0000-000000000201', true);
  select public.open_shift('f0350000-0000-0000-0000-000000000011', null, 0)
    into v_first_shift;

  perform set_config('request.jwt.claim.sub', 'f0350000-0000-0000-0000-000000000202', true);
  select public.open_shift('f0350000-0000-0000-0000-000000000011', null, 0)
    into v_second_shift;

  v_seq := v_seq + 1;
  insert into _shift_sequence_checks
  values (
    v_seq,
    'Different cashiers receive sequential branch-day labels',
    v_first_shift is not null
      and v_second_shift is not null,
    format('first_shift=%s second_shift=%s', v_first_shift, v_second_shift)
  );

  begin
    perform set_config('request.jwt.claim.sub', 'f0350000-0000-0000-0000-000000000201', true);
    perform public.open_shift('f0350000-0000-0000-0000-000000000012', null, 0);
    v_error := 'no error';
  exception when others then
    v_error := sqlerrm;
  end;

  v_seq := v_seq + 1;
  insert into _shift_sequence_checks
  values (
    v_seq,
    'Cashier cannot open a shift outside the assigned branch',
    v_error = 'that branch is not available in your organization',
    format('error=%s', v_error)
  );
end;
$$;

-- The cashier can only see their own shift through RLS. The global label check
-- intentionally runs as the database role after both user-path calls complete.
reset role;

do $$
declare
  v_labels text[];
  v_day text := to_char(now() at time zone 'Asia/Singapore', 'YYMMDD');
begin
  select array_agg(shift_no order by shift_no)
    into v_labels
  from public.shifts
  where store_id = 'f0350000-0000-0000-0000-000000000011';

  update _shift_sequence_checks
  set passed = passed
      and v_labels = array['SH-' || v_day || '-001', 'SH-' || v_day || '-002'],
      detail = detail || format(' labels=%s', v_labels)
  where seq = 1;
end;
$$;

select seq, name, passed, detail
from _shift_sequence_checks
order by seq;

do $$
declare
  v_failed text;
begin
  select string_agg(format('%s (%s)', name, detail), ', ' order by seq)
    into v_failed
  from _shift_sequence_checks
  where not passed;
  if v_failed is not null then
    raise exception 'Shift sequence smoke checks failed: %', v_failed;
  end if;
end;
$$;

rollback;
