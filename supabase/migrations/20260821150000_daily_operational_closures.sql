-- Daily operational closures.
-- Persists an immutable snapshot for a delivery_date as of 18:00
-- America/Argentina/Buenos_Aires, with retroactive rebuild support.

begin;

create table if not exists public.daily_operational_closures (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null unique,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  late_window_start timestamptz not null,
  closure_at timestamptz not null,
  closed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  version integer not null default 1,
  total_orders integer not null default 0,
  total_units integer not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  anomalies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_operational_closures_delivery_date_idx
  on public.daily_operational_closures (delivery_date desc);

alter table public.daily_operational_closures enable row level security;

drop policy if exists daily_operational_closures_admin_select on public.daily_operational_closures;
create policy daily_operational_closures_admin_select
on public.daily_operational_closures
for select
to authenticated
using (public.is_admin());

drop policy if exists daily_operational_closures_admin_write on public.daily_operational_closures;
create policy daily_operational_closures_admin_write
on public.daily_operational_closures
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.daily_operational_jsonb_int(p_value text)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when trim(coalesce(p_value, '')) ~ '^[0-9]+$' then trim(p_value)::integer
    else null
  end;
$$;

create or replace function public.daily_operational_order_units(p_order jsonb)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(
    public.daily_operational_jsonb_int(p_order->>'total_items'),
    (
      select coalesce(sum(greatest(coalesce(public.daily_operational_jsonb_int(item->>'quantity'), 1), 1)), 0)::integer
      from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as t(item)
      where jsonb_typeof(item) = 'object'
    ),
    0
  ), 0);
$$;

create or replace function public.daily_operational_company_key(p_order jsonb)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(public.normalize_company_snapshot_key(p_order->>'company_slug'), ''),
    nullif(public.normalize_company_snapshot_key(p_order->>'company'), ''),
    nullif(public.normalize_company_snapshot_key(p_order->>'organization'), ''),
    nullif(public.normalize_company_snapshot_key(p_order->>'company_name'), ''),
    nullif(public.normalize_company_snapshot_key(p_order->>'location'), ''),
    ''
  );
$$;

