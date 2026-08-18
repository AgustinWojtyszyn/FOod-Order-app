-- Single SQL script for pending order fixes.
-- 1) Applies post_report_extra.
-- 2) Reports company snapshot BEFORE.
-- 3) Applies normal-order company snapshot.
-- 4) Reports company snapshot AFTER and lists doubtful rows.

select 'APPLY post_report_extra_orders' as phase;
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

select 'APPLY_AND_VERIFY normal_order_company_snapshot' as phase;
-- Combined apply + verification script for normal order company snapshots.
-- Copy/run this as one SQL file: it reports BEFORE, applies the migration,
-- then reports AFTER and lists doubtful rows that remain unchanged.

select 'BEFORE normal_order_company_snapshot' as phase;
-- Run before and after supabase/migrations/20260818130000_normal_order_company_snapshot.sql.
-- It reports company counts, rows that can be completed by the migration rule,
-- and doubtful rows that remain unchanged. No data is modified.

create or replace function pg_temp.normalize_company_snapshot_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p_value, ''))),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    ''
  )
$$;

create or replace function pg_temp.resolve_order_company_snapshot(
  p_user_id uuid,
  p_location text,
  p_organization text,
  p_customer_email text,
  p_delivery_date date
)
returns table (
  company_slug text,
  company_name text,
  match_source text,
  candidate_count integer
)
language sql
stable
as $$
  with input_values as (
    select
      pg_temp.normalize_company_snapshot_key(p_location) as location_key,
      pg_temp.normalize_company_snapshot_key(p_organization) as organization_key,
      public.normalize_contact_email(p_customer_email) as customer_email,
      public.normalize_contact_email(u.email) as profile_email
    from public.users u
    where u.id = p_user_id
    union all
    select
      pg_temp.normalize_company_snapshot_key(p_location),
      pg_temp.normalize_company_snapshot_key(p_organization),
      public.normalize_contact_email(p_customer_email),
      null
    where p_user_id is null
       or not exists (select 1 from public.users u where u.id = p_user_id)
  ),
  profile_candidates as (
    select distinct
      c.slug,
      c.name,
      'profile'::text as source,
      10 as priority
    from public.user_daily_company_profiles p
    join public.companies c on c.slug = lower(trim(p.company_slug))
    where p.user_id = p_user_id
      and p.active_date = p_delivery_date
  ),
  email_candidates as (
    select distinct
      c.slug,
      c.name,
      'email'::text as source,
      20 as priority
    from input_values i
    join public.authorized_order_contacts aoc
      on public.normalize_contact_email(aoc.email) in (i.customer_email, i.profile_email)
     and aoc.status <> 'disabled'
    join public.order_organizations org on org.id = aoc.organization_id
    join public.companies c on c.slug = lower(org.code)
    where coalesce(i.customer_email, i.profile_email) is not null
  ),
  catalog_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      30 as priority
    from input_values i
    join public.order_locations loc
      on loc.active = true
     and i.location_key in (
       pg_temp.normalize_company_snapshot_key(loc.display_name),
       pg_temp.normalize_company_snapshot_key(loc.code),
       pg_temp.normalize_company_snapshot_key(loc.slug)
     )
    join public.order_organizations org on org.id = loc.organization_id and org.active = true
    join public.companies c on c.slug = lower(org.code)
    where i.location_key is not null
  ),
  organization_candidates as (
    select distinct
      c.slug,
      c.name,
      'organization'::text as source,
      40 as priority
    from input_values i
    join public.companies c
      on i.organization_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name)
      )
    where i.organization_key is not null
  ),
  legacy_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      50 as priority
    from input_values i
    join public.companies c
      on i.location_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name),
        pg_temp.normalize_company_snapshot_key(public.resolve_company_location(c.slug))
      )
    where i.location_key is not null
      and c.slug <> 'global'
  ),
  explicit_location_alias_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      45 as priority
    from input_values i
    join public.companies c
      on c.slug = case i.location_key
        when 'genneia_o_m' then 'genneia'
        else null
      end
    where i.location_key is not null
  ),
  candidates as (
    select * from profile_candidates
    union all
    select * from email_candidates
    union all
    select * from catalog_location_candidates
    union all
    select * from organization_candidates
    union all
    select * from explicit_location_alias_candidates
    union all
    select * from legacy_location_candidates
  ),
  top_priority as (
    select min(priority) as priority
    from candidates
  ),
  top_candidates as (
    select distinct c.slug, c.name, c.source
    from candidates c
    join top_priority p on p.priority = c.priority
  ),
  summary as (
    select
      count(distinct slug)::integer as candidate_count,
      min(slug) as slug,
      min(name) as name,
      min(source) as source
    from top_candidates
  )
  select
    case when candidate_count = 1 then slug end as company_slug,
    case when candidate_count = 1 then name end as company_name,
    case when candidate_count = 1 then source end as match_source,
    candidate_count
  from summary
