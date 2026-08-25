-- Make the "Historico de extras" panel retroactive by delivery date.
-- It now reads every admin-created extra order for the selected date, not only
-- late-window records persisted in late_admin_extra_order_history.

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
  if not public.has_company_admin_access() then raise exception 'not_authorized'; end if;

  return query
  with active_orders as (
    select
      o.id::text as source_id,
      o.delivery_date,
      coalesce(o.total_items, public.late_admin_extra_order_units(to_jsonb(o)), 0) as total_items,
      false as deleted
    from public.orders o
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and (p_from_date is null or o.delivery_date >= p_from_date)
      and (p_to_date is null or o.delivery_date <= p_to_date)
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
  deleted_orders as (
    select
      a.id::text as source_id,
      nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date as delivery_date,
      public.late_admin_extra_order_units(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as total_items,
      true as deleted
    from public.audit_logs a
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '') is not null
      and (p_from_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date >= p_from_date)
      and (p_to_date is null or nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date <= p_to_date)
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug')
              or public.admin_extra_company_location_allowed(c.slug, coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location', a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location', ''))
            )
        )
      )
      and not exists (
        select 1
        from public.orders o
        where o.id::text = coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '')
      )
  ),
  rows as (
    select * from active_orders
    union all
    select * from deleted_orders
  ),
  grouped as (
    select
      r.delivery_date,
      count(*)::integer as total_orders,
      coalesce(sum(r.total_items), 0)::integer as total_units,
      count(*) filter (where r.deleted)::integer as deleted_orders
    from rows r
    where r.delivery_date is not null
    group by r.delivery_date
  )
  select
    g.delivery_date as operational_date,
    make_timestamptz(
      extract(year from (g.delivery_date - 1))::integer,
      extract(month from (g.delivery_date - 1))::integer,
      extract(day from (g.delivery_date - 1))::integer,
      22, 0, 0, 'America/Argentina/Buenos_Aires'
    ) as window_started_at,
    make_timestamptz(
      extract(year from g.delivery_date)::integer,
      extract(month from g.delivery_date)::integer,
      extract(day from g.delivery_date)::integer,
      18, 0, 0, 'America/Argentina/Buenos_Aires'
    ) as window_closed_at,
    g.total_orders,
    g.total_units,
    g.deleted_orders,
    case when c.id is not null then 'closed' else 'open' end as status,
    c.id as closure_id,
    c.version as closure_version,
    c.closed_at
  from grouped g
  left join public.late_admin_extra_order_closures c on c.operational_date = g.delivery_date
  order by g.delivery_date desc;
end;
$$;

drop function if exists public.get_late_admin_extra_history_for_day(date);