create or replace function public.daily_operational_location_key(p_order jsonb)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when public.daily_operational_company_key(p_order) = 'epse' then coalesce(
      nullif(public.normalize_company_snapshot_key(p_order->>'requesting_location_code'), ''),
      nullif(public.normalize_company_snapshot_key(p_order->>'requesting_location'), ''),
      nullif(public.normalize_company_snapshot_key(p_order->>'requesting_location_name'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{order_location,slug}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{order_location,code}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{order_location,display_name}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{location_snapshot,slug}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{location_snapshot,code}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order #>> '{location_snapshot,display_name}'), ''),
      nullif(public.normalize_company_snapshot_key(p_order->>'location'), ''),
      ''
    )
    else ''
  end;
$$;

create or replace function public.get_daily_operational_closure(p_delivery_date date)
returns setof public.daily_operational_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  if p_delivery_date is null then
    raise exception 'delivery_date_required';
  end if;

  return query
  select *
  from public.daily_operational_closures
  where delivery_date = p_delivery_date;
end;
$$;

create or replace function public.close_daily_operational_day(
  p_delivery_date date default null,
  p_rebuild boolean default false
)
returns public.daily_operational_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_delivery_date date := coalesce(p_delivery_date, ((now() at time zone 'America/Argentina/Buenos_Aires')::date - 1));
  v_timezone text := 'America/Argentina/Buenos_Aires';
  v_late_window_start timestamptz;
  v_closure_at timestamptz;
  v_existing public.daily_operational_closures%rowtype;
  v_result public.daily_operational_closures%rowtype;
  v_snapshot jsonb := '{}'::jsonb;
  v_anomalies jsonb := '[]'::jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
  v_next_version integer := 1;
  v_action text;
  v_request_id text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'not_authorized';
  end if;

  select *
  into v_existing
  from public.daily_operational_closures
  where delivery_date = v_delivery_date
  for update;

  if found and not coalesce(p_rebuild, false) then
    return v_existing;
  end if;

  v_late_window_start := make_timestamptz(
    extract(year from (v_delivery_date - 1))::integer,
    extract(month from (v_delivery_date - 1))::integer,
    extract(day from (v_delivery_date - 1))::integer,
    22, 0, 0, v_timezone
  );

  v_closure_at := make_timestamptz(
    extract(year from v_delivery_date)::integer,
    extract(month from v_delivery_date)::integer,
    extract(day from v_delivery_date)::integer,
    18, 0, 0, v_timezone
  );

  drop table if exists pg_temp.daily_closure_first_post_audit;
  create temp table daily_closure_first_post_audit on commit drop as
  select distinct on (order_id)
    order_id,
    previous_snapshot,
    new_snapshot,
    action,
    created_at
  from (
    select
      case
        when coalesce(a.metadata->'previous'->>'id', a.metadata->'new'->>'id', a.target_id::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->'previous'->>'id', a.metadata->'new'->>'id', a.target_id::text)::uuid
        else null
      end as order_id,
      a.metadata->'previous' as previous_snapshot,
      a.metadata->'new' as new_snapshot,
      a.action,
      a.created_at
    from public.audit_logs a
    where a.created_at > v_closure_at
      and a.action in ('admin_order_updated', 'admin_order_cancelled')
      and jsonb_typeof(a.metadata->'previous') = 'object'
  ) audits
  where order_id is not null
  order by order_id, created_at asc;

  drop table if exists pg_temp.daily_closure_effective_orders;
  create temp table daily_closure_effective_orders on commit drop as
  with current_without_post_audit as (
    select
      o.id as order_id,
      to_jsonb(o) as order_data,
      'orders_current'::text as reconstruction_source,
      (
        o.updated_at > v_closure_at
        and not exists (
          select 1
          from pg_temp.daily_closure_first_post_audit pa
          where pa.order_id = o.id
        )
      ) as not_reconstructible_exactly
    from public.orders o
    where o.delivery_date = v_delivery_date
      and o.created_at < v_closure_at
      and not exists (
        select 1
        from pg_temp.daily_closure_first_post_audit pa
        where pa.order_id = o.id
      )
  ),
  rollback_from_audit as (
    select
      pa.order_id,
      pa.previous_snapshot as order_data,
      ('audit_previous:' || pa.action)::text as reconstruction_source,
      false as not_reconstructible_exactly
    from pg_temp.daily_closure_first_post_audit pa
    where (pa.previous_snapshot->>'delivery_date')::date = v_delivery_date
      and coalesce(nullif(pa.previous_snapshot->>'created_at', '')::timestamptz, '-infinity'::timestamptz) < v_closure_at
  ),
  deleted_after_closure as (
    select
      (a.metadata->'snapshot'->>'id')::uuid as order_id,
      a.metadata->'snapshot' as order_data,
      'audit_delete_snapshot'::text as reconstruction_source,
      true as not_reconstructible_exactly
    from public.audit_logs a
    where a.created_at > v_closure_at
      and a.action = 'admin_extra_order_deleted'
      and jsonb_typeof(a.metadata->'snapshot') = 'object'
      and (a.metadata->'snapshot'->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (a.metadata->'snapshot'->>'delivery_date')::date = v_delivery_date
      and coalesce(nullif(a.metadata->'snapshot'->>'created_at', '')::timestamptz, '-infinity'::timestamptz) < v_closure_at
      and not exists (
        select 1
        from public.orders o
        where o.id = (a.metadata->'snapshot'->>'id')::uuid
      )
  )
  select distinct on (order_id)
    order_id,
    order_data,
    reconstruction_source,
    not_reconstructible_exactly
  from (
    select * from rollback_from_audit
    union all
    select * from current_without_post_audit
    union all
    select * from deleted_after_closure
  ) candidate
  where coalesce(nullif(order_data->>'status', ''), 'pending') <> 'cancelled'
    and (order_data->>'delivery_date')::date = v_delivery_date
  order by order_id, reconstruction_source;

  drop table if exists pg_temp.daily_closure_final_orders;
  create temp table daily_closure_final_orders on commit drop as
  select
    eo.order_id,
    eo.order_data,
    eo.reconstruction_source,
    eo.not_reconstructible_exactly,
    public.daily_operational_company_key(eo.order_data) as company_slug,
    coalesce(nullif(eo.order_data->>'company_name', ''), nullif(eo.order_data->>'organization', ''), nullif(eo.order_data->>'company_slug', ''), '') as company_name,
    public.daily_operational_location_key(eo.order_data) as location_key,
    coalesce(
      nullif(eo.order_data->>'requesting_location', ''),
      nullif(eo.order_data->>'requesting_location_name', ''),
      nullif(eo.order_data #>> '{order_location,display_name}', ''),
      nullif(eo.order_data #>> '{location_snapshot,display_name}', ''),
      nullif(eo.order_data->>'location', ''),
      nullif(eo.order_data->>'delivery_location', ''),
      ''
    ) as location_label,
    coalesce(nullif(lower(eo.order_data->>'service'), ''), 'lunch') as service,
    coalesce(nullif(eo.order_data->>'status', ''), 'pending') as status,
    public.daily_operational_order_units(eo.order_data) as total_units,
    nullif(eo.order_data->>'created_at', '')::timestamptz as created_at
  from pg_temp.daily_closure_effective_orders eo;

  select count(*)::integer, coalesce(sum(total_units), 0)::integer
  into v_total_orders, v_total_units
  from pg_temp.daily_closure_final_orders;

  with anomaly_rows as (
    select jsonb_build_object(
      'type', 'order_created_after_closure',
      'order_id', o.id,
      'delivery_date', o.delivery_date,
      'created_at', o.created_at,
      'closure_at', v_closure_at
    ) as anomaly
    from public.orders o
    where o.delivery_date = v_delivery_date
      and o.created_at >= v_closure_at

    union all

    select jsonb_build_object(
      'type', 'order_not_reconstructible_exactly',
      'order_id', fo.order_id,
      'source', fo.reconstruction_source,
      'updated_at', fo.order_data->>'updated_at',
      'closure_at', v_closure_at
    )
    from pg_temp.daily_closure_final_orders fo
    where fo.not_reconstructible_exactly = true

    union all

    select jsonb_build_object(
      'type', 'order_without_resolvable_company_or_location',
      'order_id', fo.order_id,
      'company_slug', fo.company_slug,
      'location_key', fo.location_key,
      'location', fo.location_label
    )
    from pg_temp.daily_closure_final_orders fo
    where nullif(fo.company_slug, '') is null
       or (fo.company_slug = 'epse' and nullif(fo.location_key, '') is null)

    union all

    select jsonb_build_object(
      'type', 'multiple_active_remitos_for_logical_key',
      'delivery_date', cr.delivery_date,
      'company_slug', c.slug,
      'location_key', coalesce(cr.location_key, ''),
      'remito_ids', jsonb_agg(cr.id order by cr.remito_number),
      'remito_numbers', jsonb_agg(cr.remito_number order by cr.remito_number)
    )
    from public.company_remitos cr
    join public.companies c on c.id = cr.company_id
    where cr.delivery_date = v_delivery_date
      and cr.status = 'issued'
    group by cr.delivery_date, c.slug, coalesce(cr.location_key, '')
    having count(*) > 1

    union all

    select jsonb_build_object(
      'type', 'remito_references_missing_order',
      'remito_id', cr.id,
      'remito_number', cr.remito_number,
      'company_slug', c.slug,
      'location_key', coalesce(cr.location_key, ''),
      'missing_order_id', remito_order.order_id
    )
    from public.company_remitos cr
    join public.companies c on c.id = cr.company_id
    cross join lateral unnest(coalesce(cr.order_ids, array[]::uuid[])) as remito_order(order_id)
    left join public.orders o on o.id = remito_order.order_id
    where cr.delivery_date = v_delivery_date
      and cr.status = 'issued'
      and o.id is null

    union all

    select jsonb_build_object(
      'type', 'remito_requires_refresh',
      'remito_id', remito.remito_id,
      'remito_number', remito.remito_number,
      'company_slug', remito.company_slug,
      'location_key', remito.location_key,
      'closure_order_ids', remito.closure_order_ids,
      'remito_order_ids', remito.remito_order_ids,
      'missing_in_remito', (
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements_text(remito.closure_order_ids) closure_id(value)
        where not exists (
          select 1
          from jsonb_array_elements_text(remito.remito_order_ids) remito_id(value)
          where remito_id.value = closure_id.value
        )
      ),
      'extra_in_remito', (
        select coalesce(jsonb_agg(value), '[]'::jsonb)
        from jsonb_array_elements_text(remito.remito_order_ids) remito_id(value)
        where not exists (
          select 1
          from jsonb_array_elements_text(remito.closure_order_ids) closure_id(value)
          where closure_id.value = remito_id.value
        )
      )
    )
    from (
      select
        cr.id as remito_id,
        cr.remito_number,
        c.slug as company_slug,
        coalesce(cr.location_key, '') as location_key,
        coalesce((
          select jsonb_agg(fo.order_id::text order by fo.order_id::text)
          from pg_temp.daily_closure_final_orders fo
          where fo.company_slug = c.slug
            and coalesce(fo.location_key, '') = coalesce(cr.location_key, '')
        ), '[]'::jsonb) as closure_order_ids,
        coalesce(
          case
            when jsonb_typeof(cr.snapshot->'orderIds') = 'array' then (
              select jsonb_agg(value order by value)
              from jsonb_array_elements_text(cr.snapshot->'orderIds') ids(value)
            )
            else (
              select jsonb_agg(order_id::text order by order_id::text)
              from unnest(coalesce(cr.order_ids, array[]::uuid[])) ids(order_id)
            )
          end,
          '[]'::jsonb
        ) as remito_order_ids
      from public.company_remitos cr
      join public.companies c on c.id = cr.company_id
      where cr.delivery_date = v_delivery_date
        and cr.status = 'issued'
    ) remito
    where remito.closure_order_ids <> remito.remito_order_ids
  )
  select coalesce(jsonb_agg(anomaly), '[]'::jsonb)
  into v_anomalies
  from anomaly_rows;

  with order_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', fo.order_id,
      'status', fo.status,
      'companySlug', fo.company_slug,
      'companyName', fo.company_name,
      'locationKey', fo.location_key,
      'locationLabel', fo.location_label,
      'location', fo.order_data->>'location',
      'deliveryLocation', fo.order_data->>'delivery_location',
      'requestingLocationCode', fo.order_data->>'requesting_location_code',
      'service', fo.service,
      'totalUnits', fo.total_units,
      'items', coalesce(fo.order_data->'items', '[]'::jsonb),
      'customResponses', coalesce(fo.order_data->'custom_responses', '[]'::jsonb),
      'orderOrigin', coalesce(nullif(fo.order_data->>'order_origin', ''), 'user'),
      'adminExtra', coalesce(nullif(fo.order_data->>'order_origin', ''), 'user') = 'admin_extra',
      'postReportExtra', fo.status = 'post_report_extra',
      'createdAt', fo.order_data->>'created_at',
      'updatedAt', fo.order_data->>'updated_at',
      'createdByAdminId', fo.order_data->>'created_by_admin_id',
      'createdByAdminEmail', fo.order_data->>'created_by_admin_email',
      'createdByAdminName', fo.order_data->>'created_by_admin_name',
      'reconstructionSource', fo.reconstruction_source,
      'reconstructionExact', not fo.not_reconstructible_exactly
    ) order by fo.company_slug, fo.location_key, fo.service, fo.created_at, fo.order_id), '[]'::jsonb) as orders_json
    from pg_temp.daily_closure_final_orders fo
  ),
  company_aggregates as (
    select coalesce(jsonb_object_agg(company_slug, payload order by company_slug), '{}'::jsonb) as payload
    from (
      select
        company_slug,
        jsonb_build_object(
          'companySlug', company_slug,
          'companyName', min(company_name),
          'orders', count(*)::integer,
          'units', coalesce(sum(total_units), 0)::integer
        ) as payload
      from pg_temp.daily_closure_final_orders
      group by company_slug
    ) grouped
  ),
  company_location_aggregates as (
    select coalesce(jsonb_agg(payload order by payload->>'companySlug', payload->>'locationKey'), '[]'::jsonb) as payload
    from (
      select jsonb_build_object(
        'companySlug', company_slug,
        'companyName', min(company_name),
        'locationKey', location_key,
        'locationLabel', min(location_label),
        'orders', count(*)::integer,
        'units', coalesce(sum(total_units), 0)::integer
      ) as payload
      from pg_temp.daily_closure_final_orders
      group by company_slug, location_key
    ) grouped
  ),
  service_aggregates as (
    select coalesce(jsonb_object_agg(service, payload order by service), '{}'::jsonb) as payload
    from (
      select
        service,
        jsonb_build_object(
          'service', service,
          'orders', count(*)::integer,
          'units', coalesce(sum(total_units), 0)::integer
        ) as payload
      from pg_temp.daily_closure_final_orders
      group by service
    ) grouped
  ),
  remitos_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'remitoId', cr.id,
      'remitoNumber', cr.remito_number,
      'companySlug', c.slug,
      'companyName', c.name,
      'locationKey', coalesce(cr.location_key, ''),
      'status', cr.status,
      'orderIds', coalesce((
        select jsonb_agg(order_id::text order by order_id::text)
        from unnest(coalesce(cr.order_ids, array[]::uuid[])) ids(order_id)
      ), '[]'::jsonb),
      'snapshotOrderIds', coalesce(
        case when jsonb_typeof(cr.snapshot->'orderIds') = 'array' then cr.snapshot->'orderIds' end,
        '[]'::jsonb
      ),
      'issuedAt', cr.issued_at,
      'updatedAt', cr.updated_at,
      'snapshotVersion', cr.snapshot_version
    ) order by c.slug, cr.location_key, cr.remito_number), '[]'::jsonb) as payload
    from public.company_remitos cr
    join public.companies c on c.id = cr.company_id
    where cr.delivery_date = v_delivery_date
      and cr.status = 'issued'
  )
  select jsonb_build_object(
    'version', 1,
    'deliveryDate', v_delivery_date,
    'timezone', v_timezone,
    'lateWindowStart', v_late_window_start,
    'closureAt', v_closure_at,
    'generatedAt', now(),
    'orderIds', coalesce((
      select jsonb_agg(order_id::text order by order_id::text)
      from pg_temp.daily_closure_final_orders
    ), '[]'::jsonb),
    'orders', order_payload.orders_json,
    'aggregates', jsonb_build_object(
      'byCompany', company_aggregates.payload,
      'byCompanyLocation', company_location_aggregates.payload,
      'byService', service_aggregates.payload
    ),
    'remitos', remitos_payload.payload,
    'reconstruction', jsonb_build_object(
      'strategy', 'orders plus first post-closure audit previous snapshot',
      'usesAuditActions', jsonb_build_array(
        'admin_order_updated',
        'admin_order_cancelled',
        'admin_extra_order_deleted',
        'late_admin_extra_order_created'
      )
    )
  )
  into v_snapshot
  from order_payload, company_aggregates, company_location_aggregates, service_aggregates, remitos_payload;

  if v_existing.id is null then
    insert into public.daily_operational_closures (
      delivery_date,
      timezone,
      late_window_start,
      closure_at,
      closed_at,
      created_by,
      updated_by,
      version,
      total_orders,
      total_units,
      snapshot,
      anomalies
    )
    values (
      v_delivery_date,
      v_timezone,
      v_late_window_start,
      v_closure_at,
      now(),
      auth.uid(),
      auth.uid(),
      1,
      v_total_orders,
      v_total_units,
      v_snapshot,
      v_anomalies
    )
    returning *
    into v_result;

    v_action := 'daily_operational_closure_created';
  else
    v_next_version := coalesce(v_existing.version, 1) + 1;
    update public.daily_operational_closures
    set late_window_start = v_late_window_start,
        closure_at = v_closure_at,
        closed_at = now(),
        updated_by = auth.uid(),
        version = v_next_version,
        total_orders = v_total_orders,
        total_units = v_total_units,
        snapshot = v_snapshot,
        anomalies = v_anomalies,
        updated_at = now()
    where id = v_existing.id
    returning *
    into v_result;

    v_action := 'daily_operational_closure_rebuilt';
  end if;

  v_request_id := concat(v_action, ':', v_delivery_date::text, ':', v_result.version::text);

  insert into public.audit_logs (
    action,
    details,
    actor_id,
    actor_email,
    actor_name,
    target_id,
    target_name,
    metadata,
    request_id,
    created_at
  )
  select
    v_action,
    case when v_action = 'daily_operational_closure_created'
      then 'Cierre operativo diario creado'
      else 'Cierre operativo diario reconstruido'
    end,
    auth.uid(),
    u.email,
    coalesce(nullif(trim(u.full_name), ''), u.email),
    v_result.id,
    v_delivery_date::text,
    jsonb_build_object(
      'delivery_date', v_delivery_date,
      'closure_id', v_result.id,
      'version', v_result.version,
      'total_orders', v_total_orders,
      'total_units', v_total_units,
      'anomaly_count', jsonb_array_length(v_anomalies),
      'closure_at', v_closure_at
    ),
    v_request_id,
    now()
  from public.users u
  where u.id = auth.uid()
  on conflict (request_id, action) where request_id is not null do nothing;

  return v_result;
end;
$$;

revoke all on table public.daily_operational_closures from public;
revoke all on table public.daily_operational_closures from anon;
grant select on table public.daily_operational_closures to authenticated;

revoke all on function public.daily_operational_jsonb_int(text) from public;
revoke all on function public.daily_operational_jsonb_int(text) from anon;

revoke all on function public.daily_operational_order_units(jsonb) from public;
revoke all on function public.daily_operational_order_units(jsonb) from anon;

revoke all on function public.daily_operational_company_key(jsonb) from public;
revoke all on function public.daily_operational_company_key(jsonb) from anon;

revoke all on function public.daily_operational_location_key(jsonb) from public;
revoke all on function public.daily_operational_location_key(jsonb) from anon;

revoke all on function public.get_daily_operational_closure(date) from public;
revoke all on function public.get_daily_operational_closure(date) from anon;
grant execute on function public.get_daily_operational_closure(date) to authenticated;

revoke all on function public.close_daily_operational_day(date, boolean) from public;
revoke all on function public.close_daily_operational_day(date, boolean) from anon;
grant execute on function public.close_daily_operational_day(date, boolean) to authenticated;

notify pgrst, 'reload schema';

commit;
