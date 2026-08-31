-- Consolidated DB-backed fix for late admin extra history.
-- Applying this single SQL updates the allowlist, retroactive backfill, and
-- the read/close RPCs used by the UI.

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

insert into public.late_admin_extra_history_authorized_accounts (email, note)
values
  ('servifoodrecepcion@gmail.com', 'Autorizado para historico de pedidos extra fuera de termino'),
  ('sarmientoclaudia985@gmail.com', 'Autorizada para historico de pedidos extra fuera de termino'),
  ('agustinwojtyszyn99@gmail.com', 'Autorizado para historico de pedidos extra fuera de termino')
on conflict ((lower(trim(email)))) where email is not null do update
set active = true,
    note = excluded.note,
    updated_at = now();

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

create or replace function public.backfill_late_admin_extra_history_for_date(p_operational_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_affected integer := 0;
begin
  if p_operational_date is null then
    raise exception 'operational_date_required';
  end if;

  select * into v_bounds
  from public.late_admin_extra_operational_bounds(p_operational_date);

  with allowed_accounts as (
    select lower(trim(email)) as email
    from (values
      ('servifoodrecepcion@gmail.com'),
      ('sarmientoclaudia985@gmail.com'),
      ('agustinwojtyszyn99@gmail.com')
    ) as fixed(email)
    union
    select lower(trim(coalesce(u.email, cfg.email, ''))) as email
    from public.late_admin_extra_history_authorized_accounts cfg
    left join public.users u on u.id = cfg.user_id
    where cfg.active = true
      and lower(trim(coalesce(u.email, cfg.email, ''))) <> ''
  ),
  audit_created as (
    select
      case
        when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
      end as order_id,
      a.created_at,
      a.actor_id,
      a.actor_email,
      a.actor_name,
      a.request_id,
      a.id as audit_log_id,
      a.metadata,
      case
        when a.action = 'late_admin_extra_order_created' then 'audit_late_admin_extra_order_created'
        else 'audit_admin_extra_order_created_allowed_window'
      end as source
    from public.audit_logs a
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(a.actor_email, '')))
    where a.action in ('late_admin_extra_order_created', 'admin_extra_order_created')
      and a.created_at >= v_bounds.window_started_at
      and a.created_at < v_bounds.window_closed_at
      and (
        a.action = 'late_admin_extra_order_created'
        or aa.email is not null
        or coalesce(a.metadata->>'late_admin_extra', '') = 'true'
      )
      and (
        coalesce(a.metadata->>'delivery_date', '') = ''
        or coalesce(a.metadata->>'delivery_date', '') = p_operational_date::text
      )
      and (
        coalesce(a.metadata->>'origin', '') = ''
        or coalesce(a.metadata->>'origin', '') = 'admin_extra'
      )
  ),
  audit_deleted_only as (
    select
      case
        when coalesce(a.metadata->>'order_id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.target_id::text)::uuid
      end as order_id,
      coalesce(nullif(a.metadata->'snapshot'->>'created_at', '')::timestamptz, a.created_at) as created_at,
      a.actor_id,
      a.actor_email,
      a.actor_name,
      nullif(trim(coalesce(a.request_id, '')), '') as request_id,
      a.id as audit_log_id,
      a.metadata,
      'audit_admin_extra_order_deleted_snapshot'::text as source
    from public.audit_logs a
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(a.actor_email, '')))
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', '') = p_operational_date::text
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and (
        aa.email is not null
        or exists (
          select 1
          from allowed_accounts creator
          where creator.email = lower(trim(coalesce(a.metadata->'snapshot'->>'created_by_admin_email', '')))
        )
      )
  ),
  current_orders_allowed as (
    select
      o.id as order_id,
      o.created_at,
      o.created_by_admin_id as actor_id,
      o.created_by_admin_email as actor_email,
      o.created_by_admin_name as actor_name,
      null::text as request_id,
      null::uuid as audit_log_id,
      jsonb_build_object(
        'order_id', o.id,
        'delivery_date', o.delivery_date,
        'origin', o.order_origin,
        'snapshot', to_jsonb(o)
      ) as metadata,
      'orders_admin_extra_allowed_window'::text as source
    from public.orders o
    left join allowed_accounts aa on aa.email = lower(trim(coalesce(o.created_by_admin_email, '')))
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and o.created_at >= v_bounds.window_started_at
      and o.created_at < v_bounds.window_closed_at
      and o.delivery_date = p_operational_date
      and (
        aa.email is not null
        or coalesce(o.created_by_admin_email, '') = ''
      )
  ),
  sources as (
    select * from audit_created
    union all
    select * from audit_deleted_only
    union all
    select * from current_orders_allowed
  ),
  distinct_sources as (
    select distinct on (s.order_id)
      s.*
    from sources s
    where s.order_id is not null
    order by s.order_id,
      case
        when s.source = 'audit_late_admin_extra_order_created' then 1
        when s.source = 'orders_admin_extra_allowed_window' then 2
        when s.source = 'audit_admin_extra_order_created_allowed_window' then 3
        else 4
      end,
      s.created_at asc
  )
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
  select
    s.order_id,
    p_operational_date,
    coalesce(o.delivery_date, nullif(s.metadata->>'delivery_date', '')::date, nullif(s.metadata->'snapshot'->>'delivery_date', '')::date, p_operational_date),
    v_bounds.window_started_at,
    v_bounds.window_closed_at,
    coalesce(o.created_at, nullif(s.metadata->'snapshot'->>'created_at', '')::timestamptz, s.created_at),
    coalesce(o.created_by_admin_id, s.actor_id),
    coalesce(o.created_by_admin_email, s.metadata->'snapshot'->>'created_by_admin_email', s.actor_email),
    coalesce(o.created_by_admin_name, s.metadata->'snapshot'->>'created_by_admin_name', s.actor_name),
    coalesce(o.company_slug, s.metadata->'snapshot'->>'company_slug', s.metadata->>'company_slug'),
    coalesce(o.company_name, s.metadata->'snapshot'->>'company_name', s.metadata->>'company_name'),
    coalesce(o.location, s.metadata->'snapshot'->>'location', s.metadata->>'location'),
    coalesce(o.delivery_location, s.metadata->'snapshot'->>'delivery_location', s.metadata->>'delivery_location'),
    coalesce(o.requesting_location_code, s.metadata->'snapshot'->>'requesting_location_code', s.metadata->>'location_key', ''),
    coalesce(o.service, s.metadata->'snapshot'->>'service', s.metadata->>'service'),
    coalesce(
      public.late_admin_extra_order_units(coalesce(to_jsonb(o), s.metadata->'snapshot', '{}'::jsonb)),
      case when trim(coalesce(s.metadata->>'quantity', '')) ~ '^[0-9]+$' then trim(s.metadata->>'quantity')::integer end,
      0
    ),
    public.late_admin_extra_order_snapshot_detail(coalesce(to_jsonb(o), s.metadata->'snapshot', s.metadata)),
    coalesce(to_jsonb(o), s.metadata->'snapshot', jsonb_build_object('audit_metadata', s.metadata)),
    case when d.id is null then 'created' else 'deleted' end,
    s.request_id,
    s.audit_log_id,
    s.source
  from distinct_sources s
  left join public.orders o on o.id = s.order_id
  left join public.audit_logs d on d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = s.order_id::text
  on conflict (order_id) where order_id is not null do update
  set delivery_date = excluded.delivery_date,
      window_started_at = excluded.window_started_at,
      window_closed_at = excluded.window_closed_at,
      created_at = excluded.created_at,
      created_by = coalesce(late_admin_extra_order_history.created_by, excluded.created_by),
      created_by_email = coalesce(late_admin_extra_order_history.created_by_email, excluded.created_by_email),
      created_by_name = coalesce(late_admin_extra_order_history.created_by_name, excluded.created_by_name),
      company_slug = coalesce(excluded.company_slug, late_admin_extra_order_history.company_slug),
      company_name = coalesce(excluded.company_name, late_admin_extra_order_history.company_name),
      location = coalesce(excluded.location, late_admin_extra_order_history.location),
      delivery_location = coalesce(excluded.delivery_location, late_admin_extra_order_history.delivery_location),
      location_key = coalesce(excluded.location_key, late_admin_extra_order_history.location_key),
      service = coalesce(excluded.service, late_admin_extra_order_history.service),
      total_items = coalesce(excluded.total_items, late_admin_extra_order_history.total_items),
      detail = case when excluded.detail <> '{}'::jsonb then excluded.detail else late_admin_extra_order_history.detail end,
      order_snapshot = case when excluded.order_snapshot <> '{}'::jsonb then excluded.order_snapshot else late_admin_extra_order_history.order_snapshot end,
      historical_status = excluded.historical_status,
      create_request_id = coalesce(late_admin_extra_order_history.create_request_id, excluded.create_request_id),
      create_audit_log_id = coalesce(late_admin_extra_order_history.create_audit_log_id, excluded.create_audit_log_id),
      source = case
        when late_admin_extra_order_history.source = 'create_late_admin_extra_order' then late_admin_extra_order_history.source
        else excluded.source
      end,
      updated_at = now();

  get diagnostics v_affected = row_count;

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
  where h.operational_date = p_operational_date
    and d.action = 'admin_extra_order_deleted'
    and d.metadata->>'order_id' = h.order_id::text
    and h.deleted_at is null;

  return v_affected;
