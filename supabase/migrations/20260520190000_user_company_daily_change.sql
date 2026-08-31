create table if not exists public.user_daily_company_profiles (
  user_id uuid not null references public.users(id) on delete cascade,
  active_date date not null,
  company_slug text not null,
  location text not null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, active_date)
);

create index if not exists user_daily_company_profiles_user_date_idx
  on public.user_daily_company_profiles (user_id, active_date desc);

create table if not exists public.user_company_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  previous_location text not null,
  new_location text not null,
  previous_company_slug text,
  new_company_slug text,
  change_date date not null,
  reason text,
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists user_company_changes_user_date_idx
  on public.user_company_changes (user_id, change_date, created_at desc);

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
set search_path = public
as $$
declare
  v_order public.orders;
  v_items jsonb;
  v_now_ba timestamp;
  v_today date;
  v_active_location text;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency key required';
  end if;

  v_now_ba := timezone('America/Argentina/Buenos_Aires', now());
  v_today := v_now_ba::date;

  select p.location
  into v_active_location
  from public.user_daily_company_profiles p
  where p.user_id = p_user_id
    and p.active_date = v_today
  limit 1;

  v_items := coalesce(p_payload->'items', '[]'::jsonb);

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
    comments,
    delivery_date
  )
  values (
    p_user_id,
    p_idempotency_key,
    coalesce(v_active_location, p_payload->>'location', null),
    coalesce(p_payload->>'service', 'lunch'),
    v_items,
    coalesce(p_payload->>'status', 'pending'),
    coalesce(jsonb_array_length(v_items), 0),
    coalesce(p_payload->'custom_responses', '[]'::jsonb),
    coalesce(p_payload->>'customer_name', null),
    coalesce(p_payload->>'customer_email', null),
    coalesce(p_payload->>'comments', null),
    coalesce((p_payload->>'delivery_date')::date, current_date)
  )
  on conflict (idempotency_key)
  do update set
    idempotency_key = public.orders.idempotency_key
  returning *
  into v_order;

  return v_order;
end;
$$;