$$;

with resolved as (
  select
    o.id,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.company_slug as resolved_company_slug,
    r.company_name as resolved_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
)
select
  '01_current_counts_by_company' as section,
  coalesce(nullif(current_company_slug, ''), 'sin_empresa') as company_slug,
  coalesce(nullif(current_company_name, ''), 'Sin empresa') as company_name,
  count(*) as orders_count
from resolved
group by 1, 2, 3
union all
select
  '02_would_complete_by_company' as section,
  resolved_company_slug as company_slug,
  resolved_company_name as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is not null
group by 1, 2, 3
union all
select
  '03_doubtful_summary' as section,
  'dudosos' as company_slug,
  'Sin cambio' as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is null
order by section, company_slug;

with resolved as (
  select
    o.id,
    o.created_at,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.user_id,
    o.location,
    o.delivery_location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
    and (nullif(trim(o.company_slug), '') is null or nullif(trim(o.company_name), '') is null)
    and r.company_slug is null
)
select
  id,
  created_at,
  delivery_date,
  status,
  user_id,
  location,
  delivery_location,
  organization,
  customer_email,
  current_company_slug,
  current_company_name,
  candidate_count,
  match_source
from resolved
order by delivery_date nulls last, created_at, id;

select 'APPLY normal_order_company_snapshot' as phase;

-- Snapshot company data on regular orders without changing order contents,
-- dates, statuses, users, remitos or delivery/location snapshots.

create or replace function public.normalize_company_snapshot_key(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p_value, ''))),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    ''
  )
$$;

create or replace function public.resolve_order_company_snapshot(
  p_user_id uuid,
  p_location text,
  p_organization text,
  p_customer_email text,
  p_delivery_date date
)
returns table (
  company_slug text,
  company_name text,
  match_source text,
  candidate_count integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  with input_values as (
    select
      public.normalize_company_snapshot_key(p_location) as location_key,
      public.normalize_company_snapshot_key(p_organization) as organization_key,
      public.normalize_contact_email(p_customer_email) as customer_email,
      public.normalize_contact_email(u.email) as profile_email
    from public.users u
    where u.id = p_user_id
    union all
    select
      public.normalize_company_snapshot_key(p_location),
      public.normalize_company_snapshot_key(p_organization),
      public.normalize_contact_email(p_customer_email),
      null
    where p_user_id is null
       or not exists (select 1 from public.users u where u.id = p_user_id)
  ),
  profile_candidates as (
    select distinct
      c.slug,
      c.name,
      'profile'::text as source,
      10 as priority
    from public.user_daily_company_profiles p
    join public.companies c on c.slug = lower(trim(p.company_slug))
    where p.user_id = p_user_id
      and p.active_date = p_delivery_date
  ),
  email_candidates as (
    select distinct
      c.slug,
      c.name,
      'email'::text as source,
      20 as priority
    from input_values i
    join public.authorized_order_contacts aoc
      on public.normalize_contact_email(aoc.email) in (i.customer_email, i.profile_email)
     and aoc.status <> 'disabled'
    join public.order_organizations org on org.id = aoc.organization_id
    join public.companies c on c.slug = lower(org.code)
    where coalesce(i.customer_email, i.profile_email) is not null
  ),
  catalog_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      30 as priority
    from input_values i
    join public.order_locations loc
      on loc.active = true
     and i.location_key in (
       public.normalize_company_snapshot_key(loc.display_name),
       public.normalize_company_snapshot_key(loc.code),
       public.normalize_company_snapshot_key(loc.slug)
     )
    join public.order_organizations org on org.id = loc.organization_id and org.active = true
    join public.companies c on c.slug = lower(org.code)
    where i.location_key is not null
  ),
  organization_candidates as (
    select distinct
      c.slug,
      c.name,
      'organization'::text as source,
      40 as priority
    from input_values i
    join public.companies c
      on i.organization_key in (
        public.normalize_company_snapshot_key(c.slug),
        public.normalize_company_snapshot_key(c.name)
      )
    where i.organization_key is not null
  ),
  legacy_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      50 as priority
    from input_values i
    join public.companies c
      on i.location_key in (
        public.normalize_company_snapshot_key(c.slug),
        public.normalize_company_snapshot_key(c.name),
        public.normalize_company_snapshot_key(public.resolve_company_location(c.slug))
      )
    where i.location_key is not null
      and c.slug <> 'global'
  ),
  explicit_location_alias_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      45 as priority
    from input_values i
    join public.companies c
      on c.slug = case i.location_key
        when 'genneia_o_m' then 'genneia'
        else null
      end
    where i.location_key is not null
  ),
  candidates as (
    select * from profile_candidates
    union all
    select * from email_candidates
    union all
    select * from catalog_location_candidates
    union all
    select * from organization_candidates
    union all
    select * from explicit_location_alias_candidates
    union all
    select * from legacy_location_candidates
  ),
  top_priority as (
    select min(priority) as priority
    from candidates
  ),
  top_candidates as (
    select distinct c.slug, c.name, c.source
    from candidates c
    join top_priority p on p.priority = c.priority
  ),
  summary as (
    select
      count(distinct slug)::integer as candidate_count,
      min(slug) as slug,
      min(name) as name,
      min(source) as source
    from top_candidates
  )
  select
    case when candidate_count = 1 then slug end as company_slug,
    case when candidate_count = 1 then name end as company_name,
    case when candidate_count = 1 then source end as match_source,
    candidate_count
  from summary
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
  v_ba_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ba_hour integer := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::integer;
  v_requested_location text;
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
  v_delivery_date := coalesce((p_payload->>'delivery_date')::date, v_ba_now::date);
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

  if v_delivery_date < v_ba_now::date then
    raise exception 'invalid_delivery_date';
  end if;

  if v_ba_hour < 9 or v_ba_hour >= 22 then
    raise exception 'order_window_closed';
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

