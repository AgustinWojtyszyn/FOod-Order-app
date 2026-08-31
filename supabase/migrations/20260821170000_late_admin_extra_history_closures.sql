-- Permanent history and operational closures for late admin extra orders.
-- Access is intentionally narrower than global admin access.

begin;

create table if not exists public.late_admin_extra_history_authorized_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint late_extra_history_authorized_identity_check check (
    user_id is not null or nullif(trim(coalesce(email, '')), '') is not null
  )
);

create unique index if not exists late_extra_history_authorized_user_id_uidx
  on public.late_admin_extra_history_authorized_accounts (user_id)
  where user_id is not null;

create unique index if not exists late_extra_history_authorized_email_uidx
  on public.late_admin_extra_history_authorized_accounts (lower(trim(email)))
  where email is not null;

update public.late_admin_extra_history_authorized_accounts
set active = false,
    updated_at = now()
where lower(trim(coalesce(email, ''))) not in (
  'sarmientoclaudia985@gmail.com',
  'agustinwojtyszyn99@gmail.com'
)
and user_id is null;

insert into public.late_admin_extra_history_authorized_accounts (email, note)
values
  ('sarmientoclaudia985@gmail.com', 'Autorizada para historico y cierre operativo de pedidos extra fuera de termino'),
  ('agustinwojtyszyn99@gmail.com', 'Autorizado para historico y cierre operativo de pedidos extra fuera de termino')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

do $$
declare
  v_jessica public.users%rowtype;
  v_count integer := 0;
begin
  select count(*)
  into v_count
  from public.users u
  where lower(coalesce(u.email, '')) like '%jessica%'
     or lower(coalesce(u.email, '')) like '%jesica%'
     or lower(coalesce(u.full_name, '')) like '%jessica%'
     or lower(coalesce(u.full_name, '')) like '%jesica%';

  if v_count = 1 then
    select *
    into v_jessica
    from public.users u
    where lower(coalesce(u.email, '')) like '%jessica%'
       or lower(coalesce(u.email, '')) like '%jesica%'
       or lower(coalesce(u.full_name, '')) like '%jessica%'
       or lower(coalesce(u.full_name, '')) like '%jesica%'
    limit 1;

    insert into public.late_admin_extra_history_authorized_accounts (user_id, email, note)
    values (
      v_jessica.id,
      v_jessica.email,
      'Jessica resuelta automaticamente por coincidencia unica en public.users'
    )
    on conflict (user_id) where user_id is not null do update
    set email = excluded.email,
        active = true,
        note = excluded.note,
        updated_at = now();
  end if;
end;
$$;

create table if not exists public.late_admin_extra_order_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  operational_date date not null,
  delivery_date date,
  window_started_at timestamptz not null,
  window_closed_at timestamptz not null,
  created_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_by_name text,
  company_slug text,
  company_name text,
  location text,
  delivery_location text,
  location_key text,
  service text,
  total_items integer,
  detail jsonb not null default '{}'::jsonb,
  order_snapshot jsonb not null default '{}'::jsonb,
  historical_status text not null default 'created',
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_by_email text,
  deleted_by_name text,
  deleted_reason text,
  create_request_id text,
  delete_request_id text,
  create_audit_log_id uuid,
  delete_audit_log_id uuid,
  source text not null default 'create_late_admin_extra_order',
  created_record_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists late_admin_extra_order_history_order_id_uidx
  on public.late_admin_extra_order_history (order_id)
  where order_id is not null;

create index if not exists late_admin_extra_order_history_operational_date_idx
  on public.late_admin_extra_order_history (operational_date desc, created_at);

