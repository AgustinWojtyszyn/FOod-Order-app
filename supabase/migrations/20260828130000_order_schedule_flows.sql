begin;

create table if not exists public.order_schedule_flows (
  flow text primary key,
  opens_at time not null,
  closes_at time not null,
  timezone text not null default 'America/Argentina/San_Juan',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_schedule_flows_valid_flow check (flow in ('standard', 'extended')),
  constraint order_schedule_flows_distinct_times check (opens_at <> closes_at)
);

create unique index if not exists order_schedule_flows_single_default_idx
  on public.order_schedule_flows (is_default)
  where is_default = true;

create table if not exists public.order_schedule_location_overrides (
  location_key text primary key,
  flow text not null references public.order_schedule_flows(flow) on update cascade on delete restrict,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.normalize_order_schedule_location_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(trim(both '_' from regexp_replace(
    translate(lower(trim(coalesce(p_value, ''))), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]+',
    '_',
    'g'
  )), '');
$$;

insert into public.order_schedule_flows (flow, opens_at, closes_at, timezone, is_default)
values
  ('standard', time '06:00:00', time '14:00:00', 'America/Argentina/San_Juan', true),
  ('extended', time '09:00:00', time '22:00:00', 'America/Argentina/San_Juan', false)
on conflict (flow) do update
set opens_at = excluded.opens_at,
    closes_at = excluded.closes_at,
    timezone = excluded.timezone,
    is_default = excluded.is_default,
    updated_at = now();

insert into public.order_schedule_location_overrides (location_key, flow, label)
values
  (public.normalize_order_schedule_location_key('La Laja'), 'extended', 'La Laja'),
  (public.normalize_order_schedule_location_key('Los Berros'), 'extended', 'Los Berros'),
  (public.normalize_order_schedule_location_key('Padre Bueno'), 'extended', 'Padre Bueno'),
  (public.normalize_order_schedule_location_key('Ccp'), 'extended', 'Ccp'),
  (public.normalize_order_schedule_location_key('Administración ServiFood'), 'extended', 'Administración ServiFood')
on conflict (location_key) do update
set flow = excluded.flow,
    label = excluded.label,
    updated_at = now();

create or replace function public.get_order_schedule_context(
  p_location text,
  p_at timestamptz default now()
)
returns table (
  flow text,
  timezone text,
  opens_at text,
  closes_at text,
  is_open boolean,
  state text,
  next_transition_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select
      public.normalize_order_schedule_location_key(p_location) as location_key,
      coalesce(p_at, now()) as evaluated_at
  ),
  resolved_location as (
    select
      i.evaluated_at,
      coalesce(
        public.normalize_order_schedule_location_key(loc.display_name),
        i.location_key
      ) as schedule_location_key
    from input i
    left join lateral (
      select loc.*
      from public.order_locations loc
      where loc.active = true
        and i.location_key in (
          public.normalize_order_schedule_location_key(loc.display_name),
          public.normalize_order_schedule_location_key(loc.code),
          public.normalize_order_schedule_location_key(loc.slug)
        )
      order by
        case
          when i.location_key = public.normalize_order_schedule_location_key(loc.display_name) then 1
          when i.location_key = public.normalize_order_schedule_location_key(loc.code) then 2
          when i.location_key = public.normalize_order_schedule_location_key(loc.slug) then 3
          else 4
        end
      limit 1
    ) loc on true
  ),
  selected_flow as (
    select f.*
    from resolved_location r
    join public.order_schedule_location_overrides o on o.location_key = r.schedule_location_key
    join public.order_schedule_flows f on f.flow = o.flow

    union all

    select f.*
    from public.order_schedule_flows f
    where f.is_default = true
      and not exists (
        select 1
        from resolved_location r
        join public.order_schedule_location_overrides o on o.location_key = r.schedule_location_key
      )
    limit 1
  ),
  evaluated as (
    select
      sf.flow,
      sf.timezone,
      sf.opens_at,
      sf.closes_at,
      r.evaluated_at,
      r.evaluated_at at time zone sf.timezone as local_ts
    from selected_flow sf
    cross join resolved_location r
  ),
  classified as (
    select
      e.*,
      e.local_ts::date as local_date,
      e.local_ts::time as local_time,
      case
        when e.local_ts::time < e.opens_at then 'before_open'
        when e.local_ts::time >= e.opens_at and e.local_ts::time < e.closes_at then 'open'
        else 'after_close'
      end as state
    from evaluated e
  )
  select
    c.flow,
    c.timezone,
    to_char(c.opens_at, 'HH24:MI') as opens_at,
    to_char(c.closes_at, 'HH24:MI') as closes_at,
    c.state = 'open' as is_open,
    c.state,
    (
      case
        when c.state = 'before_open' then c.local_date + c.opens_at
        when c.state = 'open' then c.local_date + c.closes_at
        else c.local_date + interval '1 day' + c.opens_at
      end
    ) at time zone c.timezone as next_transition_at
  from classified c;
$$;

revoke all on function public.normalize_order_schedule_location_key(text) from public;
revoke all on function public.normalize_order_schedule_location_key(text) from anon;
grant execute on function public.normalize_order_schedule_location_key(text) to authenticated;

revoke all on function public.get_order_schedule_context(text, timestamptz) from public;
revoke all on function public.get_order_schedule_context(text, timestamptz) from anon;
grant execute on function public.get_order_schedule_context(text, timestamptz) to authenticated;

create or replace function public.resolve_company_location(p_company_slug text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case lower(trim(coalesce(p_company_slug, '')))
    when 'laja' then 'La Laja'
    when 'ccp' then 'Ccp'
    when 'padrebueno' then 'Padre Bueno'
    when 'losberros' then 'Los Berros'
    when 'genneia' then 'Genneia'
    when 'distro_cuyo' then 'DistroCuyo'
    when 'epse' then 'EPSE – Quebrada de Ullum'
    when 'greif' then 'Greif'
    when 'placo' then 'Placo'
    when 'molinos' then 'Molinos'
    when 'igarreta' then 'Igarreta Maquinas SA'
    when 'administracion_servifood' then 'Administración ServiFood'
    else null
  end
$$;

revoke all on function public.resolve_company_location(text) from public;
revoke all on function public.resolve_company_location(text) from anon;
grant execute on function public.resolve_company_location(text) to authenticated;

create or replace function public.check_order_time_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_schedule record;
  v_location text;
  v_test_at text;
  v_at timestamptz;
begin
  if lower(coalesce(NEW.order_origin, 'user')) = 'admin_extra' then
    return NEW;
  end if;

  v_location := nullif(trim(coalesce(NEW.location, NEW.requesting_location_code, '')), '');

  if NEW.order_location_id is not null then
    v_location := coalesce((
      select coalesce(loc.display_name, loc.code, loc.slug)
      from public.order_locations loc
      where loc.id = NEW.order_location_id
      limit 1
    ), v_location);
  end if;

  v_test_at := nullif(current_setting('app.order_schedule_test_at', true), '');
  v_at := coalesce(v_test_at::timestamptz, now());

  select *
  into v_schedule
  from public.get_order_schedule_context(v_location, v_at)
  limit 1;

  if not coalesce(v_schedule.is_open, false) then
    raise exception 'ORDER_WINDOW_CLOSED'
      using detail = jsonb_build_object(
        'flow', v_schedule.flow,
        'timezone', v_schedule.timezone,
        'opens_at', v_schedule.opens_at,
        'closes_at', v_schedule.closes_at,
        'state', v_schedule.state,
        'location', v_location
      )::text;
  end if;

  return NEW;
end;
$$;

revoke all on function public.check_order_time_limit() from public;
revoke all on function public.check_order_time_limit() from anon;
grant execute on function public.check_order_time_limit() to authenticated;

create or replace function public.get_user_company_switch_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_today date;
  v_changes_count integer := 0;
  v_current_company_slug text;
  v_current_location text;
  v_remaining integer := 0;
  v_local_now timestamp;
  v_schedule record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_local_now := timezone('America/Argentina/San_Juan', now());
  v_today := v_local_now::date;

  select count(*)::int
  into v_changes_count
  from public.user_company_changes c
  where c.user_id = v_uid
    and c.change_date = v_today;

  select p.company_slug, p.location
  into v_current_company_slug, v_current_location
  from public.user_daily_company_profiles p
  where p.user_id = v_uid
    and p.active_date = v_today;

  if v_current_company_slug is null then
    select
      coalesce(nullif(o.company_slug, ''), public.normalize_company_snapshot_key(o.location)),
      o.location
    into v_current_company_slug, v_current_location
    from public.orders o
    where o.user_id = v_uid
      and o.status = 'pending'
      and timezone('America/Argentina/San_Juan', o.created_at)::date = v_today
    order by o.created_at desc
    limit 1;
  end if;

  select *
  into v_schedule
  from public.get_order_schedule_context(v_current_location, now())
  limit 1;

  v_remaining := greatest(0, 2 - coalesce(v_changes_count, 0));

  return jsonb_build_object(
    'current_company_slug', v_current_company_slug,
    'current_location', v_current_location,
    'changes_used', coalesce(v_changes_count, 0),
    'remaining_changes', v_remaining,
    'max_changes_per_day', 2,
    'within_order_window', coalesce(v_schedule.is_open, false),
    'order_schedule', to_jsonb(v_schedule),
    'change_date', v_today
  );
end;
$$;

create or replace function public.change_active_company_for_today(
  p_new_company_slug text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
  v_today date;
  v_local_now timestamp;
  v_schedule record;
  v_new_company_slug text;
  v_new_location text;
  v_previous_company_slug text;
  v_previous_location text;
  v_changes_count integer := 0;
  v_remaining integer := 0;
  v_updated_orders integer := 0;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_local_now := timezone('America/Argentina/San_Juan', now());
  v_today := v_local_now::date;

  v_new_company_slug := lower(trim(coalesce(p_new_company_slug, '')));
  v_new_location := public.resolve_company_location(v_new_company_slug);
  if v_new_location is null then
    raise exception 'invalid_company';
  end if;

  select *
  into v_schedule
  from public.get_order_schedule_context(v_new_location, now())
  limit 1;

  if not coalesce(v_schedule.is_open, false) then
    raise exception 'outside_order_window';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text || ':' || v_today::text));

  select count(*)::int
  into v_changes_count
  from public.user_company_changes c
  where c.user_id = v_uid
    and c.change_date = v_today;

  if v_changes_count >= 2 then
    raise exception 'daily_limit_reached';
  end if;

  select p.company_slug, p.location
  into v_previous_company_slug, v_previous_location
  from public.user_daily_company_profiles p
  where p.user_id = v_uid
    and p.active_date = v_today;

  if v_previous_company_slug is null then
    select
      coalesce(nullif(o.company_slug, ''), public.normalize_company_snapshot_key(o.location)),
      o.location
    into v_previous_company_slug, v_previous_location
    from public.orders o
    where o.user_id = v_uid
      and o.status = 'pending'
      and timezone('America/Argentina/San_Juan', o.created_at)::date = v_today
    order by o.created_at desc
    limit 1;
  end if;

  if coalesce(v_previous_company_slug, '') = v_new_company_slug then
    raise exception 'same_company';
  end if;

  insert into public.user_daily_company_profiles (
    user_id, active_date, company_slug, location, created_at, updated_at
  )
  values (v_uid, v_today, v_new_company_slug, v_new_location, now(), now())
  on conflict (user_id, active_date)
  do update set
    company_slug = excluded.company_slug,
    location = excluded.location,
    updated_at = now();

  update public.orders o
  set location = v_new_location,
      updated_at = now()
  where o.user_id = v_uid
    and o.status = 'pending'
    and timezone('America/Argentina/San_Juan', o.created_at)::date = v_today;

  get diagnostics v_updated_orders = row_count;

  insert into public.user_company_changes (
    user_id,
    previous_location,
    new_location,
    previous_company_slug,
    new_company_slug,
    change_date,
    reason,
    changed_at,
    created_at
  )
  values (
    v_uid,
    coalesce(v_previous_location, 'Sin empresa/sede previa'),
    v_new_location,
    v_previous_company_slug,
    v_new_company_slug,
    v_today,
    nullif(trim(coalesce(p_reason, '')), ''),
    now(),
    now()
  );

  select count(*)::int
  into v_changes_count
  from public.user_company_changes c
  where c.user_id = v_uid
    and c.change_date = v_today;

  v_remaining := greatest(0, 2 - coalesce(v_changes_count, 0));

  return jsonb_build_object(
    'ok', true,
    'current_company_slug', v_new_company_slug,
    'current_location', v_new_location,
    'previous_company_slug', v_previous_company_slug,
    'previous_location', v_previous_location,
    'changes_used', v_changes_count,
    'remaining_changes', v_remaining,
    'updated_pending_orders', v_updated_orders,
    'order_schedule', to_jsonb(v_schedule),
    'change_date', v_today
  );
end;
$$;

create or replace function public.create_order_idempotent(
  p_user_id uuid,
  p_idempotency_key text,
  p_payload jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders;
  v_items jsonb;
  v_delivery_date date;
  v_service text;
  v_constraint text;
  v_local_now timestamp := now() at time zone 'America/Argentina/San_Juan';
  v_requested_location text;
  v_schedule record;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_company_snapshot record;
  v_company_slug text;
  v_company_name text;
  v_requires_contact_authorization boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_user_id is null then
    raise exception 'user_id_required';
  end if;

  if p_user_id <> v_uid and not public.is_admin() then
    raise exception 'user_id_not_allowed';
  end if;

  insert into public.users (id, email, full_name, role, created_at, updated_at)
  values (
    p_user_id,
    coalesce(
      nullif(public.normalize_contact_email(auth.jwt()->>'email'), ''),
      nullif(public.normalize_contact_email(p_payload->>'customer_email'), ''),
      p_user_id::text
    ),
    coalesce(
      nullif(trim(coalesce(p_payload->>'customer_name', '')), ''),
      nullif(trim(coalesce(auth.jwt()->>'email', '')), ''),
      nullif(trim(coalesce(p_payload->>'customer_email', '')), ''),
      p_user_id::text
    ),
    'user',
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(public.users.email, ''), excluded.email),
      full_name = coalesce(nullif(public.users.full_name, ''), excluded.full_name),
      updated_at = now();

  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key_required';
  end if;

  select *
  into v_order
  from public.orders
  where idempotency_key = p_idempotency_key;

  if v_order.id is not null then
    if v_order.user_id <> p_user_id then
      raise exception 'idempotency_key_conflict';
    end if;

    return v_order;
  end if;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  v_delivery_date := coalesce((p_payload->>'delivery_date')::date, v_local_now::date);
  v_service := coalesce(nullif(lower(p_payload->>'service'), ''), 'lunch');
  v_requested_location := nullif(trim(coalesce(p_payload->>'location', '')), '');

  if v_requested_location is null then
    raise exception 'location_required';
  end if;

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_delivery_date < v_local_now::date then
    raise exception 'invalid_delivery_date';
  end if;

  select *
  into v_schedule
  from public.get_order_schedule_context(v_requested_location, now())
  limit 1;

  if not coalesce(v_schedule.is_open, false) then
    raise exception 'ORDER_WINDOW_CLOSED';
  end if;

  if v_service = 'dinner' and not public.is_admin() and not exists (
    select 1
    from public.user_features uf
    where uf.user_id = p_user_id
      and uf.feature = 'dinner'
      and uf.enabled = true
  ) then
    raise exception 'dinner_not_enabled';
  end if;

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(v_requested_location)
      or lower(loc.code) = lower(v_requested_location)
      or lower(loc.slug) = lower(v_requested_location)
    )
  limit 1;

  if v_location.id is not null then
    select *
    into v_organization
    from public.order_organizations
    where id = v_location.organization_id;

    v_requires_contact_authorization := upper(coalesce(v_organization.code, '')) <> 'EPSE'
      and exists (
        select 1
        from public.authorized_order_contacts c
        where c.organization_id = v_location.organization_id
          and c.status <> 'disabled'
      );

    if not public.is_admin() and v_requires_contact_authorization and not exists (
      select 1
      from public.user_order_locations uol
      where uol.user_id = p_user_id
        and uol.location_id = v_location.id
        and uol.active = true
    ) then
      perform public.sync_authorized_order_locations_for_user(p_user_id);
      if not exists (
        select 1
        from public.user_order_locations uol
        where uol.user_id = p_user_id
          and uol.location_id = v_location.id
          and uol.active = true
      ) then
        raise exception 'location_not_allowed';
      end if;
    end if;

    select *
    into v_delivery_location
    from public.order_locations
    where id = coalesce(v_location.default_delivery_location_id, v_location.id);
  end if;

  select *
  into v_company_snapshot
  from public.resolve_order_company_snapshot(
    p_user_id,
    coalesce(v_location.display_name, v_requested_location),
    v_organization.name,
    p_payload->>'customer_email',
    v_delivery_date
  );

  v_company_slug := coalesce(
    v_company_snapshot.company_slug,
    public.normalize_company_snapshot_key(coalesce(v_organization.name, v_location.display_name, v_requested_location))
  );
  v_company_name := coalesce(
    v_company_snapshot.company_name,
    v_organization.name,
    v_location.display_name,
    v_requested_location
  );

  if exists (
    select 1
    from public.orders
    where user_id = p_user_id
      and delivery_date = v_delivery_date
      and coalesce(nullif(lower(service), ''), 'lunch') = v_service
      and status = 'pending'
  ) then
    raise exception 'duplicate_active_order';
  end if;

  insert into public.orders (
    user_id,
    idempotency_key,
    location,
    company_slug,
    company_name,
    organization,
    requesting_location_code,
    order_location_id,
    delivery_location,
    delivery_location_code,
    delivery_order_location_id,
    service,
    items,
    status,
    total_items,
    custom_responses,
    customer_name,
    customer_email,
    customer_phone,
    comments,
    delivery_date
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(v_location.display_name, v_requested_location),
    v_company_slug,
    v_company_name,
    v_organization.name,
    v_location.code,
    v_location.id,
    coalesce(v_delivery_location.display_name, v_requested_location),
    v_delivery_location.code,
    v_delivery_location.id,
    v_service,
    v_items,
    'pending',
    coalesce((p_payload->>'total_items')::integer, jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'customer_phone', null),
    coalesce(p_payload->>'comments', null),
    v_delivery_date
  )
  returning *
  into v_order;

  return v_order;
exception
  when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'orders_active_user_delivery_service_uniq' then
      raise exception 'duplicate_active_order';
    end if;
    raise;
end;
$$;

revoke all on function public.get_user_company_switch_context() from public;
revoke all on function public.get_user_company_switch_context() from anon;
grant execute on function public.get_user_company_switch_context() to authenticated;

revoke all on function public.change_active_company_for_today(text, text) from public;
revoke all on function public.change_active_company_for_today(text, text) from anon;
grant execute on function public.change_active_company_for_today(text, text) to authenticated;

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