do $$
declare
  v_has_updated_at_trigger boolean;
begin
  select exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.orders'::regclass
      and tgname = 'trg_orders_updated_at'
      and not tgisinternal
  )
  into v_has_updated_at_trigger;

  if v_has_updated_at_trigger then
    alter table public.orders disable trigger trg_orders_updated_at;
  end if;

  with resolved_orders as (
    select
      o.id,
      r.company_slug,
      r.company_name
    from public.orders o
    cross join lateral public.resolve_order_company_snapshot(
      o.user_id,
      coalesce(o.location, o.delivery_location),
      o.organization,
      o.customer_email,
      o.delivery_date
    ) r
    where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
      and (nullif(trim(o.company_slug), '') is null or nullif(trim(o.company_name), '') is null)
      and r.company_slug is not null
  )
  update public.orders o
  set company_slug = coalesce(nullif(trim(o.company_slug), ''), resolved.company_slug),
      company_name = coalesce(nullif(trim(o.company_name), ''), resolved.company_name)
  from resolved_orders resolved
  where resolved.id = o.id;

  if v_has_updated_at_trigger then
    alter table public.orders enable trigger trg_orders_updated_at;
  end if;
exception
  when others then
    if v_has_updated_at_trigger then
      alter table public.orders enable trigger trg_orders_updated_at;
    end if;
    raise;
end $$;

revoke all on function public.normalize_company_snapshot_key(text) from public;
revoke all on function public.normalize_company_snapshot_key(text) from anon;
grant execute on function public.normalize_company_snapshot_key(text) to authenticated;

revoke all on function public.resolve_order_company_snapshot(uuid, text, text, text, date) from public;
revoke all on function public.resolve_order_company_snapshot(uuid, text, text, text, date) from anon;
grant execute on function public.resolve_order_company_snapshot(uuid, text, text, text, date) to authenticated;

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

select 'AFTER normal_order_company_snapshot' as phase;
-- Run before and after supabase/migrations/20260818130000_normal_order_company_snapshot.sql.
-- It reports company counts, rows that can be completed by the migration rule,
-- and doubtful rows that remain unchanged. No data is modified.

create or replace function pg_temp.normalize_company_snapshot_key(p_value text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      translate(
        lower(trim(coalesce(p_value, ''))),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      '_',
      'g'
    ),
    ''
  )
$$;

