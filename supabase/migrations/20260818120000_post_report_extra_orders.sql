-- Post-report administrative extras.
-- These orders remain visible operationally, but are not part of the already-sent
-- daily email and must not be autoarchived as ordinary pending orders.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint if exists %I', v_constraint.conname);
  end loop;
end $$;

alter table public.orders
  alter column status set not null;

alter table public.orders
  add constraint orders_status_check
  check (status in (
    'pending',
    'archived',
    'cancelled',
    'preparing',
    'ready',
    'completed',
    'delivered',
    'processing',
    'post_report_extra'
  ));

create or replace function public.resolve_admin_extra_order_status(
  p_delivery_date date,
  p_created_at timestamptz
)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1
      from public.daily_report_runs drr
      where drr.report_type = 'daily_orders'
        and drr.report_date = p_delivery_date
        and drr.status = 'sent'
        and drr.sent_at is not null
        and drr.sent_at <= p_created_at
    )
      then 'post_report_extra'
    else 'pending'
  end
$$;

create or replace function public.create_admin_extra_order(p_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_order public.orders;
  v_items jsonb;
  v_custom_responses jsonb;
  v_delivery_date date;
  v_service text;
  v_company_slug text;
  v_company_name text;
  v_location_text text;
  v_reason text;
  v_comment text;
  v_reference text;
  v_email text;
  v_phone text;
  v_idempotency_key text;
  v_quantity integer;
  v_duplicate_confirmed boolean;
  v_created_at timestamptz := now();
  v_ba_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ba_hour integer := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::integer;
  v_outside_window boolean;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_delivery_date_text text;
  v_status text;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_admin
  from public.users
  where id = v_admin_id;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  v_company_slug := lower(trim(coalesce(p_payload->>'company_slug', '')));
  v_company_name := nullif(trim(coalesce(p_payload->>'company_name', '')), '');
  v_location_text := nullif(trim(coalesce(p_payload->>'location', '')), '');
  v_service := coalesce(nullif(lower(trim(coalesce(p_payload->>'service', ''))), ''), 'lunch');
  v_delivery_date_text := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '');
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_comment := nullif(trim(coalesce(p_payload->>'comment', '')), '');
  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  v_custom_responses := coalesce(p_payload->'custom_responses', '[]'::jsonb);
  v_reference := null;
  v_email := null;
  v_phone := null;
  v_idempotency_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_quantity := case
    when coalesce(p_payload->>'quantity', '') ~ '^[0-9]+$'
      then greatest((p_payload->>'quantity')::integer, 1)
    else 1
  end;
  v_duplicate_confirmed := false;
  v_outside_window := (v_ba_hour < 9 or v_ba_hour >= 22);

  if v_delivery_date_text is null or v_delivery_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_delivery_date';
  end if;
  v_delivery_date := v_delivery_date_text::date;

  if v_company_slug = '' then
    raise exception 'company_required';
  end if;

  if not public.is_company_admin(v_company_slug) then
    raise exception 'not_authorized';
  end if;

  if v_location_text is null then
    raise exception 'location_required';
  end if;

  if not public.admin_extra_company_location_allowed(v_company_slug, v_location_text) then
    raise exception 'location_not_allowed';
  end if;

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if v_delivery_date is null or v_delivery_date < v_ba_now::date then
    raise exception 'invalid_delivery_date';
  end if;

  if v_reason is null then
    raise exception 'reason_required';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if jsonb_typeof(v_custom_responses) <> 'array' then
    raise exception 'custom_responses_invalid';
  end if;

  if v_service = 'lunch' and not exists (
    select 1
    from public.menu_items mi
    where mi.menu_date = v_delivery_date
      and mi.company_slug in ('global', v_company_slug)
  ) then
    raise exception 'menu_required';
  end if;

  if v_service = 'dinner' and not (
    exists (
      select 1
      from public.menu_items mi
      where mi.menu_date = v_delivery_date
        and mi.company_slug in ('global', v_company_slug)
    )
    or exists (
      select 1
      from public.dinner_menu_by_date dm
      where dm.delivery_date = v_delivery_date
        and dm.active = true
        and (
          dm.company is null
          or dm.company = ''
          or lower(dm.company) = v_company_slug
        )
    )
  ) then
    raise exception 'menu_required';
  end if;

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(v_location_text)
      or lower(loc.code) = lower(v_location_text)
      or lower(loc.slug) = lower(v_location_text)
    )
  limit 1;

  if v_location.id is not null then
    select *
    into v_delivery_location
    from public.order_locations
    where id = coalesce(v_location.default_delivery_location_id, v_location.id);

    select *
    into v_organization
    from public.order_organizations
    where id = v_location.organization_id;
  end if;

  if v_idempotency_key is not null then
    select *
    into v_order
    from public.orders
    where idempotency_key = v_idempotency_key;

    if v_order.id is not null then
      return v_order;
    end if;
  end if;

  select
    coalesce(jsonb_agg(
      jsonb_set(
        item,
        '{quantity}',
        to_jsonb(case
          when coalesce(item->>'quantity', '') ~ '^[0-9]+$'
            then greatest((item->>'quantity')::integer, 1)
          else 1
        end),
        true
      )
      order by ord
    ), '[]'::jsonb),
    coalesce(sum(case
      when coalesce(item->>'quantity', '') ~ '^[0-9]+$'
        then greatest((item->>'quantity')::integer, 1)
      else 1
    end), 0)::integer
  into v_items
  , v_quantity
  from jsonb_array_elements(v_items) with ordinality as t(item, ord)
  where jsonb_typeof(item) = 'object';

  if jsonb_array_length(v_items) = 0 or v_quantity <= 0 then
    raise exception 'items_required';
  end if;

  v_status := public.resolve_admin_extra_order_status(v_delivery_date, v_created_at);

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
    delivery_date,
    order_origin,
    created_by_admin_id,
    created_by_admin_email,
    created_by_admin_name,
    admin_extra_reason,
    admin_extra_comment,
    admin_extra_outside_window,
    admin_extra_duplicate_confirmed,
    admin_extra_created_at,
    created_at
  )
  values (
    null,
    v_idempotency_key,
    coalesce(v_location.display_name, v_location_text),
    v_company_slug,
    v_company_name,
    coalesce(v_organization.name, v_company_name),
    v_location.code,
    v_location.id,
    coalesce(v_delivery_location.display_name, v_location_text),
    v_delivery_location.code,
    v_delivery_location.id,
    v_service,
    v_items,
    v_status,
    v_quantity,
    v_custom_responses,
    v_reference,
    v_email,
    v_phone,
    v_comment,
    v_delivery_date,
    'admin_extra',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_reason,
    v_comment,
    v_outside_window,
    v_duplicate_confirmed,
    v_created_at,
    v_created_at
  )
  returning *
  into v_order;

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    actor_email,
    actor_name,
    target_id,
    target_email,
    target_name,
    metadata,
    request_id,
    created_at
  )
  values (
    'admin_extra_order_created',
    'Pedido extra cargado por administrador',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    null,
    v_email,
    v_reference,
    jsonb_build_object(
      'order_id', v_order.id,
      'company_slug', v_company_slug,
      'company_name', v_company_name,
      'location', v_order.location,
      'delivery_location', v_order.delivery_location,
      'service', v_service,
      'delivery_date', v_delivery_date,
      'quantity', v_quantity,
      'status', v_order.status,
      'reason', v_reason,
      'outside_window', v_outside_window,
      'duplicate_confirmed', v_duplicate_confirmed,
      'existing_order_id', null,
      'origin', 'admin_extra'
    ),
    v_idempotency_key,
    v_created_at
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_order;
end;
$$;

create or replace function public.get_daily_orders_for_admin(
  p_delivery_date date,
  p_statuses text[] default array['pending', 'archived', 'post_report_extra']
)
returns setof public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if public.is_admin() then
    return query
    select o.*
    from public.orders o
    where o.delivery_date = p_delivery_date
      and (p_statuses is null or o.status = any(p_statuses))
    order by o.created_at desc;
    return;
  end if;

  return query
  select o.*
  from public.orders o
  join public.company_admins ca on ca.user_id = auth.uid()
  join public.companies c on c.id = ca.company_id
  where o.delivery_date = p_delivery_date
    and (p_statuses is null or o.status = any(p_statuses))
    and (
      o.company_slug = c.slug
      or public.admin_extra_company_location_allowed(c.slug, coalesce(o.location, o.delivery_location, ''))
    )
  order by o.created_at desc;
end;
$$;

create or replace function public.search_historical_daily_orders(
  p_search text default '',
  p_email text default '',
  p_company_slug text default null,
  p_from_date date default null,
  p_to_date date default null,
  p_remito_number integer default null,
  p_status text default null,
  p_origin text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  id uuid,
  user_id uuid,
  delivery_date date,
  created_at timestamptz,
  status text,
  order_origin text,
  person_name text,
  person_email text,
  company_slug text,
  company_name text,
  organization text,
  location text,
  delivery_location text,
  service text,
  items jsonb,
  custom_responses jsonb,
  total_items integer,
  customer_name text,
  customer_email text,
  created_by_admin_id uuid,
  created_by_admin_email text,
  created_by_admin_name text,
  admin_extra_created_at timestamptz,
  remito_number integer,
  total_count bigint
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_search text := public.normalize_admin_search_text(p_search);
  v_email text := public.normalize_admin_search_text(p_email);
  v_company_slug text := lower(nullif(trim(coalesce(p_company_slug, '')), ''));
  v_status text := lower(nullif(trim(coalesce(p_status, '')), ''));
  v_origin text := lower(nullif(trim(coalesce(p_origin, '')), ''));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_offset integer;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_status is not null and v_status not in ('pending', 'archived', 'cancelled', 'post_report_extra') then
    raise exception 'invalid_status';
  end if;

  if v_origin = 'normal' then
    v_origin := 'user';
  end if;

  if v_origin is not null and v_origin not in ('user', 'admin_extra') then
    raise exception 'invalid_origin';
  end if;

  if p_remito_number is not null and p_remito_number <= 0 then
    raise exception 'invalid_remito_number';
  end if;

  if p_from_date is not null and p_to_date is not null and p_from_date > p_to_date then
    raise exception 'invalid_date_range';
  end if;

  if v_company_slug is not null and not public.is_company_admin(v_company_slug) then
    raise exception 'not_authorized';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  return query
  with scoped_orders as (
    select o.*
    from public.orders o
    where (v_status is null or lower(coalesce(o.status, '')) = v_status)
      and (v_origin is null or coalesce(nullif(lower(o.order_origin), ''), 'user') = v_origin)
      and (p_from_date is null or o.delivery_date >= p_from_date)
      and (p_to_date is null or o.delivery_date <= p_to_date)
      and (
        v_company_slug is null
        or o.company_slug = v_company_slug
        or public.admin_extra_company_location_allowed(v_company_slug, coalesce(o.location, o.delivery_location, ''))
      )
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = o.company_slug
              or public.admin_extra_company_location_allowed(c.slug, coalesce(o.location, o.delivery_location, ''))
            )
        )
      )
  ),
  enriched as (
    select
      o.*,
      coalesce(nullif(trim(o.customer_name), ''), nullif(trim(u.full_name), ''), nullif(trim(o.customer_email), ''), nullif(trim(u.email), '')) as resolved_person_name,
      coalesce(nullif(trim(o.customer_email), ''), nullif(trim(u.email), '')) as resolved_person_email,
      remito.remito_number
    from scoped_orders o
    left join public.users u on u.id = o.user_id
    left join lateral (
      select cr.remito_number
      from public.company_remitos cr
      join public.companies c on c.id = cr.company_id
      where o.id = any(cr.order_ids)
        and (p_remito_number is null or cr.remito_number = p_remito_number)
      order by cr.issued_at desc, cr.created_at desc
      limit 1
    ) remito on true
    where (p_remito_number is null or remito.remito_number is not null)
      and (
        v_search = ''
        or public.normalize_admin_search_text(coalesce(o.customer_name, u.full_name, '')) like '%' || v_search || '%'
      )
      and (
        v_email = ''
        or public.normalize_admin_search_text(coalesce(o.customer_email, u.email, '')) like '%' || v_email || '%'
      )
  ),
  counted as (
    select enriched.*, count(*) over() as total_count
    from enriched
  )
  select
    counted.id,
    counted.user_id,
    counted.delivery_date,
    counted.created_at,
    counted.status,
    coalesce(nullif(counted.order_origin, ''), 'user') as order_origin,
    counted.resolved_person_name as person_name,
    counted.resolved_person_email as person_email,
    counted.company_slug,
    counted.company_name,
    counted.organization,
    counted.location,
    counted.delivery_location,
    counted.service,
    counted.items,
    counted.custom_responses,
    counted.total_items,
    counted.customer_name,
    counted.customer_email,
    counted.created_by_admin_id,
    counted.created_by_admin_email,
    counted.created_by_admin_name,
    counted.admin_extra_created_at,
    counted.remito_number,
    counted.total_count
  from counted
  order by counted.delivery_date desc nulls last, counted.created_at desc
  limit v_page_size
  offset v_offset;