create or replace function public.get_late_admin_extra_history_for_day(p_operational_date date)
returns table (
  id uuid,
  order_id uuid,
  operational_date date,
  delivery_date date,
  window_started_at timestamptz,
  window_closed_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_by_name text,
  company_slug text,
  company_name text,
  location text,
  delivery_location text,
  location_key text,
  service text,
  total_items integer,
  detail jsonb,
  order_snapshot jsonb,
  historical_status text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text,
  deleted_by_name text,
  deleted_reason text,
  create_request_id text,
  delete_request_id text,
  create_audit_log_id uuid,
  delete_audit_log_id uuid,
  source text,
  created_record_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.has_company_admin_access() then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  return query
  with existing_closure as (
    select c.*
    from public.late_admin_extra_order_closures c
    where c.operational_date = p_operational_date
    limit 1
  ),
  closed_rows as (
    select
      (row_data->>'id')::uuid as id,
      nullif(row_data->>'order_id', '')::uuid as order_id,
      (row_data->>'operational_date')::date as operational_date,
      (row_data->>'delivery_date')::date as delivery_date,
      (row_data->>'window_started_at')::timestamptz as window_started_at,
      (row_data->>'window_closed_at')::timestamptz as window_closed_at,
      (row_data->>'created_at')::timestamptz as created_at,
      nullif(row_data->>'created_by', '')::uuid as created_by,
      row_data->>'created_by_email' as created_by_email,
      row_data->>'created_by_name' as created_by_name,
      row_data->>'company_slug' as company_slug,
      row_data->>'company_name' as company_name,
      row_data->>'location' as location,
      row_data->>'delivery_location' as delivery_location,
      row_data->>'location_key' as location_key,
      row_data->>'service' as service,
      coalesce((row_data->>'total_items')::integer, 0) as total_items,
      coalesce(row_data->'detail', '{}'::jsonb) as detail,
      coalesce(row_data->'order_snapshot', '{}'::jsonb) as order_snapshot,
      'closed'::text as historical_status,
      nullif(row_data->>'deleted_at', '')::timestamptz as deleted_at,
      nullif(row_data->>'deleted_by', '')::uuid as deleted_by,
      row_data->>'deleted_by_email' as deleted_by_email,
      row_data->>'deleted_by_name' as deleted_by_name,
      row_data->>'deleted_reason' as deleted_reason,
      row_data->>'create_request_id' as create_request_id,
      row_data->>'delete_request_id' as delete_request_id,
      nullif(row_data->>'create_audit_log_id', '')::uuid as create_audit_log_id,
      nullif(row_data->>'delete_audit_log_id', '')::uuid as delete_audit_log_id,
      coalesce(row_data->>'source', 'closed_snapshot') as source,
      coalesce(nullif(row_data->>'created_record_at', '')::timestamptz, (row_data->>'created_at')::timestamptz) as created_record_at,
      coalesce(nullif(row_data->>'updated_at', '')::timestamptz, (select closed_at from existing_closure)) as updated_at
    from existing_closure c
    cross join lateral jsonb_array_elements(coalesce(c.snapshot->'rows', '[]'::jsonb)) as rows(row_data)
  ),
  bounds as (
    select
      make_timestamptz(
        extract(year from (p_operational_date - 1))::integer,
        extract(month from (p_operational_date - 1))::integer,
        extract(day from (p_operational_date - 1))::integer,
        22, 0, 0, 'America/Argentina/Buenos_Aires'
      ) as started_at,
      make_timestamptz(
        extract(year from p_operational_date)::integer,
        extract(month from p_operational_date)::integer,
        extract(day from p_operational_date)::integer,
        18, 0, 0, 'America/Argentina/Buenos_Aires'
      ) as closed_at
  ),
  active_orders as (
    select
      o.id,
      o.id as order_id,
      o.delivery_date as operational_date,
      o.delivery_date,
      b.started_at as window_started_at,
      b.closed_at as window_closed_at,
      o.created_at,
      o.created_by_admin_id as created_by,
      o.created_by_admin_email,
      o.created_by_admin_name,
      o.company_slug,
      o.company_name,
      o.location,
      o.delivery_location,
      coalesce(o.requesting_location_code, '') as location_key,
      o.service,
      coalesce(o.total_items, public.late_admin_extra_order_units(to_jsonb(o)), 0)::integer as total_items,
      public.late_admin_extra_order_snapshot_detail(to_jsonb(o)) as detail,
      to_jsonb(o) as order_snapshot,
      'registered'::text as historical_status,
      null::timestamptz as deleted_at,
      null::uuid as deleted_by,
      null::text as deleted_by_email,
      null::text as deleted_by_name,
      null::text as deleted_reason,
      null::text as create_request_id,
      null::text as delete_request_id,
      null::uuid as create_audit_log_id,
      null::uuid as delete_audit_log_id,
      'orders_admin_extra_by_delivery_date'::text as source,
      o.created_at as created_record_at,
      o.updated_at
    from public.orders o
    cross join bounds b
    where lower(coalesce(o.order_origin, '')) = 'admin_extra'
      and o.delivery_date = p_operational_date
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
  deleted_orders as (
    select
      a.id,
      case
        when coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id')::uuid
      end as order_id,
      p_operational_date as operational_date,
      p_operational_date as delivery_date,
      b.started_at as window_started_at,
      b.closed_at as window_closed_at,
      coalesce(nullif(a.metadata->'snapshot'->>'created_at', '')::timestamptz, a.created_at) as created_at,
      case
        when coalesce(a.metadata->'snapshot'->>'created_by_admin_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (a.metadata->'snapshot'->>'created_by_admin_id')::uuid
      end as created_by,
      coalesce(a.metadata->'snapshot'->>'created_by_admin_email', a.actor_email) as created_by_admin_email,
      coalesce(a.metadata->'snapshot'->>'created_by_admin_name', a.actor_name) as created_by_admin_name,
      coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug') as company_slug,
      coalesce(a.metadata->>'company_name', a.metadata->'snapshot'->>'company_name') as company_name,
      coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location') as location,
      coalesce(a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location') as delivery_location,
      coalesce(a.metadata->'snapshot'->>'requesting_location_code', '') as location_key,
      coalesce(a.metadata->'snapshot'->>'service', a.metadata->>'service') as service,
      public.late_admin_extra_order_units(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as total_items,
      public.late_admin_extra_order_snapshot_detail(coalesce(a.metadata->'snapshot', '{}'::jsonb)) as detail,
      coalesce(a.metadata->'snapshot', jsonb_build_object('audit_metadata', a.metadata)) as order_snapshot,
      'deleted'::text as historical_status,
      a.created_at as deleted_at,
      a.actor_id as deleted_by,
      a.actor_email as deleted_by_email,
      a.actor_name as deleted_by_name,
      a.metadata->>'reason' as deleted_reason,
      null::text as create_request_id,
      a.request_id as delete_request_id,
      null::uuid as create_audit_log_id,
      a.id as delete_audit_log_id,
      'audit_admin_extra_order_deleted_snapshot'::text as source,
      a.created_at as created_record_at,
      a.created_at as updated_at
    from public.audit_logs a
    cross join bounds b
    where a.action = 'admin_extra_order_deleted'
      and coalesce(a.metadata->>'origin', a.metadata->'snapshot'->>'order_origin', '') = 'admin_extra'
      and nullif(coalesce(a.metadata->>'delivery_date', a.metadata->'snapshot'->>'delivery_date', ''), '')::date = p_operational_date
      and (
        public.is_admin()
        or exists (
          select 1
          from public.company_admins ca
          join public.companies c on c.id = ca.company_id
          where ca.user_id = auth.uid()
            and (
              c.slug = coalesce(a.metadata->>'company_slug', a.metadata->'snapshot'->>'company_slug')
              or public.admin_extra_company_location_allowed(c.slug, coalesce(a.metadata->>'location', a.metadata->'snapshot'->>'location', a.metadata->>'delivery_location', a.metadata->'snapshot'->>'delivery_location', ''))
            )
        )
      )
      and not exists (
        select 1
        from public.orders o
        where o.id::text = coalesce(a.metadata->>'order_id', a.metadata->'snapshot'->>'id', '')
      )
  )
  select * from closed_rows
  union all
  select * from active_orders
  where not exists (select 1 from existing_closure)
  union all
  select * from deleted_orders
  where not exists (select 1 from existing_closure)
  order by created_at asc, id asc;
end;
$$;

drop function if exists public.close_late_admin_extra_operational_day(date);

create or replace function public.close_late_admin_extra_operational_day(p_operational_date date)
returns public.late_admin_extra_order_closures
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.late_admin_extra_order_closures%rowtype;
  v_result public.late_admin_extra_order_closures%rowtype;
  v_actor public.users;
  v_window_started_at timestamptz;
  v_window_closed_at timestamptz;
  v_snapshot jsonb;
  v_total_orders integer := 0;
  v_total_units integer := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_manage_late_extra_history(auth.uid()) then raise exception 'not_authorized'; end if;
  if p_operational_date is null then raise exception 'operational_date_required'; end if;

  select *
  into v_existing
  from public.late_admin_extra_order_closures
  where operational_date = p_operational_date
  for update;

  if found then
    return v_existing;
  end if;

  v_window_started_at := make_timestamptz(
    extract(year from (p_operational_date - 1))::integer,
    extract(month from (p_operational_date - 1))::integer,
    extract(day from (p_operational_date - 1))::integer,
    22, 0, 0, 'America/Argentina/Buenos_Aires'
  );
  v_window_closed_at := make_timestamptz(
    extract(year from p_operational_date)::integer,
    extract(month from p_operational_date)::integer,
    extract(day from p_operational_date)::integer,
    18, 0, 0, 'America/Argentina/Buenos_Aires'
  );

  select * into v_actor from public.users where id = auth.uid();

  with rows as (
    select *
    from public.get_late_admin_extra_history_for_day(p_operational_date)
  )
  select
    count(*)::integer,
    coalesce(sum(total_items), 0)::integer,
    jsonb_build_object(
      'delivery_date', p_operational_date,
      'window_started_at', v_window_started_at,
      'window_closed_at', v_window_closed_at,
      'closed_at', now(),
      'closed_by', auth.uid(),
      'closed_by_email', v_actor.email,
      'rows', coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at, rows.id), '[]'::jsonb)
    )
  into v_total_orders, v_total_units, v_snapshot
  from rows;

  insert into public.late_admin_extra_order_closures (
    operational_date,
    window_started_at,
    window_closed_at,
    closed_by,
    closed_by_email,
    total_orders,
    total_units,
    snapshot,
    version
  )
  values (
    p_operational_date,
    v_window_started_at,
    v_window_closed_at,
    auth.uid(),
    v_actor.email,
    v_total_orders,
    v_total_units,
    coalesce(v_snapshot, jsonb_build_object('rows', '[]'::jsonb)),
    1
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_late_admin_extra_history_days(date, date) from public, anon;
grant execute on function public.get_late_admin_extra_history_days(date, date) to authenticated;

revoke all on function public.get_late_admin_extra_history_for_day(date) from public, anon;
grant execute on function public.get_late_admin_extra_history_for_day(date) to authenticated;

revoke all on function public.close_late_admin_extra_operational_day(date) from public, anon;
grant execute on function public.close_late_admin_extra_operational_day(date) to authenticated;