end;
$$;

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
declare
  v_day date;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;

  if p_from_date is not null and p_to_date is not null and p_from_date = p_to_date then
    perform public.backfill_late_admin_extra_history_for_date(p_from_date);
  else
    for v_day in
      with evidence_days as (
        select public.resolve_late_admin_extra_operational_date(a.created_at) as operational_date
        from public.audit_logs a
        where a.action in ('late_admin_extra_order_created', 'admin_extra_order_created')
          and (p_from_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) >= p_from_date)
          and (p_to_date is null or public.resolve_late_admin_extra_operational_date(a.created_at) <= p_to_date)
        union
        select o.delivery_date as operational_date
        from public.orders o
        where lower(coalesce(o.order_origin, '')) = 'admin_extra'
          and (p_from_date is null or o.delivery_date >= p_from_date)
          and (p_to_date is null or o.delivery_date <= p_to_date)
        union
        select nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date as operational_date
        from public.audit_logs a
        where a.action = 'admin_extra_order_deleted'
          and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '') is not null
          and (p_from_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date >= p_from_date)
          and (p_to_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date <= p_to_date)
      )
      select distinct operational_date
      from evidence_days
      where operational_date is not null
    loop
      perform public.backfill_late_admin_extra_history_for_date(v_day);
    end loop;
  end if;

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
  having count(h.id) > 0 or c.id is not null
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

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

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

  perform public.backfill_late_admin_extra_history_for_date(p_operational_date);

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

revoke all on table public.late_admin_extra_history_authorized_accounts from public, anon;
revoke all on table public.late_admin_extra_order_history from public, anon;
revoke all on table public.late_admin_extra_order_closures from public, anon;

revoke all on function public.can_manage_late_extra_history(uuid) from public, anon;
grant execute on function public.can_manage_late_extra_history(uuid) to authenticated;

revoke all on function public.backfill_late_admin_extra_history_for_date(date) from public, anon;
grant execute on function public.backfill_late_admin_extra_history_for_date(date) to authenticated;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;

revoke all on function public.get_late_admin_extra_closure(date) from public, anon;
grant execute on function public.get_late_admin_extra_closure(date) to authenticated;

notify pgrst, 'reload schema';

commit;
