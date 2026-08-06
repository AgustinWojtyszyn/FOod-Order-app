-- Admin-created extra orders for daily operations.
-- Keeps the existing customer order flow unchanged and records administrative
-- origin/exception metadata directly on orders.

alter table public.orders
  add column if not exists order_origin text not null default 'user',
  add column if not exists company_slug text,
  add column if not exists company_name text,
  add column if not exists created_by_admin_id uuid references auth.users(id) on delete set null,
  add column if not exists created_by_admin_email text,
  add column if not exists created_by_admin_name text,
  add column if not exists admin_extra_reason text,
  add column if not exists admin_extra_comment text,
  add column if not exists admin_extra_outside_window boolean not null default false,
  add column if not exists admin_extra_duplicate_confirmed boolean not null default false,
  add column if not exists admin_extra_created_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_order_origin_check'
  ) then
    alter table public.orders
      add constraint orders_order_origin_check
      check (order_origin in ('user', 'admin_extra'));
  end if;
end $$;

create index if not exists orders_order_origin_idx on public.orders (order_origin);
create index if not exists orders_company_slug_idx on public.orders (company_slug);
create index if not exists orders_created_by_admin_id_idx on public.orders (created_by_admin_id);
create index if not exists orders_admin_extra_created_at_idx on public.orders (admin_extra_created_at desc);

