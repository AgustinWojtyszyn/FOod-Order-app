-- Fix new Auth accounts failing to create orders when public.users has not
-- been materialized yet, and avoid applying contact-location authorization to
-- legacy company locations that do not use authorized_order_contacts.

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
  v_requires_contact_authorization boolean := false;
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

  v_requires_contact_authorization := upper(coalesce(v_organization.code, '')) <> 'EPSE'
    and exists (
      select 1
      from public.authorized_order_contacts c
      where c.organization_id = v_location.organization_id
        and c.status <> 'disabled'
    );

  if not public.is_admin() and not v_admin_extra_allowed and v_requires_contact_authorization then
    perform public.sync_authorized_order_locations_for_user(new.user_id);
  end if;

  if not public.is_admin() and not v_admin_extra_allowed and v_requires_contact_authorization and not exists (
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

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
