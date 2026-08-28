-- Real local validation for order schedule flows and the existing
-- enforce_order_time_limit trigger. Run against a local database only.
-- The script is wrapped in a rollback transaction and leaves no data behind.

begin;

alter table public.orders
  add column if not exists order_origin text not null default 'user';

create temp table order_schedule_trigger_setup (
  trigger_existed_before boolean
) on commit drop;

insert into order_schedule_trigger_setup (trigger_existed_before)
select exists (
  select 1
  from pg_trigger
  where tgrelid = 'public.orders'::regclass
    and tgname = 'enforce_order_time_limit'
    and not tgisinternal
);

insert into public.order_organizations (code, name, active)
values
  ('CALIDRA', 'Calidra', true),
  ('SERVIFOOD', 'ServiFood', true),
  ('IGARRETA', 'Igarreta Maquinas SA', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.order_locations (organization_id, code, slug, display_name, active)
select org.id, loc.code, loc.slug, loc.display_name, true
from (
  values
    ('CALIDRA', 'LAJA', 'laja', 'La Laja'),
    ('CALIDRA', 'LOSBERROS', 'losberros', 'Los Berros'),
    ('CALIDRA', 'PADREBUENO', 'padrebueno', 'Padre Bueno'),
    ('CALIDRA', 'CCP', 'ccp', 'Ccp'),
    ('SERVIFOOD', 'ADMINISTRACION_SERVIFOOD', 'administracion_servifood', 'Administración ServiFood'),
    ('IGARRETA', 'IGARRETA', 'igarreta', 'Igarreta Maquinas SA')
) as loc(org_code, code, slug, display_name)
join public.order_organizations org on org.code = loc.org_code
on conflict (code) do update
set slug = excluded.slug,
    display_name = excluded.display_name,
    active = true;

-- Production already has enforce_order_time_limit. Local reset may not,
-- so create it only inside this rollback transaction when absent.
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'enforce_order_time_limit'
      and not tgisinternal
  ) then
    create trigger enforce_order_time_limit
    before insert on public.orders
    for each row
    execute function public.check_order_time_limit();
  end if;
end $$;

create temp table order_schedule_trigger_results (
  scenario text,
  location_value text,
  requesting_location_code text,
  delivery_location_value text,
  order_origin text,
  evaluated_at timestamptz,
  expected_success boolean,
  actual_success boolean,
  error_message text
) on commit drop;

create or replace function pg_temp.assert_order_insert(
  p_scenario text,
  p_location text,
  p_requesting_location_code text,
  p_delivery_location text,
  p_order_origin text,
  p_at timestamptz,
  p_expected_success boolean
)
returns void
language plpgsql
as $$
declare
  v_success boolean := false;
  v_error text := null;
  v_user_id uuid := gen_random_uuid();
  v_email text := 'schedule-trigger-test-' || replace(v_user_id::text, '-', '') || '@example.com';
  v_location_id uuid;
begin
  perform set_config('app.order_schedule_test_at', p_at::text, true);

  begin
    insert into auth.users (
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      '',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', 'Schedule Trigger Test'),
      now(),
      now()
    );

    insert into public.users (id, email, full_name, role)
    values (
      v_user_id,
      v_email,
      'Schedule Trigger Test',
      'user'
    )
    on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        role = excluded.role;

    select loc.id
    into v_location_id
    from public.order_locations loc
    where loc.active = true
      and public.normalize_order_schedule_location_key(coalesce(p_location, p_requesting_location_code)) in (
        public.normalize_order_schedule_location_key(loc.display_name),
        public.normalize_order_schedule_location_key(loc.code),
        public.normalize_order_schedule_location_key(loc.slug)
      )
    limit 1;

    if v_location_id is not null then
      insert into public.user_order_locations (user_id, location_id, active)
      values (v_user_id, v_location_id, true)
      on conflict (user_id, location_id) do update
      set active = true,
          updated_at = now();
    end if;

    insert into public.orders (
      user_id,
      location,
      requesting_location_code,
      delivery_location,
      order_origin,
      customer_name,
      customer_email,
      items,
      total_items,
      service,
      delivery_date,
      status
    )
    values (
      v_user_id,
      p_location,
      p_requesting_location_code,
      p_delivery_location,
      p_order_origin,
      'Schedule Trigger Test',
      'schedule-trigger-test@example.com',
      '[{"name":"Menu test","quantity":1}]'::jsonb,
      1,
      'lunch',
      '2026-08-29'::date,
      'pending'
    );
    v_success := true;
  exception
    when others then
      v_success := false;
      v_error := sqlerrm;
  end;

  insert into order_schedule_trigger_results (
    scenario,
    location_value,
    requesting_location_code,
    delivery_location_value,
    order_origin,
    evaluated_at,
    expected_success,
    actual_success,
    error_message
  )
  values (
    p_scenario,
    p_location,
    p_requesting_location_code,
    p_delivery_location,
    p_order_origin,
    p_at,
    p_expected_success,
    v_success,
    v_error
  );

  if v_success is distinct from p_expected_success then
    raise exception 'schedule trigger assertion failed: %, expected %, got %, error %',
      p_scenario,
      p_expected_success,
      v_success,
      coalesce(v_error, '');
  end if;
