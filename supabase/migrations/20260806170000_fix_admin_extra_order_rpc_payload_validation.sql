do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'user_id'
      and is_nullable = 'NO'
  ) then
    alter table public.orders
      alter column user_id drop not null;
  end if;
end $$;

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
  v_delivery_date_text text;
  v_client_user_id_text text;
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
  v_client_user_id_text := nullif(trim(coalesce(p_payload->>'client_user_id', '')), '');
  v_reference := nullif(trim(coalesce(p_payload->>'customer_name', '')), '');
  v_email := nullif(trim(coalesce(p_payload->>'customer_email', '')), '');
  v_phone := nullif(trim(coalesce(p_payload->>'customer_phone', '')), '');
  v_idempotency_key := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_quantity := case
    when coalesce(p_payload->>'quantity', '') ~ '^[0-9]+$'
      then greatest((p_payload->>'quantity')::integer, 1)
    else 1
  end;
  v_duplicate_confirmed := lower(coalesce(p_payload->>'duplicate_confirmed', 'false')) in ('true', 't', '1', 'yes');
  v_outside_window := (v_ba_hour < 9 or v_ba_hour >= 22);

  if v_delivery_date_text is null or v_delivery_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'invalid_delivery_date';
  end if;
  v_delivery_date := v_delivery_date_text::date;

  if v_client_user_id_text is not null then
    if v_client_user_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'client_not_found';
    end if;
    v_client_user_id := v_client_user_id_text::uuid;
  end if;

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

revoke all on function public.create_admin_extra_order(jsonb) from public;
revoke all on function public.create_admin_extra_order(jsonb) from anon;
grant execute on function public.create_admin_extra_order(jsonb) to authenticated;
