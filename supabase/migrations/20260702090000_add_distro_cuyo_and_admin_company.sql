create or replace function public.resolve_company_location(p_company_slug text)
returns text
language plpgsql
immutable
as $$
begin
  case lower(trim(coalesce(p_company_slug, '')))
    when 'laja' then return 'La Laja';
    when 'ccp' then return 'Ccp';
    when 'padrebueno' then return 'Padre Bueno';
    when 'losberros' then return 'Los Berros';
    when 'genneia' then return 'Genneia';
    when 'distro_cuyo' then return 'DistroCuyo';
    when 'administracion_servifood' then return 'Administración ServiFood';
    else return null;
  end case;
end;
$$;

create or replace function public.get_user_company_switch_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_today date;
  v_changes_count integer := 0;
  v_current_company_slug text;
  v_current_location text;
  v_remaining integer := 0;
  v_now_ba timestamp;
  v_hour integer;
  v_within_window boolean;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_now_ba := timezone('America/Argentina/Buenos_Aires', now());
  v_today := v_now_ba::date;
  v_hour := extract(hour from v_now_ba);
  v_within_window := (v_hour >= 9 and v_hour < 22);

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
      case
        when o.location = 'La Laja' then 'laja'
        when o.location = 'Ccp' then 'ccp'
        when o.location = 'Padre Bueno' then 'padrebueno'
        when o.location = 'Los Berros' then 'losberros'
        when o.location = 'Genneia' then 'genneia'
        when o.location = 'DistroCuyo' then 'distro_cuyo'
        when o.location = 'Administración ServiFood' and public.is_admin() then 'administracion_servifood'
        else null
      end,
      o.location
    into v_current_company_slug, v_current_location
    from public.orders o
    where o.user_id = v_uid
      and o.status = 'pending'
      and timezone('America/Argentina/Buenos_Aires', o.created_at)::date = v_today
    order by o.created_at desc
    limit 1;
  end if;

  if v_current_company_slug = 'administracion_servifood' and not public.is_admin() then
    v_current_company_slug := null;
    v_current_location := null;
  end if;

  v_remaining := greatest(0, 2 - coalesce(v_changes_count, 0));

  return jsonb_build_object(
    'current_company_slug', v_current_company_slug,
    'current_location', v_current_location,
    'changes_used', coalesce(v_changes_count, 0),
    'remaining_changes', v_remaining,
    'max_changes_per_day', 2,
    'within_order_window', v_within_window,
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
set search_path = public
as $$
declare
  v_uid uuid;
  v_today date;
  v_now_ba timestamp;
  v_hour integer;
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

  v_now_ba := timezone('America/Argentina/Buenos_Aires', now());
  v_today := v_now_ba::date;
  v_hour := extract(hour from v_now_ba);
  if v_hour < 9 or v_hour >= 22 then
    raise exception 'outside_order_window';
  end if;

  v_new_company_slug := lower(trim(coalesce(p_new_company_slug, '')));
  if v_new_company_slug = 'administracion_servifood' and not public.is_admin() then
    raise exception 'invalid_company';
  end if;

  v_new_location := public.resolve_company_location(v_new_company_slug);
  if v_new_location is null then
    raise exception 'invalid_company';
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
      case
        when o.location = 'La Laja' then 'laja'
        when o.location = 'Ccp' then 'ccp'
        when o.location = 'Padre Bueno' then 'padrebueno'
        when o.location = 'Los Berros' then 'losberros'
        when o.location = 'Genneia' then 'genneia'
        when o.location = 'DistroCuyo' then 'distro_cuyo'
        when o.location = 'Administración ServiFood' and public.is_admin() then 'administracion_servifood'
        else null
      end,
      o.location
    into v_previous_company_slug, v_previous_location
    from public.orders o
    where o.user_id = v_uid
      and o.status = 'pending'
      and timezone('America/Argentina/Buenos_Aires', o.created_at)::date = v_today
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
    and timezone('America/Argentina/Buenos_Aires', o.created_at)::date = v_today;

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
  v_ba_now timestamp := now() at time zone 'America/Argentina/Buenos_Aires';
  v_ba_hour integer := extract(hour from now() at time zone 'America/Argentina/Buenos_Aires')::integer;
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

  if v_service not in ('lunch', 'dinner') then
    raise exception 'invalid_service';
  end if;

  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'items_required';
  end if;

  if v_service in ('lunch', 'dinner') then
    select coalesce(
      jsonb_agg(
        case
          when jsonb_typeof(item) = 'object' then jsonb_set(item, '{quantity}', '1'::jsonb, true)
          else item
        end
        order by ord
      ),
      '[]'::jsonb
    )
    into v_items
    from jsonb_array_elements(v_items) with ordinality as t(item, ord)
    where ord = 1;
  end if;

  if jsonb_array_length(v_items) = 0 then
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
    coalesce(p_payload->>'location', null),
    v_service,
    v_items,
    'pending',
    jsonb_array_length(v_items),
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

revoke all on function public.create_order_idempotent(uuid, text, jsonb) from public;
revoke all on function public.create_order_idempotent(uuid, text, jsonb) from anon;
grant execute on function public.create_order_idempotent(uuid, text, jsonb) to authenticated;