create table if not exists public.late_admin_extra_order_closures (
  id uuid primary key default gen_random_uuid(),
  operational_date date not null unique,
  window_started_at timestamptz not null,
  window_closed_at timestamptz not null,
  closed_at timestamptz not null default now(),
  closed_by uuid references auth.users(id) on delete set null,
  closed_by_email text,
  total_orders integer not null default 0,
  total_units integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.late_admin_extra_history_authorized_accounts enable row level security;
alter table public.late_admin_extra_order_history enable row level security;
alter table public.late_admin_extra_order_closures enable row level security;

create or replace function public.can_manage_late_extra_history(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with actor as (
    select u.id, lower(trim(coalesce(u.email, ''))) as email
    from public.users u
    where u.id = p_user_id
  )
  select exists (
    select 1
    from public.late_admin_extra_history_authorized_accounts cfg
    join actor a on (
      cfg.user_id = a.id
      or lower(trim(coalesce(cfg.email, ''))) = a.email
    )
    where cfg.active = true
  );
$$;

drop policy if exists late_extra_history_authorized_read on public.late_admin_extra_history_authorized_accounts;
create policy late_extra_history_authorized_read
on public.late_admin_extra_history_authorized_accounts
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

drop policy if exists late_extra_history_read on public.late_admin_extra_order_history;
create policy late_extra_history_read
on public.late_admin_extra_order_history
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

drop policy if exists late_extra_closures_read on public.late_admin_extra_order_closures;
create policy late_extra_closures_read
on public.late_admin_extra_order_closures
for select
to authenticated
using (public.can_manage_late_extra_history(auth.uid()));

create or replace function public.late_admin_extra_operational_bounds(p_operational_date date)
returns table (
  operational_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    p_operational_date,
    make_timestamptz(
      extract(year from (p_operational_date - 1))::integer,
      extract(month from (p_operational_date - 1))::integer,
      extract(day from (p_operational_date - 1))::integer,
      22, 0, 0, 'America/Argentina/Buenos_Aires'
    ),
    make_timestamptz(
      extract(year from p_operational_date)::integer,
      extract(month from p_operational_date)::integer,
      extract(day from p_operational_date)::integer,
      18, 0, 0, 'America/Argentina/Buenos_Aires'
    );
$$;

create or replace function public.resolve_late_admin_extra_operational_date(p_created_at timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when (p_created_at at time zone 'America/Argentina/Buenos_Aires')::time >= time '22:00:00'
      then (p_created_at at time zone 'America/Argentina/Buenos_Aires')::date + 1
    else (p_created_at at time zone 'America/Argentina/Buenos_Aires')::date
  end;
$$;

create or replace function public.late_admin_extra_order_snapshot_detail(p_order jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'items', coalesce(p_order->'items', '[]'::jsonb),
    'custom_responses', coalesce(p_order->'custom_responses', '[]'::jsonb),
    'comments', p_order->>'comments',
    'customer_name', p_order->>'customer_name',
    'customer_email', p_order->>'customer_email'
  );
$$;

create or replace function public.late_admin_extra_order_units(p_order jsonb)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(
    case when trim(coalesce(p_order->>'total_items', '')) ~ '^[0-9]+$' then trim(p_order->>'total_items')::integer end,
    (
      select coalesce(sum(greatest(coalesce(
        case when trim(coalesce(item->>'quantity', '')) ~ '^[0-9]+$' then trim(item->>'quantity')::integer end,
        1
      ), 1)), 0)::integer
      from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(item)
      where jsonb_typeof(item) = 'object'
    ),
    0
  ), 0);
$$;

create or replace function public.insert_late_admin_extra_order_history(
  p_order public.orders,
  p_operational_date date,
  p_created_by uuid,
  p_created_by_email text,
  p_created_by_name text,
  p_request_id text default null,
  p_audit_log_id uuid default null,
  p_source text default 'create_late_admin_extra_order'
)
returns public.late_admin_extra_order_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_result public.late_admin_extra_order_history%rowtype;
  v_snapshot jsonb := to_jsonb(p_order);
begin
  select * into v_bounds
  from public.late_admin_extra_operational_bounds(p_operational_date);

  insert into public.late_admin_extra_order_history (
    order_id,
    operational_date,
    delivery_date,
    window_started_at,
    window_closed_at,
    created_at,
    created_by,
    created_by_email,
    created_by_name,
    company_slug,
    company_name,
    location,
    delivery_location,
    location_key,
    service,
    total_items,
    detail,
    order_snapshot,
    historical_status,
    create_request_id,
    create_audit_log_id,
    source
  )
  values (
    p_order.id,
    p_operational_date,
    p_order.delivery_date,
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    p_order.created_at,
    p_created_by,
    p_created_by_email,
    p_created_by_name,
    p_order.company_slug,
    p_order.company_name,
    p_order.location,
    p_order.delivery_location,
    coalesce(p_order.requesting_location_code, ''),
    p_order.service,
    public.late_admin_extra_order_units(v_snapshot),
    public.late_admin_extra_order_snapshot_detail(v_snapshot),
    v_snapshot,
    'created',
    p_request_id,
    p_audit_log_id,
    p_source
  )
  on conflict (order_id) where order_id is not null do update
  set create_request_id = coalesce(late_admin_extra_order_history.create_request_id, excluded.create_request_id),
      create_audit_log_id = coalesce(late_admin_extra_order_history.create_audit_log_id, excluded.create_audit_log_id),
      updated_at = now()
  returning *
  into v_result;

  return v_result;
end;
$$;

create or replace function public.create_late_admin_extra_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_local_now timestamp := current_timestamp at time zone 'America/Argentina/Buenos_Aires';
  v_local_time time := (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::time;
  v_local_date date := (current_timestamp at time zone 'America/Argentina/Buenos_Aires')::date;
  v_operational_date date;
  v_requested_date_text text := nullif(trim(coalesce(p_payload->>'delivery_date', '')), '');
  v_payload jsonb;
  v_order public.orders;
  v_request_id text := nullif(trim(coalesce(p_payload->>'idempotency_key', '')), '');
  v_has_authorized_config boolean := false;
  v_is_authorized boolean := false;
  v_audit_id uuid;
begin
  if v_admin_id is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_admin from public.users where id = v_admin_id;
  if v_admin.id is null then
    raise exception 'not_authenticated';
  end if;

  select exists (select 1 from public.admin_late_extra_order_authorized_accounts cfg where cfg.active = true)
  into v_has_authorized_config;

  if not coalesce(v_has_authorized_config, false) then
    raise exception 'late_admin_extra_authorized_account_not_configured';
  end if;

  v_is_authorized := public.is_late_admin_extra_order_authorized(v_admin_id);
  if not coalesce(v_is_authorized, false) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if v_local_time >= time '22:00:00' then
    v_operational_date := v_local_now::date + 1;
  elsif v_local_time < time '18:00:00' then
    v_operational_date := v_local_now::date;
  else
    raise exception 'late_admin_extra_window_closed';
  end if;

  if v_requested_date_text is not null then
    if v_requested_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'invalid_delivery_date';
    end if;
    if v_requested_date_text::date <> v_operational_date then
      raise exception 'invalid_delivery_date';
    end if;
  end if;

  if v_operational_date < v_local_date then
    raise exception 'invalid_delivery_date';
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || jsonb_build_object('delivery_date', v_operational_date::text, 'late_admin_extra', true);

  select * into v_order from public.create_admin_extra_order(v_payload);

  insert into public.audit_logs (
    action, details, actor_id, actor_email, actor_name, target_id, target_email, target_name,
    metadata, request_id, created_at
  )
  values (
    'late_admin_extra_order_created',
    'Pedido fuera de termino cargado por cuenta autorizada',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'order_id', v_order.id,
      'delivery_date', v_operational_date,
      'local_timestamp', v_local_now,
      'timezone', 'America/Argentina/Buenos_Aires',
      'origin', 'admin_extra',
      'extended_window', '22:00-18:00',
      'status', v_order.status,
      'snapshot', to_jsonb(v_order)
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing
  returning id into v_audit_id;

  perform public.insert_late_admin_extra_order_history(
    v_order,
    v_operational_date,
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_request_id,
    v_audit_id,
    'create_late_admin_extra_order'
  );

  return jsonb_build_object('delivery_date', v_operational_date, 'order', to_jsonb(v_order));
end;
$$;

create or replace function public.delete_admin_extra_order(
  p_order_id uuid,
  p_reason text,
  p_request_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_id uuid := auth.uid();
  v_admin public.users;
  v_order public.orders;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_id text := nullif(trim(coalesce(p_request_id, '')), '');
  v_allowed boolean := false;
  v_is_late_extra boolean := false;
  v_delete_audit_id uuid;
begin
  if v_admin_id is null then raise exception 'not_authenticated'; end if;
  if p_order_id is null then raise exception 'order_required'; end if;
  if v_reason is null then raise exception 'reason_required'; end if;

  select * into v_admin from public.users where id = v_admin_id;

  if not public.has_company_admin_access() then
    raise exception 'not_authorized';
  end if;

  if v_request_id is not null and exists (
    select 1 from public.audit_logs a
    where a.request_id = v_request_id and a.action = 'admin_extra_order_deleted'
  ) then
    return jsonb_build_object('deleted', false, 'idempotent', true, 'order_id', p_order_id);
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if lower(coalesce(v_order.order_origin, 'user')) <> 'admin_extra' then
    raise exception 'not_admin_extra_order';
  end if;

  select exists (
    select 1 from public.late_admin_extra_order_history h where h.order_id = v_order.id
    union all
    select 1 from public.audit_logs a
    where a.action = 'late_admin_extra_order_created'
      and a.metadata->>'order_id' = v_order.id::text
    limit 1
  ) into v_is_late_extra;

  if v_is_late_extra and not public.is_late_admin_extra_order_authorized(v_admin_id) then
    raise exception 'late_admin_extra_not_authorized';
  end if;

  if public.is_admin() then
    v_allowed := true;
  else
    select exists (
      select 1 from public.company_admins ca
      join public.companies c on c.id = ca.company_id
      where ca.user_id = v_admin_id
        and (
          c.slug = v_order.company_slug
          or public.admin_extra_company_location_allowed(c.slug, coalesce(v_order.location, v_order.delivery_location, ''))
        )
    ) into v_allowed;
  end if;
  if not coalesce(v_allowed, false) then raise exception 'not_authorized'; end if;

  insert into public.audit_logs (
    action, details, actor_id, actor_email, actor_name, target_id, target_email, target_name,
    metadata, request_id, created_at
  )
  values (
    'admin_extra_order_deleted',
    'Pedido extra eliminado por administrador',
    v_admin_id,
    v_admin.email,
    coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
    v_order.user_id,
    v_order.customer_email,
    v_order.customer_name,
    jsonb_build_object(
      'reason', v_reason,
      'order_id', v_order.id,
      'company_slug', v_order.company_slug,
      'company_name', v_order.company_name,
      'location', v_order.location,
      'delivery_location', v_order.delivery_location,
      'delivery_date', v_order.delivery_date,
      'service', v_order.service,
      'origin', v_order.order_origin,
      'late_admin_extra', v_is_late_extra,
      'snapshot', to_jsonb(v_order)
    ),
    v_request_id,
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing
  returning id into v_delete_audit_id;

  if v_is_late_extra then
    update public.late_admin_extra_order_history
    set historical_status = 'deleted',
        deleted_at = now(),
        deleted_by = v_admin_id,
        deleted_by_email = v_admin.email,
        deleted_by_name = coalesce(nullif(trim(v_admin.full_name), ''), v_admin.email),
        deleted_reason = v_reason,
        delete_request_id = v_request_id,
        delete_audit_log_id = v_delete_audit_id,
        updated_at = now()
    where order_id = v_order.id;
  end if;

  delete from public.orders
  where id = v_order.id
    and lower(coalesce(order_origin, 'user')) = 'admin_extra';

  return jsonb_build_object('deleted', true, 'idempotent', false, 'order_id', v_order.id, 'late_admin_extra', v_is_late_extra);
end;
$$;

insert into public.late_admin_extra_order_history (
  order_id,
  operational_date,
  delivery_date,
  window_started_at,
  window_closed_at,
  created_at,
  created_by,
  created_by_email,
  created_by_name,
  company_slug,
  company_name,
  location,
  delivery_location,
  location_key,
  service,
  total_items,
  detail,
  order_snapshot,
  historical_status,
  create_request_id,
  source
)
select
  case when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
  end,
  public.resolve_late_admin_extra_operational_date(a.created_at),
  coalesce(o.delivery_date, nullif(a.metadata->>'delivery_date', '')::date),
  b.window_started_at,
  b.window_closed_at,
  coalesce(o.created_at, a.created_at),
  a.actor_id,
  a.actor_email,
  a.actor_name,
  o.company_slug,
  o.company_name,
  o.location,
  o.delivery_location,
  coalesce(o.requesting_location_code, ''),
  o.service,
  public.late_admin_extra_order_units(coalesce(to_jsonb(o), a.metadata->'snapshot', '{}'::jsonb)),
  public.late_admin_extra_order_snapshot_detail(coalesce(to_jsonb(o), a.metadata->'snapshot', '{}'::jsonb)),
  coalesce(to_jsonb(o), a.metadata->'snapshot', jsonb_build_object('audit_metadata', a.metadata)),
  case when d.action is null then 'created' else 'deleted' end,
  a.request_id,
  'backfill_audit_logs'
from public.audit_logs a
cross join lateral public.late_admin_extra_operational_bounds(public.resolve_late_admin_extra_operational_date(a.created_at)) b
left join public.orders o on o.id = (
  case when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
  end
)
left join public.audit_logs d on d.action = 'admin_extra_order_deleted'
  and d.metadata->>'order_id' = coalesce(a.metadata->>'order_id', a.target_id::text)
where a.action = 'late_admin_extra_order_created'
  and coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
on conflict (order_id) where order_id is not null do nothing;

update public.late_admin_extra_order_history h
set historical_status = 'deleted',
    deleted_at = d.created_at,
    deleted_by = d.actor_id,
    deleted_by_email = d.actor_email,
    deleted_by_name = d.actor_name,
    deleted_reason = d.metadata->>'reason',
    delete_request_id = d.request_id,
    delete_audit_log_id = d.id,
    updated_at = now()
from public.audit_logs d
where d.action = 'admin_extra_order_deleted'
  and d.metadata->>'order_id' = h.order_id::text
  and h.deleted_at is null;

create or replace function public.get_late_admin_extra_history_days(
  p_from_date date default null,
  p_to_date date default null
)
returns table (
  operational_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz,
  total_orders integer,
  total_units integer,
  deleted_orders integer,
  status text,
  closure_id uuid,
  closure_version integer,
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;

  return query
  with days as (
    select h.operational_date
    from public.late_admin_extra_order_history h
    where (p_from_date is null or h.operational_date >= p_from_date)
      and (p_to_date is null or h.operational_date <= p_to_date)
    union
    select c.operational_date
    from public.late_admin_extra_order_closures c
    where (p_from_date is null or c.operational_date >= p_from_date)
      and (p_to_date is null or c.operational_date <= p_to_date)
  )
  select
    d.operational_date,
    b.window_started_at,
    b.window_closed_at,
    count(h.id)::integer,
    coalesce(sum(h.total_items), 0)::integer,
    count(h.id) filter (where h.deleted_at is not null)::integer,
    case
      when c.id is not null then 'closed'
      when now() >= b.window_closed_at then 'ready_to_close'
      else 'open'
    end,
    c.id,
    c.version,
    c.closed_at
  from days d
  cross join lateral public.late_admin_extra_operational_bounds(d.operational_date) b
  left join public.late_admin_extra_order_history h on h.operational_date = d.operational_date
  left join public.late_admin_extra_order_closures c on c.operational_date = d.operational_date
  group by d.operational_date, b.window_started_at, b.window_closed_at, c.id, c.version, c.closed_at
  order by d.operational_date desc;
end;
$$;

create or replace function public.get_late_admin_extra_history_for_day(p_operational_date date)
returns setof public.late_admin_extra_order_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  return query
  select *
  from public.late_admin_extra_order_history
  where operational_date = p_operational_date
  order by created_at asc, id asc;
end;
$$;

create or replace function public.close_late_admin_extra_operational_day(p_operational_date date)
returns public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_existing public.late_admin_extra_order_closures%rowtype;
  v_result public.late_admin_extra_order_closures%rowtype;
  v_actor public.users;
  v_snapshot jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  select * into v_bounds from public.late_admin_extra_operational_bounds(p_operational_date);
  if now() < v_bounds.window_closed_at then
    raise exception 'late_extra_operational_day_open';
  end if;

  select * into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;
  if found then return v_existing; end if;

  select * into v_actor from public.users where id = auth.uid();

  select count(*)::integer, coalesce(sum(total_items), 0)::integer
  into v_total_orders, v_total_units
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  select jsonb_build_object(
    'version', 1,
    'operationalDate', p_operational_date,
    'windowStartedAt', v_bounds.window_started_at,
    'windowClosedAt', v_bounds.window_closed_at,
    'totalOrders', v_total_orders,
    'totalUnits', v_total_units,
    'rows', coalesce(jsonb_agg(to_jsonb(h) order by h.created_at, h.id) filter (where h.id is not null), '[]'::jsonb)
  )
  into v_snapshot
  from public.late_admin_extra_order_history h
  where h.operational_date = p_operational_date
    and h.created_at >= v_bounds.window_started_at
    and h.created_at < v_bounds.window_closed_at;

  insert into public.late_admin_extra_order_closures (
    operational_date,
    window_started_at,
    window_closed_at,
    closed_by,
    closed_by_email,
    total_orders,
    total_units,
    snapshot
  )
  values (
    p_operational_date,
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    auth.uid(),
    v_actor.email,
    v_total_orders,
    v_total_units,
    coalesce(v_snapshot, '{}'::jsonb)
  )
  returning * into v_result;

  insert into public.audit_logs (
    action, details, actor_id, actor_email, actor_name, target_id, target_name, metadata, request_id, created_at
  )
  values (
    'late_admin_extra_operational_day_closed',
    'Cierre operativo de pedidos extra fuera de termino',
    auth.uid(),
    v_actor.email,
    coalesce(nullif(trim(v_actor.full_name), ''), v_actor.email),
    v_result.id,
    p_operational_date::text,
    jsonb_build_object('operational_date', p_operational_date, 'total_orders', v_total_orders, 'total_units', v_total_units),
    concat('late-extra-closure:', p_operational_date::text, ':', v_result.version::text),
    now()
  )
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_result;
end;
$$;

create or replace function public.get_late_admin_extra_closure(p_operational_date date)
returns setof public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  return query
  select *
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date;
end;
$$;

create or replace function public.get_admin_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_global boolean := false;
  v_companies jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  v_is_global := public.is_admin();
  if not v_is_global then
    select coalesce(jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name) order by c.name), '[]'::jsonb)
    into v_companies
    from public.company_admins ca
    join public.companies c on c.id = ca.company_id
    where ca.user_id = auth.uid()
      and c.slug <> 'global';
  end if;

  return jsonb_build_object(
    'is_global_admin', v_is_global,
    'is_company_admin', jsonb_array_length(v_companies) > 0,
    'can_create_late_admin_extra_order', public.is_late_admin_extra_order_authorized(auth.uid()),
    'can_manage_late_extra_history', public.can_manage_late_extra_history(auth.uid()),
    'companies', v_companies
  );
end;
$$;

revoke all on table public.late_admin_extra_history_authorized_accounts from public, anon;
revoke all on table public.late_admin_extra_order_history from public, anon;
revoke all on table public.late_admin_extra_order_closures from public, anon;

revoke all on function public.can_manage_late_extra_history(uuid) from public, anon;
grant execute on function public.can_manage_late_extra_history(uuid) to authenticated;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;

revoke all on function public.get_late_admin_extra_closure(date) from public, anon;
grant execute on function public.get_late_admin_extra_closure(date) to authenticated;

revoke all on function public.create_late_admin_extra_order(jsonb) from public, anon;
grant execute on function public.create_late_admin_extra_order(jsonb) to authenticated;

revoke all on function public.delete_admin_extra_order(uuid, text, text) from public, anon;
grant execute on function public.delete_admin_extra_order(uuid, text, text) to authenticated;

revoke all on function public.get_admin_access_context() from public, anon;
grant execute on function public.get_admin_access_context() to authenticated;

notify pgrst, 'reload schema';

commit;