end;
$$;

-- STANDARD: Igarreta defaults to 06:00 inclusive / 14:00 exclusive.
select pg_temp.assert_order_insert('STANDARD 05:59 cerrado', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 05:59:00-03'::timestamptz, false);
select pg_temp.assert_order_insert('STANDARD 06:00 abierto', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 06:00:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('STANDARD 08:59 abierto', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 08:59:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('STANDARD 09:00 abierto', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 09:00:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('STANDARD 13:59 abierto', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 13:59:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('STANDARD 14:00 cerrado', 'Igarreta Maquinas SA', null, null, 'user', '2026-08-28 14:00:00-03'::timestamptz, false);

-- EXTENDED: La Laja is 09:00 inclusive / 22:00 exclusive.
select pg_temp.assert_order_insert('EXTENDED 08:59 cerrado', 'La Laja', null, null, 'user', '2026-08-28 08:59:00-03'::timestamptz, false);
select pg_temp.assert_order_insert('EXTENDED 09:00 abierto', 'La Laja', null, null, 'user', '2026-08-28 09:00:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('EXTENDED 13:59 abierto', 'La Laja', null, null, 'user', '2026-08-28 13:59:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('EXTENDED 14:00 abierto', 'La Laja', null, null, 'user', '2026-08-28 14:00:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('EXTENDED 21:59 abierto', 'La Laja', null, null, 'user', '2026-08-28 21:59:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('EXTENDED 22:00 cerrado', 'La Laja', null, null, 'user', '2026-08-28 22:00:00-03'::timestamptz, false);

-- admin_extra keeps the existing bypass even outside the normal window.
select pg_temp.assert_order_insert('ADMIN_EXTRA bypass 05:59', 'Igarreta Maquinas SA', null, null, 'admin_extra', '2026-08-28 05:59:00-03'::timestamptz, true);

-- Trigger must use requesting/origin location, not delivery_location.
select pg_temp.assert_order_insert('ORIGIN location wins over delivery open', 'Igarreta Maquinas SA', null, 'La Laja', 'user', '2026-08-28 08:59:00-03'::timestamptz, true);
select pg_temp.assert_order_insert('ORIGIN location wins over delivery closed', 'Igarreta Maquinas SA', null, 'La Laja', 'user', '2026-08-28 14:00:00-03'::timestamptz, false);

-- Extended resolution through display_name, slug and code.
select 'La Laja display_name' as scenario, *
from public.get_order_schedule_context('La Laja', '2026-08-28 09:00:00-03'::timestamptz);

select 'La Laja slug' as scenario, *
from public.get_order_schedule_context('laja', '2026-08-28 09:00:00-03'::timestamptz);

select 'La Laja code' as scenario, *
from public.get_order_schedule_context('LAJA', '2026-08-28 09:00:00-03'::timestamptz);

select 'All key locations by display/slug/code' as scenario,
       loc.display_name,
       loc.slug,
       loc.code,
       by_display.flow as display_flow,
       by_slug.flow as slug_flow,
       by_code.flow as code_flow
from public.order_locations loc
cross join lateral public.get_order_schedule_context(loc.display_name, '2026-08-28 13:00:00-03'::timestamptz) by_display
cross join lateral public.get_order_schedule_context(loc.slug, '2026-08-28 13:00:00-03'::timestamptz) by_slug
cross join lateral public.get_order_schedule_context(loc.code, '2026-08-28 13:00:00-03'::timestamptz) by_code
where loc.display_name in (
  'La Laja',
  'Los Berros',
  'Padre Bueno',
  'Ccp',
  'Administración ServiFood',
  'Igarreta Maquinas SA'
)
order by loc.display_name;

select 'Trigger count' as scenario,
       count(*) as enforce_order_time_limit_count
from pg_trigger
where tgrelid = 'public.orders'::regclass
  and tgname = 'enforce_order_time_limit'
  and not tgisinternal;

select 'Trigger existed before diagnostic transaction' as scenario,
       trigger_existed_before
from order_schedule_trigger_setup;

select *
from order_schedule_trigger_results
order by evaluated_at, scenario;

rollback;