create or replace function public.admin_extra_company_location_allowed(
  p_company_slug text,
  p_location text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with input as (
    select
      lower(trim(coalesce(p_company_slug, ''))) as company_slug,
      lower(trim(coalesce(p_location, ''))) as location
  )
  select case
    when company_slug = 'epse' then exists (
      select 1
      from public.order_locations loc
      join public.order_organizations org on org.id = loc.organization_id
      where loc.active = true
        and org.active = true
        and lower(org.code) = 'epse'
        and (
          lower(loc.display_name) = location
          or lower(loc.code) = location
          or lower(loc.slug) = location
        )
    )
    when company_slug = 'ccp' then location in ('ccp', 'c c p')
    when company_slug = 'laja' then location = 'la laja'
    when company_slug = 'padrebueno' then location = 'padre bueno'
    when company_slug = 'losberros' then location = 'los berros'
    when company_slug = 'genneia' then location = 'genneia'
    when company_slug = 'distro_cuyo' then location = 'distrocuyo'
    when company_slug = 'administracion_servifood' then location = 'administración servifood' or location = 'administracion servifood'
    else false
  end
  from input;
$$;

create or replace function public.search_admin_extra_order_people(
  p_search text,
  p_company_slug text default null,
  p_limit integer default 10
)
returns table (
  id uuid,
  email text,
  full_name text,
  role text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
  v_company_slug text := lower(trim(coalesce(p_company_slug, '')));
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 12);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_company_slug <> '' and not public.is_company_admin(v_company_slug) then
    raise exception 'not_authorized';
  end if;

  if length(v_search) < 2 then
    return;
  end if;

  return query
  select u.id, u.email, u.full_name, u.role, u.created_at
  from public.users u
  where lower(coalesce(u.email, '')) like '%' || v_search || '%'
     or lower(coalesce(u.full_name, '')) like '%' || v_search || '%'
  order by
    case
      when lower(coalesce(u.full_name, '')) like v_search || '%' then 0
      when lower(coalesce(u.email, '')) like v_search || '%' then 1
      else 2
    end,
    coalesce(nullif(trim(u.full_name), ''), u.email)
  limit v_limit;
end;
$$;

create or replace function public.get_admin_extra_order_duplicate(
  p_client_user_id uuid,
  p_delivery_date date,
  p_service text,
  p_company_slug text
)
returns table (
  id uuid,
  user_id uuid,
  customer_name text,
  customer_email text,
  location text,
  delivery_location text,
  service text,
  items jsonb,
  custom_responses jsonb,
  comments text,
  total_items integer,
  created_at timestamptz,
  status text,
  order_origin text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service text := coalesce(nullif(lower(trim(coalesce(p_service, ''))), ''), 'lunch');
  v_company_slug text := lower(trim(coalesce(p_company_slug, '')));
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if p_client_user_id is null then
    return;
  end if;

  if v_company_slug = '' or not public.is_company_admin(v_company_slug) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    o.id,
    o.user_id,
    o.customer_name,
    o.customer_email,
    o.location,
    o.delivery_location,
    o.service,
    o.items,
    o.custom_responses,
    o.comments,
    o.total_items,
    o.created_at,
    o.status,
    o.order_origin
  from public.orders o
  where o.user_id = p_client_user_id
    and o.delivery_date = p_delivery_date
    and coalesce(nullif(lower(o.service), ''), 'lunch') = v_service
    and o.status = 'pending'
  order by o.created_at desc
  limit 1;
end;
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
  v_client public.users;
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
  v_client_user_id uuid;
  v_idempotency_key text;
  v_quantity integer;
  v_duplicate_confirmed boolean;
  v_ba_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ba_hour integer := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::integer;
  v_outside_window boolean;
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_existing_order_id uuid;
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
  v_delivery_date := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '')::date;
  v_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  v_comment := nullif(trim(coalesce(p_payload->>'comment', '')), '');
  v_items := coalesce(p_payload->'items', '[]'::jsonb);
  v_custom_responses := coalesce(p_payload->'custom_responses', '[]'::jsonb);
  v_client_user_id := nullif(trim(coalesce(p_payload->>'client_user_id', '')), '')::uuid;
  v_reference := nullif(trim(coalesce(p_payload->>'customer_name', '')), '');
  v_email := nullif(trim(coalesce(p_payload->>'customer_email', '')), '');
  v_phone := nullif(trim(coalesce(p_payload->>'customer_phone', '')), '');
  v_idempotency_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_quantity := greatest(coalesce((p_payload->>'quantity')::integer, 1), 1);
  v_duplicate_confirmed := coalesce((p_payload->>'duplicate_confirmed')::boolean, false);
  v_outside_window := (v_ba_hour < 9 or v_ba_hour >= 22);

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

  if v_service = 'lunch' and not exists (
    select 1
    from public.menu_items mi
    where mi.menu_date = v_delivery_date
      and mi.company_slug in ('global', v_company_slug)
  ) then
    raise exception 'menu_required';
  end if;

  if v_service = 'dinner' and not exists (
    select 1
    from public.dinner_menu_by_date dm
    where dm.delivery_date = v_delivery_date
      and dm.active = true
      and (
        dm.company is null
        or dm.company = ''
        or lower(dm.company) = v_company_slug
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

  if v_client_user_id is not null then
    select *
    into v_client
    from public.users
    where id = v_client_user_id;

    if v_client.id is null then
      raise exception 'client_not_found';
    end if;

    v_reference := coalesce(v_reference, nullif(trim(coalesce(v_client.full_name, '')), ''), v_client.email);
    v_email := coalesce(v_email, nullif(trim(coalesce(v_client.email, '')), ''));

    select o.id
    into v_existing_order_id
    from public.orders o
    where o.user_id = v_client_user_id
      and o.delivery_date = v_delivery_date
      and coalesce(nullif(lower(o.service), ''), 'lunch') = v_service
      and o.status = 'pending'
    order by o.created_at desc
    limit 1;

    if v_existing_order_id is not null and not v_duplicate_confirmed then
      raise exception 'duplicate_active_order';
    end if;
  else
    if v_reference is null then
      raise exception 'customer_reference_required';
    end if;
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

  select coalesce(jsonb_agg(
    case
      when jsonb_typeof(item) = 'object' then jsonb_set(item, '{quantity}', to_jsonb(v_quantity), true)
      else item
    end
    order by ord
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_items) with ordinality as t(item, ord)
  where ord = 1;

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
    admin_extra_created_at
  )
  values (
    v_client_user_id,
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
    'pending',
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
    now()
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
    v_client_user_id,
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
      'reason', v_reason,
      'outside_window', v_outside_window,
      'duplicate_confirmed', v_duplicate_confirmed,
      'existing_order_id', v_existing_order_id,
      'origin', 'admin_extra'
    ),
    v_idempotency_key,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_order;
end;
$$;

create or replace function public.get_daily_orders_for_admin(
  p_delivery_date date,
  p_statuses text[] default array['pending', 'archived']
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

create or replace function public.resolve_order_delivery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location public.order_locations;
  v_delivery_location public.order_locations;
  v_organization public.order_organizations;
  v_is_admin_extra boolean;
  v_admin_extra_allowed boolean := false;
begin
  v_is_admin_extra := lower(coalesce(new.order_origin, 'user')) = 'admin_extra';

  select loc.*
  into v_location
  from public.order_locations loc
  where loc.active = true
    and (
      lower(loc.display_name) = lower(trim(coalesce(new.location, '')))
      or lower(loc.code) = lower(trim(coalesce(new.location, '')))
      or lower(loc.slug) = lower(trim(coalesce(new.location, '')))
    )
  limit 1;

  if v_location.id is null then
    if tg_op = 'UPDATE' and old.order_location_id is not null and not public.is_admin() then
      raise exception 'location_not_allowed';
    end if;

    if v_is_admin_extra then
      if not public.is_company_admin(coalesce(new.company_slug, '')) then
        raise exception 'location_not_allowed';
      end if;
      if not public.admin_extra_company_location_allowed(coalesce(new.company_slug, ''), coalesce(new.location, '')) then
        raise exception 'location_not_allowed';
      end if;
    end if;

    new.organization = coalesce(new.organization, new.company_name);
    new.requesting_location_code = null;
    new.order_location_id = null;
    new.delivery_location = coalesce(nullif(trim(new.delivery_location), ''), new.location);
    new.delivery_location_code = null;
    new.delivery_order_location_id = null;
    return new;
  end if;

  select *
  into v_delivery_location
  from public.order_locations
  where id = coalesce(v_location.default_delivery_location_id, v_location.id);

  select *
  into v_organization
  from public.order_organizations
  where id = v_location.organization_id;

  if v_is_admin_extra then
    v_admin_extra_allowed := public.is_company_admin(coalesce(new.company_slug, ''))
      and public.admin_extra_company_location_allowed(coalesce(new.company_slug, lower(v_organization.code)), v_location.display_name);
  end if;

  if not public.is_admin() and not v_admin_extra_allowed then
    perform public.sync_authorized_order_locations_for_user(new.user_id);
  end if;

  if not public.is_admin() and not v_admin_extra_allowed and not exists (
    select 1
    from public.user_order_locations uol
    where uol.user_id = new.user_id
      and uol.location_id = v_location.id
      and uol.active = true
  ) then
    raise exception 'location_not_allowed';
  end if;

  new.location = v_location.display_name;
  new.organization = v_organization.name;
  new.requesting_location_code = v_location.code;
  new.order_location_id = v_location.id;
  new.delivery_location = coalesce(v_delivery_location.display_name, v_location.display_name);
  new.delivery_location_code = coalesce(v_delivery_location.code, v_location.code);
  new.delivery_order_location_id = coalesce(v_delivery_location.id, v_location.id);
  return new;
end;
$$;

drop policy if exists orders_select_company_admin_assigned on public.orders;
create policy orders_select_company_admin_assigned
on public.orders
for select
to authenticated
using (
  public.is_admin()
  or auth.uid() = user_id
  or exists (
    select 1
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and (
        c.slug = orders.company_slug
        or public.admin_extra_company_location_allowed(c.slug, coalesce(orders.location, orders.delivery_location, ''))
      )
  )
);

revoke all on function public.admin_extra_company_location_allowed(text, text) from public;
revoke all on function public.admin_extra_company_location_allowed(text, text) from anon;
grant execute on function public.admin_extra_company_location_allowed(text, text) to authenticated;

revoke all on function public.search_admin_extra_order_people(text, text, integer) from public;
revoke all on function public.search_admin_extra_order_people(text, text, integer) from anon;
grant execute on function public.search_admin_extra_order_people(text, text, integer) to authenticated;

revoke all on function public.get_admin_extra_order_duplicate(uuid, date, text, text) from public;
revoke all on function public.get_admin_extra_order_duplicate(uuid, date, text, text) from anon;
grant execute on function public.get_admin_extra_order_duplicate(uuid, date, text, text) to authenticated;

revoke all on function public.create_admin_extra_order(jsonb) from public;
revoke all on function public.create_admin_extra_order(jsonb) from anon;
grant execute on function public.create_admin_extra_order(jsonb) to authenticated;

revoke all on function public.get_daily_orders_for_admin(date, text[]) from public;
revoke all on function public.get_daily_orders_for_admin(date, text[]) from anon;
grant execute on function public.get_daily_orders_for_admin(date, text[]) to authenticated;