create or replace function pg_temp.resolve_order_company_snapshot(
  p_user_id uuid,
  p_location text,
  p_organization text,
  p_customer_email text,
  p_delivery_date date
)
returns table (
  company_slug text,
  company_name text,
  match_source text,
  candidate_count integer
)
language sql
stable
as $$
  with input_values as (
    select
      pg_temp.normalize_company_snapshot_key(p_location) as location_key,
      pg_temp.normalize_company_snapshot_key(p_organization) as organization_key,
      public.normalize_contact_email(p_customer_email) as customer_email,
      public.normalize_contact_email(u.email) as profile_email
    from public.users u
    where u.id = p_user_id
    union all
    select
      pg_temp.normalize_company_snapshot_key(p_location),
      pg_temp.normalize_company_snapshot_key(p_organization),
      public.normalize_contact_email(p_customer_email),
      null
    where p_user_id is null
       or not exists (select 1 from public.users u where u.id = p_user_id)
  ),
  profile_candidates as (
    select distinct
      c.slug,
      c.name,
      'profile'::text as source,
      10 as priority
    from public.user_daily_company_profiles p
    join public.companies c on c.slug = lower(trim(p.company_slug))
    where p.user_id = p_user_id
      and p.active_date = p_delivery_date
  ),
  email_candidates as (
    select distinct
      c.slug,
      c.name,
      'email'::text as source,
      20 as priority
    from input_values i
    join public.authorized_order_contacts aoc
      on public.normalize_contact_email(aoc.email) in (i.customer_email, i.profile_email)
     and aoc.status <> 'disabled'
    join public.order_organizations org on org.id = aoc.organization_id
    join public.companies c on c.slug = lower(org.code)
    where coalesce(i.customer_email, i.profile_email) is not null
  ),
  catalog_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      30 as priority
    from input_values i
    join public.order_locations loc
      on loc.active = true
     and i.location_key in (
       pg_temp.normalize_company_snapshot_key(loc.display_name),
       pg_temp.normalize_company_snapshot_key(loc.code),
       pg_temp.normalize_company_snapshot_key(loc.slug)
     )
    join public.order_organizations org on org.id = loc.organization_id and org.active = true
    join public.companies c on c.slug = lower(org.code)
    where i.location_key is not null
  ),
  organization_candidates as (
    select distinct
      c.slug,
      c.name,
      'organization'::text as source,
      40 as priority
    from input_values i
    join public.companies c
      on i.organization_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name)
      )
    where i.organization_key is not null
  ),
  legacy_location_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      50 as priority
    from input_values i
    join public.companies c
      on i.location_key in (
        pg_temp.normalize_company_snapshot_key(c.slug),
        pg_temp.normalize_company_snapshot_key(c.name),
        pg_temp.normalize_company_snapshot_key(public.resolve_company_location(c.slug))
      )
    where i.location_key is not null
      and c.slug <> 'global'
  ),
  explicit_location_alias_candidates as (
    select distinct
      c.slug,
      c.name,
      'location'::text as source,
      45 as priority
    from input_values i
    join public.companies c
      on c.slug = case i.location_key
        when 'genneia_o_m' then 'genneia'
        else null
      end
    where i.location_key is not null
  ),
  candidates as (
    select * from profile_candidates
    union all
    select * from email_candidates
    union all
    select * from catalog_location_candidates
    union all
    select * from organization_candidates
    union all
    select * from explicit_location_alias_candidates
    union all
    select * from legacy_location_candidates
  ),
  top_priority as (
    select min(priority) as priority
    from candidates
  ),
  top_candidates as (
    select distinct c.slug, c.name, c.source
    from candidates c
    join top_priority p on p.priority = c.priority
  ),
  summary as (
    select
      count(distinct slug)::integer as candidate_count,
      min(slug) as slug,
      min(name) as name,
      min(source) as source
    from top_candidates
  )
  select
    case when candidate_count = 1 then slug end as company_slug,
    case when candidate_count = 1 then name end as company_name,
    case when candidate_count = 1 then source end as match_source,
    candidate_count
  from summary
$$;

with resolved as (
  select
    o.id,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.company_slug as resolved_company_slug,
    r.company_name as resolved_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
)
select
  '01_current_counts_by_company' as section,
  coalesce(nullif(current_company_slug, ''), 'sin_empresa') as company_slug,
  coalesce(nullif(current_company_name, ''), 'Sin empresa') as company_name,
  count(*) as orders_count
from resolved
group by 1, 2, 3
union all
select
  '02_would_complete_by_company' as section,
  resolved_company_slug as company_slug,
  resolved_company_name as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is not null
group by 1, 2, 3
union all
select
  '03_doubtful_summary' as section,
  'dudosos' as company_slug,
  'Sin cambio' as company_name,
  count(*) as orders_count
from resolved
where (nullif(trim(current_company_slug), '') is null or nullif(trim(current_company_name), '') is null)
  and resolved_company_slug is null
order by section, company_slug;

with resolved as (
  select
    o.id,
    o.created_at,
    o.delivery_date,
    o.status,
    coalesce(nullif(lower(o.order_origin), ''), 'user') as order_origin,
    o.user_id,
    o.location,
    o.delivery_location,
    o.organization,
    o.customer_email,
    o.company_slug as current_company_slug,
    o.company_name as current_company_name,
    r.match_source,
    r.candidate_count
  from public.orders o
  cross join lateral pg_temp.resolve_order_company_snapshot(
    o.user_id,
    coalesce(o.location, o.delivery_location),
    o.organization,
    o.customer_email,
    o.delivery_date
  ) r
  where coalesce(nullif(lower(o.order_origin), ''), 'user') = 'user'
    and (nullif(trim(o.company_slug), '') is null or nullif(trim(o.company_name), '') is null)
    and r.company_slug is null
)
select
  id,
  created_at,
  delivery_date,
  status,
  user_id,
  location,
  delivery_location,
  organization,
  customer_email,
  current_company_slug,
  current_company_name,
  candidate_count,
  match_source
from resolved
order by delivery_date nulls last, created_at, id;