end;
$$;

do $$
declare
  v_signature text;
  v_sql text;
begin
  foreach v_signature in array array[
    'public.issue_company_remito(text,text,date,uuid[],text,jsonb,text)',
    'public.refresh_company_remito_snapshot(uuid,uuid[],jsonb,text)'
  ]
  loop
    begin
      select pg_get_functiondef(v_signature::regprocedure)
      into v_sql;

      if v_sql like '%array[''pending'', ''archived'']%' then
        execute replace(
          v_sql,
          'array[''pending'', ''archived'']',
          'array[''pending'', ''archived'', ''post_report_extra'']'
        );
      end if;
    exception
      when undefined_function then
        null;
    end;
  end loop;
end $$;

do $$
begin
  update public.orders o
  set status = 'post_report_extra',
      updated_at = now()
  where o.status = 'pending'
    and lower(coalesce(o.order_origin, 'user')) = 'admin_extra'
    and exists (
      select 1
      from public.daily_report_runs drr
      where drr.report_type = 'daily_orders'
        and drr.report_date = o.delivery_date
        and drr.status = 'sent'
        and drr.sent_at is not null
        and drr.sent_at <= o.created_at
    );
end $$;

revoke all on function public.resolve_admin_extra_order_status(date, timestamptz) from public;
revoke all on function public.resolve_admin_extra_order_status(date, timestamptz) from anon;
grant execute on function public.resolve_admin_extra_order_status(date, timestamptz) to authenticated;

revoke all on function public.create_admin_extra_order(jsonb) from public;
revoke all on function public.create_admin_extra_order(jsonb) from anon;
grant execute on function public.create_admin_extra_order(jsonb) to authenticated;

revoke all on function public.get_daily_orders_for_admin(date, text[]) from public;
revoke all on function public.get_daily_orders_for_admin(date, text[]) from anon;
grant execute on function public.get_daily_orders_for_admin(date, text[]) to authenticated;

revoke all on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) from public;
revoke all on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) from anon;
grant execute on function public.search_historical_daily_orders(text, text, text, date, date, integer, text, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
